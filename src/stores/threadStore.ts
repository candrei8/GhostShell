import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { Thread } from '../lib/types'

interface ThreadState {
  threads: Thread[]

  addThread: (name: string, icon?: string, description?: string) => Thread
  removeThread: (id: string) => void
  updateThread: (id: string, updates: Partial<Thread>) => void
  toggleExpanded: (id: string) => void
  addAgentToThread: (threadId: string, agentId: string) => void
  removeAgentFromThread: (threadId: string, agentId: string) => void
  getThread: (id: string) => Thread | undefined
}

let nextId = 1

export const useThreadStore = create<ThreadState>()(
  persist(
    (set, get) => ({
      threads: [],

      addThread: (name, icon = '💬', description = '') => {
        const thread: Thread = {
          id: `thread-${Date.now()}-${nextId++}`,
          name,
          icon,
          description,
          agentIds: [],
          createdAt: Date.now(),
          isExpanded: true,
        }
        set((state) => ({ threads: [...state.threads, thread] }))
        return thread
      },

      removeThread: (id) => {
        set((state) => ({
          threads: state.threads.filter((t) => t.id !== id),
        }))
      },

      updateThread: (id, updates) => {
        set((state) => ({
          threads: state.threads.map((t) => (t.id === id ? { ...t, ...updates } : t)),
        }))
      },

      toggleExpanded: (id) => {
        set((state) => ({
          threads: state.threads.map((t) =>
            t.id === id ? { ...t, isExpanded: !t.isExpanded } : t
          ),
        }))
      },

      addAgentToThread: (threadId, agentId) => {
        set((state) => ({
          threads: state.threads.map((t) =>
            t.id === threadId && !t.agentIds.includes(agentId)
              ? { ...t, agentIds: [...t.agentIds, agentId] }
              : t
          ),
        }))
      },

      removeAgentFromThread: (threadId, agentId) => {
        set((state) => ({
          threads: state.threads.map((t) =>
            t.id === threadId
              ? { ...t, agentIds: t.agentIds.filter((id) => id !== agentId) }
              : t
          ),
        }))
      },

      getThread: (id) => get().threads.find((t) => t.id === id),
    }),
    {
      name: 'ghostshell-threads',
    }
  )
)
