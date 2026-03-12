import { useTerminalStore } from '../stores/terminalStore'
import { useAgentStore } from '../stores/agentStore'
import { AgentAvatarConfig, ClaudeConfig, GeminiConfig, CodexConfig, Provider, SessionGroup } from './types'

const SNAPSHOT_KEY = 'ghostshell-tab-snapshot'
const SNAPSHOT_VERSION = 2

export interface SavedSession {
  id: string
  title: string
  cwd: string
  shell?: string
  description?: string
  agentId?: string // original agent ID — remapped on restore
}

export interface SavedAgent {
  originalId: string
  name: string
  avatar: AgentAvatarConfig
  color: string
  provider: Provider
  claudeConfig: ClaudeConfig
  geminiConfig?: GeminiConfig
  codexConfig?: CodexConfig
  cwd: string
  hasConversation: boolean
  templateId?: string
}

export interface TabSnapshot {
  version: number
  timestamp: number
  sessions: SavedSession[]
  agents: SavedAgent[]
  groups: SessionGroup[]
  activeSessionId: string | null
  activeWorkspaceId: string | null
  activeSessionIndex: number
  viewMode: 'tabs' | 'grid'
  tabsCollapsed: boolean
}

export function buildSnapshot(): TabSnapshot {
  const {
    sessions,
    groups,
    activeSessionId,
    activeWorkspaceId,
    viewMode,
    tabsCollapsed,
  } = useTerminalStore.getState()
  const { agents } = useAgentStore.getState()

  const savedAgents: SavedAgent[] = agents.map((a) => ({
    originalId: a.id,
    name: a.name,
    avatar: a.avatar,
    color: a.color,
    provider: a.provider || 'claude',
    claudeConfig: a.claudeConfig,
    geminiConfig: a.geminiConfig,
    codexConfig: a.codexConfig,
    cwd: a.cwd,
    hasConversation: a.hasConversation ?? false,
    templateId: a.templateId,
  }))

  const savedSessions: SavedSession[] = sessions.map((s) => ({
    id: s.id,
    title: s.title,
    cwd: s.cwd,
    shell: s.shell,
    description: s.description,
    agentId: s.agentId,
  }))

  const activeIndex = sessions.findIndex((s) => s.id === activeSessionId)

  return {
    version: SNAPSHOT_VERSION,
    timestamp: Date.now(),
    sessions: savedSessions,
    agents: savedAgents,
    groups,
    activeSessionId,
    activeWorkspaceId,
    activeSessionIndex: activeIndex >= 0 ? activeIndex : 0,
    viewMode,
    tabsCollapsed,
  }
}

export async function saveTabSnapshot(snapshot: TabSnapshot): Promise<void> {
  if (!window.ghostshell?.storageSet) return
  await window.ghostshell.storageSet(SNAPSHOT_KEY, snapshot)
}

export async function loadTabSnapshot(): Promise<TabSnapshot | null> {
  if (!window.ghostshell?.storageGet) return null
  const data = await window.ghostshell.storageGet(SNAPSHOT_KEY)
  if (!data || typeof data !== 'object') return null
  const snap = data as TabSnapshot
  if (snap.version !== SNAPSHOT_VERSION) return null
  return snap
}

export async function clearTabSnapshot(): Promise<void> {
  if (!window.ghostshell?.storageRemove) return
  await window.ghostshell.storageRemove(SNAPSHOT_KEY)
}
