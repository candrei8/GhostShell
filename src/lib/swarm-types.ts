import { Provider } from './types'

// ─── Layout Preset IDs ──────────────────────────────────────────

/** Canonical preset identifiers — derived from ROSTER_PRESETS[].id */
export type SwarmLayoutPresetId = 'duo' | 'squad' | 'team' | 'platoon' | 'custom'

// ─── Agent Roles ──────────────────────────────────────────────

export type SwarmAgentRole = 'coordinator' | 'builder' | 'scout' | 'reviewer' | 'custom'

export interface SwarmAgentRoleDef {
  id: SwarmAgentRole
  label: string
  description: string
  icon: string
  color: string
  /** Default count when adding this role in presets */
  defaultCount: number
}

export const SWARM_ROLES: SwarmAgentRoleDef[] = [
  {
    id: 'coordinator',
    label: 'Coordinator',
    description: 'Orchestrates tasks, assigns work, resolves conflicts',
    icon: 'Terminal',
    color: '#f59e0b',
    defaultCount: 1,
  },
  {
    id: 'builder',
    label: 'Builder',
    description: 'Writes production code, implements features',
    icon: 'Code2',
    color: '#3b82f6',
    defaultCount: 2,
  },
  {
    id: 'scout',
    label: 'Scout',
    description: 'Explores codebase, gathers intelligence, researches',
    icon: 'Radar',
    color: '#10b981',
    defaultCount: 1,
  },
  {
    id: 'reviewer',
    label: 'Reviewer',
    description: 'Reviews code quality, catches bugs, suggests improvements',
    icon: 'ShieldCheck',
    color: '#8b5cf6',
    defaultCount: 1,
  },
  {
    id: 'custom',
    label: 'Custom',
    description: 'Custom role with user-defined behavior',
    icon: 'Hexagon',
    color: '#6b7280',
    defaultCount: 0,
  },
]

export function getRoleDef(role: SwarmAgentRole): SwarmAgentRoleDef {
  return SWARM_ROLES.find((r) => r.id === role) || SWARM_ROLES[SWARM_ROLES.length - 1]
}

// ─── Roster Presets ───────────────────────────────────────────

export interface RosterPreset {
  id: string
  label: string
  total: number
  composition: Record<SwarmAgentRole, number>
  /** Estimated RAM per agent in MB (CLI + PTY + xterm) */
  ramPerAgent: number
  /** Description shown on hover */
  description: string
}

// ─── Scaling Constants ──────────────────────────────────────

/** Estimated RAM per agent: CLI ~300MB + PTY ~15MB + xterm ~8MB */
export const RAM_PER_AGENT_MB = 320
/** Max builders per coordinator before context exhaustion */
export const MAX_BUILDERS_PER_COORDINATOR = 5
/** Soft cap: warn above this count */
export const AGENT_SOFT_CAP = 8
/** Hard cap: refuse above this count */
export const AGENT_HARD_CAP = 15

/**
 * Realistic presets based on industry benchmarks:
 * - Anthropic recommends 3-5 agents
 * - Cursor caps at 8 parallel agents
 * - incident.io runs 4-5 in production
 * - Above 8: coordination overhead > parallelism gains
 * - Above 15: memory + renderer + API limits become critical
 */
export const ROSTER_PRESETS: RosterPreset[] = [
  {
    id: 'duo',
    label: 'DUO',
    total: 3,
    composition: { coordinator: 1, builder: 1, scout: 1, reviewer: 0, custom: 0 },
    ramPerAgent: RAM_PER_AGENT_MB,
    description: 'Minimum viable swarm — fast, low overhead',
  },
  {
    id: 'squad',
    label: 'SQUAD',
    total: 5,
    composition: { coordinator: 1, builder: 2, scout: 1, reviewer: 1, custom: 0 },
    ramPerAgent: RAM_PER_AGENT_MB,
    description: 'Sweet spot — Anthropic recommended team size',
  },
  {
    id: 'team',
    label: 'TEAM',
    total: 8,
    composition: { coordinator: 1, builder: 4, scout: 2, reviewer: 1, custom: 0 },
    ramPerAgent: RAM_PER_AGENT_MB,
    description: 'Max for most machines — Cursor\'s cap',
  },
  {
    id: 'platoon',
    label: 'PLATOON',
    total: 12,
    composition: { coordinator: 2, builder: 5, scout: 3, reviewer: 2, custom: 0 },
    ramPerAgent: RAM_PER_AGENT_MB,
    description: 'Power users — requires 32GB+ RAM, split coordinators',
  },
]

// ─── CLI Provider Options ─────────────────────────────────────

export type SwarmCliProvider = 'claude' | 'codex' | 'gemini' | 'opencode' | 'cursor' | 'droid' | 'copilot'

export interface SwarmCliProviderDef {
  id: SwarmCliProvider
  label: string
  icon: string
  color: string
  /** Maps to existing Provider type for agents that support it */
  coreProvider?: Provider
}

export const SWARM_CLI_PROVIDERS: SwarmCliProviderDef[] = [
  { id: 'claude', label: 'Claude', icon: 'BrainCircuit', color: '#a855f7', coreProvider: 'claude' },
  { id: 'codex', label: 'Codex', icon: 'Binary', color: '#10b981', coreProvider: 'codex' },
  { id: 'gemini', label: 'Gemini', icon: 'Aperture', color: '#3b82f6', coreProvider: 'gemini' },
  { id: 'opencode', label: 'OpenCode', icon: 'Braces', color: '#6366f1' },
  { id: 'cursor', label: 'Cursor', icon: 'TerminalSquare', color: '#f97316' },
  { id: 'droid', label: 'Droid', icon: 'Cpu', color: '#ef4444' },
  { id: 'copilot', label: 'Copilot', icon: 'Rocket', color: '#06b6d4' },
]

// ─── Swarm Agent (roster member) ──────────────────────────────

export interface SwarmRosterAgent {
  id: string
  role: SwarmAgentRole
  cliProvider: SwarmCliProvider
  autoApprove: boolean
  /** Custom name override */
  customName?: string
}

// ─── Wizard Steps ─────────────────────────────────────────────

export type SwarmWizardStep = 'roster' | 'mission' | 'directory' | 'context' | 'name'

export const SWARM_WIZARD_STEPS: SwarmWizardStep[] = [
  'roster',
  'mission',
  'directory',
  'context',
  'name',
]

export interface SwarmWizardStepDef {
  id: SwarmWizardStep
  label: string
  icon: string
}

export const SWARM_WIZARD_STEP_DEFS: SwarmWizardStepDef[] = [
  { id: 'roster', label: 'ROSTER', icon: 'Users' },
  { id: 'mission', label: 'MISSION', icon: 'MessageSquare' },
  { id: 'directory', label: 'DIRECTORY', icon: 'FolderOpen' },
  { id: 'context', label: 'CONTEXT', icon: 'BookOpen' },
  { id: 'name', label: 'NAME', icon: 'Type' },
]

// ─── Context File ─────────────────────────────────────────────

export interface SwarmContextFile {
  id: string
  name: string
  path: string
  size: number
}

// ─── Swarm Config (wizard output) ─────────────────────────────

export interface SwarmConfig {
  name: string
  mission: string
  directory: string
  roster: SwarmRosterAgent[]
  contextFiles: SwarmContextFile[]
  skills: string[]  // skill IDs
  createdAt: number
}

// ─── Live Swarm State ─────────────────────────────────────────

export type SwarmStatus = 'configuring' | 'launching' | 'running' | 'paused' | 'completed' | 'error'
export type SwarmAgentStatus = 'waiting' | 'planning' | 'building' | 'review' | 'done' | 'error' | 'idle'

export interface SwarmAgentState {
  rosterId: string
  agentId?: string        // linked to Agent in agentStore after launch
  terminalId?: string
  status: SwarmAgentStatus
  currentTask?: string
  progress?: string
  filesOwned: string[]
  messagesCount: number
}

export interface SwarmMessage {
  id: string
  from: string
  to: string
  body: string
  type: 'message' | 'status' | 'escalation' | 'worker_done'
      | 'assignment' | 'review_request' | 'review_complete' | 'review_feedback' | 'heartbeat'
  meta?: Record<string, unknown>
  timestamp: number
}

export interface SwarmTaskItem {
  id: string
  title: string
  owner: string         // roster agent id
  ownedFiles: string[]
  dependsOn: string[]   // other task IDs
  status: 'open' | 'assigned' | 'planning' | 'building' | 'review' | 'done'
  reviewer?: string
  verdict?: 'approved' | 'changes_requested' | 'approved_with_notes'
  acceptanceCriteria?: string[]
  description?: string
}

export interface Swarm {
  id: string
  config: SwarmConfig
  status: SwarmStatus
  agents: SwarmAgentState[]
  tasks: SwarmTaskItem[]
  messages: SwarmMessage[]
  startedAt?: number
  completedAt?: number
  swarmRoot?: string
}

// ─── GhostSwarm Role Contract & Layout Model ─────────────────
//
// Centralized types for layout-aware agent behavior.
// Replaces ad-hoc role math scattered across swarm-prompts.ts,
// swarm-orchestrator.ts, and UI components.

// ─── Swarm Tier (derived from agent count) ───────────────────

/** Size tier derived from total roster count — drives behavioral adaptation */
export type SwarmTier = 'duo' | 'squad' | 'team' | 'platoon'

// ─── Role Counts ─────────────────────────────────────────────

/** Pre-computed role counts for the full roster */
export interface SwarmRoleCounts {
  coordinators: number
  builders: number
  scouts: number
  reviewers: number
  custom: number
  total: number
}

// ─── Role Position ───────────────────────────────────────────

/**
 * Per-agent position within the swarm — combines layout context with
 * role-local indexing. This is the primary input for role specialization.
 *
 * Example: Builder 2 in a TEAM swarm (4 builders total)
 *   → { layoutPreset: 'team', swarmTier: 'team', roleIndex: 1,
 *        roleTotal: 4, isLead: false, swarmSize: 8, counts: {...} }
 */
export interface SwarmRolePosition {
  /** Which preset layout this swarm uses */
  layoutPreset: SwarmLayoutPresetId
  /** Derived size tier */
  swarmTier: SwarmTier
  /** This agent's 0-based index among agents of the SAME role */
  roleIndex: number
  /** Total agents sharing this role */
  roleTotal: number
  /** True when roleIndex === 0 — designates lead for this role group */
  isLead: boolean
  /** Total agents in the swarm */
  swarmSize: number
  /** Pre-computed counts for all roles */
  counts: SwarmRoleCounts
}

// ─── Role Behavior Hints ─────────────────────────────────────

/** Task granularity levels for coordinators */
export type SwarmTaskGranularity = 'coarse' | 'standard' | 'fine' | 'very-fine'

/** Agent autonomy levels — how much independent action is allowed */
export type SwarmAutonomyLevel = 'high' | 'standard' | 'guided' | 'strict'

/** Work scope boundaries */
export type SwarmWorkScope = 'full-stack' | 'task-scoped' | 'domain-scoped' | 'layer-scoped'

/**
 * Behavioral hints for a role at a specific swarm tier.
 * Consumed by the prompt system to generate layout-aware instructions.
 */
export interface SwarmRoleBehaviorHints {
  /** How finely tasks should be decomposed */
  taskGranularity: SwarmTaskGranularity
  /** How much independent decision-making is expected */
  autonomy: SwarmAutonomyLevel
  /** Boundaries of what this agent should touch */
  scope: SwarmWorkScope
  /** Whether a "lead" concept applies at this tier */
  hasLeadConcept: boolean
  /** Free-form behavioral notes for prompt generation */
  notes: string[]
}

// ─── Role Specialization Contract ────────────────────────────

/**
 * Complete behavioral contract for a role across all swarm tiers.
 * This is the single source of truth for "how should role X behave
 * in tier Y?" — replaces duplicated logic in prompt builders.
 */
export interface SwarmRoleContract {
  role: SwarmAgentRole
  /** Behavior hints keyed by swarm tier */
  tiers: Record<SwarmTier, SwarmRoleBehaviorHints>
}

// ─── Domain Ownership (multi-coordinator) ────────────────────

/** Named domain for splitting work in PLATOON+ swarms */
export interface SwarmDomain {
  /** Unique domain identifier (e.g. 'frontend', 'backend', 'infra') */
  id: string
  /** Human-readable label */
  label: string
  /** Glob patterns for files belonging to this domain */
  filePatterns: string[]
  /** Directory prefixes for quick matching */
  directoryPrefixes: string[]
}

/**
 * Assignment of agents to a domain — used when coordinators split ownership.
 * Each coordinator owns one domain and manages its assigned agents.
 */
export interface SwarmDomainAssignment {
  domain: SwarmDomain
  coordinatorLabel: string
  /** Builder labels assigned to this domain */
  builders: string[]
  /** Scout labels assigned to this domain */
  scouts: string[]
  /** Reviewer labels assigned to this domain */
  reviewers: string[]
}

// ─── Structured Handoff Schemas ──────────────────────────────

/** Handoff types for structured inter-role communication */
export type SwarmHandoffType =
  | 'scout_findings'
  | 'review_result'
  | 'task_assignment'
  | 'domain_split'
  | 'context_bundle'

/**
 * A structured scout finding — replaces free-text in FINDINGS.md
 * with machine-readable sections that builders can consume reliably.
 */
export interface SwarmScoutFinding {
  /** Domain this finding covers (e.g. 'frontend', 'backend') */
  domain: string
  /** Key files discovered in this domain */
  files: string[]
  /** Code patterns identified */
  patterns: string[]
  /** Risk factors or hazards */
  risks: string[]
  /** Actionable recommendations for builders */
  recommendations: string[]
}

/**
 * A single review issue from a reviewer.
 */
export interface SwarmReviewIssue {
  severity: 'critical' | 'major' | 'minor' | 'nit'
  file: string
  line?: number
  description: string
}

/**
 * Structured review result — replaces ad-hoc review messages
 * with a typed verdict + issue list.
 */
export interface SwarmReviewResult {
  taskId: string
  verdict: 'approved' | 'changes_requested' | 'approved_with_notes'
  issues: SwarmReviewIssue[]
  notes: string[]
}

/**
 * Generic typed handoff envelope — carries a typed payload between agents.
 * Can be serialized to JSON for the gs-mail --meta field.
 */
export interface SwarmHandoff<T extends SwarmHandoffType = SwarmHandoffType> {
  from: string
  to: string
  type: T
  payload: T extends 'scout_findings' ? SwarmScoutFinding[]
    : T extends 'review_result' ? SwarmReviewResult
    : T extends 'domain_split' ? SwarmDomainAssignment[]
    : Record<string, unknown>
  timestamp: number
}

// ─── Layout Preset Metadata ──────────────────────────────────

/**
 * Extended preset metadata — augments RosterPreset with layout-aware
 * behavioral defaults and domain templates.
 */
export interface SwarmLayoutPreset {
  id: SwarmLayoutPresetId
  tier: SwarmTier
  label: string
  total: number
  composition: Record<SwarmAgentRole, number>
  /** RAM estimate in MB (per agent) */
  ramPerAgent: number
  description: string
  /** Default task sizing guidance for coordinators */
  taskSizingHint: string
  /** Whether this preset needs multi-coordinator protocol */
  multiCoordinator: boolean
  /** Default domain template (if multi-coordinator) */
  domainTemplates: SwarmDomain[]
  /** Recommended scout coverage strategy */
  scoutStrategy: 'full-codebase' | 'domain-split' | 'deep-specialization'
  /** Recommended review strategy */
  reviewStrategy: 'self-review' | 'sequential' | 'round-robin' | 'domain-split'
}
