export interface AgentAvatarConfig {
  id: string
  name: string
  icon: string
  color: string
}

export type Provider = 'claude' | 'gemini' | 'codex'

export interface ClaudeConfig {
  model?: string
  systemPrompt?: string
  dangerouslySkipPermissions?: boolean
  allowedTools?: string[]
  maxTurns?: number
  customFlags?: string[]
}

export interface GeminiConfig {
  model?: string
  yolo?: boolean
  sandbox?: boolean
  debug?: boolean
  customFlags?: string[]
}

export interface CodexConfig {
  model?: string
  fullAuto?: boolean
  sandbox?: 'workspace-write' | 'read-only' | 'danger-full-access'
  customFlags?: string[]
}

export interface Agent {
  id: string
  name: string
  avatar: AgentAvatarConfig
  status: 'idle' | 'working' | 'error' | 'offline'
  threadId?: string
  terminalId?: string
  color: string
  createdAt: number
  templateId?: string
  provider?: Provider
  claudeConfig: ClaudeConfig
  geminiConfig?: GeminiConfig
  codexConfig?: CodexConfig
  cwd: string
  /** Whether this agent had a conversation (enables --continue on restart for Claude) */
  hasConversation?: boolean
}

export interface Thread {
  id: string
  name: string
  icon: string
  description: string
  agentIds: string[]
  createdAt: number
  isExpanded: boolean
}

export interface TerminalSession {
  id: string
  agentId?: string
  title: string
  description?: string
  isActive: boolean
  cwd: string
  shell?: string
  /** Provider inferred from a standalone CLI launched inside this terminal. */
  detectedProvider?: Provider
  /** Skip auto-launching Claude in usePty (e.g. restartAgent handles launch with --continue) */
  skipAutoLaunch?: boolean
}

export interface Workspace {
  id: string
  name: string
  path: string
  lastOpened: number
}

export type GridLayout = '1x1' | '1x2' | '1x3' | '2x1' | '2x2' | '2x3' | '3x1' | '3x3'

export interface ThemeColors {
  bg: string
  surface: string
  sidebar: string
  border: string
  text: string
  textDim: string
  accent: string
  accent2: string
  accent3: string
  success: string
  warning: string
  error: string
}

export interface Theme {
  id: string
  name: string
  colors: ThemeColors
  terminalColors: TerminalTheme
}

export interface TerminalTheme {
  background: string
  foreground: string
  cursor: string
  cursorAccent: string
  selectionBackground: string
  black: string
  red: string
  green: string
  yellow: string
  blue: string
  magenta: string
  cyan: string
  white: string
  brightBlack: string
  brightRed: string
  brightGreen: string
  brightYellow: string
  brightBlue: string
  brightMagenta: string
  brightCyan: string
  brightWhite: string
}

export interface FileEntry {
  name: string
  isDirectory: boolean
  path: string
  size?: number
  modifiedAt?: number
}

export interface GitStatus {
  branch: string
  modified: number
  added: number
  deleted: number
  ahead: number
  total: number
  isRepo: boolean
  fileStatuses?: Record<string, string>
}

// Saved custom agent configuration (persisted across sessions)
export interface SavedAgentConfig {
  id: string
  name: string
  avatar: AgentAvatarConfig
  provider: Provider
  model: string
  systemPrompt?: string
  skipPermissions: boolean
  cwd?: string
  createdAt: number
}

export type SidebarView = 'files' | 'agents' | 'settings' | 'history' | 'blocks' | 'swarm'

// Session grouping
export interface SessionGroup {
  id: string
  name: string
  sessionIds: string[]
  createdAt: number
  icon?: string
}

// Claude activity tracking
export type ClaudeActivity =
  | 'idle'
  | 'thinking'
  | 'reading'
  | 'writing'
  | 'editing'
  | 'running_bash'
  | 'searching'
  | 'planning'
  | 'permission'
  | 'sub_agent'
  | 'task_create'
  | 'task_update'
  | 'web_search'
  | 'web_fetch'

export type SubAgentType = 'Explore' | 'Plan' | 'Bash' | 'general-purpose' | 'unknown'
export type SubAgentStatus = 'spawning' | 'running' | 'completed' | 'error'

export interface SubAgentOutputLine {
  timestamp: number
  text: string
}

export type SubAgentDomain =
  | 'frontend' | 'backend' | 'database'
  | 'testing' | 'devops' | 'docs' | 'config' | 'general'

export interface SubAgent {
  id: string
  agentId: string
  type: SubAgentType
  description: string
  status: SubAgentStatus
  model?: string
  startTime: number
  endTime?: number
  activeForm?: string
  outputLines?: SubAgentOutputLine[]
  domain?: SubAgentDomain
}

export interface TaskItem {
  id: string
  agentId: string
  subject: string
  status: 'pending' | 'in_progress' | 'completed'
  activeForm?: string
  createdAt: number
}

export interface ContextMetrics {
  tokenEstimate: number
  maxTokens: number
  turnCount: number
  costEstimate: number
  usagePercentage?: number
  lastUpdatedAt?: number
}

export interface FileTouch {
  path: string
  operation: 'read' | 'write' | 'edit'
  timestamp: number
  agentId: string
}

export interface ActivityEvent {
  id: string
  type: ClaudeActivity
  tool?: string
  detail?: string
  timestamp: number
}

export interface AgentActivity {
  agentId: string
  currentActivity: ClaudeActivity
  currentDetail?: string
  filesTouched: FileTouch[]
  activityLog: ActivityEvent[]
  subAgents: SubAgent[]
  tasks: TaskItem[]
  contextMetrics: ContextMetrics
  lastActivityTime: number
  sessionStartTime: number
}

export type SplitDirection = 'horizontal' | 'vertical'

export interface SplitLayout {
  direction: SplitDirection
  sizes: number[]
  children: (string | SplitLayout)[]
}

declare global {
  interface Window {
    ghostshell: {
      windowMinimize: () => void
      windowMaximize: () => void
      windowClose: () => void
      windowIsMaximized: () => Promise<boolean>
      ptyCreate: (options: { id: string; shell?: string; cwd?: string; cols?: number; rows?: number; provider?: Provider }) => Promise<{ success: boolean; error?: string }>
      ptyWrite: (id: string, data: string) => void
      ptyResize: (id: string, cols: number, rows: number) => void
      ptyKill: (id: string) => void
      ptyGetCwd: (id: string) => Promise<string | null>
      ptyOnData: (id: string, callback: (data: string) => void) => () => void
      ptyOnExit: (id: string, callback: (exitCode: number) => void) => () => void
      fsReadDir: (path: string) => Promise<FileEntry[]>
      fsCreateFile: (filePath: string, content?: string) => Promise<{ success: boolean; error?: string }>
      fsCreateDir: (dirPath: string) => Promise<{ success: boolean; error?: string }>
      fsCopy: (sourcePath: string, destinationPath: string) => Promise<{ success: boolean; error?: string }>
      fsRename: (oldPath: string, newPath: string) => Promise<{ success: boolean; error?: string }>
      fsDelete: (targetPath: string) => Promise<{ success: boolean; error?: string }>
      gitStatus: (cwd: string) => Promise<GitStatus>
      selectDirectory: () => Promise<string | null>
      workspaceSave: (name: string, data: unknown) => Promise<boolean>
      workspaceLoad: (name: string) => Promise<unknown | null>
      workspaceList: () => Promise<string[]>
      fsPreview: (filePath: string, maxLines?: number) => Promise<{ success: boolean; content: string; totalLines: number; error?: string }>
      saveTempImage: (buffer: ArrayBuffer, mimeType: string) => Promise<string>
      showNotification: (title: string, body?: string) => void
      getVersion: () => Promise<string>
      storageGet: (key: string) => Promise<unknown | null>
      storageSet: (key: string, value: unknown) => Promise<{ success: boolean; error?: string }>
      storageRemove: (key: string) => Promise<{ success: boolean; error?: string }>
      cliDiscoverModels: (provider: Provider, command?: string) => Promise<{ success: boolean; output: string; error?: string }>
      cliGetVersion: (cli: string) => Promise<{ installed: boolean; version: string }>
      updaterCheck: () => Promise<{ success: boolean; version?: string; error?: string }>
      updaterDownload: () => Promise<{ success: boolean; error?: string }>
      updaterInstall: () => void
      onUpdaterStatus: (cb: (status: Record<string, unknown>) => void) => () => void
      onBeforeClose: (callback: () => void) => () => void
      closeReady: () => void
    }
  }
}
