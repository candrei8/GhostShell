import { useTerminalStore } from '../stores/terminalStore'
import { useAgentStore } from '../stores/agentStore'
import { AnimalAvatar, ClaudeConfig, GeminiConfig, CodexConfig, Provider } from './types'

const SNAPSHOT_KEY = 'ghostshell-tab-snapshot'
const SNAPSHOT_VERSION = 1

export interface SavedSession {
  title: string
  cwd: string
  shell?: string
  agentId?: string // original agent ID — remapped on restore
}

export interface SavedAgent {
  originalId: string
  name: string
  avatar: AnimalAvatar
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
  activeSessionIndex: number
  viewMode: 'tabs' | 'grid'
}

export function buildSnapshot(): TabSnapshot {
  const { sessions, activeSessionId, viewMode } = useTerminalStore.getState()
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
    title: s.title,
    cwd: s.cwd,
    shell: s.shell,
    agentId: s.agentId,
  }))

  const activeIndex = sessions.findIndex((s) => s.id === activeSessionId)

  return {
    version: SNAPSHOT_VERSION,
    timestamp: Date.now(),
    sessions: savedSessions,
    agents: savedAgents,
    activeSessionIndex: activeIndex >= 0 ? activeIndex : 0,
    viewMode,
  }
}

export async function saveTabSnapshot(snapshot: TabSnapshot): Promise<void> {
  await window.ghostshell.storageSet(SNAPSHOT_KEY, snapshot)
}

export async function loadTabSnapshot(): Promise<TabSnapshot | null> {
  const data = await window.ghostshell.storageGet(SNAPSHOT_KEY)
  if (!data || typeof data !== 'object') return null
  const snap = data as TabSnapshot
  if (snap.version !== SNAPSHOT_VERSION) return null
  return snap
}

export async function clearTabSnapshot(): Promise<void> {
  await window.ghostshell.storageRemove(SNAPSHOT_KEY)
}
