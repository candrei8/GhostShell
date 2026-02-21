import { create } from 'zustand'
import { persist } from 'zustand/middleware'
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

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      workspaces: [],
      currentWorkspaceId: null,
      currentPath: 'C:\\Users',
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
        const recent = get().recentProjects.filter((p) => p !== path)
        set({
          currentPath: path,
          recentProjects: [path, ...recent].slice(0, 10),
        })
      },

      getCurrentWorkspace: () => {
        const state = get()
        return state.workspaces.find((w) => w.id === state.currentWorkspaceId)
      },

      addRecentProject: (path) => {
        const recent = get().recentProjects.filter((p) => p !== path)
        set({ recentProjects: [path, ...recent].slice(0, 10) })
      },
    }),
    {
      name: 'ghostshell-workspaces',
      storage: electronStorage,
    }
  )
)
