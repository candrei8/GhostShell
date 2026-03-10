import { create } from 'zustand'
import { TerminalSession, SessionGroup } from '../lib/types'

export interface TerminalWorkspace {
  id: string
  isGroup: boolean
  title: string
  sessionIds: string[]
  agentId?: string
  createdAt: number
}

interface TerminalState {
  sessions: TerminalSession[]
  activeSessionId: string | null
  activeWorkspaceId: string | null
  // Legacy field for compatibility with existing callers.
  activeGroupId: string | null
  maximizedSessionId: string | null
  syncInputsMode: 'off' | 'all'
  viewMode: 'tabs' | 'grid'
  groups: SessionGroup[]
  tabsCollapsed: boolean

  addSession: (session: Omit<TerminalSession, 'isActive'>) => void
  removeSession: (id: string) => void
  setActiveSession: (id: string | null) => void
  setActiveWorkspace: (id: string | null) => void
  updateSession: (id: string, updates: Partial<TerminalSession>) => void
  getSession: (id: string) => TerminalSession | undefined
  getWorkspaces: () => TerminalWorkspace[]
  closeWorkspace: (workspaceId: string) => void
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
  setTabsCollapsed: (collapsed: boolean) => void
}

function uniqueIds(ids: string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const id of ids) {
    if (!seen.has(id)) {
      seen.add(id)
      out.push(id)
    }
  }
  return out
}

function normalizeGroups(sessions: TerminalSession[], groups: SessionGroup[]): SessionGroup[] {
  const sessionSet = new Set(sessions.map((s) => s.id))
  const claimed = new Set<string>()
  const normalized: SessionGroup[] = []

  for (const group of groups) {
    const cleaned = uniqueIds(group.sessionIds).filter((id) => sessionSet.has(id) && !claimed.has(id))
    if (cleaned.length < 2) continue
    cleaned.forEach((id) => claimed.add(id))
    normalized.push({ ...group, sessionIds: cleaned })
  }

  return normalized
}

function findGroupForSession(groups: SessionGroup[], sessionId: string): SessionGroup | undefined {
  return groups.find((g) => g.sessionIds.includes(sessionId))
}

function getWorkspaceIdForSession(groups: SessionGroup[], sessionId: string): string {
  return findGroupForSession(groups, sessionId)?.id || sessionId
}

function buildWorkspaces(sessions: TerminalSession[], groups: SessionGroup[]): TerminalWorkspace[] {
  const normalizedGroups = normalizeGroups(sessions, groups)
  const groupBySession = new Map<string, SessionGroup>()
  for (const group of normalizedGroups) {
    for (const sessionId of group.sessionIds) {
      groupBySession.set(sessionId, group)
    }
  }

  const seenWorkspaceIds = new Set<string>()
  const workspaces: TerminalWorkspace[] = []

  for (const session of sessions) {
    const group = groupBySession.get(session.id)
    if (group) {
      if (seenWorkspaceIds.has(group.id)) continue
      seenWorkspaceIds.add(group.id)
      workspaces.push({
        id: group.id,
        isGroup: true,
        title: group.name || `Workspace ${group.sessionIds.length}`,
        sessionIds: [...group.sessionIds],
        createdAt: group.createdAt,
      })
      continue
    }

    if (seenWorkspaceIds.has(session.id)) continue
    seenWorkspaceIds.add(session.id)
    workspaces.push({
      id: session.id,
      isGroup: false,
      title: session.title,
      sessionIds: [session.id],
      agentId: session.agentId,
      createdAt: 0,
    })
  }

  return workspaces
}

function getActiveGroupId(groups: SessionGroup[], activeWorkspaceId: string | null): string | null {
  if (!activeWorkspaceId) return null
  return groups.some((g) => g.id === activeWorkspaceId) ? activeWorkspaceId : null
}

export const useTerminalStore = create<TerminalState>()((set, get) => ({
  sessions: [],
  activeSessionId: null,
  activeWorkspaceId: null,
  activeGroupId: null,
  maximizedSessionId: null,
  syncInputsMode: 'off',
  viewMode: 'tabs',
  groups: [],
  tabsCollapsed: false,

  addSession: (session) => {
    const newSession: TerminalSession = { ...session, isActive: true }
    set((state) => {
      const sessions = [...state.sessions, newSession]
      const groups = normalizeGroups(sessions, state.groups)
      return {
        sessions,
        groups,
        activeSessionId: newSession.id,
        activeWorkspaceId: newSession.id,
        activeGroupId: null,
      }
    })
  },

  removeSession: (id) => {
    set((state) => {
      const previousWorkspaces = buildWorkspaces(state.sessions, state.groups)
      const sessions = state.sessions.filter((s) => s.id !== id)
      const groups = normalizeGroups(
        sessions,
        state.groups.map((g) => ({
          ...g,
          sessionIds: g.sessionIds.filter((sid) => sid !== id),
        })),
      )

      const nextWorkspaces = buildWorkspaces(sessions, groups)
      const removedWorkspaceId = getWorkspaceIdForSession(state.groups, id)

      let activeWorkspaceId = state.activeWorkspaceId
      if (!activeWorkspaceId || !nextWorkspaces.some((w) => w.id === activeWorkspaceId)) {
        if (nextWorkspaces.length === 0) {
          activeWorkspaceId = null
        } else {
          const previousIndex = previousWorkspaces.findIndex(
            (w) => w.id === state.activeWorkspaceId || w.id === removedWorkspaceId,
          )
          const fallbackIndex = previousIndex >= 0 ? Math.min(previousIndex, nextWorkspaces.length - 1) : nextWorkspaces.length - 1
          activeWorkspaceId = nextWorkspaces[fallbackIndex].id
        }
      }

      let activeSessionId = state.activeSessionId
      if (!activeSessionId || activeSessionId === id || !sessions.some((s) => s.id === activeSessionId)) {
        const activeWorkspace = activeWorkspaceId
          ? nextWorkspaces.find((w) => w.id === activeWorkspaceId)
          : undefined
        activeSessionId = activeWorkspace?.sessionIds[0] || sessions[sessions.length - 1]?.id || null
      } else if (activeWorkspaceId) {
        const activeWorkspace = nextWorkspaces.find((w) => w.id === activeWorkspaceId)
        if (activeWorkspace && !activeWorkspace.sessionIds.includes(activeSessionId)) {
          activeSessionId = activeWorkspace.sessionIds[0] || activeSessionId
        }
      }

      return {
        sessions,
        groups,
        activeWorkspaceId,
        activeGroupId: getActiveGroupId(groups, activeWorkspaceId),
        activeSessionId,
        maximizedSessionId: sessions.some((s) => s.id === state.maximizedSessionId)
          ? state.maximizedSessionId
          : null,
      }
    })
  },

  setActiveSession: (id) => {
    set((state) => {
      if (!id) {
        return {
          activeSessionId: null,
          activeWorkspaceId: null,
          activeGroupId: null,
        }
      }

      if (!state.sessions.some((s) => s.id === id)) return state
      const activeWorkspaceId = getWorkspaceIdForSession(state.groups, id)
      return {
        activeSessionId: id,
        activeWorkspaceId,
        activeGroupId: getActiveGroupId(state.groups, activeWorkspaceId),
      }
    })
  },

  setActiveWorkspace: (id) => {
    set((state) => {
      if (!id) {
        return {
          activeWorkspaceId: null,
          activeGroupId: null,
        }
      }

      const workspaces = buildWorkspaces(state.sessions, state.groups)
      const workspace = workspaces.find((w) => w.id === id)
      if (!workspace) return state

      const preferredActiveSession =
        state.activeSessionId && workspace.sessionIds.includes(state.activeSessionId)
          ? state.activeSessionId
          : workspace.sessionIds[0] || null

      return {
        activeWorkspaceId: workspace.id,
        activeGroupId: getActiveGroupId(state.groups, workspace.id),
        activeSessionId: preferredActiveSession,
      }
    })
  },

  updateSession: (id, updates) => {
    set((state) => ({
      sessions: state.sessions.map((s) => (s.id === id ? { ...s, ...updates } : s)),
    }))
  },

  getSession: (id) => get().sessions.find((s) => s.id === id),

  getWorkspaces: () => {
    const state = get()
    return buildWorkspaces(state.sessions, state.groups)
  },

  closeWorkspace: (workspaceId) => {
    set((state) => {
      const currentWorkspaces = buildWorkspaces(state.sessions, state.groups)
      const workspace = currentWorkspaces.find((w) => w.id === workspaceId)
      if (!workspace) return state

      const removedIds = new Set(workspace.sessionIds)
      const sessions = state.sessions.filter((s) => !removedIds.has(s.id))
      const groups = normalizeGroups(
        sessions,
        state.groups.map((g) => ({
          ...g,
          sessionIds: g.sessionIds.filter((id) => !removedIds.has(id)),
        })),
      )

      const nextWorkspaces = buildWorkspaces(sessions, groups)
      if (nextWorkspaces.length === 0) {
        return {
          sessions,
          groups,
          activeSessionId: null,
          activeWorkspaceId: null,
          activeGroupId: null,
          maximizedSessionId: null,
        }
      }

      const previousIndex = currentWorkspaces.findIndex((w) => w.id === workspaceId)
      const nextWorkspace = nextWorkspaces[Math.min(previousIndex, nextWorkspaces.length - 1)]
      const nextSessionId = nextWorkspace.sessionIds[0] || null

      return {
        sessions,
        groups,
        activeWorkspaceId: nextWorkspace.id,
        activeGroupId: getActiveGroupId(groups, nextWorkspace.id),
        activeSessionId: nextSessionId,
        maximizedSessionId: sessions.some((s) => s.id === state.maximizedSessionId)
          ? state.maximizedSessionId
          : null,
      }
    })
  },

  toggleMaximize: (id) => {
    set((state) => {
      if (!state.sessions.some((s) => s.id === id)) return state
      return {
        maximizedSessionId: state.maximizedSessionId === id ? null : id,
        activeSessionId: id,
        activeWorkspaceId: getWorkspaceIdForSession(state.groups, id),
        activeGroupId: getActiveGroupId(state.groups, getWorkspaceIdForSession(state.groups, id)),
      }
    })
  },

  setSyncInputs: (mode) => set({ syncInputsMode: mode }),

  setViewMode: (mode) => {
    set((state) => {
      const workspaces = buildWorkspaces(state.sessions, state.groups)

      if (mode === 'tabs') {
        if (workspaces.length === 0) {
          return {
            viewMode: mode,
            activeWorkspaceId: null,
            activeGroupId: null,
            activeSessionId: null,
          }
        }

        let activeWorkspaceId = state.activeWorkspaceId
        if (!activeWorkspaceId || !workspaces.some((w) => w.id === activeWorkspaceId)) {
          if (state.activeSessionId && state.sessions.some((s) => s.id === state.activeSessionId)) {
            activeWorkspaceId = getWorkspaceIdForSession(state.groups, state.activeSessionId)
          } else {
            activeWorkspaceId = workspaces[0].id
          }
        }

        const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId) || workspaces[0]
        const activeSessionId =
          state.activeSessionId && activeWorkspace.sessionIds.includes(state.activeSessionId)
            ? state.activeSessionId
            : activeWorkspace.sessionIds[0] || null

        return {
          viewMode: mode,
          activeWorkspaceId: activeWorkspace.id,
          activeGroupId: getActiveGroupId(state.groups, activeWorkspace.id),
          activeSessionId,
        }
      }

      if (state.sessions.length === 0) {
        return {
          viewMode: mode,
          activeWorkspaceId: null,
          activeGroupId: null,
          activeSessionId: null,
        }
      }

      let activeSessionId = state.activeSessionId
      if (!activeSessionId || !state.sessions.some((s) => s.id === activeSessionId)) {
        activeSessionId = state.sessions[0].id
      }

      let activeWorkspaceId = state.activeWorkspaceId
      if (!activeWorkspaceId || !workspaces.some((w) => w.id === activeWorkspaceId)) {
        activeWorkspaceId = getWorkspaceIdForSession(state.groups, activeSessionId)
      }

      return {
        viewMode: mode,
        activeWorkspaceId,
        activeGroupId: getActiveGroupId(state.groups, activeWorkspaceId),
        activeSessionId,
      }
    })
  },

  moveSession: (fromIndex, toIndex) => {
    set((state) => {
      if (fromIndex === toIndex) return state
      const sessions = [...state.sessions]
      const [moved] = sessions.splice(fromIndex, 1)
      if (!moved) return state
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
      title: `${session.title} (copy)`,
      agentId: undefined,
      isActive: true,
    }
    set((state) => {
      const sessions = [...state.sessions, newSession]
      const groups = normalizeGroups(sessions, state.groups)
      return {
        sessions,
        groups,
        activeSessionId: newId,
        activeWorkspaceId: newId,
        activeGroupId: null,
        viewMode: 'tabs',
      }
    })
    return newId
  },

  addGroup: (group) => {
    set((state) => {
      const existingSessionIds = new Set(state.sessions.map((s) => s.id))
      const targetSessionIds = uniqueIds(group.sessionIds).filter((id) => existingSessionIds.has(id))
      if (targetSessionIds.length < 2) return state

      const cleanedGroups = state.groups
        .filter((g) => g.id !== group.id)
        .map((g) => ({
          ...g,
          sessionIds: g.sessionIds.filter((id) => !targetSessionIds.includes(id)),
        }))

      const groups = normalizeGroups(state.sessions, [
        ...cleanedGroups,
        {
          ...group,
          sessionIds: targetSessionIds,
          createdAt: group.createdAt || Date.now(),
        },
      ])

      return {
        groups,
        activeWorkspaceId: group.id,
        activeGroupId: group.id,
        activeSessionId: targetSessionIds[0],
        viewMode: 'tabs',
      }
    })
  },

  removeGroup: (id) => {
    set((state) => {
      const groups = normalizeGroups(state.sessions, state.groups.filter((g) => g.id !== id))
      const workspaces = buildWorkspaces(state.sessions, groups)
      const activeWorkspaceId =
        state.activeWorkspaceId === id || !state.activeWorkspaceId || !workspaces.some((w) => w.id === state.activeWorkspaceId)
          ? workspaces[0]?.id || null
          : state.activeWorkspaceId

      const activeWorkspace = activeWorkspaceId ? workspaces.find((w) => w.id === activeWorkspaceId) : undefined
      const activeSessionId =
        state.activeSessionId && activeWorkspace?.sessionIds.includes(state.activeSessionId)
          ? state.activeSessionId
          : activeWorkspace?.sessionIds[0] || state.sessions[0]?.id || null

      return {
        groups,
        activeWorkspaceId,
        activeGroupId: getActiveGroupId(groups, activeWorkspaceId),
        activeSessionId,
      }
    })
  },

  setActiveGroup: (id) => {
    if (!id) {
      set((state) => ({
        activeGroupId: null,
        activeWorkspaceId: state.activeSessionId
          ? getWorkspaceIdForSession(state.groups, state.activeSessionId)
          : null,
      }))
      return
    }
    get().setActiveWorkspace(id)
  },

  addSessionToGroup: (groupId, sessionId) => {
    set((state) => {
      if (!state.sessions.some((s) => s.id === sessionId)) return state
      const currentGroups = state.groups.map((g) => ({
        ...g,
        sessionIds: g.id === groupId
          ? uniqueIds([...g.sessionIds, sessionId])
          : g.sessionIds.filter((id) => id !== sessionId),
      }))
      const groups = normalizeGroups(state.sessions, currentGroups)
      if (!groups.some((g) => g.id === groupId)) return state
      return {
        groups,
        activeWorkspaceId: groupId,
        activeGroupId: groupId,
      }
    })
  },

  removeSessionFromGroup: (groupId, sessionId) => {
    set((state) => {
      const groups = normalizeGroups(
        state.sessions,
        state.groups.map((g) =>
          g.id === groupId
            ? { ...g, sessionIds: g.sessionIds.filter((id) => id !== sessionId) }
            : g,
        ),
      )
      const workspaces = buildWorkspaces(state.sessions, groups)
      const activeWorkspaceId =
        state.activeWorkspaceId && workspaces.some((w) => w.id === state.activeWorkspaceId)
          ? state.activeWorkspaceId
          : workspaces[0]?.id || null
      return {
        groups,
        activeWorkspaceId,
        activeGroupId: getActiveGroupId(groups, activeWorkspaceId),
      }
    })
  },

  setTabsCollapsed: (collapsed) => {
    set((state) => {
      if (collapsed === state.tabsCollapsed) return state

      if (collapsed) {
        return { tabsCollapsed: true }
      }

      const workspaces = buildWorkspaces(state.sessions, state.groups)
      if (workspaces.length === 0) {
        return {
          tabsCollapsed: false,
          activeWorkspaceId: null,
          activeGroupId: null,
          activeSessionId: null,
        }
      }

      let activeWorkspaceId = state.activeWorkspaceId
      if (!activeWorkspaceId || !workspaces.some((w) => w.id === activeWorkspaceId)) {
        if (state.activeSessionId && state.sessions.some((s) => s.id === state.activeSessionId)) {
          activeWorkspaceId = getWorkspaceIdForSession(state.groups, state.activeSessionId)
        } else {
          activeWorkspaceId = workspaces[0].id
        }
      }

      const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId) || workspaces[0]
      const activeSessionId =
        state.activeSessionId && activeWorkspace.sessionIds.includes(state.activeSessionId)
          ? state.activeSessionId
          : activeWorkspace.sessionIds[0] || null

      return {
        tabsCollapsed: false,
        activeWorkspaceId: activeWorkspace.id,
        activeGroupId: getActiveGroupId(state.groups, activeWorkspace.id),
        activeSessionId,
      }
    })
  },
}))
