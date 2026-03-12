import { Provider } from './types'

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
    icon: 'Crown',
    color: '#f59e0b',
    defaultCount: 1,
  },
  {
    id: 'builder',
    label: 'Builder',
    description: 'Writes production code, implements features',
    icon: 'Hammer',
    color: '#3b82f6',
    defaultCount: 2,
  },
  {
    id: 'scout',
    label: 'Scout',
    description: 'Explores codebase, gathers intelligence, researches',
    icon: 'Search',
    color: '#10b981',
    defaultCount: 1,
  },
  {
    id: 'reviewer',
    label: 'Reviewer',
    description: 'Reviews code quality, catches bugs, suggests improvements',
    icon: 'Eye',
    color: '#8b5cf6',
    defaultCount: 1,
  },
  {
    id: 'custom',
    label: 'Custom',
    description: 'Custom role with user-defined behavior',
    icon: 'Wrench',
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
}

export const ROSTER_PRESETS: RosterPreset[] = [
  {
    id: 'squad',
    label: 'SQUAD',
    total: 5,
    composition: { coordinator: 1, builder: 2, scout: 1, reviewer: 1, custom: 0 },
  },
  {
    id: 'team',
    label: 'TEAM',
    total: 10,
    composition: { coordinator: 1, builder: 5, scout: 2, reviewer: 2, custom: 0 },
  },
  {
    id: 'platoon',
    label: 'PLATOON',
    total: 15,
    composition: { coordinator: 2, builder: 8, scout: 3, reviewer: 2, custom: 0 },
  },
  {
    id: 'battalion',
    label: 'BATTALION',
    total: 20,
    composition: { coordinator: 2, builder: 10, scout: 4, reviewer: 4, custom: 0 },
  },
  {
    id: 'legion',
    label: 'LEGION',
    total: 50,
    composition: { coordinator: 3, builder: 28, scout: 10, reviewer: 9, custom: 0 },
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
  { id: 'claude', label: 'Claude', icon: 'Ghost', color: '#a855f7', coreProvider: 'claude' },
  { id: 'codex', label: 'Codex', icon: 'Bot', color: '#10b981', coreProvider: 'codex' },
  { id: 'gemini', label: 'Gemini', icon: 'Sparkles', color: '#3b82f6', coreProvider: 'gemini' },
  { id: 'opencode', label: 'OpenCode', icon: 'Code', color: '#6366f1' },
  { id: 'cursor', label: 'Cursor', icon: 'MousePointer', color: '#f97316' },
  { id: 'droid', label: 'Droid', icon: 'Cpu', color: '#ef4444' },
  { id: 'copilot', label: 'Copilot', icon: 'Zap', color: '#06b6d4' },
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
  timestamp: number
}

export interface SwarmTaskItem {
  id: string
  title: string
  owner: string         // roster agent id
  ownedFiles: string[]
  dependsOn: string[]   // other task IDs
  status: 'open' | 'assigned' | 'planning' | 'building' | 'review' | 'done'
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
}
