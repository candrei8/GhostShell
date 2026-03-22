import { Provider } from './types'
import type { MissionAnalysis } from './mission-planner'

// ─── Layout Preset IDs ──────────────────────────────────────────

/** Canonical preset identifiers — derived from ROSTER_PRESETS[].id */
export type SwarmLayoutPresetId = 'duo' | 'squad' | 'team' | 'platoon' | 'battalion' | 'legion' | 'custom'

// ─── Agent Roles ──────────────────────────────────────────────

export type SwarmAgentRole = 'coordinator' | 'builder' | 'scout' | 'reviewer' | 'analyst' | 'custom'

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
    id: 'analyst',
    label: 'Analyst',
    description: 'Monitors progress, detects bottlenecks, produces reports',
    icon: 'LineChart',
    color: '#ec4899',
    defaultCount: 0,
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
export const MAX_BUILDERS_PER_COORDINATOR = 7
/** Soft cap: warn above this count */
export const AGENT_SOFT_CAP = 15
/** Hard cap: refuse above this count */
export const AGENT_HARD_CAP = 50

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
    composition: { coordinator: 1, builder: 1, scout: 1, reviewer: 0, analyst: 0, custom: 0 },
    ramPerAgent: RAM_PER_AGENT_MB,
    description: 'Minimum viable swarm — fast, low overhead',
  },
  {
    id: 'squad',
    label: 'SQUAD',
    total: 5,
    composition: { coordinator: 1, builder: 2, scout: 1, reviewer: 1, analyst: 0, custom: 0 },
    ramPerAgent: RAM_PER_AGENT_MB,
    description: 'Sweet spot — Anthropic recommended team size',
  },
  {
    id: 'team',
    label: 'TEAM',
    total: 8,
    composition: { coordinator: 1, builder: 4, scout: 2, reviewer: 1, analyst: 0, custom: 0 },
    ramPerAgent: RAM_PER_AGENT_MB,
    description: 'Max for most machines — Cursor\'s cap',
  },
  {
    id: 'platoon',
    label: 'PLATOON',
    total: 12,
    composition: { coordinator: 2, builder: 5, scout: 3, reviewer: 2, analyst: 0, custom: 0 },
    ramPerAgent: RAM_PER_AGENT_MB,
    description: 'Power users — requires 32GB+ RAM, split coordinators',
  },
  {
    id: 'battalion',
    label: 'BATTALION',
    total: 20,
    composition: { coordinator: 2, builder: 12, scout: 3, reviewer: 3, analyst: 0, custom: 0 },
    ramPerAgent: RAM_PER_AGENT_MB,
    description: 'Large-scale — 2 coordinators, domain-split, 64GB+ RAM recommended',
  },
  {
    id: 'legion',
    label: 'LEGION',
    total: 30,
    composition: { coordinator: 3, builder: 18, scout: 5, reviewer: 4, analyst: 0, custom: 0 },
    ramPerAgent: RAM_PER_AGENT_MB,
    description: 'Maximum scale — 3 coordinators, triple-domain split, 128GB+ RAM',
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
  /** Coding persona ID — shapes the agent's working style and prompt */
  personaId?: string
}

// ─── Wizard Steps ─────────────────────────────────────────────

export type SwarmWizardStep = 'mission' | 'configure' | 'simulate' | 'launch'

export const SWARM_WIZARD_STEPS: SwarmWizardStep[] = [
  'mission',
  'configure',
  'simulate',
  'launch',
]

export interface SwarmWizardStepDef {
  id: SwarmWizardStep
  label: string
  icon: string
}

export const SWARM_WIZARD_STEP_DEFS: SwarmWizardStepDef[] = [
  { id: 'mission', label: 'MISIÓN', icon: 'MessageSquare' },
  { id: 'configure', label: 'CONFIGURAR', icon: 'Settings' },
  { id: 'simulate', label: 'SIMULAR', icon: 'Activity' },
  { id: 'launch', label: 'DESPLEGAR', icon: 'Rocket' },
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
  /** Pre-computed mission analysis from the planner (optional) */
  missionAnalysis?: MissionAnalysis
  /** Per-rule autonomy level overrides (rule ID -> level) */
  autonomyOverrides?: Record<string, AutonomyLevel>
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

// ─── Message Priority ───────────────────────────────────────

/** Priority levels for coordinator triage — urgent messages get injected faster */
export type SwarmMessagePriority = 'low' | 'normal' | 'urgent'

export interface SwarmMessage {
  id: string
  from: string
  to: string
  body: string
  type: 'message' | 'status' | 'escalation' | 'worker_done'
      | 'assignment' | 'review_request' | 'review_complete' | 'review_feedback' | 'heartbeat'
      | 'interview' | 'interview_response'
  meta?: Record<string, unknown>
  timestamp: number
  /** ID of the message this replies to — links messages into conversation threads */
  replyTo?: string
  /** Thread identifier grouping related exchanges (auto-generated from first message ID) */
  threadId?: string
  /** Message priority for coordinator triage (defaults to 'normal' when omitted) */
  priority?: SwarmMessagePriority
}

// ─── Conversation Threads ───────────────────────────────────

/**
 * A conversation thread — groups related SwarmMessages into a coherent
 * back-and-forth exchange. Built from messages sharing the same threadId.
 *
 * Used by the `gs-mail thread` subcommand and the UI thread view.
 */
export interface SwarmMessageThread {
  /** Thread ID (matches the threadId field on grouped messages) */
  id: string
  /** ID of the message that started this thread */
  rootMessageId: string
  /** Ordered message IDs in this thread (by timestamp) */
  messageIds: string[]
  /** Agent labels that have participated in this thread */
  participants: string[]
  /** Timestamp of the most recent message in this thread */
  lastActivityAt: number
  /** Total message count in the thread */
  messageCount: number
}

export interface SwarmTaskItem {
  id: string
  title: string
  owner: string         // roster agent id
  ownedFiles: string[]
  dependsOn: string[]   // other task IDs
  status: 'open' | 'assigned' | 'planning' | 'building' | 'review' | 'done'
  /** Timestamp when the task entered 'building' status */
  startedAt?: number
  /** Timestamp when the task entered 'done' status */
  completedAt?: number
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
  simulation?: SimulationResult
  debriefResult?: DebriefResult
}

// ─── Simulation ──────────────────────────────────────────────

export interface SimulationResult {
  predictedDuration: number           // total minutes
  criticalPath: string[]              // task IDs in order
  taskAssignments: SimulatedTask[]
  timeline: SimulatedTimelineSlot[]
  conflicts: SimulatedConflict[]
  risks: SimulatedRisk[]
  utilization: AgentUtilization[]
  llmInsights?: string[]              // optional LLM analysis results
  simulatedAt: number
}

export interface SimulatedTask {
  taskId: string
  assignedAgent: string               // rosterId
  predictedDuration: number           // minutes
  predictedStart: number              // relative minutes from swarm start
  predictedEnd: number
  isCriticalPath: boolean
  confidenceScore: number             // 0-100, higher = more historical data
}

export interface SimulatedTimelineSlot {
  agentRosterId: string
  taskId: string
  start: number                       // relative minutes
  end: number
}

export interface SimulatedConflict {
  filePath: string
  agents: string[]                    // rosterIds
  taskIds: string[]
  severity: 'warning' | 'critical'
  historicalFrequency: number         // from knowledge graph, 0 if no history
}

export interface SimulatedRisk {
  type: 'complexity' | 'unknown_territory' | 'cross_module' | 'historical_conflict' | 'bottleneck'
  severity: 'low' | 'medium' | 'high'
  description: string
  affectedFiles?: string[]
  affectedTasks?: string[]
}

export interface AgentUtilization {
  rosterId: string
  predictedBusyMinutes: number
  utilization: number                 // 0-1
  taskCount: number
  isBottleneck: boolean               // >0.9
  isUnderutilized: boolean            // <0.3
}

// ─── Knowledge Graph ─────────────────────────────────────────

export interface KGNode {
  id: string                          // prefixed: "file:...", "task:...", etc.
  type: 'file' | 'module' | 'task' | 'pattern' | 'finding' | 'decision'
  properties: Record<string, unknown>
  lastSeen: number
}

export interface KGEdge {
  from: string
  to: string
  type: 'modified_by' | 'depends_on' | 'discovered_by' | 'conflicted_with' | 'reviewed_by' | 'co_modified' | 'task_in_module'
  weight: number
  lastSeen: number
}

export interface KnowledgeGraph {
  version: number
  nodes: KGNode[]
  edges: KGEdge[]
  metadata: {
    lastUpdated: number
    totalSwarms: number
    totalTasks: number
  }
}

// ─── Debrief ─────────────────────────────────────────────────

export interface DebriefResult {
  interviews: { agentLabel: string; answers: { question: string; answer: string }[] }[]
  accuracy?: SimulationAccuracy
  learnings: string[]
  nextSteps: string[]
  completedAt: number
}

export interface SimulationAccuracy {
  predictedDuration: number
  actualDuration: number
  durationAccuracy: number            // 0-100%
  predictedConflicts: number
  actualConflicts: number
  taskAccuracy: { taskId: string; predicted: number; actual: number }[]
}

// ─── GhostSwarm Role Contract & Layout Model ─────────────────
//
// Centralized types for layout-aware agent behavior.
// Replaces ad-hoc role math scattered across swarm-prompts.ts,
// swarm-orchestrator.ts, and UI components.

// ─── Swarm Tier (derived from agent count) ───────────────────

/** Size tier derived from total roster count — drives behavioral adaptation */
export type SwarmTier = 'duo' | 'squad' | 'team' | 'platoon' | 'battalion' | 'legion'

// ─── Role Counts ─────────────────────────────────────────────

/** Pre-computed role counts for the full roster */
export interface SwarmRoleCounts {
  coordinators: number
  builders: number
  scouts: number
  reviewers: number
  analysts: number
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
    : T extends 'task_assignment' ? Record<string, unknown>
    : T extends 'context_bundle' ? Record<string, unknown>
    : never
  timestamp: number
}

// ─── Structured Report Schemas (JSON files in reports/) ──────
//
// These types define the JSON format that scouts and reviewers write
// to the reports/ directory. The message injector (pollReportsDirectory)
// watches for these files and auto-notifies relevant agents.

/** Discriminated report type tag — matches filename prefix convention. */
export type SwarmReportType = 'scout-findings' | 'review-report' | 'analyst-report'

/**
 * A scout findings JSON report written to `reports/scout-findings-*.json`.
 * The message injector detects these and notifies all builders + coordinator.
 *
 * Filename convention: `scout-findings-{scout-slug}-{timestamp}.json`
 */
export interface SwarmScoutReport {
  type: 'scout-findings'
  /** Scout label (e.g. "Scout 8") */
  author: string
  /** Domain or area covered (e.g. "frontend", "IPC layer") */
  domain: string
  /** Human-readable summary for notification messages */
  summary: string
  /** Critical files discovered */
  criticalFiles: string[]
  /** Risk factors or hazards */
  risks: string[]
  /** ISO timestamp of when the report was generated */
  timestamp: string
  /** Optional detailed findings (keyed by domain/topic) */
  findings?: SwarmScoutFinding[]
}

/**
 * A review report JSON written to `reports/review-report-*.json`.
 * The message injector detects these and notifies the coordinator.
 *
 * Filename convention: `review-report-{task-id}-{timestamp}.json`
 */
export interface SwarmReviewReport {
  type: 'review-report'
  /** Reviewer label (e.g. "Reviewer 11") */
  author: string
  /** Task ID being reviewed */
  taskId: string
  /** Review verdict */
  verdict: 'approved' | 'changes_requested' | 'approved_with_notes'
  /** Human-readable summary for notification messages */
  summary: string
  /** Detailed issues found */
  issues: SwarmReviewIssue[]
  /** Additional notes */
  notes: string[]
  /** ISO timestamp of when the review was completed */
  timestamp: string
}

/**
 * An analyst report JSON written to `reports/analyst/analyst-report-*.json`.
 * The message injector detects these and notifies the coordinator.
 *
 * Filename convention: `analyst-report-{timestamp}.json`
 */
export interface SwarmAnalystReport {
  type: 'analyst-report'
  /** Analyst label (e.g. "Analyst 1") */
  author: string
  /** ISO timestamp of when the report was generated */
  timestamp: string
  /** Human-readable summary of swarm progress */
  summary: string
  /** Task progress snapshot */
  taskProgress: {
    total: number
    done: number
    blocked: number
    inProgress: number
  }
  /** Detected bottlenecks with severity and suggested actions */
  bottlenecks: Array<{
    agentLabel: string
    issue: string
    suggestedAction: string
    severity: 'warning' | 'critical'
  }>
  /** Actionable recommendations for the coordinator */
  recommendations: string[]
  /** Velocity trend based on task completion rate */
  velocityTrend: 'improving' | 'stable' | 'declining'
}

/** Union type for all structured reports in the reports/ directory. */
export type SwarmReport = SwarmScoutReport | SwarmReviewReport | SwarmAnalystReport

// ─── Swarm Directory Layout ─────────────────────────────────
//
// Canonical subdirectory names within a swarm root. Used by the
// launcher to create the directory tree and by validators to
// verify the tree is intact.

/**
 * All subdirectories that must exist under a swarm root for the
 * runtime (message injector, heartbeat tracker, report watcher) to
 * function correctly.
 */
export const SWARM_SUBDIRECTORIES = [
  'bin',
  'inbox',
  'nudges',
  'knowledge',
  'heartbeats',
  'reports',
  'prompts',
] as const

export type SwarmSubdirectory = (typeof SWARM_SUBDIRECTORIES)[number]

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

// ─── Pipeline Stages ────────────────────────────────────────

export type SwarmPipelineStage = 'map' | 'plan' | 'launch' | 'monitor' | 'report' | 'archive'

export const SWARM_PIPELINE_STAGES: SwarmPipelineStage[] = [
  'map', 'plan', 'launch', 'monitor', 'report', 'archive',
]

// ─── Activity Feed ──────────────────────────────────────────

export type SwarmActivityEventType =
  | 'file_read' | 'file_write' | 'file_edit'
  | 'command_run' | 'tool_call' | 'search'
  | 'error' | 'thinking'
  | 'message_sent' | 'message_received'
  | 'task_created' | 'task_status_change'
  | 'subagent_spawn' | 'subagent_complete'
  | 'review_submit'

export interface SwarmActivityEvent {
  id: string
  timestamp: number
  agentLabel: string
  agentRole: SwarmAgentRole
  swarmId: string
  type: SwarmActivityEventType
  detail: string
  metadata?: Record<string, unknown>
}

// ─── Conflict Detection ─────────────────────────────────────

export interface SwarmFileConflict {
  id: string
  /** Swarm this conflict belongs to */
  swarmId: string
  filePath: string
  agents: Array<{
    label: string
    role: SwarmAgentRole
    operation: 'read' | 'write' | 'edit'
    detectedAt: number
  }>
  severity: 'warning' | 'critical'  // warning = read+write overlap, critical = write+write overlap
  status: 'active' | 'resolved'
  detectedAt: number
  resolvedAt?: number
}

// ─── Live Agent Interviews ──────────────────────────────────

export type SwarmInterviewStatus = 'pending' | 'sent' | 'answered' | 'timeout'

export interface SwarmInterview {
  id: string
  question: string
  targetAgent: string        // agent label
  targetTerminalId?: string
  status: SwarmInterviewStatus
  answer?: string
  sentAt: number
  answeredAt?: number
}

export interface SwarmBatchInterview {
  id: string
  question: string
  targets: string[]          // agent labels
  interviews: SwarmInterview[]
  createdAt: number
}

// ─── CI/CD Feedback Loop (A5) ──────────────────────────────

export type CICheckType = 'lint' | 'typecheck' | 'test' | 'build'
export type CICheckStatus = 'pending' | 'running' | 'passed' | 'failed' | 'skipped'

export interface CICheck {
  id: string
  type: CICheckType
  command: string
  status: CICheckStatus
  output?: string       // truncated to 500 chars
  duration?: number     // milliseconds
  triggeredBy: string   // agent label
  triggeredAt: number
}

export interface CIPipeline {
  agentLabel: string
  swarmId: string
  checks: CICheck[]
  lastRun: number
  passRate: number       // 0-100
}

// ─── Agent Performance Tracking (A7) ────────────────────────

export interface AgentPerformanceProfile {
  agentLabel: string
  role: SwarmAgentRole
  tasksCompleted: number
  tasksFailed: number
  avgTaskDurationMs: number
  /** Domain name → success rate 0-100 */
  domainScores: Record<string, number>
  lastUpdated: number
}

export interface RoutingSuggestion {
  taskId: string
  taskTitle: string
  suggestedAgent: string
  confidence: number // 0-100
  reason: string
}

// ─── ReACT Report (A8) ─────────────────────────────────────

export interface ReACTReportSection {
  title: string
  content: string
  toolsUsed: string[]
  generatedAt: string
}

export interface ReACTReport {
  swarmId: string
  swarmName: string
  sections: ReACTReportSection[]
  status: 'planning' | 'generating' | 'complete' | 'error'
  startedAt: number
  completedAt?: number
}

export type ReACTReportStatus = ReACTReport['status']

// ─── Git Checkpoints (B10: Conversation-Aware Rollback) ─────

export interface SwarmGitCheckpoint {
  id: string
  swarmId: string
  label: string          // e.g., "task-1-start", "task-1-complete", "pre-merge"
  gitRef: string         // git stash/commit ref hash
  createdAt: number
  agentLabel?: string
  taskId?: string
  isClean: boolean       // true if working tree was clean at capture time
  metadata?: {
    filesModified: string[]
    taskTitle?: string
  }
}

// ─── Configurable Autonomy Gates (B11) ──────────────────────

export type AutonomyLevel = 'full_auto' | 'review_required' | 'approval_gates' | 'supervised'

export interface AutonomyRule {
  id: string
  name: string
  description: string
  level: AutonomyLevel
  /** Action patterns this rule applies to (regex or substring) */
  patterns: string[]
  icon: string
  color: string
}

export interface ApprovalRequest {
  id: string
  swarmId: string
  agentLabel: string
  rule: AutonomyRule
  action: string        // what the agent wants to do
  detail: string        // specific file/command
  status: 'pending' | 'approved' | 'denied'
  requestedAt: number
  resolvedAt?: number
  resolvedBy?: string   // 'operator' or 'auto'
}
