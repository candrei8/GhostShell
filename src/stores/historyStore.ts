import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { electronStorage } from '../lib/electronStorage'

export interface HistoryEntry {
  id: string
  command: string
  sessionId: string
  agentName?: string
  cwd?: string
  timestamp: number
}

export interface PathHistoryEntry {
  path: string
  lastUsedAt: number
  useCount: number
}

const PATH_COMMAND_PREFIXES = new Set(['cd', 'ls', 'cat', 'code', 'open', 'explorer'])

interface HistoryState {
  entries: HistoryEntry[]
  addEntry: (command: string, sessionId: string, agentName?: string, cwd?: string) => void
  clearHistory: () => void
  removeEntry: (id: string) => void
  getFiltered: (query: string) => HistoryEntry[]
  getCommandSuggestions: (query: string, cwd?: string, limit?: number) => HistoryEntry[]
  getRecentPaths: (query?: string, limit?: number) => PathHistoryEntry[]
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}

function isAbsolutePath(path: string): boolean {
  return path.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(path)
}

function normalizeResolvedPath(path: string, preferWindows: boolean): string {
  const normalized = path.replace(/\\/g, '/')
  const driveMatch = normalized.match(/^([A-Za-z]:)(?:\/(.*))?$/)
  const isUnixAbsolute = normalized.startsWith('/')
  const prefix = driveMatch ? driveMatch[1] : isUnixAbsolute ? '/' : ''
  const tail = driveMatch ? (driveMatch[2] || '') : isUnixAbsolute ? normalized.slice(1) : normalized
  const resolved: string[] = []

  for (const segment of tail.split('/')) {
    if (!segment || segment === '.') continue
    if (segment === '..') {
      if (resolved.length > 0) resolved.pop()
      continue
    }
    resolved.push(segment)
  }

  if (driveMatch) {
    const windowsPath = resolved.length > 0
      ? `${driveMatch[1]}\\${resolved.join('\\')}`
      : `${driveMatch[1]}\\`
    return preferWindows ? windowsPath : windowsPath.replace(/\\/g, '/')
  }

  if (isUnixAbsolute) {
    return `/${resolved.join('/')}` || '/'
  }

  return preferWindows ? resolved.join('\\') : resolved.join('/')
}

function resolveHistoryPath(basePath: string | undefined, targetPath: string): string | null {
  const trimmedTarget = targetPath.trim()
  if (!trimmedTarget) return null

  const preferWindows = /\\/.test(basePath || '') || /^[a-zA-Z]:[\\/]/.test(basePath || '')

  if (trimmedTarget === '.') {
    return basePath?.trim() || null
  }

  if (isAbsolutePath(trimmedTarget)) {
    return normalizeResolvedPath(trimmedTarget, preferWindows)
  }

  if (!basePath?.trim()) return null
  const base = basePath.trim().replace(/[\\/]+$/, '')
  const separator = preferWindows ? '\\' : '/'
  return normalizeResolvedPath(`${base}${separator}${trimmedTarget}`, preferWindows)
}

function extractPathArgument(command: string): string | null {
  const trimmed = command.trim()
  if (!trimmed) return null

  const [prefix] = trimmed.split(/\s+/)
  if (!PATH_COMMAND_PREFIXES.has(prefix.toLowerCase())) return null

  const rest = trimmed.slice(prefix.length).trim()
  if (!rest || rest.startsWith('-')) return null

  if (rest.startsWith('"')) {
    const endIndex = rest.indexOf('"', 1)
    return endIndex > 0 ? rest.slice(1, endIndex) : rest.slice(1)
  }

  if (rest.startsWith('\'')) {
    const endIndex = rest.indexOf('\'', 1)
    return endIndex > 0 ? rest.slice(1, endIndex) : rest.slice(1)
  }

  return rest.split(/\s+/)[0] || null
}

function getEntryPaths(entry: HistoryEntry): string[] {
  const paths = new Set<string>()

  if (entry.cwd?.trim()) {
    paths.add(entry.cwd.trim())
  }

  const commandPath = extractPathArgument(entry.command)
  if (commandPath) {
    const resolvedTarget = resolveHistoryPath(entry.cwd, commandPath)
    if (resolvedTarget?.trim()) {
      paths.add(resolvedTarget.trim())
    }
  }

  return [...paths]
}

function scoreCommand(entry: HistoryEntry, normalizedQuery: string, normalizedCwd: string): number {
  const normalizedCommand = entry.command.toLowerCase()
  if (!normalizedQuery) {
    return entry.timestamp
  }

  let score = 0
  if (normalizedCommand === normalizedQuery) score += 500
  if (normalizedCommand.startsWith(normalizedQuery)) score += 220
  if (normalizedCommand.includes(normalizedQuery)) score += 120
  if (normalizedCommand.split(/\s+/).some((part) => part.startsWith(normalizedQuery))) score += 80
  if (normalizedCwd && entry.cwd && normalizePath(entry.cwd) === normalizedCwd) score += 60
  return score + entry.timestamp / 1_000_000_000_000
}

function buildPathEntries(entries: HistoryEntry[], normalizedQuery: string, limit: number): PathHistoryEntry[] {
  const byPath = new Map<string, PathHistoryEntry & { normalized: string }>()

  for (const entry of entries) {
    for (const path of getEntryPaths(entry)) {
      const normalized = normalizePath(path)
      if (normalizedQuery && !normalized.includes(normalizedQuery) && !path.toLowerCase().includes(normalizedQuery)) {
        continue
      }

      const existing = byPath.get(normalized)
      if (existing) {
        existing.useCount += 1
        existing.lastUsedAt = Math.max(existing.lastUsedAt, entry.timestamp)
        continue
      }

      byPath.set(normalized, {
        path,
        normalized,
        lastUsedAt: entry.timestamp,
        useCount: 1,
      })
    }
  }

  return [...byPath.values()]
    .sort((a, b) => {
      if (b.lastUsedAt !== a.lastUsedAt) return b.lastUsedAt - a.lastUsedAt
      return b.useCount - a.useCount
    })
    .slice(0, limit)
    .map(({ normalized: _normalized, ...entry }) => entry)
}

export const useHistoryStore = create<HistoryState>()(
  persist(
    (set, get) => ({
      entries: [],

      addEntry: (command, sessionId, agentName, cwd) => {
        const trimmed = command.trim()
        if (!trimmed || trimmed.length < 2) return
        // Deduplicate consecutive same commands
        const entries = get().entries
        if (entries.length > 0 && entries[entries.length - 1].command === trimmed) return

        const entry: HistoryEntry = {
          id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          command: trimmed,
          sessionId,
          agentName,
          cwd: cwd?.trim() || undefined,
          timestamp: Date.now(),
        }
        set((state) => ({
          entries: [...state.entries.slice(-499), entry],
        }))
      },

      clearHistory: () => set({ entries: [] }),

      removeEntry: (id) => {
        set((state) => ({
          entries: state.entries.filter((e) => e.id !== id),
        }))
      },

      getFiltered: (query) => {
        const q = query.toLowerCase()
        return get().entries.filter((e) => e.command.toLowerCase().includes(q)).reverse()
      },

      getCommandSuggestions: (query, cwd, limit = 8) => {
        const normalizedQuery = query.trim().toLowerCase()
        const normalizedCwd = cwd?.trim() ? normalizePath(cwd) : ''
        const deduped = new Map<string, HistoryEntry>()

        for (let i = get().entries.length - 1; i >= 0; i -= 1) {
          const entry = get().entries[i]
          const key = entry.command.toLowerCase()
          if (deduped.has(key)) continue
          const score = scoreCommand(entry, normalizedQuery, normalizedCwd)
          if (normalizedQuery && score <= entry.timestamp / 1_000_000_000_000) continue
          deduped.set(key, entry)
        }

        return [...deduped.values()]
          .sort((a, b) => scoreCommand(b, normalizedQuery, normalizedCwd) - scoreCommand(a, normalizedQuery, normalizedCwd))
          .slice(0, limit)
      },

      getRecentPaths: (query = '', limit = 6) => {
        return buildPathEntries(get().entries, query.trim().toLowerCase(), limit)
      },
    }),
    {
      name: 'ghostshell-history',
      storage: createJSONStorage(() => electronStorage),
    }
  )
)
