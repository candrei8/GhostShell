import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import {
  Swarm,
  SwarmConfig,
  SwarmStatus,
  SwarmAgentState,
  SwarmAgentStatus,
  SwarmRosterAgent,
  SwarmContextFile,
  SwarmMessage,
  SwarmTaskItem,
  SwarmWizardStep,
  SwarmCliProvider,
  SwarmAgentRole,
  SWARM_WIZARD_STEPS,
} from '../lib/swarm-types'
import { getDefaultSkillIds } from '../lib/swarm-skills'
import { electronStorage } from '../lib/electronStorage'

// ─── Runtime State (outside Zustand — not persisted, no re-renders) ──

interface SwarmRuntime {
  injectorCleanup?: () => void
  taskSyncInterval?: number
}

const swarmRuntime = new Map<string, SwarmRuntime>()

export function getSwarmRuntime(swarmId: string): SwarmRuntime | undefined {
  return swarmRuntime.get(swarmId)
}

export function setSwarmRuntime(swarmId: string, data: Partial<SwarmRuntime>): void {
  const existing = swarmRuntime.get(swarmId) || {}
  swarmRuntime.set(swarmId, { ...existing, ...data })
}

export function clearSwarmRuntime(swarmId: string): void {
  const runtime = swarmRuntime.get(swarmId)
  if (runtime) {
    try { if (runtime.injectorCleanup) runtime.injectorCleanup() } catch { /* safe cleanup */ }
    try { if (runtime.taskSyncInterval) clearInterval(runtime.taskSyncInterval) } catch { /* safe cleanup */ }
    swarmRuntime.delete(swarmId)
  }
}

// ─── Wizard State ─────────────────────────────────────────────

interface WizardState {
  isOpen: boolean
  currentStep: SwarmWizardStep
  roster: SwarmRosterAgent[]
  mission: string
  directory: string
  contextFiles: SwarmContextFile[]
  enabledSkills: string[]
  swarmName: string
}

// ─── Store Interface ──────────────────────────────────────────

interface SwarmState {
  // Active swarms
  swarms: Swarm[]
  activeSwarmId: string | null

  // Health tracking
  agentHealth: Record<string, Record<string, { lastSeen: number; status: 'healthy' | 'stale' | 'dead' }>>

  // Operator messages
  operatorMessages: SwarmMessage[]

  // Wizard state
  wizard: WizardState

  // ── Wizard actions ──
  openWizard: () => void
  closeWizard: () => void
  setWizardStep: (step: SwarmWizardStep) => void
  nextStep: () => void
  prevStep: () => void
  canAdvance: () => boolean

  // Roster
  addRosterAgent: (role: SwarmAgentRole, cliProvider: SwarmCliProvider) => void
  removeRosterAgent: (id: string) => void
  updateRosterAgent: (id: string, updates: Partial<SwarmRosterAgent>) => void
  setRosterFromPreset: (composition: Record<SwarmAgentRole, number>, defaultProvider: SwarmCliProvider) => void
  clearRoster: () => void

  // Mission
  setMission: (mission: string) => void

  // Directory
  setDirectory: (directory: string) => void

  // Context
  addContextFile: (file: SwarmContextFile) => void
  removeContextFile: (id: string) => void

  // Skills
  toggleSkill: (skillId: string) => void
  setEnabledSkills: (skills: string[]) => void

  // Name
  setSwarmName: (name: string) => void

  // ── Swarm lifecycle ──
  launchSwarm: () => Swarm
  pauseSwarm: (swarmId: string) => void
  resumeSwarm: (swarmId: string) => void
  completeSwarm: (swarmId: string) => void
  removeSwarm: (swarmId: string) => void
  setActiveSwarm: (swarmId: string | null) => void

  // ── Live swarm actions ──
  setSwarmStatus: (swarmId: string, status: SwarmStatus) => void
  setSwarmRoot: (swarmId: string, swarmRoot: string) => void
  updateAgentState: (swarmId: string, rosterId: string, updates: Partial<SwarmAgentState>) => void
  setAgentStatus: (swarmId: string, rosterId: string, status: SwarmAgentStatus) => void
  linkAgentToStore: (swarmId: string, rosterId: string, agentId: string, terminalId: string) => void
  addTask: (swarmId: string, task: SwarmTaskItem) => void
  setTasks: (swarmId: string, tasks: SwarmTaskItem[]) => void
  updateTask: (swarmId: string, taskId: string, updates: Partial<SwarmTaskItem>) => void
  addMessage: (swarmId: string, message: SwarmMessage) => void

  // ── Health tracking ──
  updateAgentHealth: (swarmId: string, agentName: string, health: { lastSeen: number; status: 'healthy' | 'stale' | 'dead' }) => void

  // ── Operator inbox ──
  addOperatorMessage: (message: SwarmMessage) => void
  clearOperatorMessages: () => void

  // ── Selectors ──
  getSwarm: (id: string) => Swarm | undefined
  getActiveSwarm: () => Swarm | undefined
}

// ─── Helpers ──────────────────────────────────────────────────

let nextRosterId = 1

function createRosterAgent(role: SwarmAgentRole, cliProvider: SwarmCliProvider): SwarmRosterAgent {
  return {
    id: `roster-${Date.now()}-${nextRosterId++}`,
    role,
    cliProvider,
    autoApprove: false,
  }
}

function defaultWizardState(): WizardState {
  return {
    isOpen: false,
    currentStep: 'roster',
    roster: [],
    mission: '',
    directory: '',
    contextFiles: [],
    enabledSkills: getDefaultSkillIds(),
    swarmName: '',
  }
}

/** Max messages kept in swarm store (circular buffer) */
const MAX_MESSAGES = 200

// ─── Store ────────────────────────────────────────────────────

export const useSwarmStore = create<SwarmState>()(
  persist(
    (set, get) => ({
      swarms: [],
      activeSwarmId: null,
      agentHealth: {},
      operatorMessages: [],
      wizard: defaultWizardState(),

      // ── Wizard actions ──────────────────────────────────────────

      openWizard: () =>
        set({ wizard: { ...defaultWizardState(), isOpen: true } }),

      closeWizard: () =>
        set((state) => ({
          wizard: { ...state.wizard, isOpen: false },
        })),

      setWizardStep: (step) =>
        set((state) => ({
          wizard: { ...state.wizard, currentStep: step },
        })),

      nextStep: () =>
        set((state) => {
          const idx = SWARM_WIZARD_STEPS.indexOf(state.wizard.currentStep)
          if (idx < SWARM_WIZARD_STEPS.length - 1) {
            return { wizard: { ...state.wizard, currentStep: SWARM_WIZARD_STEPS[idx + 1] } }
          }
          return state
        }),

      prevStep: () =>
        set((state) => {
          const idx = SWARM_WIZARD_STEPS.indexOf(state.wizard.currentStep)
          if (idx > 0) {
            return { wizard: { ...state.wizard, currentStep: SWARM_WIZARD_STEPS[idx - 1] } }
          }
          return state
        }),

      canAdvance: () => {
        const { wizard } = get()
        switch (wizard.currentStep) {
          case 'roster':
            return wizard.roster.length > 0 && wizard.roster.length <= 15
          case 'mission':
            return wizard.mission.trim().length > 0
          case 'directory':
            return wizard.directory.trim().length > 0
          case 'context':
            return true // optional step
          case 'name':
            return wizard.swarmName.trim().length > 0
          default:
            return false
        }
      },

      // ── Roster ──

      addRosterAgent: (role, cliProvider) =>
        set((state) => ({
          wizard: {
            ...state.wizard,
            roster: [...state.wizard.roster, createRosterAgent(role, cliProvider)],
          },
        })),

      removeRosterAgent: (id) =>
        set((state) => ({
          wizard: {
            ...state.wizard,
            roster: state.wizard.roster.filter((a) => a.id !== id),
          },
        })),

      updateRosterAgent: (id, updates) =>
        set((state) => ({
          wizard: {
            ...state.wizard,
            roster: state.wizard.roster.map((a) =>
              a.id === id ? { ...a, ...updates } : a,
            ),
          },
        })),

      setRosterFromPreset: (composition, defaultProvider) =>
        set((state) => {
          const roster: SwarmRosterAgent[] = []
          for (const [role, count] of Object.entries(composition)) {
            for (let i = 0; i < count; i++) {
              roster.push(createRosterAgent(role as SwarmAgentRole, defaultProvider))
            }
          }
          return { wizard: { ...state.wizard, roster } }
        }),

      clearRoster: () =>
        set((state) => ({
          wizard: { ...state.wizard, roster: [] },
        })),

      // ── Mission ──

      setMission: (mission) =>
        set((state) => ({
          wizard: { ...state.wizard, mission },
        })),

      // ── Directory ──

      setDirectory: (directory) =>
        set((state) => ({
          wizard: { ...state.wizard, directory },
        })),

      // ── Context ──

      addContextFile: (file) =>
        set((state) => ({
          wizard: {
            ...state.wizard,
            contextFiles: [...state.wizard.contextFiles, file],
          },
        })),

      removeContextFile: (id) =>
        set((state) => ({
          wizard: {
            ...state.wizard,
            contextFiles: state.wizard.contextFiles.filter((f) => f.id !== id),
          },
        })),

      // ── Skills ──

      toggleSkill: (skillId) =>
        set((state) => {
          const skills = state.wizard.enabledSkills
          const next = skills.includes(skillId)
            ? skills.filter((s) => s !== skillId)
            : [...skills, skillId]
          return { wizard: { ...state.wizard, enabledSkills: next } }
        }),

      setEnabledSkills: (skills) =>
        set((state) => ({
          wizard: { ...state.wizard, enabledSkills: skills },
        })),

      // ── Name ──

      setSwarmName: (name) =>
        set((state) => ({
          wizard: { ...state.wizard, swarmName: name },
        })),

      // ── Swarm lifecycle ─────────────────────────────────────────

      launchSwarm: () => {
        const { wizard } = get()
        const swarmId = `swarm-${Date.now()}`

        const config: SwarmConfig = {
          name: wizard.swarmName.trim() || `Swarm ${swarmId.slice(-6)}`,
          mission: wizard.mission,
          directory: wizard.directory,
          roster: [...wizard.roster],
          contextFiles: [...wizard.contextFiles],
          skills: [...wizard.enabledSkills],
          createdAt: Date.now(),
        }

        const agents: SwarmAgentState[] = wizard.roster.map((r) => ({
          rosterId: r.id,
          status: 'waiting',
          filesOwned: [],
          messagesCount: 0,
        }))

        const swarm: Swarm = {
          id: swarmId,
          config,
          status: 'launching',
          agents,
          tasks: [],
          messages: [],
          startedAt: Date.now(),
        }

        set((state) => ({
          swarms: [...state.swarms, swarm],
          activeSwarmId: swarmId,
          wizard: defaultWizardState(),
        }))

        return swarm
      },

      pauseSwarm: (swarmId) => {
        set((state) => ({
          swarms: state.swarms.map((s) =>
            s.id === swarmId
              ? { ...s, status: 'paused' as SwarmStatus }
              : s,
          ),
        }))
        // Clear runtime AFTER state update to avoid stale references during render
        clearSwarmRuntime(swarmId)
      },

      resumeSwarm: (swarmId) =>
        set((state) => ({
          swarms: state.swarms.map((s) =>
            s.id === swarmId && s.status === 'paused'
              ? { ...s, status: 'running' as SwarmStatus }
              : s,
          ),
        })),

      completeSwarm: (swarmId) => {
        set((state) => ({
          swarms: state.swarms.map((s) =>
            s.id === swarmId
              ? { ...s, status: 'completed' as SwarmStatus, completedAt: Date.now() }
              : s,
          ),
          activeSwarmId: state.activeSwarmId === swarmId ? null : state.activeSwarmId,
        }))
        clearSwarmRuntime(swarmId)
      },

      removeSwarm: (swarmId) => {
        set((state) => ({
          swarms: state.swarms.filter((s) => s.id !== swarmId),
          activeSwarmId: state.activeSwarmId === swarmId ? null : state.activeSwarmId,
        }))
        clearSwarmRuntime(swarmId)
      },

      setActiveSwarm: (swarmId) => set({ activeSwarmId: swarmId }),

      // ── Live swarm actions ──────────────────────────────────────

      setSwarmStatus: (swarmId, status) =>
        set((state) => ({
          swarms: state.swarms.map((s) =>
            s.id === swarmId ? { ...s, status } : s,
          ),
        })),

      setSwarmRoot: (swarmId, swarmRoot) =>
        set((state) => ({
          swarms: state.swarms.map((s) =>
            s.id === swarmId ? { ...s, swarmRoot } : s,
          ),
        })),

      updateAgentState: (swarmId, rosterId, updates) =>
        set((state) => ({
          swarms: state.swarms.map((s) =>
            s.id === swarmId
              ? {
                  ...s,
                  agents: s.agents.map((a) =>
                    a.rosterId === rosterId ? { ...a, ...updates } : a,
                  ),
                }
              : s,
          ),
        })),

      setAgentStatus: (swarmId, rosterId, status) =>
        set((state) => ({
          swarms: state.swarms.map((s) =>
            s.id === swarmId
              ? {
                  ...s,
                  agents: s.agents.map((a) =>
                    a.rosterId === rosterId ? { ...a, status } : a,
                  ),
                }
              : s,
          ),
        })),

      linkAgentToStore: (swarmId, rosterId, agentId, terminalId) =>
        set((state) => ({
          swarms: state.swarms.map((s) =>
            s.id === swarmId
              ? {
                  ...s,
                  agents: s.agents.map((a) =>
                    a.rosterId === rosterId ? { ...a, agentId, terminalId } : a,
                  ),
                }
              : s,
          ),
        })),

      addTask: (swarmId, task) =>
        set((state) => ({
          swarms: state.swarms.map((s) =>
            s.id === swarmId
              ? { ...s, tasks: [...s.tasks, task] }
              : s,
          ),
        })),

      setTasks: (swarmId, tasks) =>
        set((state) => ({
          swarms: state.swarms.map((s) =>
            s.id === swarmId ? { ...s, tasks } : s,
          ),
        })),

      updateTask: (swarmId, taskId, updates) =>
        set((state) => ({
          swarms: state.swarms.map((s) =>
            s.id === swarmId
              ? {
                  ...s,
                  tasks: s.tasks.map((t) =>
                    t.id === taskId ? { ...t, ...updates } : t,
                  ),
                }
              : s,
          ),
        })),

      addMessage: (swarmId, message) =>
        set((state) => ({
          swarms: state.swarms.map((s) =>
            s.id === swarmId
              ? {
                  ...s,
                  messages: s.messages.length >= MAX_MESSAGES
                    ? [...s.messages.slice(-MAX_MESSAGES + 1), message]
                    : [...s.messages, message],
                }
              : s,
          ),
        })),

      // ── Health tracking ─────────────────────────────────────────

      updateAgentHealth: (swarmId, agentName, health) =>
        set((state) => ({
          agentHealth: {
            ...state.agentHealth,
            [swarmId]: {
              ...(state.agentHealth[swarmId] || {}),
              [agentName]: health,
            },
          },
        })),

      // ── Operator inbox ────────────────────────────────────────

      addOperatorMessage: (message) =>
        set((state) => ({
          operatorMessages: state.operatorMessages.length >= 100
            ? [...state.operatorMessages.slice(-99), message]
            : [...state.operatorMessages, message],
        })),

      clearOperatorMessages: () => set({ operatorMessages: [] }),

      // ── Selectors ───────────────────────────────────────────────

      getSwarm: (id) => get().swarms.find((s) => s.id === id),

      getActiveSwarm: () => {
        const { swarms, activeSwarmId } = get()
        return activeSwarmId ? swarms.find((s) => s.id === activeSwarmId) : undefined
      },
    }),
    {
      name: 'ghostshell-swarms',
      storage: createJSONStorage(() => electronStorage),
      partialize: (state) => ({
        swarms: state.swarms.map((s) => ({
          ...s,
          // Auto-pause running swarms on persist (app close)
          status: s.status === 'running' || s.status === 'launching'
            ? ('paused' as SwarmStatus)
            : s.status,
        })),
        activeSwarmId: state.activeSwarmId,
        agentHealth: {},          // Reset on persist (volatile)
        operatorMessages: [],     // Reset on persist (volatile)
      }) as unknown as SwarmState,
    }
  )
)
