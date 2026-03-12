import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { Workspace } from '../lib/types'
import { electronStorage } from '../lib/electronStorage'

interface WorkspaceState {
  workspaces: Workspace[]
  currentWorkspaceId: string | null
  currentPath: string
  recentProjects: string[]

  addWorkspace: (name: string, path: string) => Workspace
  removeWorkspace: (id: string) => void
  setCurrentWorkspace: (id: string) => void
  setCurrentPath: (path: string) => void
  getCurrentWorkspace: () => Workspace | undefined
  addRecentProject: (path: string) => void
}

const DEFAULT_PATH = typeof navigator !== 'undefined' && /Mac|Linux/.test(navigator.platform) ? '' : 'C:\\Users'

function pickPath(value: unknown, fallback = DEFAULT_PATH): string {
  return typeof value === 'string' && value.trim() ? value : fallback
}

function sanitizeWorkspace(value: unknown): Workspace | null {
  if (!value || typeof value !== 'object') return null

  const raw = value as Record<string, unknown>
  const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id : ''
  const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name : ''
  const path = pickPath(raw.path, '')

  if (!id || !name || !path) return null

  return {
    id,
    name,
    path,
    lastOpened:
      typeof raw.lastOpened === 'number' && Number.isFinite(raw.lastOpened) && raw.lastOpened > 0
        ? raw.lastOpened
        : Date.now(),
  }
}

function sanitizeRecentProjects(value: unknown, currentPath: string): string[] {
  const entries = Array.isArray(value) ? value : []
  const out: string[] = []
  const seen = new Set<string>()

  for (const entry of entries) {
    if (typeof entry !== 'string' || !entry.trim() || seen.has(entry)) continue
    seen.add(entry)
    out.push(entry)
  }

  if (currentPath && !seen.has(currentPath)) {
    out.unshift(currentPath)
  }

  return out.slice(0, 10)
}

function normalizePersistedWorkspaceState(persistedState: unknown) {
  const raw = (persistedState && typeof persistedState === 'object'
    ? persistedState
    : {}) as Record<string, unknown>
  const currentPath = pickPath(raw.currentPath)
  const workspaces = (Array.isArray(raw.workspaces) ? raw.workspaces : [])
    .map((entry) => sanitizeWorkspace(entry))
    .filter((entry): entry is Workspace => !!entry)
  const workspaceIds = new Set(workspaces.map((workspace) => workspace.id))
  const currentWorkspaceId =
    typeof raw.currentWorkspaceId === 'string' && workspaceIds.has(raw.currentWorkspaceId)
      ? raw.currentWorkspaceId
      : null

  return {
    workspaces,
    currentWorkspaceId,
    currentPath,
    recentProjects: sanitizeRecentProjects(raw.recentProjects, currentPath),
  }
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      workspaces: [],
      currentWorkspaceId: null,
      currentPath: DEFAULT_PATH,
      recentProjects: [],

      addWorkspace: (name, path) => {
        const workspace: Workspace = {
          id: `ws-${Date.now()}`,
          name,
          path,
          lastOpened: Date.now(),
        }
        set((state) => ({ workspaces: [...state.workspaces, workspace] }))
        return workspace
      },

      removeWorkspace: (id) => {
        set((state) => ({
          workspaces: state.workspaces.filter((w) => w.id !== id),
          currentWorkspaceId:
            state.currentWorkspaceId === id ? null : state.currentWorkspaceId,
        }))
      },

      setCurrentWorkspace: (id) => {
        const ws = get().workspaces.find((w) => w.id === id)
        if (ws) {
          set({
            currentWorkspaceId: id,
            currentPath: ws.path,
            workspaces: get().workspaces.map((w) =>
              w.id === id ? { ...w, lastOpened: Date.now() } : w
            ),
          })
        }
      },

      setCurrentPath: (path) => {
        const nextPath = pickPath(path)
        const recent = get().recentProjects.filter((p) => p !== nextPath)
        set({
          currentPath: nextPath,
          recentProjects: [nextPath, ...recent].slice(0, 10),
        })
      },

      getCurrentWorkspace: () => {
        const state = get()
        return state.workspaces.find((w) => w.id === state.currentWorkspaceId)
      },

      addRecentProject: (path) => {
        const nextPath = pickPath(path, '')
        if (!nextPath) return
        const recent = get().recentProjects.filter((p) => p !== nextPath)
        set({ recentProjects: [nextPath, ...recent].slice(0, 10) })
      },
    }),
    {
      name: 'ghostshell-workspaces',
      version: 1,
      storage: createJSONStorage(() => electronStorage),
      migrate: (persistedState) => normalizePersistedWorkspaceState(persistedState),
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...normalizePersistedWorkspaceState(persistedState),
      }),
    }
  )
)
