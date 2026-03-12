import { create } from 'zustand'
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
  updateAgentState: (swarmId: string, rosterId: string, updates: Partial<SwarmAgentState>) => void
  setAgentStatus: (swarmId: string, rosterId: string, status: SwarmAgentStatus) => void
  linkAgentToStore: (swarmId: string, rosterId: string, agentId: string, terminalId: string) => void
  addTask: (swarmId: string, task: SwarmTaskItem) => void
  updateTask: (swarmId: string, taskId: string, updates: Partial<SwarmTaskItem>) => void
  addMessage: (swarmId: string, message: SwarmMessage) => void

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

// ─── Store ────────────────────────────────────────────────────

export const useSwarmStore = create<SwarmState>()((set, get) => ({
  swarms: [],
  activeSwarmId: null,
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
        return wizard.roster.length > 0
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

  pauseSwarm: (swarmId) =>
    set((state) => ({
      swarms: state.swarms.map((s) =>
        s.id === swarmId ? { ...s, status: 'paused' as SwarmStatus } : s,
      ),
    })),

  resumeSwarm: (swarmId) =>
    set((state) => ({
      swarms: state.swarms.map((s) =>
        s.id === swarmId && s.status === 'paused'
          ? { ...s, status: 'running' as SwarmStatus }
          : s,
      ),
    })),

  completeSwarm: (swarmId) =>
    set((state) => ({
      swarms: state.swarms.map((s) =>
        s.id === swarmId
          ? { ...s, status: 'completed' as SwarmStatus, completedAt: Date.now() }
          : s,
      ),
    })),

  removeSwarm: (swarmId) =>
    set((state) => ({
      swarms: state.swarms.filter((s) => s.id !== swarmId),
      activeSwarmId: state.activeSwarmId === swarmId ? null : state.activeSwarmId,
    })),

  setActiveSwarm: (swarmId) => set({ activeSwarmId: swarmId }),

  // ── Live swarm actions ──────────────────────────────────────

  setSwarmStatus: (swarmId, status) =>
    set((state) => ({
      swarms: state.swarms.map((s) =>
        s.id === swarmId ? { ...s, status } : s,
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
          ? { ...s, messages: [...s.messages, message] }
          : s,
      ),
    })),

  // ── Selectors ───────────────────────────────────────────────

  getSwarm: (id) => get().swarms.find((s) => s.id === id),

  getActiveSwarm: () => {
    const { swarms, activeSwarmId } = get()
    return activeSwarmId ? swarms.find((s) => s.id === activeSwarmId) : undefined
  },
}))
