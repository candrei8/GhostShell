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
    if (!entry.cwd?.trim()) continue
    const path = entry.cwd.trim()
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
