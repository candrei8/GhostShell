import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { Agent, AnimalAvatar, ClaudeConfig, GeminiConfig, Provider } from '../lib/types'
import { getRandomAnimal } from '../lib/animals'
import { useWorkspaceStore } from './workspaceStore'

interface AgentState {
  agents: Agent[]
  activeAgentId: string | null

  addAgent: (name: string, avatar?: AnimalAvatar, color?: string, claudeConfig?: ClaudeConfig, cwd?: string, templateId?: string, provider?: Provider, geminiConfig?: GeminiConfig) => Agent
  removeAgent: (id: string) => void
  updateAgent: (id: string, updates: Partial<Agent>) => void
  setActiveAgent: (id: string | null) => void
  getAgent: (id: string) => Agent | undefined
  setAgentStatus: (id: string, status: Agent['status']) => void
  assignToThread: (agentId: string, threadId: string | undefined) => void
}

let nextId = 1

export const useAgentStore = create<AgentState>()(
  persist(
    (set, get) => ({
      agents: [],
      activeAgentId: null,

      addAgent: (name, avatar, color, claudeConfig, cwd, templateId, provider, geminiConfig) => {
        const av = avatar || getRandomAnimal()
        const agent: Agent = {
          id: `agent-${Date.now()}-${nextId++}`,
          name,
          avatar: av,
          status: 'idle',
          color: color || av.color,
          createdAt: Date.now(),
          templateId,
          provider: provider || 'claude',
          claudeConfig: claudeConfig || {},
          geminiConfig: geminiConfig,
          cwd: cwd || useWorkspaceStore.getState().currentPath || '.',
        }
        set((state) => ({ agents: [...state.agents, agent] }))
        return agent
      },

      removeAgent: (id) => {
        set((state) => ({
          agents: state.agents.filter((a) => a.id !== id),
          activeAgentId: state.activeAgentId === id ? null : state.activeAgentId,
        }))
      },

      updateAgent: (id, updates) => {
        set((state) => ({
          agents: state.agents.map((a) => (a.id === id ? { ...a, ...updates } : a)),
        }))
      },

      setActiveAgent: (id) => set({ activeAgentId: id }),

      getAgent: (id) => get().agents.find((a) => a.id === id),

      setAgentStatus: (id, status) => {
        set((state) => ({
          agents: state.agents.map((a) => (a.id === id ? { ...a, status } : a)),
        }))
      },

      assignToThread: (agentId, threadId) => {
        set((state) => ({
          agents: state.agents.map((a) =>
            a.id === agentId ? { ...a, threadId } : a
          ),
        }))
      },
    }),
    {
      name: 'ghostshell-agents',
      onRehydrateStorage: () => {
        // Fresh start: PTY processes don't survive app restart, so clear all agents
        return (state) => {
          if (state) {
            state.agents = []
            state.activeAgentId = null
          }
        }
      },
    }
  )
)
