import { create } from 'zustand'
import { TerminalSession, SessionGroup } from '../lib/types'

interface TerminalState {
  sessions: TerminalSession[]
  activeSessionId: string | null
  maximizedSessionId: string | null
  syncInputsMode: 'off' | 'all'
  viewMode: 'tabs' | 'grid'
  groups: SessionGroup[]
  activeGroupId: string | null

  addSession: (session: Omit<TerminalSession, 'isActive'>) => void
  removeSession: (id: string) => void
  setActiveSession: (id: string | null) => void
  updateSession: (id: string, updates: Partial<TerminalSession>) => void
  getSession: (id: string) => TerminalSession | undefined
  toggleMaximize: (id: string) => void
  setSyncInputs: (mode: 'off' | 'all') => void
  setViewMode: (mode: 'tabs' | 'grid') => void
  moveSession: (fromIndex: number, toIndex: number) => void
  duplicateSession: (id: string) => string | null
  addGroup: (group: SessionGroup) => void
  removeGroup: (id: string) => void
  setActiveGroup: (id: string | null) => void
  addSessionToGroup: (groupId: string, sessionId: string) => void
  removeSessionFromGroup: (groupId: string, sessionId: string) => void
}

export const useTerminalStore = create<TerminalState>()((set, get) => ({
  sessions: [],
  activeSessionId: null,
  maximizedSessionId: null,
  syncInputsMode: 'off',
  viewMode: 'tabs',
  groups: [],
  activeGroupId: null,

  addSession: (session) => {
    const newSession: TerminalSession = { ...session, isActive: true }
    set((state) => ({
      sessions: [...state.sessions, newSession],
      activeSessionId: newSession.id,
    }))
  },

  removeSession: (id) => {
    set((state) => {
      const filtered = state.sessions.filter((s) => s.id !== id)
      return {
        sessions: filtered,
        activeSessionId:
          state.activeSessionId === id
            ? filtered.length > 0
              ? filtered[filtered.length - 1].id
              : null
            : state.activeSessionId,
        maximizedSessionId:
          state.maximizedSessionId === id ? null : state.maximizedSessionId,
      }
    })
  },

  setActiveSession: (id) => set({ activeSessionId: id }),

  updateSession: (id, updates) => {
    set((state) => ({
      sessions: state.sessions.map((s) => (s.id === id ? { ...s, ...updates } : s)),
    }))
  },

  getSession: (id) => get().sessions.find((s) => s.id === id),

  toggleMaximize: (id) => {
    set((state) => ({
      maximizedSessionId: state.maximizedSessionId === id ? null : id,
      activeSessionId: id,
    }))
  },

  setSyncInputs: (mode) => set({ syncInputsMode: mode }),

  setViewMode: (mode) => set({ viewMode: mode }),

  moveSession: (fromIndex, toIndex) => {
    set((state) => {
      const sessions = [...state.sessions]
      const [moved] = sessions.splice(fromIndex, 1)
      sessions.splice(toIndex, 0, moved)
      return { sessions }
    })
  },

  duplicateSession: (id) => {
    const session = get().getSession(id)
    if (!session) return null
    const newId = `term-dup-${Date.now()}`
    const newSession: TerminalSession = {
      ...session,
      id: newId,
      title: session.title + ' (copy)',
      agentId: undefined,
      isActive: true,
    }
    set((state) => ({
      sessions: [...state.sessions, newSession],
      activeSessionId: newId,
      viewMode: 'grid',
    }))
    return newId
  },

  addGroup: (group) => {
    set((state) => ({
      groups: [...state.groups, group],
      activeGroupId: group.id,
      viewMode: 'grid',
    }))
  },

  removeGroup: (id) => {
    set((state) => ({
      groups: state.groups.filter((g) => g.id !== id),
      activeGroupId: state.activeGroupId === id ? null : state.activeGroupId,
    }))
  },

  setActiveGroup: (id) => {
    set({
      activeGroupId: id,
      viewMode: id ? 'grid' : 'tabs',
    })
  },

  addSessionToGroup: (groupId, sessionId) => {
    set((state) => ({
      groups: state.groups.map((g) =>
        g.id === groupId
          ? { ...g, sessionIds: [...g.sessionIds, sessionId] }
          : g,
      ),
    }))
  },

  removeSessionFromGroup: (groupId, sessionId) => {
    set((state) => ({
      groups: state.groups.map((g) =>
        g.id === groupId
          ? { ...g, sessionIds: g.sessionIds.filter((s) => s !== sessionId) }
          : g,
      ),
    }))
  },
}))
