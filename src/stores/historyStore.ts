import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface HistoryEntry {
  id: string
  command: string
  sessionId: string
  agentName?: string
  timestamp: number
}

interface HistoryState {
  entries: HistoryEntry[]
  addEntry: (command: string, sessionId: string, agentName?: string) => void
  clearHistory: () => void
  removeEntry: (id: string) => void
  getFiltered: (query: string) => HistoryEntry[]
}

export const useHistoryStore = create<HistoryState>()(
  persist(
    (set, get) => ({
      entries: [],

      addEntry: (command, sessionId, agentName) => {
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
    }),
    { name: 'ghostshell-history' }
  )
)
