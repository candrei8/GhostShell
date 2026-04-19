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
  SwarmActivityEvent,
  SwarmInterview,
  SwarmFileConflict,
  CIPipeline,
  SWARM_WIZARD_STEPS,
  AGENT_HARD_CAP,
} from '../lib/swarm-types'
import type {
  AgentPerformanceProfile,
  ReACTReport,
  AutonomyRule,
  AutonomyLevel,
  ApprovalRequest,
  SwarmGitCheckpoint,
  SimulationResult,
  DebriefResult,
} from '../lib/swarm-types'
import type { MissionAnalysis, MissionPlannerStatus } from '../lib/mission-planner'
import { getPersonasForRole } from '../lib/swarm-personas'
import { createSnapshot } from '../lib/swarm-time-travel'
import { getDefaultSkillIds } from '../lib/swarm-skills'
import { electronStorage } from '../lib/electronStorage'
import type { AgentRecoveryEvent } from '../lib/swarm-self-heal'

// ─── Runtime State (outside Zustand — not persisted, no re-renders) ──

interface SwarmRuntime {
  injectorCleanup?: () => void
  taskSyncInterval?: ReturnType<typeof setInterval>
  selfHealCleanup?: () => void
  conflictDetectorCleanup?: () => void
  ciMonitorCleanup?: () => void
  checkpointMonitorCleanup?: () => void
}

// ─── Checkpoint Data (Tier 3.3) ──────────────────────────────

export interface SwarmCheckpoint {
  swarmId: string
  timestamp: number
  agentSnapshots: Array<{
    rosterId: string
    agentId?: string
    terminalId?: string
    status: SwarmAgentStatus
    currentTask?: string
    filesOwned: string[]
    lastOutputLines?: string[]  // last N lines of output for context
  }>
  tasks: SwarmTaskItem[]
  messages: SwarmMessage[]
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
    try { if (runtime.selfHealCleanup) runtime.selfHealCleanup() } catch { /* safe cleanup */ }
    try { if (runtime.conflictDetectorCleanup) runtime.conflictDetectorCleanup() } catch { /* safe cleanup */ }
    try { if (runtime.ciMonitorCleanup) runtime.ciMonitorCleanup() } catch { /* safe cleanup */ }
    try { if (runtime.checkpointMonitorCleanup) runtime.checkpointMonitorCleanup() } catch { /* safe cleanup */ }
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
  missionAnalysis: MissionAnalysis | null
  plannerStatus: MissionPlannerStatus
  autonomyOverrides: Record<string, AutonomyLevel>
  simulation: SimulationResult | null
}

// ─── Store Interface ──────────────────────────────────────────

interface SwarmState {
  // Active swarms
  swarms: Swarm[]
  activeSwarmId: string | null

  // View mode: dashboard (full-width overview) vs terminals (classic terminal view)
  swarmViewMode: 'dashboard' | 'terminals'

  // Centralized tick counter (incremented every second by the dashboard)
  tick: number

  // Health tracking
  agentHealth: Record<string, Record<string, { lastSeen: number; status: 'healthy' | 'stale' | 'dead' }>>

  // Operator messages
  operatorMessages: SwarmMessage[]

  // Activity feed (real-time swarm events — not persisted)
  activityFeed: SwarmActivityEvent[]

  // Live agent interviews (volatile — not persisted)
  interviews: SwarmInterview[]

  // Conflict detection (volatile — not persisted)
  conflicts: SwarmFileConflict[]

  // Recovery events (volatile — not persisted)
  recoveryEvents: AgentRecoveryEvent[]

  // CI/CD pipelines per agent (volatile — not persisted)
  ciPipelines: Record<string, CIPipeline>

  // Autonomy gates (B11) — volatile, per-session
  autonomyRules: AutonomyRule[]
  approvalQueue: ApprovalRequest[]

  // Wizard state
  wizard: WizardState

  // ── View mode ──
  setSwarmViewMode: (mode: 'dashboard' | 'terminals') => void
  toggleSwarmViewMode: () => void

  // ── Tick ──
  incrementTick: () => void

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
  updateAllRosterProviders: (provider: SwarmCliProvider) => void
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

  // Autonomy (wizard)
  setWizardAutonomyOverrides: (overrides: Record<string, AutonomyLevel>) => void

  // Name
  setSwarmName: (name: string) => void

  // Mission Analysis
  setMissionAnalysis: (analysis: MissionAnalysis | null) => void
  setPlannerStatus: (status: MissionPlannerStatus) => void

  // Simulation
  setSimulation: (sim: SimulationResult | null) => void

  // Debrief
  debriefResult: DebriefResult | null
  setDebriefResult: (result: DebriefResult | null) => void

  // ── Swarm lifecycle ──
  launchSwarm: () => Swarm
  pauseSwarm: (swarmId: string) => Promise<void>
  resumeSwarm: (swarmId: string) => void
  completeSwarm: (swarmId: string) => void
  markSwarmCompleted: (swarmId: string) => void
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

  // ── Activity feed ──
  addActivityEvent: (event: SwarmActivityEvent) => void
  addActivityEvents: (events: SwarmActivityEvent[]) => void
  clearActivityFeed: (swarmId: string) => void

  // ── Operator inbox ──
  addOperatorMessage: (message: SwarmMessage) => void
  clearOperatorMessages: () => void

  // ── Live agent interviews ──
  addInterview: (interview: SwarmInterview) => void
  updateInterview: (id: string, updates: Partial<SwarmInterview>) => void
  clearInterviews: () => void

  // ── Conflict detection ──
  addConflict: (conflict: SwarmFileConflict) => void
  resolveConflict: (id: string) => void
  clearConflicts: (swarmId: string) => void

  // ── Recovery events (Self-Heal) ──
  addRecoveryEvent: (event: AgentRecoveryEvent) => void
  updateRecoveryEvent: (agentLabel: string, updates: Partial<AgentRecoveryEvent>) => void

  // ── CI/CD Pipelines (A5) ──
  updateCIPipeline: (agentLabel: string, pipeline: CIPipeline) => void
  clearCIPipelines: (swarmId: string) => void

  // ── Autonomy Gates (B11) ──
  setAutonomyRules: (rules: AutonomyRule[]) => void
  addApprovalRequest: (request: ApprovalRequest) => void
  resolveApproval: (id: string, approved: boolean) => void

  // ── Checkpoint (Tier 3.3) ──
  saveCheckpoint: (swarmId: string) => Promise<void>
  loadCheckpoint: (swarmId: string) => Promise<SwarmCheckpoint | null>

  // ── Performance Profiles (A7) ──
  performanceProfiles: Record<string, AgentPerformanceProfile>  // keyed by agent label
  updatePerformanceProfile: (profile: AgentPerformanceProfile) => void

  // ── ReACT Report (A8) ──
  reactReport: ReACTReport | null
  setReACTReport: (report: ReACTReport | null) => void
  updateReACTReport: (updates: Partial<ReACTReport>) => void

  // ── Git Checkpoints (B10) ──
  gitCheckpoints: SwarmGitCheckpoint[]
  addGitCheckpoint: (checkpoint: SwarmGitCheckpoint) => void
  clearGitCheckpoints: (swarmId: string) => void

  // ── Selectors ──
  getSwarm: (id: string) => Swarm | undefined
  getActiveSwarm: () => Swarm | undefined
}

// ─── Helpers ──────────────────────────────────────────────────

let nextRosterId = 1

function createRosterAgent(role: SwarmAgentRole, cliProvider: SwarmCliProvider, personaId?: string): SwarmRosterAgent {
  const id = `roster-${Date.now()}-${nextRosterId++}-${Math.random().toString(36).slice(2, 8)}`
  return {
    id,
    role,
    cliProvider,
    autoApprove: false,
    personaId,
  }
}

function defaultWizardState(): WizardState {
  return {
    isOpen: false,
    currentStep: 'mission',
    roster: [],
    mission: '',
    directory: '',
    contextFiles: [],
    enabledSkills: getDefaultSkillIds(),
    swarmName: '',
    missionAnalysis: null,
    plannerStatus: 'idle',
    autonomyOverrides: {},
    simulation: null,
  }
}

/** Max messages kept in swarm store (circular buffer) */
const MAX_MESSAGES = 200

/** Max activity feed events (circular buffer) */
const MAX_ACTIVITY_EVENTS = 500

// ─── Store ────────────────────────────────────────────────────

export const useSwarmStore = create<SwarmState>()(
  persist(
    (set, get) => ({
      swarms: [],
      activeSwarmId: null,
      swarmViewMode: 'dashboard',
      tick: 0,
      agentHealth: {},
      operatorMessages: [],
      activityFeed: [],
      interviews: [],
      conflicts: [],
      recoveryEvents: [],
      ciPipelines: {},
      autonomyRules: [],
      approvalQueue: [],
      performanceProfiles: {},
      reactReport: null,
      gitCheckpoints: [],
      debriefResult: null,
      wizard: defaultWizardState(),

      // ── View mode ─────────────────────────────────────────────────

      setSwarmViewMode: (mode) => set({ swarmViewMode: mode }),

      toggleSwarmViewMode: () =>
        set((state) => ({
          swarmViewMode: state.swarmViewMode === 'dashboard' ? 'terminals' : 'dashboard',
        })),

      // ── Tick ─────────────────────────────────────────────────────

      incrementTick: () => set((state) => ({ tick: state.tick + 1 })),

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
          case 'mission':
            return wizard.mission.trim().length > 0 && wizard.directory.trim().length > 0
          case 'configure':
            return wizard.roster.length > 0 && wizard.roster.length <= AGENT_HARD_CAP
          case 'simulate':
            return true // simulation is optional, always advanceable
          case 'launch':
            return true // name auto-generated, always launchable
          default:
            return false
        }
      },

      // ── Roster ──

      addRosterAgent: (role, cliProvider) =>
        set((state) => {
          if (state.wizard.roster.length >= AGENT_HARD_CAP) return state
          // Auto-assign next persona in round-robin for this role
          const personas = getPersonasForRole(role)
          const existingCount = state.wizard.roster.filter((a) => a.role === role).length
          const personaId = personas.length > 0
            ? personas[existingCount % personas.length].id
            : undefined
          return {
            wizard: {
              ...state.wizard,
              roster: [...state.wizard.roster, createRosterAgent(role, cliProvider, personaId)],
            },
          }
        }),

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

      updateAllRosterProviders: (provider) =>
        set((state) => ({
          wizard: {
            ...state.wizard,
            roster: state.wizard.roster.map((a) => ({ ...a, cliProvider: provider })),
          },
        })),

      setRosterFromPreset: (composition, defaultProvider) =>
        set((state) => {
          const roster: SwarmRosterAgent[] = []
          // Track per-role index for round-robin persona assignment
          const roleCounters: Record<string, number> = {}
          for (const [role, count] of Object.entries(composition)) {
            const personas = getPersonasForRole(role as SwarmAgentRole)
            roleCounters[role] = 0
            for (let i = 0; i < count; i++) {
              const personaId = personas.length > 0
                ? personas[roleCounters[role] % personas.length].id
                : undefined
              roleCounters[role]++
              roster.push(createRosterAgent(role as SwarmAgentRole, defaultProvider, personaId))
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

      // ── Autonomy (wizard) ──

      setWizardAutonomyOverrides: (overrides) =>
        set((state) => ({
          wizard: { ...state.wizard, autonomyOverrides: overrides },
        })),

      // ── Name ──

      setSwarmName: (name) =>
        set((state) => ({
          wizard: { ...state.wizard, swarmName: name },
        })),

      // ── Mission Analysis ──

      setMissionAnalysis: (analysis) =>
        set((state) => ({
          wizard: { ...state.wizard, missionAnalysis: analysis },
        })),

      setPlannerStatus: (status) =>
        set((state) => ({
          wizard: { ...state.wizard, plannerStatus: status },
        })),

      // ── Simulation ──

      setSimulation: (sim) =>
        set((state) => ({
          wizard: { ...state.wizard, simulation: sim },
        })),

      // ── Debrief ──

      setDebriefResult: (result) => {
        // Store both globally (for quick UI access) and per-swarm
        const activeId = get().activeSwarmId
        set((state) => ({
          debriefResult: result,
          swarms: activeId
            ? state.swarms.map((s) =>
                s.id === activeId ? { ...s, debriefResult: result || undefined } : s,
              )
            : state.swarms,
        }))
      },

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
          missionAnalysis: wizard.missionAnalysis || undefined,
          autonomyOverrides: Object.keys(wizard.autonomyOverrides).length > 0
            ? { ...wizard.autonomyOverrides }
            : undefined,
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
          simulation: wizard.simulation || undefined,
        }

        set((state) => ({
          swarms: [...state.swarms, swarm],
          activeSwarmId: swarmId,
          wizard: defaultWizardState(),
        }))

        return swarm
      },

      pauseSwarm: async (swarmId) => {
        // Save checkpoint before pausing (Tier 3.3)
        try {
          await get().saveCheckpoint(swarmId)
        } catch (err) {
          console.error('[SwarmStore] Failed to save checkpoint on pause:', err)
        }
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
        const swarm = get().swarms.find(s => s.id === swarmId)
        set((state) => ({
          swarms: state.swarms.map((s) =>
            s.id === swarmId
              ? { ...s, status: 'completed' as SwarmStatus, completedAt: Date.now() }
              : s,
          ),
          activeSwarmId: state.activeSwarmId === swarmId ? null : state.activeSwarmId,
        }))
        clearSwarmRuntime(swarmId)

        // Generate summary report asynchronously (non-blocking)
        import('../lib/swarm-report-generator').then(({ generateSwarmReport }) => {
          generateSwarmReport(swarmId).catch((err) =>
            console.warn('[swarm] Report generation failed:', err),
          )
        }).catch(() => {})

        // Save performance data on swarm completion (A7 — non-blocking)
        if (swarm?.config.directory) {
          import('../lib/swarm-performance-tracker').then(({ savePerformanceData }) => {
            savePerformanceData(swarm.config.directory).catch((err) =>
              console.warn('[swarm] Performance data save failed:', err),
            )
          }).catch(() => {})
        }

        // Trigger debrief orchestrator (non-blocking)
        import('../lib/swarm-debrief-orchestrator').then(({ runDebrief }) => {
          runDebrief(swarmId).catch((err) =>
            console.warn('[swarm] Debrief failed:', err),
          )
        }).catch(() => {})
      },

      markSwarmCompleted: (swarmId) => {
        set((state) => ({
          swarms: state.swarms.map((s) =>
            s.id === swarmId
              ? {
                  ...s,
                  status: 'completed' as SwarmStatus,
                  completedAt: s.completedAt || Date.now(),
                }
              : s,
          ),
        }))
        clearSwarmRuntime(swarmId)

        // Generate summary report asynchronously (non-blocking)
        import('../lib/swarm-report-generator').then(({ generateSwarmReport }) => {
          generateSwarmReport(swarmId).catch((err) =>
            console.warn('[swarm] Report generation failed:', err),
          )
        }).catch(() => {})
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
          swarms: state.swarms.map((s) => {
            if (s.id !== swarmId) return s
            // Idempotent: update if the SwarmAgentState for this rosterId already
            // exists (the normal case — launchSwarm pre-creates them), otherwise
            // append a fresh one. This prevents agents from going invisible when
            // a checkpoint restore arrives without pre-seeded agent slots, which
            // would otherwise leave the dashboard stuck on "Agents warming up..."
            // forever even though the PTYs are alive.
            const existing = s.agents.findIndex((a) => a.rosterId === rosterId)
            if (existing >= 0) {
              return {
                ...s,
                agents: s.agents.map((a, i) =>
                  i === existing ? { ...a, agentId, terminalId } : a,
                ),
              }
            }
            return {
              ...s,
              agents: [
                ...s.agents,
                {
                  rosterId,
                  agentId,
                  terminalId,
                  status: 'waiting' as const,
                  filesOwned: [],
                  messagesCount: 0,
                },
              ],
            }
          }),
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

      updateTask: (swarmId, taskId, updates) => {
        set((state) => ({
          swarms: state.swarms.map((s) =>
            s.id === swarmId
              ? {
                  ...s,
                  tasks: s.tasks.map((t) => {
                    if (t.id !== taskId) return t
                    // Auto-set timestamps on status transitions
                    const merged = { ...t, ...updates }
                    if (updates.status === 'building' && !t.startedAt) {
                      merged.startedAt = Date.now()
                    }
                    if (updates.status === 'done' && !t.completedAt) {
                      merged.completedAt = Date.now()
                    }
                    return merged
                  }),
                }
              : s,
          ),
        }))
        // Record time-travel snapshot on task status changes
        if (updates.status) {
          const swarm = get().swarms.find((s) => s.id === swarmId)
          if (swarm) {
            createSnapshot('task_change', swarm.agents, swarm.tasks, swarm.messages, get().conflicts, swarm.startedAt)
          }
        }
      },

      addMessage: (swarmId, message) =>
        set((state) => ({
          swarms: state.swarms.map((s) =>
            s.id === swarmId
              ? {
                  ...s,
                  messages: s.messages.length >= MAX_MESSAGES
                    ? [...s.messages.slice(-(MAX_MESSAGES - 1)), message]
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

      // ── Activity feed ──────────────────────────────────────────

      addActivityEvent: (event) =>
        set((state) => ({
          activityFeed: state.activityFeed.length >= MAX_ACTIVITY_EVENTS
            ? [...state.activityFeed.slice(-(MAX_ACTIVITY_EVENTS - 1)), event]
            : [...state.activityFeed, event],
        })),

      addActivityEvents: (events) =>
        set((state) => {
          if (events.length === 0) return state
          const combined = [...state.activityFeed, ...events]
          return {
            activityFeed: combined.length > MAX_ACTIVITY_EVENTS
              ? combined.slice(-MAX_ACTIVITY_EVENTS)
              : combined,
          }
        }),

      clearActivityFeed: (swarmId) =>
        set((state) => ({
          activityFeed: state.activityFeed.filter((e) => e.swarmId !== swarmId),
        })),

      // ── Operator inbox ────────────────────────────────────────

      addOperatorMessage: (message) =>
        set((state) => ({
          operatorMessages: state.operatorMessages.length >= 100
            ? [...state.operatorMessages.slice(-99), message]
            : [...state.operatorMessages, message],
        })),

      clearOperatorMessages: () => set({ operatorMessages: [] }),

      // ── Live agent interviews ──────────────────────────────────

      addInterview: (interview) =>
        set((state) => ({
          interviews: [...state.interviews, interview],
        })),

      updateInterview: (id, updates) =>
        set((state) => ({
          interviews: state.interviews.map((iv) =>
            iv.id === id ? { ...iv, ...updates } : iv,
          ),
        })),

      clearInterviews: () => set({ interviews: [] }),

      // ── Conflict detection ──────────────────────────────────

      addConflict: (conflict) => {
        const wasNew = !get().conflicts.some(
          (c) => c.filePath === conflict.filePath && c.swarmId === conflict.swarmId && c.status === 'active',
        )
        set((state) => {
          const existing = state.conflicts.find(
            (c) => c.filePath === conflict.filePath && c.swarmId === conflict.swarmId && c.status === 'active',
          )
          if (existing) {
            return {
              conflicts: state.conflicts.map((c) =>
                c.id === existing.id
                  ? {
                      ...c,
                      agents: conflict.agents,
                      severity: conflict.severity,
                      detectedAt: conflict.detectedAt,
                    }
                  : c,
              ),
            }
          }
          return {
            conflicts: [...state.conflicts.slice(-99), conflict],
          }
        })
        // Snapshot on NEW conflict detection
        if (wasNew) {
          const swarm = get().swarms.find((s) => s.id === conflict.swarmId)
          if (swarm) {
            createSnapshot('conflict', swarm.agents, swarm.tasks, swarm.messages, get().conflicts, swarm.startedAt)
          }
        }
      },

      resolveConflict: (id) =>
        set((state) => ({
          conflicts: state.conflicts.map((c) =>
            c.id === id ? { ...c, status: 'resolved' as const, resolvedAt: Date.now() } : c,
          ),
        })),

      clearConflicts: (swarmId) =>
        set((state) => ({
          conflicts: state.conflicts.filter((c) => c.swarmId !== swarmId),
        })),

      // ── Recovery events (Self-Heal) ─────────────────────────

      addRecoveryEvent: (event) =>
        set((state) => ({
          recoveryEvents: state.recoveryEvents.length >= 100
            ? [...state.recoveryEvents.slice(-99), event]
            : [...state.recoveryEvents, event],
        })),

      updateRecoveryEvent: (agentLabel, updates) =>
        set((state) => ({
          recoveryEvents: state.recoveryEvents.map((e) =>
            e.agentLabel === agentLabel ? { ...e, ...updates } : e,
          ),
        })),

      // ── CI/CD Pipelines (A5) ─────────────────────────────────

      updateCIPipeline: (agentLabel, pipeline) =>
        set((state) => ({
          ciPipelines: {
            ...state.ciPipelines,
            [agentLabel]: pipeline,
          },
        })),

      clearCIPipelines: (_swarmId) =>
        set({ ciPipelines: {} }),

      // ── Autonomy Gates (B11) ─────────────────────────────────

      setAutonomyRules: (rules) =>
        set({ autonomyRules: rules }),

      addApprovalRequest: (request) =>
        set((state) => ({
          approvalQueue: state.approvalQueue.length >= 200
            ? [...state.approvalQueue.slice(-199), request]
            : [...state.approvalQueue, request],
        })),

      resolveApproval: (id, approved) =>
        set((state) => ({
          approvalQueue: state.approvalQueue.map((req) =>
            req.id === id
              ? {
                  ...req,
                  status: (approved ? 'approved' : 'denied'),
                  resolvedAt: Date.now(),
                  resolvedBy: 'operator',
                }
              : req,
          ),
        })),

      // ── Checkpoint (Tier 3.3) ────────────────────────────────

      saveCheckpoint: async (swarmId: string) => {
        const swarm = get().swarms.find(s => s.id === swarmId)
        if (!swarm?.swarmRoot) return

        const checkpoint: SwarmCheckpoint = {
          swarmId,
          timestamp: Date.now(),
          agentSnapshots: swarm.agents.map(a => ({
            rosterId: a.rosterId,
            agentId: a.agentId,
            terminalId: a.terminalId,
            status: a.status,
            currentTask: a.currentTask,
            filesOwned: [...a.filesOwned],
          })),
          tasks: [...swarm.tasks],
          messages: swarm.messages.slice(-50), // Keep last 50 messages for context
        }

        try {
          await window.ghostshell.fsCreateFile(
            `${swarm.swarmRoot}/checkpoint.json`,
            JSON.stringify(checkpoint, null, 2),
          )
        } catch (err) {
          console.error('[SwarmStore] Failed to save checkpoint:', err)
        }
      },

      loadCheckpoint: async (swarmId: string) => {
        const swarm = get().swarms.find(s => s.id === swarmId)
        if (!swarm?.swarmRoot) return null

        try {
          const result = await window.ghostshell.fsReadFile(`${swarm.swarmRoot}/checkpoint.json`)
          if (!result.success || !result.content) return null
          const parsed = JSON.parse(result.content)
          // Validate checkpoint shape
          if (!parsed || parsed.swarmId !== swarmId || !Array.isArray(parsed.agentSnapshots)) {
            console.warn('[SwarmStore] Invalid checkpoint shape for', swarmId)
            return null
          }
          return parsed as SwarmCheckpoint
        } catch (err) {
          console.warn('[SwarmStore] Failed to load checkpoint:', err)
          return null
        }
      },

      // ── Performance Profiles (A7) ──────────────────────────────

      updatePerformanceProfile: (profile) =>
        set((state) => ({
          performanceProfiles: {
            ...state.performanceProfiles,
            [profile.agentLabel]: profile,
          },
        })),

      // ── ReACT Report (A8) ─────────────────────────────────────

      setReACTReport: (report) => set({ reactReport: report }),

      updateReACTReport: (updates) =>
        set((state) => ({
          reactReport: state.reactReport
            ? { ...state.reactReport, ...updates }
            : null,
        })),

      // ── Git Checkpoints (B10) ────────────────────────────────

      addGitCheckpoint: (checkpoint) =>
        set((state) => ({
          gitCheckpoints: state.gitCheckpoints.length >= 200
            ? [...state.gitCheckpoints.slice(-199), checkpoint]
            : [...state.gitCheckpoints, checkpoint],
        })),

      clearGitCheckpoints: (swarmId) =>
        set((state) => ({
          gitCheckpoints: state.gitCheckpoints.filter((c) => c.swarmId !== swarmId),
        })),

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
        activityFeed: [],         // Reset on persist (volatile)
        interviews: [],           // Reset on persist (volatile)
        conflicts: [],            // Reset on persist (volatile)
        recoveryEvents: [],       // Reset on persist (volatile)
        ciPipelines: {},          // Reset on persist (volatile)
        autonomyRules: [],        // Reset on persist (volatile)
        approvalQueue: [],        // Reset on persist (volatile)
        performanceProfiles: {},  // Reset on persist (volatile)
        reactReport: null,        // Reset on persist (volatile)
        gitCheckpoints: [],       // Reset on persist (volatile)
      }) as unknown as SwarmState,
    }
  )
)
