import { useMemo, useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  AlertTriangle,
  Bookmark,
  Bot,
  ChevronDown,
  ChevronRight,
  Clock,
  FolderOpen,
  Play,
  Save,
  Search,
  Shield,
  Sparkles,
  Terminal,
  Trash2,
  X,
  Zap,
  Ghost,
} from 'lucide-react'
import { AgentAvatar } from '../agents/AgentAvatar'
import { useAgent } from '../../hooks/useAgent'
import { agentTemplates, type AgentTemplate, templateCategories, type TemplateCategory } from '../../lib/agent-templates'
import { getGhostshellApi, selectDirectorySafe } from '../../lib/ghostshell'
import { getDefaultModel, getProviderColor, getProviderLabel } from '../../lib/providers'
import {
  type AgentAvatarConfig,
  type ClaudeConfig,
  type CodexConfig,
  type GeminiConfig,
  type GridLayout,
  type Provider,
  type SavedAgentConfig,
} from '../../lib/types'
import { useSettingsStore } from '../../stores/settingsStore'
import { useTerminalStore } from '../../stores/terminalStore'
import { useWorkspaceStore } from '../../stores/workspaceStore'

interface QuickLaunchProps {
  onLaunched: () => void
}

type CategoryFilter = TemplateCategory | 'all'

const categoryOrder: TemplateCategory[] = ['development', 'quality', 'operations', 'architecture']

const gridOptions: { layout: GridLayout; label: string; count: number }[] = [
  { layout: '1x1', label: 'Solo', count: 1 },
  { layout: '1x2', label: 'Split', count: 2 },
  { layout: '1x3', label: 'Triple', count: 3 },
  { layout: '2x2', label: 'Quad', count: 4 },
  { layout: '2x3', label: 'Hex', count: 6 },
  { layout: '3x3', label: 'Grid', count: 9 },
]

const providerIcons: Record<Provider, typeof Ghost> = {
  claude: Ghost,
  gemini: Sparkles,
  codex: Bot,
}

const providerIconById: Record<Provider, string> = {
  claude: 'Ghost',
  gemini: 'Sparkles',
  codex: 'Bot',
}

const providerDescriptions: Record<Provider, string> = {
  claude: 'Careful reasoning, broader planning, and heavier implementation.',
  gemini: 'Fast iteration for mixed workloads, docs, and lightweight research.',
  codex: 'Terminal-first coding workflows with repo-oriented execution.',
}

function isProvider(value: unknown): value is Provider {
  return value === 'claude' || value === 'gemini' || value === 'codex'
}

function sanitizeProvider(value: unknown): Provider {
  return isProvider(value) ? value : 'claude'
}

function LayoutPreview({ layout, active }: { layout: GridLayout; active: boolean }) {
  const gap = 2
  const radius = 2
  const grids: Record<GridLayout, { rows: number; cols: number }> = {
    '1x1': { rows: 1, cols: 1 },
    '1x2': { rows: 1, cols: 2 },
    '1x3': { rows: 1, cols: 3 },
    '2x1': { rows: 2, cols: 1 },
    '2x2': { rows: 2, cols: 2 },
    '2x3': { rows: 2, cols: 3 },
    '3x1': { rows: 3, cols: 1 },
    '3x3': { rows: 3, cols: 3 },
  }
  const grid = grids[layout] || grids['1x1']
  const width = 36
  const height = 26
  const cellW = (width - gap * (grid.cols - 1)) / grid.cols
  const cellH = (height - gap * (grid.rows - 1)) / grid.rows

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} fill="none" aria-hidden="true">
      {Array.from({ length: grid.rows }, (_, row) =>
        Array.from({ length: grid.cols }, (_, col) => (
          <rect
            key={`${row}-${col}`}
            x={col * (cellW + gap)}
            y={row * (cellH + gap)}
            width={cellW}
            height={cellH}
            rx={radius}
            fill={active ? 'currentColor' : '#52657f'}
            opacity={active ? 0.92 : 0.36}
          />
        )),
      )}
    </svg>
  )
}

function getProviderAvatar(provider: Provider): AgentAvatarConfig {
  return {
    id: `quick-${provider}`,
    name: getProviderLabel(provider),
    icon: providerIconById[provider],
    color: getProviderColor(provider),
  }
}

function normalizeSavedAvatar(saved: SavedAgentConfig): AgentAvatarConfig {
  const fallback = getProviderAvatar(sanitizeProvider(saved.provider))
  const loose =
    saved.avatar && typeof saved.avatar === 'object'
      ? (saved.avatar as Partial<AgentAvatarConfig>)
      : {}
  return {
    id: typeof loose.id === 'string' && loose.id.trim() ? loose.id : fallback.id,
    name: typeof loose.name === 'string' && loose.name.trim() ? loose.name : fallback.name,
    icon: typeof loose.icon === 'string' && loose.icon.trim() ? loose.icon : fallback.icon,
    color: typeof loose.color === 'string' && loose.color.trim() ? loose.color : fallback.color,
  }
}

function getFolderName(path: string): string {
  const normalized = path.replace(/\\/g, '/').split('/').filter(Boolean)
  return normalized[normalized.length - 1] || path
}

function extractAllowedTools(flags: string[]): string[] {
  const idx = flags.indexOf('--allowedTools')
  if (idx === -1 || idx + 1 >= flags.length) return []
  return flags[idx + 1].split(',')
}

export function QuickLaunch({ onLaunched }: QuickLaunchProps) {
  const defaultModel = useSettingsStore((s) => s.defaultModel)
  const defaultGeminiModel = useSettingsStore((s) => s.defaultGeminiModel)
  const defaultCodexModel = useSettingsStore((s) => s.defaultCodexModel)
  const defaultSkipPermissions = useSettingsStore((s) => s.defaultSkipPermissions)
  const defaultProvider = useSettingsStore((s) => s.defaultProvider)
  const savedAgents = useSettingsStore((s) => s.savedAgents)
  const addSavedAgent = useSettingsStore((s) => s.addSavedAgent)
  const removeSavedAgent = useSettingsStore((s) => s.removeSavedAgent)
  const lastAgentFolder = useSettingsStore((s) => s.lastAgentFolder)
  const setLastAgentFolder = useSettingsStore((s) => s.setLastAgentFolder)

  const currentPath = useWorkspaceStore((s) => s.currentPath)
  const setCurrentPath = useWorkspaceStore((s) => s.setCurrentPath)
  const recentProjects = useWorkspaceStore((s) => s.recentProjects)

  const { createAgent } = useAgent()
  const safeDefaultProvider = sanitizeProvider(defaultProvider)
  const safeSavedAgents = useMemo(
    () =>
      (Array.isArray(savedAgents) ? savedAgents : []).filter(
        (entry): entry is SavedAgentConfig => !!entry && typeof entry === 'object',
      ),
    [savedAgents],
  )

  const resolveConfiguredModel = (targetProvider: Provider): string => {
    if (targetProvider === 'gemini') return defaultGeminiModel || getDefaultModel('gemini')
    if (targetProvider === 'codex') return defaultCodexModel || getDefaultModel('codex')
    return defaultModel || getDefaultModel('claude')
  }

  const [provider, setProvider] = useState<Provider>(safeDefaultProvider)
  const [projectPath, setProjectPath] = useState<string>(
    typeof lastAgentFolder === 'string' ? lastAgentFolder : '',
  )
  const [gridLayout, setGridLayout] = useState<GridLayout>('1x1')
  const [skipPermissions, setSkipPermissions] = useState(Boolean(defaultSkipPermissions))
  const [codexSandbox, setCodexSandbox] = useState<CodexConfig['sandbox']>('workspace-write')
  const [agentName, setAgentName] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<CategoryFilter>('all')
  const [launching, setLaunching] = useState(false)
  const [showPresets, setShowPresets] = useState(false)
  const [showRecents, setShowRecents] = useState(false)
  const [projectPickerError, setProjectPickerError] = useState<string | null>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)

  const selectedLayout = useMemo(
    () => gridOptions.find((g) => g.layout === gridLayout) || gridOptions[0],
    [gridLayout],
  )
  const providerColor = getProviderColor(provider)
  const providerLabel = getProviderLabel(provider)
  const resolvedProjectPath =
    (typeof projectPath === 'string' && projectPath) ||
    (typeof currentPath === 'string' ? currentPath : '')
  const selectedProjectName = resolvedProjectPath ? getFolderName(resolvedProjectPath) : 'No workspace selected'
  const launchCount = selectedLayout.count
  const canSelectProject = Boolean(getGhostshellApi()?.selectDirectory)

  const templatesMatchingSearch = useMemo(() => {
    const query = search.trim().toLowerCase()
    return agentTemplates.filter((template) => {
      if (!query) return true
      return (
        template.name.toLowerCase().includes(query) ||
        template.description.toLowerCase().includes(query) ||
        template.tags.some((tag) => tag.toLowerCase().includes(query))
      )
    })
  }, [search])

  const visibleTemplates = useMemo(() => {
    if (category === 'all') return templatesMatchingSearch
    return templatesMatchingSearch.filter((template) => template.category === category)
  }, [templatesMatchingSearch, category])

  const categoryCounts = useMemo(() => {
    const counts: Record<TemplateCategory, number> = {
      development: 0,
      quality: 0,
      operations: 0,
      architecture: 0,
    }
    for (const template of templatesMatchingSearch) {
      counts[template.category] += 1
    }
    return counts
  }, [templatesMatchingSearch])

  const groupedTemplates = useMemo(() => {
    const groups: Record<TemplateCategory, AgentTemplate[]> = {
      development: [],
      quality: [],
      operations: [],
      architecture: [],
    }
    for (const template of visibleTemplates) {
      groups[template.category].push(template)
    }
    return groups
  }, [visibleTemplates])

  const displayRecents = useMemo(
    () =>
      (Array.isArray(recentProjects) ? recentProjects : [])
        .filter((path): path is string => typeof path === 'string' && path !== resolvedProjectPath)
        .slice(0, 6),
    [recentProjects, resolvedProjectPath],
  )

  useEffect(() => {
    const timer = setTimeout(() => nameInputRef.current?.focus(), 120)
    return () => clearTimeout(timer)
  }, [])

  const handleProviderSwitch = (nextProvider: Provider) => {
    setProvider(nextProvider)
  }

  const selectProject = async () => {
    if (!canSelectProject) {
      setProjectPickerError('Folder picker is unavailable in the browser preview. Open GhostShell in Electron or use a recent workspace.')
      return
    }

    try {
      setProjectPickerError(null)
      const path = await selectDirectorySafe()
      if (!path) return
      setProjectPath(path)
      setCurrentPath(path)
      setLastAgentFolder(path)
    } catch (error) {
      setProjectPickerError(error instanceof Error ? error.message : 'Failed to open the folder picker.')
    }
  }

  const selectRecentProject = (path: string) => {
    setProjectPickerError(null)
    setProjectPath(path)
    setCurrentPath(path)
    setLastAgentFolder(path)
    setShowRecents(false)
  }

  const spawnByProvider = (
    targetProvider: Provider,
    name: string,
    cwd: string | undefined,
    config: {
      modelId: string
      skip: boolean
      avatar?: AgentAvatarConfig
      templateId?: string
      claudePrompt?: string
      claudeFlags?: string[]
      codexSandboxMode?: CodexConfig['sandbox']
    },
  ) => {
    const avatar = config.avatar || getProviderAvatar(targetProvider)

    if (targetProvider === 'gemini') {
      const geminiConfig: GeminiConfig = {
        model: config.modelId,
        yolo: config.skip,
      }
      return createAgent(
        name,
        avatar,
        avatar.color,
        {},
        cwd,
        config.templateId,
        undefined,
        true,
        'gemini',
        geminiConfig,
      ).sessionId
    }

    if (targetProvider === 'codex') {
      const codexConfig: CodexConfig = {
        model: config.modelId,
        fullAuto: config.skip,
        sandbox: config.codexSandboxMode || codexSandbox,
      }
      return createAgent(
        name,
        avatar,
        avatar.color,
        {},
        cwd,
        config.templateId,
        undefined,
        true,
        'codex',
        undefined,
        codexConfig,
      ).sessionId
    }

    const claudeFlags = config.claudeFlags || []
    const claudeConfig: ClaudeConfig = {
      model: config.modelId,
      dangerouslySkipPermissions: config.skip,
      systemPrompt: config.claudePrompt?.trim() || undefined,
      allowedTools: claudeFlags.length > 0 ? extractAllowedTools(claudeFlags) : [],
      customFlags: claudeFlags.length > 0 ? claudeFlags : undefined,
    }
    return createAgent(
      name,
      avatar,
      avatar.color,
      claudeConfig,
      cwd,
      config.templateId,
      undefined,
      true,
      'claude',
    ).sessionId
  }

  const createWorkspaceGroup = (baseName: string, sessionIds: string[]) => {
    if (sessionIds.length <= 1) return
    useTerminalStore.getState().addGroup({
      id: `group-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: `${baseName} (${sessionIds.length})`,
      sessionIds,
      createdAt: Date.now(),
    })
  }

  const executeLaunch = (task: () => void) => {
    if (launching) return
    setLaunching(true)
    try {
      task()
      onLaunched()
    } catch (error) {
      setLaunching(false)
      console.error('Quick launch failed:', error)
    }
  }

  const handleLaunchTerminal = () => {
    const cwd = projectPath || currentPath
    useTerminalStore.getState().addSession({
      id: `term-standalone-${Date.now()}`,
      title: 'Terminal',
      cwd,
    })
    onLaunched()
  }

  const handlePrimaryLaunch = () => {
    executeLaunch(() => {
      const cwd = projectPath || currentPath || undefined
      if (cwd) setLastAgentFolder(cwd)
      const baseName = agentName.trim() || providerLabel
      const sessionIds: string[] = []

      for (let i = 0; i < launchCount; i++) {
        const name = launchCount === 1 ? baseName : `${baseName} ${i + 1}`
        sessionIds.push(
          spawnByProvider(provider, name, cwd, {
            modelId: resolveConfiguredModel(provider),
            skip: skipPermissions,
            claudePrompt: provider === 'claude' ? systemPrompt : undefined,
          }),
        )
      }

      createWorkspaceGroup(baseName, sessionIds)
    })
  }

  const handleTemplateLaunch = (template: AgentTemplate) => {
    executeLaunch(() => {
      const templateProvider = template.provider || provider
      const cwd = projectPath || currentPath || undefined
      if (cwd) setLastAgentFolder(cwd)
      const sessionIds: string[] = []

      for (let i = 0; i < launchCount; i++) {
        const name = launchCount === 1 ? template.name : `${template.name} ${i + 1}`
        sessionIds.push(
          spawnByProvider(templateProvider, name, cwd, {
            modelId: resolveConfiguredModel(templateProvider),
            skip: skipPermissions,
            avatar: template.avatar,
            templateId: template.id,
            claudePrompt: template.systemPrompt,
            claudeFlags: template.claudeFlags,
          }),
        )
      }

      createWorkspaceGroup(template.name, sessionIds)
    })
  }

  const handleSavePreset = () => {
    const avatar = getProviderAvatar(provider)
    const name = agentName.trim() || `${providerLabel} Preset`
    const saved: SavedAgentConfig = {
      id: `saved-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name,
      avatar,
      provider,
      model: resolveConfiguredModel(provider),
      systemPrompt: provider === 'claude' ? (systemPrompt.trim() || undefined) : undefined,
      skipPermissions,
      cwd: projectPath || currentPath || undefined,
      createdAt: Date.now(),
    }
    addSavedAgent(saved)
  }

  const handleLaunchSaved = (saved: SavedAgentConfig) => {
    executeLaunch(() => {
      const savedProvider = sanitizeProvider(saved.provider)
      const cwd = saved.cwd || projectPath || currentPath || undefined
      if (cwd) setLastAgentFolder(cwd)
      const avatar = normalizeSavedAvatar(saved)
      const sessionIds: string[] = []
      const savedModel =
        typeof saved.model === 'string' && saved.model.trim()
          ? saved.model
          : resolveConfiguredModel(savedProvider)

      for (let i = 0; i < launchCount; i++) {
        const name = launchCount === 1 ? saved.name : `${saved.name} ${i + 1}`
        sessionIds.push(
          spawnByProvider(savedProvider, name, cwd, {
            modelId: savedModel,
            skip: saved.skipPermissions,
            avatar,
            claudePrompt: saved.systemPrompt,
          }),
        )
      }

      createWorkspaceGroup(saved.name, sessionIds)
    })
  }

  const ProviderIcon = providerIcons[provider]

  return (
    <div className="ql-root h-full w-full overflow-y-auto overflow-x-hidden">
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
        className="mx-auto flex min-h-full w-full max-w-[1680px] flex-col gap-5 px-5 py-4 sm:px-6 lg:px-8 lg:py-6"
      >
        <div className="ghost-glass-panel-strong rounded-[34px] px-6 py-6 sm:px-7 lg:px-8">
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
              <div className="max-w-4xl">
                <div className="flex items-center gap-4">
                  <div
                    className="flex h-14 w-14 items-center justify-center rounded-[20px] border"
                    style={{
                      borderColor: `${providerColor}35`,
                      backgroundColor: `${providerColor}16`,
                      color: providerColor,
                    }}
                  >
                    <ProviderIcon className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-white/36">Launch Pad</p>
                    <h1 className="mt-2 text-[clamp(1.9rem,3vw,2.8rem)] font-semibold leading-none tracking-tight text-white/96">
                      Prepare a workspace that feels like desktop software
                    </h1>
                    <p className="mt-3 max-w-3xl text-[14px] leading-7 text-white/56">
                      This view now uses the available screen space, larger controls, and clearer hierarchy so the first
                      interaction no longer feels miniature or misaligned.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                <button
                  onClick={handleLaunchTerminal}
                  className="flex h-10 items-center gap-2 rounded-full border border-white/[0.04] bg-white/[0.02] px-4 text-[13px] font-medium text-white/70 shadow-sm backdrop-blur-md transition-all hover:border-white/[0.08] hover:bg-white/[0.06] hover:text-white"
                >
                  <Terminal className="h-4 w-4" />
                  Open Plain Shell
                </button>
                <button
                  onClick={onLaunched}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-white/[0.04] bg-white/[0.02] text-white/50 shadow-sm backdrop-blur-md transition-all hover:border-rose-400/20 hover:bg-rose-500/10 hover:text-rose-400"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <div className="flex items-center gap-2.5 rounded-[12px] border border-white/[0.04] bg-black/20 px-3.5 py-2 shadow-sm backdrop-blur-md">
                <span className="text-[11px] font-medium text-white/40">Workspace</span>
                <div className="h-3 w-px bg-white/[0.08]" />
                <span className="max-w-[200px] truncate text-[12px] font-medium text-white/80">{selectedProjectName}</span>
              </div>
              <div className="flex items-center gap-2.5 rounded-[12px] border border-white/[0.04] bg-black/20 px-3.5 py-2 shadow-sm backdrop-blur-md">
                <span className="text-[11px] font-medium text-white/40">Layout</span>
                <div className="h-3 w-px bg-white/[0.08]" />
                <span className="text-[12px] font-medium text-white/80">{selectedLayout.label}</span>
              </div>
              <div className="flex items-center gap-2.5 rounded-[12px] border border-white/[0.04] bg-black/20 px-3.5 py-2 shadow-sm backdrop-blur-md">
                <span className="text-[11px] font-medium text-white/40">Mode</span>
                <div className="h-3 w-px bg-white/[0.08]" />
                <span className="text-[12px] font-medium text-white/80">{skipPermissions ? 'YOLO' : 'Safe'}</span>
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-3">
              {(['claude', 'gemini', 'codex'] as Provider[]).map((p) => {
                const active = provider === p
                const color = getProviderColor(p)
                const Icon = providerIcons[p]
                return (
                  <button
                    key={p}
                    onClick={() => handleProviderSwitch(p)}
                    className={`relative overflow-hidden rounded-[22px] border p-4 text-left transition-all ${
                      active
                        ? 'border-white/[0.1] bg-white/[0.06] shadow-lg'
                        : 'border-white/[0.04] bg-black/30 hover:border-white/[0.08] hover:bg-black/50'
                    }`}
                  >
                    {active && (
                      <motion.div
                        layoutId="ql-provider-card"
                        transition={{ type: 'spring', stiffness: 460, damping: 34 }}
                        className="absolute inset-0 rounded-[22px]"
                        style={{
                          background: `linear-gradient(135deg, ${color}15, transparent 70%)`,
                        }}
                      />
                    )}
                    <div className="relative z-10">
                      <div className="mb-3 flex items-center gap-3">
                        <div
                          className="flex h-10 w-10 items-center justify-center rounded-[14px]"
                          style={{ backgroundColor: `${color}18`, color }}
                        >
                          <Icon className="h-5 w-5" />
                        </div>
                        <div>
                          <p className={`text-[15px] font-semibold tracking-tight ${active ? 'text-white' : 'text-white/80'}`}>{getProviderLabel(p)}</p>
                          <p className="text-[11px] text-white/40">{active ? 'Selected provider' : 'Click to switch'}</p>
                        </div>
                      </div>
                      <p className={`text-[12px] leading-5 ${active ? 'text-white/70' : 'text-white/50'}`}>{providerDescriptions[p]}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <div className="grid gap-5 xl:flex-1 xl:min-h-0 xl:grid-cols-[minmax(430px,500px)_minmax(0,1fr)]">
          <section className="ghost-glass-panel relative flex min-h-0 flex-col overflow-hidden rounded-[30px] shadow-2xl">
            <div className="flex-1 overflow-y-auto p-5 pb-8 lg:p-6 lg:pb-8 ql-templates-scroll">
              <div className="mb-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/34">Session Setup</p>
              <h2 className="mt-2 text-[24px] font-semibold tracking-tight text-white/96">Configure the launch</h2>
              <p className="mt-2 text-[13px] leading-6 text-white/52">
                Set the repository, choose the model, define the layout, and save presets when the combination is worth reusing.
              </p>
            </div>

            <div className="space-y-4">
              <div className="rounded-[20px] border border-white/[0.04] bg-black/20 p-4 shadow-sm backdrop-blur-md">
                <div className="mb-4 flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/34">Workspace</p>
                    <p className="mt-2 text-[18px] font-semibold tracking-tight text-white/92">Repository and recents</p>
                  </div>
                  <div
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl"
                    style={{ backgroundColor: `${providerColor}14`, color: providerColor }}
                  >
                    <FolderOpen className="h-5 w-5" />
                  </div>
                </div>

                <button
                  onClick={selectProject}
                  disabled={!canSelectProject}
                  className="group flex w-full items-center gap-4 rounded-[18px] border border-white/[0.05] bg-black/40 px-4 py-4 text-left transition-all hover:border-white/[0.1] hover:bg-black/60 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[16px] font-semibold tracking-tight text-white/94">
                      {resolvedProjectPath ? selectedProjectName : 'Select a project folder'}
                    </p>
                    <p className="truncate text-[13px] text-white/45">
                      {resolvedProjectPath || 'Pick the folder that should anchor the launch.'}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-white/26 transition-transform group-hover:translate-x-0.5 group-hover:text-white/52" />
                </button>

                {!canSelectProject && (
                  <div className="mt-3 flex items-start gap-2 rounded-[14px] border border-amber-400/20 bg-amber-500/8 px-3 py-2.5 text-[12px] text-amber-100/80">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300/80" />
                    <p>Folder picker is unavailable in the browser preview. Open GhostShell in Electron or use a recent workspace.</p>
                  </div>
                )}

                {projectPickerError && canSelectProject && (
                  <div className="mt-3 flex items-start gap-2 rounded-[14px] border border-amber-400/20 bg-amber-500/8 px-3 py-2.5 text-[12px] text-amber-100/80">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300/80" />
                    <p>{projectPickerError}</p>
                  </div>
                )}

                {displayRecents.length > 0 && (
                  <div className="mt-4 border-t border-white/[0.04] pt-4">
                    <button
                      onClick={() => setShowRecents((value) => !value)}
                      className="flex w-full items-center gap-2 text-left text-[11px] font-semibold uppercase tracking-[0.22em] text-white/40 transition-colors hover:text-white/70"
                    >
                      <Clock className="h-3.5 w-3.5" />
                      Recent workspaces
                      <ChevronDown className={`ml-auto h-3.5 w-3.5 transition-transform ${showRecents ? 'rotate-180' : ''}`} />
                    </button>
                    <AnimatePresence>
                      {showRecents && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.18 }}
                          className="overflow-hidden"
                        >
                          <div className="mt-3 space-y-1">
                            {displayRecents.map((path) => (
                              <button
                                key={path}
                                onClick={() => selectRecentProject(path)}
                                className="flex w-full items-center gap-3 rounded-[12px] border border-transparent bg-transparent px-3 py-2.5 text-left transition-all hover:bg-white/[0.06]"
                              >
                                <FolderOpen className="h-4 w-4 shrink-0 text-white/40" />
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-[13px] font-medium text-white/80">{getFolderName(path)}</p>
                                  <p className="truncate text-[11px] text-white/40">{path}</p>
                                </div>
                              </button>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </div>

              <div className="rounded-[20px] border border-white/[0.04] bg-black/20 p-4 shadow-sm backdrop-blur-md">
                <div className="mb-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/34">Configuration</p>
                  <p className="mt-2 text-[18px] font-semibold tracking-tight text-white/92">Identity and layout</p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-3">
                    <input
                      ref={nameInputRef}
                      value={agentName}
                      onChange={(e) => setAgentName(e.target.value)}
                      placeholder={`${providerLabel} Agent`}
                      className="h-11 w-full rounded-[14px] border border-white/[0.04] bg-black/40 px-4 text-[13px] text-white/90 placeholder:text-white/30 shadow-inner transition-all focus:border-white/[0.12] focus:bg-black/60 focus:outline-none focus:ring-4 focus:ring-white/[0.02]"
                    />

                    {provider === 'claude' && (
                      <textarea
                        value={systemPrompt}
                        onChange={(e) => setSystemPrompt(e.target.value)}
                        rows={3}
                        placeholder="System prompt (optional)"
                        className="min-h-[80px] w-full resize-none rounded-[14px] border border-white/[0.04] bg-black/40 px-4 py-3 text-[13px] leading-relaxed text-white/90 placeholder:text-white/30 shadow-inner transition-all focus:border-white/[0.12] focus:bg-black/60 focus:outline-none focus:ring-4 focus:ring-white/[0.02]"
                      />
                    )}

                    {provider === 'codex' && (
                      <select
                        value={codexSandbox}
                        onChange={(e) => setCodexSandbox(e.target.value as CodexConfig['sandbox'])}
                        className="h-11 w-full rounded-[14px] border border-white/[0.04] bg-black/40 px-4 text-[13px] text-white/90 shadow-inner focus:border-white/[0.12] focus:outline-none"
                      >
                        <option value="workspace-write">workspace-write</option>
                        <option value="read-only">read-only</option>
                        <option value="danger-full-access">danger-full-access</option>
                      </select>
                    )}
                  </div>

                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between px-1">
                      <p className="text-[13px] font-medium text-white/70">Window Layout</p>
                      <span className="text-[12px] text-white/40">{selectedLayout.label}</span>
                    </div>
                    <div className="flex overflow-hidden rounded-[16px] bg-black/40 p-1 border border-white/[0.04] shadow-inner">
                      {gridOptions.map((option) => {
                        const active = option.layout === gridLayout
                        return (
                          <button
                            key={option.layout}
                            onClick={() => setGridLayout(option.layout)}
                            className={`relative flex flex-1 flex-col items-center justify-center gap-1.5 rounded-[12px] py-2.5 transition-all ${
                              active
                                ? 'text-white shadow-sm'
                                : 'text-white/40 hover:text-white/70'
                            }`}
                            title={`${option.label} (${option.count} pane${option.count > 1 ? 's' : ''})`}
                          >
                            {active && (
                              <motion.div
                                layoutId="layout-active-bg"
                                className="absolute inset-0 rounded-[12px] bg-white/[0.12] border border-white/[0.08] shadow-[0_2px_8px_rgba(0,0,0,0.2)]"
                                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                              />
                            )}
                            <div className="relative z-10 flex flex-col items-center gap-1">
                              <LayoutPreview layout={option.layout} active={active} />
                              <span className="text-[10px] font-medium">{option.label}</span>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 pt-2 sm:flex-row">
                    <button
                      onClick={handleSavePreset}
                      className="flex h-12 flex-1 items-center justify-center gap-2 rounded-[14px] border border-white/[0.06] bg-white/[0.02] px-4 text-[13px] font-medium text-white/60 shadow-sm transition-all hover:bg-white/[0.04] hover:text-white"
                    >
                      <Save className="h-4 w-4" />
                      Save Preset
                    </button>

                    <motion.button
                      onClick={handlePrimaryLaunch}
                      disabled={launching}
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                      className="group relative flex h-12 flex-[2] items-center justify-center gap-2.5 overflow-hidden rounded-[14px] px-5 text-[14px] font-medium text-white shadow-md transition-all disabled:opacity-50"
                      style={{
                        background: `linear-gradient(135deg, ${providerColor}40, ${providerColor}20)`,
                        border: `1px solid ${providerColor}40`,
                        boxShadow: `0 4px 12px ${providerColor}20`,
                      }}
                    >
                      <Zap className="h-4 w-4" />
                      {launching ? 'Launching...' : `Launch ${providerLabel}`}
                    </motion.button>
                  </div>

                  <button
                    onClick={() => setSkipPermissions((value) => !value)}
                    className={`flex w-full items-center justify-between gap-4 rounded-[16px] border px-4 py-3.5 text-left transition-all ${
                      skipPermissions
                        ? 'border-amber-500/20 bg-amber-500/10'
                        : 'border-white/[0.04] bg-black/40 hover:bg-black/60'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] ${
                          skipPermissions ? 'bg-amber-500/20 text-amber-400' : 'bg-white/[0.06] text-white/50'
                        }`}
                      >
                        {skipPermissions ? <AlertTriangle className="h-4 w-4" /> : <Shield className="h-4 w-4" />}
                      </div>
                      <div>
                        <p className={`text-[13px] font-medium ${skipPermissions ? 'text-amber-100' : 'text-white/80'}`}>{skipPermissions ? 'YOLO Mode Enabled' : 'Safe Mode Enabled'}</p>
                        <p className={`text-[11px] ${skipPermissions ? 'text-amber-200/60' : 'text-white/40'}`}>
                          {skipPermissions ? 'Skips approval prompts' : 'Requires approval for sensitive actions'}
                        </p>
                      </div>
                    </div>
                    <div className={`relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors ${skipPermissions ? 'bg-amber-500' : 'bg-white/10'}`}>
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${skipPermissions ? 'translate-x-5' : 'translate-x-1'}`} />
                    </div>
                  </button>
                </div>
              </div>
            </div>

            {safeSavedAgents.length > 0 && (
              <div className="mt-4 rounded-[20px] border border-white/[0.04] bg-black/20 p-4 shadow-sm backdrop-blur-md">
                <button
                  onClick={() => setShowPresets((value) => !value)}
                  className="flex w-full items-center gap-3 text-left transition-opacity hover:opacity-80"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-white/[0.04] text-white/50">
                    <Bookmark className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/40">Presets</p>
                    <p className="mt-0.5 text-[14px] font-medium tracking-tight text-white/90">Saved Configurations</p>
                  </div>
                  <span className="rounded-full bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-white/60">
                    {safeSavedAgents.length}
                  </span>
                  <ChevronDown className={`h-4 w-4 text-white/40 transition-transform ${showPresets ? 'rotate-180' : ''}`} />
                </button>

                <AnimatePresence>
                  {showPresets && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.18 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-4 flex flex-col overflow-hidden rounded-[16px] border border-white/[0.04] bg-black/40 shadow-inner">
                        {safeSavedAgents.map((saved, index) => {
                          const avatar = normalizeSavedAvatar(saved)
                          const savedColor = getProviderColor(sanitizeProvider(saved.provider))
                          return (
                            <div
                              key={saved.id}
                              className={`group flex items-center gap-3 px-3.5 py-3 transition-colors hover:bg-white/[0.04] ${
                                index !== 0 ? 'border-t border-white/[0.04]' : ''
                              }`}
                            >
                              <AgentAvatar avatar={avatar} size="sm" />
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-[13px] font-medium text-white/90">{saved.name}</p>
                                <p className="truncate text-[11px] text-white/50">{saved.model}</p>
                              </div>
                              <button
                                onClick={() => handleLaunchSaved(saved)}
                                disabled={launching}
                                className="flex h-8 items-center gap-1.5 rounded-full bg-white/[0.04] px-3 text-[11px] font-semibold transition-all hover:bg-white/[0.08] disabled:opacity-50"
                                style={{ color: savedColor }}
                              >
                                <Play className="h-3 w-3" />
                                Launch
                              </button>
                              <button
                                onClick={() => removeSavedAgent(saved.id)}
                                className="flex h-8 w-8 items-center justify-center rounded-full text-white/30 opacity-0 transition-all hover:bg-rose-500/20 hover:text-rose-400 group-hover:opacity-100"
                                aria-label={`Delete ${saved.name}`}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            </div>
          </section>

          <section className="ghost-glass-panel relative flex min-h-0 flex-col overflow-hidden rounded-[30px] shadow-2xl">
            <div className="flex-none border-b border-white/[0.04] p-5 pb-5 lg:p-6 lg:pb-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/34">Specialists</p>
              <h2 className="mt-2 text-[24px] font-semibold tracking-tight text-white/96">Launch a purpose-built teammate</h2>
              <p className="mt-2 text-[13px] leading-6 text-white/52">
                Templates are grouped by role so you can start from a concrete specialist instead of a blank shell.
              </p>

              <div className="mt-4 flex flex-col gap-3 xl:flex-row xl:items-center">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search specialists, tags, or outcomes"
                    className="h-11 w-full rounded-full border border-white/[0.04] bg-black/40 pl-11 pr-4 text-[13px] text-white/90 placeholder:text-white/40 shadow-inner transition-all focus:border-white/[0.12] focus:bg-black/60 focus:outline-none focus:ring-4 focus:ring-white/[0.02]"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-1.5 rounded-full border border-white/[0.04] bg-black/40 p-1 shadow-inner">
                  <button
                    onClick={() => setCategory('all')}
                    className={`rounded-full px-4 py-1.5 text-[12px] font-medium transition-all ${
                      category === 'all'
                        ? 'bg-white/[0.12] text-white shadow-sm'
                        : 'bg-transparent text-white/50 hover:text-white/80'
                    }`}
                  >
                    All
                  </button>
                  {categoryOrder.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setCategory(cat)}
                      className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[12px] font-medium transition-all ${
                        category === cat
                          ? 'bg-white/[0.12] text-white shadow-sm'
                          : 'bg-transparent text-white/50 hover:text-white/80'
                      }`}
                    >
                      {templateCategories[cat].label}
                      {categoryCounts[cat] > 0 && <span className="text-[10px] opacity-60">{categoryCounts[cat]}</span>}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5 pb-8 lg:p-6 lg:pb-8 ql-templates-scroll space-y-6">
              {categoryOrder.map((cat) => {
                const templates = groupedTemplates[cat]
                if (templates.length === 0) return null

                return (
                  <div key={cat}>
                    <div className="mb-3 flex items-center gap-3">
                      <span className="rounded-full bg-white/[0.05] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/40">
                        {templateCategories[cat].label}
                      </span>
                      <div className="h-px flex-1 bg-white/[0.05]" />
                    </div>

                    <div className="grid gap-3 xl:grid-cols-2 2xl:grid-cols-3">
                      {templates.map((template) => {
                        const templateProvider = template.provider || 'claude'
                        const templateColor = template.avatar.color
                        return (
                          <motion.button
                            key={template.id}
                            onClick={() => handleTemplateLaunch(template)}
                            disabled={launching}
                            whileHover={{ y: -2 }}
                            whileTap={{ scale: 0.995 }}
                            className="group relative flex min-h-[160px] flex-col justify-between overflow-hidden rounded-[20px] border border-white/[0.04] bg-black/20 p-4 text-left shadow-sm backdrop-blur-md transition-all hover:border-white/[0.08] hover:bg-black/40 hover:shadow-md disabled:opacity-50"
                          >
                            <div
                              className="pointer-events-none absolute -left-6 -top-8 h-28 w-28 rounded-full opacity-0 blur-3xl transition-opacity group-hover:opacity-60"
                              style={{ backgroundColor: templateColor }}
                            />

                            <div className="relative">
                              <div className="mb-4 flex items-start gap-3">
                                <div
                                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] border border-white/[0.04] transition-all"
                                  style={{
                                    backgroundColor: `${templateColor}10`,
                                    color: templateColor,
                                  }}
                                >
                                  <AgentAvatar
                                    avatar={template.avatar}
                                    size="sm"
                                    className="!rounded-none !border-0 !bg-transparent !shadow-none"
                                  />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <span
                                    className="inline-flex rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em]"
                                    style={{ backgroundColor: `${templateColor}15`, color: templateColor }}
                                  >
                                    {getProviderLabel(templateProvider)}
                                  </span>
                                  <p className="mt-2 truncate text-[14px] font-semibold tracking-tight text-white/90">{template.name}</p>
                                  <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-white/50">{template.description}</p>
                                </div>
                              </div>

                              <div className="flex flex-wrap gap-1.5">
                                {template.tags.slice(0, 3).map((tag) => (
                                  <span
                                    key={tag}
                                    className="rounded-full border border-white/[0.04] bg-white/[0.02] px-2 py-0.5 text-[10px] text-white/40"
                                  >
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            </div>

                            <div className="relative mt-4 flex items-center justify-between">
                              <span className="text-[11px] font-medium text-white/30 transition-colors group-hover:text-white/50">Launch Template</span>
                              <div
                                className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold opacity-0 transition-all group-hover:opacity-100"
                                style={{ backgroundColor: `${templateColor}15`, color: templateColor }}
                              >
                                <Play className="h-3 w-3" />
                                Run
                              </div>
                            </div>
                          </motion.button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}

              {visibleTemplates.length === 0 && (
                <div className="flex min-h-[260px] flex-col items-center justify-center rounded-[20px] border border-white/[0.04] bg-black/20 px-6 text-center shadow-sm backdrop-blur-md">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-white/[0.04]">
                    <Search className="h-5 w-5 text-white/40" />
                  </div>
                  <p className="text-[14px] font-medium text-white/80">No specialists match this search</p>
                  <p className="mt-1.5 max-w-xs text-[12px] leading-relaxed text-white/40">
                    Try selecting a different category or using a broader search keyword.
                  </p>
                </div>
              )}
            </div>
          </section>
        </div>
      </motion.div>
    </div>
  )
}
