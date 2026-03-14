import { create } from 'zustand'
import { ClaudeActivity, FileTouch, ActivityEvent, AgentActivity, SubAgent, SubAgentType, SubAgentStatus, SubAgentOutputLine, SubAgentDomain, TaskItem, ContextMetrics } from '../lib/types'

interface ActivityState {
  activities: Record<string, AgentActivity>

  initAgent: (agentId: string) => void
  removeAgent: (agentId: string) => void
  setActivity: (agentId: string, activity: ClaudeActivity, detail?: string) => void
  addFileTouch: (agentId: string, path: string, operation: 'read' | 'write' | 'edit') => void
  addEvent: (agentId: string, type: ClaudeActivity, tool?: string, detail?: string) => void
  getFileConflicts: () => { path: string; agentIds: string[] }[]

  // Subagent tracking
  addSubAgent: (agentId: string, subAgent: Omit<SubAgent, 'id' | 'startTime'>) => string
  updateSubAgent: (agentId: string, subAgentId: string, updates: Partial<SubAgent>) => void
  completeSubAgent: (agentId: string, subAgentId: string, status?: SubAgentStatus) => void

  // Sub-agent output capture
  appendSubAgentOutput: (agentId: string, subAgentId: string, lines: SubAgentOutputLine[]) => void
  updateSubAgentDomain: (agentId: string, subAgentId: string, domain: SubAgentDomain) => void

  // Task tracking
  addTask: (agentId: string, task: Omit<TaskItem, 'id' | 'createdAt'>) => void
  updateTask: (agentId: string, taskId: string, updates: Partial<TaskItem>) => void

  // Context metrics
  updateContextMetrics: (agentId: string, metrics: Partial<ContextMetrics>) => void
  incrementTurnCount: (agentId: string) => void
}

const MAX_FILE_TOUCHES = 200
const MAX_ACTIVITY_LOG = 100
const MAX_SUB_AGENTS = 50
const MAX_OUTPUT_LINES = 200
const MAX_OUTPUT_LINE_LENGTH = 500

const defaultContextMetrics: ContextMetrics = {
  tokenEstimate: 0,
  maxTokens: 0,
  turnCount: 0,
  costEstimate: 0,
}

export const useActivityStore = create<ActivityState>()((set, get) => ({
  activities: {},

  initAgent: (agentId) => {
    set((state) => ({
      activities: {
        ...state.activities,
        [agentId]: {
          agentId,
          currentActivity: 'idle',
          currentDetail: undefined,
          filesTouched: [],
          activityLog: [],
          subAgents: [],
          tasks: [],
          contextMetrics: { ...defaultContextMetrics },
          lastActivityTime: Date.now(),
          sessionStartTime: Date.now(),
        },
      },
    }))
  },

  removeAgent: (agentId) => {
    set((state) => {
      const { [agentId]: _, ...rest } = state.activities
      return { activities: rest }
    })
  },

  setActivity: (agentId, activity, detail) => {
    set((state) => {
      const existing = state.activities[agentId]
      if (!existing) return state
      // Skip no-op updates to prevent unnecessary re-renders
      if (existing.currentActivity === activity && existing.currentDetail === detail) return state
      return {
        activities: {
          ...state.activities,
          [agentId]: {
            ...existing,
            currentActivity: activity,
            currentDetail: detail,
            lastActivityTime: Date.now(),
          },
        },
      }
    })
  },

  addFileTouch: (agentId, path, operation) => {
    set((state) => {
      const existing = state.activities[agentId]
      if (!existing) return state
      const touch: FileTouch = { path, operation, timestamp: Date.now(), agentId }
      const filesTouched = [...existing.filesTouched, touch].slice(-MAX_FILE_TOUCHES)
      return {
        activities: {
          ...state.activities,
          [agentId]: { ...existing, filesTouched },
        },
      }
    })
  },

  addEvent: (agentId, type, tool, detail) => {
    set((state) => {
      const existing = state.activities[agentId]
      if (!existing) return state
      const event: ActivityEvent = {
        id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type,
        tool,
        detail,
        timestamp: Date.now(),
      }
      const activityLog = [...existing.activityLog, event].slice(-MAX_ACTIVITY_LOG)
      return {
        activities: {
          ...state.activities,
          [agentId]: { ...existing, activityLog },
        },
      }
    })
  },

  getFileConflicts: () => {
    const { activities } = get()
    const writeMap = new Map<string, Set<string>>()

    for (const activity of Object.values(activities)) {
      for (const touch of activity.filesTouched) {
        if (touch.operation === 'write' || touch.operation === 'edit') {
          if (!writeMap.has(touch.path)) writeMap.set(touch.path, new Set())
          writeMap.get(touch.path)!.add(touch.agentId)
        }
      }
    }

    const conflicts: { path: string; agentIds: string[] }[] = []
    for (const [path, agentIds] of writeMap) {
      if (agentIds.size > 1) {
        conflicts.push({ path, agentIds: Array.from(agentIds) })
      }
    }
    return conflicts
  },

  // Subagent tracking
  addSubAgent: (agentId, subAgent) => {
    const id = `sub-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    set((state) => {
      const existing = state.activities[agentId]
      if (!existing) return state
      const newSubAgent: SubAgent = {
        ...subAgent,
        id,
        startTime: Date.now(),
      }
      const subAgents = [...existing.subAgents, newSubAgent].slice(-MAX_SUB_AGENTS)
      return {
        activities: {
          ...state.activities,
          [agentId]: { ...existing, subAgents },
        },
      }
    })
    return id
  },

  updateSubAgent: (agentId, subAgentId, updates) => {
    set((state) => {
      const existing = state.activities[agentId]
      if (!existing) return state
      const subAgents = existing.subAgents.map((s) =>
        s.id === subAgentId ? { ...s, ...updates } : s,
      )
      return {
        activities: {
          ...state.activities,
          [agentId]: { ...existing, subAgents },
        },
      }
    })
  },

  completeSubAgent: (agentId, subAgentId, status = 'completed') => {
    set((state) => {
      const existing = state.activities[agentId]
      if (!existing) return state
      const subAgents = existing.subAgents.map((s) =>
        s.id === subAgentId ? { ...s, status: status as SubAgentStatus, endTime: Date.now() } : s,
      )
      return {
        activities: {
          ...state.activities,
          [agentId]: { ...existing, subAgents },
        },
      }
    })
  },

  // Sub-agent output capture
  appendSubAgentOutput: (agentId, subAgentId, lines) => {
    set((state) => {
      const existing = state.activities[agentId]
      if (!existing) return state
      const subAgentIdx = existing.subAgents.findIndex((s) => s.id === subAgentId)
      if (subAgentIdx === -1) return state
      const subAgent = existing.subAgents[subAgentIdx]
      const truncated = lines.map((l) => ({
        ...l,
        text: l.text.length > MAX_OUTPUT_LINE_LENGTH ? l.text.slice(0, MAX_OUTPUT_LINE_LENGTH) + '...' : l.text,
      }))
      const existing_lines = subAgent.outputLines || []
      const merged = [...existing_lines, ...truncated].slice(-MAX_OUTPUT_LINES)
      const newSubAgents = [...existing.subAgents]
      newSubAgents[subAgentIdx] = { ...subAgent, outputLines: merged }
      return {
        activities: {
          ...state.activities,
          [agentId]: { ...existing, subAgents: newSubAgents },
        },
      }
    })
  },

  updateSubAgentDomain: (agentId, subAgentId, domain) => {
    set((state) => {
      const existing = state.activities[agentId]
      if (!existing) return state
      const subAgents = existing.subAgents.map((s) =>
        s.id === subAgentId ? { ...s, domain } : s,
      )
      return {
        activities: {
          ...state.activities,
          [agentId]: { ...existing, subAgents },
        },
      }
    })
  },

  // Task tracking
  addTask: (agentId, task) => {
    set((state) => {
      const existing = state.activities[agentId]
      if (!existing) return state
      const newTask: TaskItem = {
        ...task,
        id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        createdAt: Date.now(),
      }
      const tasks = [...existing.tasks, newTask]
      return {
        activities: {
          ...state.activities,
          [agentId]: { ...existing, tasks },
        },
      }
    })
  },

  updateTask: (agentId, taskId, updates) => {
    set((state) => {
      const existing = state.activities[agentId]
      if (!existing) return state
      const tasks = existing.tasks.map((t) =>
        t.id === taskId ? { ...t, ...updates } : t,
      )
      return {
        activities: {
          ...state.activities,
          [agentId]: { ...existing, tasks },
        },
      }
    })
  },

  // Context metrics
  updateContextMetrics: (agentId, metrics) => {
    set((state) => {
      const existing = state.activities[agentId]
      if (!existing) return state
      return {
        activities: {
          ...state.activities,
          [agentId]: {
            ...existing,
            contextMetrics: {
              ...existing.contextMetrics,
              ...metrics,
              lastUpdatedAt: Date.now(),
            },
          },
        },
      }
    })
  },

  incrementTurnCount: (agentId) => {
    set((state) => {
      const existing = state.activities[agentId]
      if (!existing) return state
      return {
        activities: {
          ...state.activities,
          [agentId]: {
            ...existing,
            contextMetrics: {
              ...existing.contextMetrics,
              turnCount: existing.contextMetrics.turnCount + 1,
            },
          },
        },
      }
    })
  },
}))
