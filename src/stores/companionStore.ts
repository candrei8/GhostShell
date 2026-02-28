import { create } from 'zustand'
import { ClaudeActivity, Provider } from '../lib/types'

export type CompanionEntryKind = 'assistant' | 'user' | 'event' | 'system'

export interface CompanionEntry {
  id: string
  sessionId: string
  kind: CompanionEntryKind
  text: string
  timestamp: number
  provider?: Provider
  activity?: ClaudeActivity
  tool?: string
  detail?: string
  filePath?: string
  operation?: 'read' | 'write' | 'edit'
}

interface CompanionSessionState {
  entries: CompanionEntry[]
}

interface CompanionState {
  sessions: Record<string, CompanionSessionState>
  initSession: (sessionId: string) => void
  removeSession: (sessionId: string) => void
  clearSession: (sessionId: string) => void
  addUserMessage: (sessionId: string, text: string) => void
  addAssistantMessage: (sessionId: string, text: string, provider?: Provider) => void
  addSystemMessage: (sessionId: string, text: string, provider?: Provider) => void
  addActivityEvent: (
    sessionId: string,
    payload: {
      provider?: Provider
      activity: ClaudeActivity
      tool?: string
      detail?: string
      fileTouch?: { path: string; operation: 'read' | 'write' | 'edit' }
    },
  ) => void
}

const MAX_SESSION_ENTRIES = 600
const DEDUP_WINDOW_MS = 1200

const PROMPT_LINE = /^(?:\s*(?:codex|gemini|claude)>\s*|\s*\$+\s*|\s*PS [A-Z]:\\[^>]*>\s*)$/i
const SPINNER_LINE = /[\u280B\u2819\u2838\u2834\u2826\u2807]/
const TOOL_LIKE_LINE = /^(Reading|Read|Writing|Wrote|Creating|Editing|Patching|Updating|Running|Executing|Ran|Searching|Grepping|Task(?:Create|Update)?|Tool:|apply_patch|shell\(|readFile\(|writeFile\(|patch\()/i

function getSession(state: CompanionState, sessionId: string): CompanionSessionState {
  return state.sessions[sessionId] || { entries: [] }
}

function normalizeLine(text: string): string {
  return text
    .replace(/\u0000/g, '')
    .replace(/\r/g, '')
    .replace(/\t/g, '  ')
    .trimEnd()
}

function shouldIgnoreAssistantLine(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return true
  if (PROMPT_LINE.test(trimmed)) return true
  if (SPINNER_LINE.test(trimmed) && trimmed.length <= 3) return true
  if (TOOL_LIKE_LINE.test(trimmed)) return true
  return false
}

function toActivityLabel(activity: ClaudeActivity): string {
  if (activity === 'running_bash') return 'Running command'
  if (activity === 'task_create') return 'Task created'
  if (activity === 'task_update') return 'Task updated'
  if (activity === 'web_search') return 'Web search'
  if (activity === 'web_fetch') return 'Web fetch'
  if (activity === 'sub_agent') return 'Sub-agent'
  return activity.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function pushEntry(
  state: CompanionState,
  sessionId: string,
  entry: Omit<CompanionEntry, 'id' | 'sessionId' | 'timestamp'>,
) {
  const session = getSession(state, sessionId)
  const now = Date.now()
  const prev = session.entries[session.entries.length - 1]

  if (
    prev &&
    prev.kind === entry.kind &&
    prev.text === entry.text &&
    now - prev.timestamp < DEDUP_WINDOW_MS
  ) {
    return state
  }

  const nextEntry: CompanionEntry = {
    id: `cmp-${now}-${Math.random().toString(36).slice(2, 6)}`,
    sessionId,
    timestamp: now,
    ...entry,
  }

  const nextEntries = [...session.entries, nextEntry].slice(-MAX_SESSION_ENTRIES)
  return {
    sessions: {
      ...state.sessions,
      [sessionId]: { entries: nextEntries },
    },
  }
}

export const useCompanionStore = create<CompanionState>()((set) => ({
  sessions: {},

  initSession: (sessionId) => {
    set((state) => {
      if (state.sessions[sessionId]) return state
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: { entries: [] },
        },
      }
    })
  },

  removeSession: (sessionId) => {
    set((state) => {
      const { [sessionId]: _, ...rest } = state.sessions
      return { sessions: rest }
    })
  },

  clearSession: (sessionId) => {
    set((state) => ({
      sessions: {
        ...state.sessions,
        [sessionId]: { entries: [] },
      },
    }))
  },

  addUserMessage: (sessionId, text) => {
    const normalized = normalizeLine(text)
    if (!normalized.trim()) return
    set((state) => pushEntry(state, sessionId, { kind: 'user', text: normalized }))
  },

  addAssistantMessage: (sessionId, text, provider) => {
    const normalized = normalizeLine(text)
    if (shouldIgnoreAssistantLine(normalized)) return
    set((state) => pushEntry(state, sessionId, { kind: 'assistant', text: normalized, provider }))
  },

  addSystemMessage: (sessionId, text, provider) => {
    const normalized = normalizeLine(text)
    if (!normalized.trim()) return
    set((state) => pushEntry(state, sessionId, { kind: 'system', text: normalized, provider }))
  },

  addActivityEvent: (sessionId, payload) => {
    if (payload.activity === 'idle' || payload.activity === 'thinking') return

    const base = toActivityLabel(payload.activity)
    let text = base
    if (payload.fileTouch) {
      text = `${base}: ${payload.fileTouch.path}`
    } else if (payload.tool && payload.detail) {
      text = `${payload.tool} - ${payload.detail}`
    } else if (payload.detail) {
      text = `${base}: ${payload.detail}`
    } else if (payload.tool) {
      text = `${base}: ${payload.tool}`
    }

    set((state) =>
      pushEntry(state, sessionId, {
        kind: 'event',
        text,
        provider: payload.provider,
        activity: payload.activity,
        tool: payload.tool,
        detail: payload.detail,
        filePath: payload.fileTouch?.path,
        operation: payload.fileTouch?.operation,
      }),
    )
  },
}))

