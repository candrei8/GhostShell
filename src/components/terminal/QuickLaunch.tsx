import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  FolderOpen,
  Zap,
  Shield,
  ShieldOff,
  Clock,
  Terminal,
  Search,
  Sparkles,
  AlertTriangle,
  ChevronRight,
  Save,
  Trash2,
  Play,
} from 'lucide-react'
import { agentTemplates, AgentTemplate, templateCategories, TemplateCategory } from '../../lib/agent-templates'
import { useAgent } from '../../hooks/useAgent'
import { useWorkspaceStore } from '../../stores/workspaceStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useTerminalStore } from '../../stores/terminalStore'
import { GridLayout, ClaudeConfig, GeminiConfig, CodexConfig, Provider, SavedAgentConfig } from '../../lib/types'
import { getModelsForProvider, getDefaultModel, getProviderColor, getProviderEmoji } from '../../lib/providers'

interface QuickLaunchProps {
  onLaunched: () => void
}

// --- Layout Preview SVGs ---
function LayoutPreview({ layout, active }: { layout: GridLayout; active: boolean }) {
  const color = active ? 'var(--ghost-accent)' : 'var(--ghost-text-dim)'
  const opacity = active ? 1 : 0.4
  const gap = 1.5
  const r = 1

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

  const g = grids[layout] || { rows: 1, cols: 1 }
  const w = 24
  const h = 18
  const cellW = (w - gap * (g.cols - 1)) / g.cols
  const cellH = (h - gap * (g.rows - 1)) / g.rows

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="none">
      {Array.from({ length: g.rows }, (_, row) =>
        Array.from({ length: g.cols }, (_, col) => (
          <rect
            key={`${row}-${col}`}
            x={col * (cellW + gap)}
            y={row * (cellH + gap)}
            width={cellW}
            height={cellH}
            rx={r}
            fill={color}
            opacity={opacity}
          />
        )),
      )}
    </svg>
  )
}

const gridOptions: { layout: GridLayout; label: string; count: number }[] = [
  { layout: '1x1', label: 'Single', count: 1 },
  { layout: '1x2', label: 'Split', count: 2 },
  { layout: '1x3', label: 'Triple', count: 3 },
  { layout: '2x2', label: 'Quad', count: 4 },
  { layout: '2x3', label: 'Six', count: 6 },
  { layout: '3x3', label: 'Nine', count: 9 },
]

// Models are now loaded dynamically from providers.ts based on selected provider

const categoryOrder: TemplateCategory[] = ['development', 'quality', 'operations', 'architecture']

// Animation variants
const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.04 },
  },
}

const item = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.2 } },
}

export function QuickLaunch({ onLaunched }: QuickLaunchProps) {
  const defaultModel = useSettingsStore((s) => s.defaultModel)
  const defaultSkip = useSettingsStore((s) => s.defaultSkipPermissions)
  const defaultProvider = useSettingsStore((s) => s.defaultProvider)
  const lastAgentFolder = useSettingsStore((s) => s.lastAgentFolder)
  const setLastAgentFolder = useSettingsStore((s) => s.setLastAgentFolder)
  const savedAgents = useSettingsStore((s) => s.savedAgents)
  const addSavedAgent = useSettingsStore((s) => s.addSavedAgent)
  const removeSavedAgent = useSettingsStore((s) => s.removeSavedAgent)
  const [provider, setProvider] = useState<Provider>(defaultProvider)
  const [projectPath, setProjectPath] = useState<string>(lastAgentFolder)
  const [gridLayout, setGridLayout] = useState<GridLayout>('1x1')
  const [skipPermissions, setSkipPermissions] = useState(defaultSkip)
  const models = useMemo(() => getModelsForProvider(provider), [provider])
  const [model, setModel] = useState(provider === 'claude' ? (defaultModel || getDefaultModel('claude')) : getDefaultModel(provider))
  const [launching, setLaunching] = useState(false)
  const [specialistSearch, setSpecialistSearch] = useState('')
  const [expandedCategory, setExpandedCategory] = useState<TemplateCategory | 'all'>('all')
  const [agentName, setAgentName] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('')
  const { createAgent } = useAgent()
  const setCurrentPath = useWorkspaceStore((s) => s.setCurrentPath)
  const recentProjects = useWorkspaceStore((s) => s.recentProjects)

  const handleProviderSwitch = (p: Provider) => {
    setProvider(p)
    setModel(getDefaultModel(p))
  }

  const selectProject = async () => {
    const path = await window.ghostshell.selectDirectory()
    if (path) {
      setProjectPath(path)
      setCurrentPath(path)
      setLastAgentFolder(path)
    }
  }

  const selectRecentProject = (path: string) => {
    setProjectPath(path)
    setCurrentPath(path)
    setLastAgentFolder(path)
  }

  const getGridCount = () => gridOptions.find((g) => g.layout === gridLayout)?.count || 1

  const getFolderName = (fullPath: string) => {
    const parts = fullPath.replace(/\\/g, '/').split('/')
    return parts[parts.length - 1] || fullPath
  }

  const extractAllowedTools = (flags: string[]): string[] => {
    const idx = flags.indexOf('--allowedTools')
    if (idx !== -1 && idx + 1 < flags.length) {
      return flags[idx + 1].split(',')
    }
    return []
  }

  const buildClaudeConfig = (template?: AgentTemplate): ClaudeConfig => ({
    model,
    dangerouslySkipPermissions: skipPermissions,
    systemPrompt: template?.systemPrompt || systemPrompt.trim() || undefined,
    allowedTools: template?.claudeFlags ? extractAllowedTools(template.claudeFlags) : [],
    customFlags: template?.claudeFlags || [],
  })

  const buildGeminiCfg = (): GeminiConfig => ({
    model,
    yolo: skipPermissions,
  })

  const buildCodexCfg = (): CodexConfig => ({
    model,
    fullAuto: skipPermissions,
  })

  const handleQuickLaunch = () => {
    setLaunching(true)
    if (projectPath) setLastAgentFolder(projectPath)
    const count = getGridCount()
    const cwd = projectPath || undefined
    const providerLabel = provider === 'gemini' ? 'Gemini' : provider === 'codex' ? 'Codex' : 'Claude'
    const baseName = agentName.trim() || providerLabel
    const providerEmoji = getProviderEmoji(provider)
    const providerColor = getProviderColor(provider)

    const sessionIds: string[] = []
    for (let i = 0; i < count; i++) {
      const name = count === 1 ? baseName : `${baseName} ${i + 1}`
      if (provider === 'gemini') {
        const result = createAgent(
          name,
          { id: 'star', name: 'Star', emoji: providerEmoji, color: providerColor },
          providerColor,
          {},
          cwd, undefined, undefined, true,
          'gemini', buildGeminiCfg(),
        )
        sessionIds.push(result.sessionId)
      } else if (provider === 'codex') {
        const result = createAgent(
          name,
          { id: 'robot', name: 'Robot', emoji: providerEmoji, color: providerColor },
          providerColor,
          {},
          cwd, undefined, undefined, true,
          'codex', undefined, buildCodexCfg(),
        )
        sessionIds.push(result.sessionId)
      } else {
        const result = createAgent(
          name,
          { id: 'ghost', name: 'Ghost', emoji: providerEmoji, color: providerColor },
          providerColor,
          buildClaudeConfig(),
          cwd, undefined, undefined, true,
          'claude',
        )
        sessionIds.push(result.sessionId)
      }
    }

    if (count > 1) {
      const groupId = `group-${Date.now()}`
      useTerminalStore.getState().addGroup({
        id: groupId,
        name: `${baseName} (${count})`,
        sessionIds,
        createdAt: Date.now(),
      })
    }
    onLaunched()
  }

  const handleTemplateLaunch = (template: AgentTemplate) => {
    setLaunching(true)
    if (projectPath) setLastAgentFolder(projectPath)
    const cwd = projectPath || undefined
    const templateProvider = template.provider || provider
    const count = getGridCount()
    const sessionIds: string[] = []

    for (let i = 0; i < count; i++) {
      const agentName = count === 1 ? template.name : `${template.name} ${i + 1}`
      if (templateProvider === 'gemini') {
        const result = createAgent(
          agentName, template.avatar, template.avatar.color,
          {}, cwd, template.id, undefined, true,
          'gemini', buildGeminiCfg(),
        )
        sessionIds.push(result.sessionId)
      } else if (templateProvider === 'codex') {
        const result = createAgent(
          agentName, template.avatar, template.avatar.color,
          {}, cwd, template.id, undefined, true,
          'codex', undefined, buildCodexCfg(),
        )
        sessionIds.push(result.sessionId)
      } else {
        const result = createAgent(
          agentName, template.avatar, template.avatar.color,
          buildClaudeConfig(template), cwd, template.id, undefined, true,
          'claude',
        )
        sessionIds.push(result.sessionId)
      }
    }

    if (count > 1) {
      useTerminalStore.getState().addGroup({
        id: `group-${Date.now()}`,
        name: `${template.name} (${count})`,
        sessionIds,
        createdAt: Date.now(),
      })
    }
    onLaunched()
  }

  const handleSaveConfig = () => {
    const providerEmoji = getProviderEmoji(provider)
    const providerColor = getProviderColor(provider)
    const displayName = agentName.trim() || `${provider === 'gemini' ? 'Gemini' : provider === 'codex' ? 'Codex' : 'Claude'} Agent`
    const saved: SavedAgentConfig = {
      id: `saved-${Date.now()}`,
      name: displayName,
      avatar: { id: provider, name: provider, emoji: providerEmoji, color: providerColor },
      provider,
      model,
      systemPrompt: provider === 'claude' ? (systemPrompt.trim() || undefined) : undefined,
      skipPermissions,
      cwd: projectPath || undefined,
      createdAt: Date.now(),
    }
    addSavedAgent(saved)
    setAgentName('')
  }

  const handleLaunchSaved = (saved: SavedAgentConfig) => {
    setLaunching(true)
    const cwd = saved.cwd || projectPath || undefined
    if (cwd) setLastAgentFolder(cwd)
    const count = getGridCount()
    const sessionIds: string[] = []

    for (let i = 0; i < count; i++) {
      const name = count === 1 ? saved.name : `${saved.name} ${i + 1}`
      if (saved.provider === 'gemini') {
        const result = createAgent(
          name, saved.avatar, saved.avatar.color,
          {}, cwd, undefined, undefined, true,
          'gemini', { model: saved.model, yolo: saved.skipPermissions },
        )
        sessionIds.push(result.sessionId)
      } else if (saved.provider === 'codex') {
        const result = createAgent(
          name, saved.avatar, saved.avatar.color,
          {}, cwd, undefined, undefined, true,
          'codex', undefined, { model: saved.model, fullAuto: saved.skipPermissions },
        )
        sessionIds.push(result.sessionId)
      } else {
        const result = createAgent(
          name, saved.avatar, saved.avatar.color,
          { model: saved.model, dangerouslySkipPermissions: saved.skipPermissions, systemPrompt: saved.systemPrompt },
          cwd, undefined, undefined, true,
          'claude',
        )
        sessionIds.push(result.sessionId)
      }
    }

    if (count > 1) {
      useTerminalStore.getState().addGroup({
        id: `group-${Date.now()}`,
        name: `${saved.name} (${count})`,
        sessionIds,
        createdAt: Date.now(),
      })
    }
    onLaunched()
  }

  // Filter specialists
  const filteredTemplates = useMemo(() => {
    let templates = agentTemplates
    if (specialistSearch.trim()) {
      const q = specialistSearch.toLowerCase()
      templates = templates.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          t.tags.some((tag) => tag.includes(q)),
      )
    }
    return templates
  }, [specialistSearch])

  // Group by category
  const groupedTemplates = useMemo(() => {
    const groups: Record<TemplateCategory, AgentTemplate[]> = {
      development: [],
      quality: [],
      operations: [],
      architecture: [],
    }
    for (const t of filteredTemplates) {
      groups[t.category].push(t)
    }
    return groups
  }, [filteredTemplates])

  const displayRecents = recentProjects.filter((p) => p !== projectPath).slice(0, 4)

  const selectedModel = models.find((m) => m.id === model) || models[0]
  const providerLabel = provider === 'gemini' ? 'Gemini' : provider === 'codex' ? 'Codex' : 'Claude'

  return (
    <div className="flex-1 flex flex-col items-center justify-start overflow-y-auto py-8 px-4">
      <motion.div
        className="w-full max-w-[640px]"
        variants={container}
        initial="hidden"
        animate="show"
      >
        {/* -- Header -- */}
        <motion.div variants={item} className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-950/50 border border-ghost-accent/20 mb-3">
            <Terminal className="w-7 h-7 text-ghost-accent" />
          </div>
          <h1 className="text-xl font-bold text-ghost-text tracking-tight">GhostShell</h1>
          <p className="text-xs text-ghost-text-dim mt-0.5">Launch terminals & AI agents in seconds</p>
        </motion.div>

        {/* -- Quick Actions Row -- */}
        <motion.div variants={item} className="grid grid-cols-4 gap-2 mb-6">
          {/* Open Terminal */}
          <button
            onClick={() => {
              const id = `term-standalone-${Date.now()}`
              useTerminalStore.getState().addSession({
                id,
                title: 'Terminal',
                cwd: projectPath || useWorkspaceStore.getState().currentPath,
              })
              onLaunched()
            }}
            className="h-12 bg-ghost-surface border border-ghost-border rounded-xl font-medium text-base flex items-center justify-center gap-2 text-ghost-text hover:bg-slate-800/50 hover:border-ghost-accent/30 transition-all group"
          >
            <Terminal className="w-4 h-4 text-ghost-text-dim group-hover:text-ghost-accent transition-colors" />
            Terminal
          </button>

          {/* Quick Claude */}
          <button
            onClick={() => {
              const cwd = projectPath || undefined
              createAgent(
                'Claude',
                { id: 'ghost', name: 'Ghost', emoji: '\uD83D\uDC7B', color: '#a855f7' },
                '#a855f7',
                { model: getDefaultModel('claude'), dangerouslySkipPermissions: skipPermissions },
                cwd, undefined, undefined, true,
                'claude',
              )
              onLaunched()
            }}
            className="h-12 border rounded-xl font-medium text-base flex items-center justify-center gap-2 transition-all"
            style={{
              backgroundColor: `${getProviderColor('claude')}10`,
              borderColor: `${getProviderColor('claude')}30`,
              color: getProviderColor('claude'),
            }}
          >
            <Sparkles className="w-4 h-4" />
            Claude
          </button>

          {/* Quick Gemini */}
          <button
            onClick={() => {
              const cwd = projectPath || undefined
              createAgent(
                'Gemini',
                { id: 'star', name: 'Star', emoji: '\u2726', color: '#4285f4' },
                '#4285f4',
                {}, cwd, undefined, undefined, true,
                'gemini', { model: getDefaultModel('gemini'), yolo: skipPermissions },
              )
              onLaunched()
            }}
            className="h-12 border rounded-xl font-medium text-base flex items-center justify-center gap-2 transition-all"
            style={{
              backgroundColor: `${getProviderColor('gemini')}10`,
              borderColor: `${getProviderColor('gemini')}30`,
              color: getProviderColor('gemini'),
            }}
          >
            <span className="text-base">{'\u2726'}</span>
            Gemini
          </button>

          {/* Quick Codex */}
          <button
            onClick={() => {
              const cwd = projectPath || undefined
              createAgent(
                'Codex',
                { id: 'robot', name: 'Robot', emoji: '\uD83E\uDD16', color: '#10a37f' },
                '#10a37f',
                {}, cwd, undefined, undefined, true,
                'codex', undefined, { model: getDefaultModel('codex'), fullAuto: skipPermissions },
              )
              onLaunched()
            }}
            className="h-12 border rounded-xl font-medium text-base flex items-center justify-center gap-2 transition-all"
            style={{
              backgroundColor: `${getProviderColor('codex')}10`,
              borderColor: `${getProviderColor('codex')}30`,
              color: getProviderColor('codex'),
            }}
          >
            <span className="text-base">{'\uD83E\uDD16'}</span>
            Codex
          </button>
        </motion.div>

        {/* -- Project Directory -- */}
        <motion.div variants={item} className="mb-4">
          <label className="text-xs font-semibold text-ghost-text-dim uppercase tracking-widest mb-2 block">
            Project
          </label>
          <button
            onClick={selectProject}
            className="w-full h-12 px-4 bg-ghost-surface border border-ghost-border rounded-xl flex items-center gap-3 hover:border-ghost-accent/40 transition-all group"
          >
            <div className="w-7 h-7 rounded-lg bg-indigo-950/50 flex items-center justify-center shrink-0 group-hover:bg-indigo-950/50 transition-colors">
              <FolderOpen className="w-3.5 h-3.5 text-ghost-accent" />
            </div>
            {projectPath ? (
              <div className="flex flex-col items-start min-w-0">
                <span className="text-base font-medium text-ghost-text truncate w-full">
                  {getFolderName(projectPath)}
                </span>
                <span className="text-xs text-ghost-text-dim truncate w-full">{projectPath}</span>
              </div>
            ) : (
              <span className="text-sm text-ghost-text-dim">Select project folder...</span>
            )}
            <ChevronRight className="w-3.5 h-3.5 text-ghost-text-dim/40 ml-auto shrink-0" />
          </button>

          {/* Recent Projects */}
          {!projectPath && displayRecents.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {displayRecents.map((path) => (
                <button
                  key={path}
                  onClick={() => selectRecentProject(path)}
                  className="h-6 px-3 bg-ghost-surface/60 border border-ghost-border/50 rounded-lg flex items-center gap-2 hover:border-ghost-accent/30 hover:bg-ghost-surface transition-all text-left"
                >
                  <Clock className="w-3 h-3 text-ghost-text-dim/50 shrink-0" />
                  <span className="text-xs text-ghost-text-dim truncate max-w-[140px]">
                    {getFolderName(path)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </motion.div>

        {/* -- Provider Toggle -- */}
        <motion.div variants={item} className="mb-4">
          <label className="text-xs font-semibold text-ghost-text-dim uppercase tracking-widest mb-2 block">
            Provider
          </label>
          <div className="flex gap-1 p-1 bg-ghost-surface rounded-xl border border-ghost-border w-fit">
            <button
              onClick={() => handleProviderSwitch('claude')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                provider === 'claude' ? 'text-white' : 'text-ghost-text-dim hover:bg-slate-800/50'
              }`}
              style={provider === 'claude' ? { backgroundColor: getProviderColor('claude') } : undefined}
            >
              {'\uD83D\uDC7B'} Claude
            </button>
            <button
              onClick={() => handleProviderSwitch('gemini')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                provider === 'gemini' ? 'text-white' : 'text-ghost-text-dim hover:bg-slate-800/50'
              }`}
              style={provider === 'gemini' ? { backgroundColor: getProviderColor('gemini') } : undefined}
            >
              {'\u2726'} Gemini
            </button>
            <button
              onClick={() => handleProviderSwitch('codex')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                provider === 'codex' ? 'text-white' : 'text-ghost-text-dim hover:bg-slate-800/50'
              }`}
              style={provider === 'codex' ? { backgroundColor: getProviderColor('codex') } : undefined}
            >
              {'\uD83E\uDD16'} Codex
            </button>
          </div>
        </motion.div>

        {/* -- Config: Layout + Model -- */}
        <motion.div variants={item} className="grid grid-cols-2 gap-3 mb-4">
          {/* Layout Selector */}
          <div>
            <label className="text-xs font-semibold text-ghost-text-dim uppercase tracking-widest mb-2 block">
              Layout
            </label>
            <div className="grid grid-cols-6 gap-1">
              {gridOptions.map((opt) => (
                <button
                  key={opt.layout}
                  onClick={() => setGridLayout(opt.layout)}
                  className={`h-12 rounded-lg border flex flex-col items-center justify-center gap-1 transition-all ${
                    gridLayout === opt.layout
                      ? 'border-ghost-accent bg-indigo-950/50'
                      : 'border-ghost-border bg-ghost-surface hover:border-ghost-accent/25 hover:bg-white/[0.02]'
                  }`}
                  title={`${opt.label} (${opt.count} pane${opt.count > 1 ? 's' : ''})`}
                >
                  <LayoutPreview layout={opt.layout} active={gridLayout === opt.layout} />
                  <span
                    className={`text-xs leading-none ${
                      gridLayout === opt.layout ? 'text-ghost-accent' : 'text-ghost-text-dim/60'
                    }`}
                  >
                    {opt.count}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Model Selector */}
          <div>
            <label className="text-xs font-semibold text-ghost-text-dim uppercase tracking-widest mb-2 block">
              Model
            </label>
            <div className="flex flex-col gap-1">
              {models.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setModel(m.id)}
                  className={`h-9 px-3 rounded-lg border flex items-center gap-2 transition-all ${
                    model === m.id
                      ? 'border-ghost-accent/50 bg-ghost-accent/8'
                      : 'border-ghost-border bg-ghost-surface hover:border-ghost-accent/20 hover:bg-white/[0.02]'
                  }`}
                >
                  <div
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      model === m.id ? 'opacity-100' : 'opacity-30'
                    }`}
                    style={{ backgroundColor: m.color }}
                  />
                  <span
                    className={`text-xs font-medium ${
                      model === m.id ? 'text-ghost-text' : 'text-ghost-text-dim'
                    }`}
                  >
                    {m.name}
                  </span>
                  <span
                    className={`text-xs ml-auto ${
                      model === m.id ? 'text-ghost-accent' : 'text-ghost-text-dim/40'
                    }`}
                  >
                    {m.badge}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </motion.div>

        {/* -- Agent Name + System Prompt -- */}
        <motion.div variants={item} className="mb-4 space-y-3">
          <div>
            <label className="text-xs font-semibold text-ghost-text-dim uppercase tracking-widest mb-2 block">
              Agent Name (optional)
            </label>
            <input
              type="text"
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              placeholder={provider === 'gemini' ? 'e.g. Gemini Agent' : provider === 'codex' ? 'e.g. Codex Agent' : 'e.g. Frontend Dev'}
              className="w-full h-10 px-3 bg-ghost-surface border border-ghost-border rounded-xl text-sm text-ghost-text placeholder:text-ghost-text-dim/30 focus:outline-none focus:border-ghost-accent/40 transition-colors"
            />
          </div>
          {provider === 'claude' && (
            <div>
              <label className="text-xs font-semibold text-ghost-text-dim uppercase tracking-widest mb-2 block">
                System Prompt (optional)
              </label>
              <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder="Custom instructions for Claude..."
                rows={3}
                className="w-full px-3 py-2 bg-ghost-surface border border-ghost-border rounded-xl text-xs text-ghost-text placeholder:text-ghost-text-dim/30 focus:outline-none focus:border-ghost-accent/40 transition-colors resize-none font-mono"
              />
            </div>
          )}
        </motion.div>

        {/* -- Skip Permissions -- */}
        <motion.div variants={item} className="mb-4">
          <button
            onClick={() => setSkipPermissions(!skipPermissions)}
            className={`w-full h-11 px-3 rounded-xl border flex items-center gap-3 transition-all ${
              skipPermissions
                ? 'border-orange-500/40 bg-orange-500/8 hover:bg-orange-500/12'
                : 'border-ghost-border bg-ghost-surface hover:border-ghost-accent/20'
            }`}
          >
            {skipPermissions ? (
              <AlertTriangle className="w-3.5 h-3.5 text-orange-400 shrink-0" />
            ) : (
              <Shield className="w-3.5 h-3.5 text-ghost-text-dim shrink-0" />
            )}
            <span className={`text-xs font-medium ${skipPermissions ? 'text-orange-300' : 'text-ghost-text-dim'}`}>
              {skipPermissions
                ? `Auto-approve ON${provider === 'gemini' ? ' (--yolo)' : provider === 'codex' ? ' (--full-auto)' : ''}`
                : 'Safe mode'}
            </span>
            <div
              className={`ml-auto w-8 h-[18px] rounded-full transition-colors flex items-center px-0.5 shrink-0 ${
                skipPermissions ? 'bg-orange-500' : 'bg-ghost-border'
              }`}
            >
              <div
                className={`w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                  skipPermissions ? 'translate-x-[14px]' : 'translate-x-0'
                }`}
              />
            </div>
          </button>
        </motion.div>

        {/* -- Launch + Save Buttons -- */}
        <motion.div variants={item} className="mb-6 flex gap-2">
          <button
            onClick={handleQuickLaunch}
            disabled={launching}
            className="flex-1 h-14 bg-ghost-accent text-white rounded-xl font-semibold text-base flex items-center justify-center gap-3 hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {launching ? (
              <span className="text-sm">Launching...</span>
            ) : (
              <>
                <Zap className="w-4 h-4" />
                Launch {getGridCount() > 1 ? `${getGridCount()} ${providerLabel} Agents` : `${providerLabel} Agent`}
                <span className="text-white/40 text-xs font-normal ml-1">
                  {selectedModel.name}
                  {getGridCount() > 1 ? ` \u00D7 ${getGridCount()}` : ''}
                </span>
              </>
            )}
          </button>
          <button
            onClick={handleSaveConfig}
            className="h-14 px-4 bg-ghost-surface border border-ghost-border rounded-xl text-ghost-text-dim hover:border-ghost-accent/40 hover:text-ghost-accent transition-all flex items-center gap-2 shrink-0"
            title="Save this configuration for later"
          >
            <Save className="w-4 h-4" />
            <span className="text-xs font-medium">Save</span>
          </button>
        </motion.div>

        {/* -- Saved Agents -- */}
        {savedAgents.length > 0 && (
          <motion.div variants={item} className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <Save className="w-3.5 h-3.5 text-ghost-text-dim/60" />
              <h2 className="text-sm font-semibold text-ghost-text uppercase tracking-wider">Saved Agents</h2>
              <span className="text-xs text-ghost-text-dim/40">{savedAgents.length}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {savedAgents.map((saved) => (
                <div
                  key={saved.id}
                  className="p-4 bg-ghost-surface/80 border border-ghost-border/60 rounded-2xl hover:border-ghost-accent/30 transition-all group"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-sm shrink-0"
                      style={{ backgroundColor: `${saved.avatar.color}15` }}
                    >
                      {saved.avatar.emoji}
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="text-sm font-medium text-ghost-text block truncate">{saved.name}</span>
                      <span className="text-xs text-ghost-text-dim/50">{saved.model}</span>
                    </div>
                  </div>
                  {saved.systemPrompt && (
                    <p className="text-xs text-ghost-text-dim/40 mb-2 line-clamp-2 font-mono">{saved.systemPrompt}</p>
                  )}
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => handleLaunchSaved(saved)}
                      disabled={launching}
                      className="flex-1 h-8 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-all disabled:opacity-50"
                      style={{
                        backgroundColor: `${saved.avatar.color}15`,
                        color: saved.avatar.color,
                      }}
                    >
                      <Play className="w-3 h-3" />
                      Launch{getGridCount() > 1 ? ` \u00D7${getGridCount()}` : ''}
                    </button>
                    <button
                      onClick={() => removeSavedAgent(saved.id)}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-ghost-text-dim/30 hover:text-ghost-error hover:bg-ghost-error/10 transition-all"
                      title="Delete saved agent"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* -- Specialists Section -- */}
        <motion.div variants={item}>
          {/* Specialist Header + Search */}
          <div className="flex items-center gap-2 mb-3">
            <div className="flex-1">
              <h2 className="text-sm font-semibold text-ghost-text uppercase tracking-wider">Specialists</h2>
            </div>

            {/* Category Filter Pills */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setExpandedCategory('all')}
                className={`h-5 px-2 rounded text-xs font-medium transition-all ${
                  expandedCategory === 'all'
                    ? 'bg-indigo-950/50 text-ghost-accent'
                    : 'text-ghost-text-dim/50 hover:text-ghost-text-dim'
                }`}
              >
                All
              </button>
              {categoryOrder.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setExpandedCategory(cat)}
                  className={`h-5 px-2 rounded text-xs font-medium transition-all ${
                    expandedCategory === cat
                      ? 'bg-indigo-950/50 text-ghost-accent'
                      : 'text-ghost-text-dim/50 hover:text-ghost-text-dim'
                  }`}
                >
                  {templateCategories[cat].label}
                </button>
              ))}
            </div>
          </div>

          {/* Search */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ghost-text-dim/40" />
            <input
              type="text"
              value={specialistSearch}
              onChange={(e) => setSpecialistSearch(e.target.value)}
              placeholder="Search specialists..."
              className="w-full h-8 pl-8 pr-3 bg-ghost-surface border border-ghost-border rounded-xl text-xs text-ghost-text placeholder:text-ghost-text-dim/30 focus:outline-none focus:border-ghost-accent/40 transition-colors"
            />
          </div>

          {/* Categories + Cards */}
          <div className="space-y-4 pb-6">
            {categoryOrder.map((cat) => {
              const templates = groupedTemplates[cat]
              if (templates.length === 0) return null
              if (expandedCategory !== 'all' && expandedCategory !== cat) return null
              const catInfo = templateCategories[cat]

              return (
                <motion.div
                  key={cat}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.2 }}
                >
                  {/* Category Label */}
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-semibold uppercase tracking-widest text-ghost-text-dim/60">
                      {catInfo.label}
                    </span>
                    <span className="text-xs text-ghost-text-dim/30">{catInfo.description}</span>
                    <div className="flex-1 h-px bg-ghost-border/40" />
                  </div>

                  {/* Template Grid */}
                  <div className="grid grid-cols-2 gap-2">
                    {templates.map((template) => (
                      <button
                        key={template.id}
                        onClick={() => handleTemplateLaunch(template)}
                        disabled={launching}
                        className="p-5 bg-ghost-surface/80 border border-ghost-border/60 rounded-2xl text-left hover:border-ghost-accent/30 transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <div className="relative shrink-0">
                            <div
                              className="w-9 h-9 rounded-lg flex items-center justify-center text-sm"
                              style={{ backgroundColor: `${template.avatar.color}15` }}
                            >
                              {template.avatar.emoji}
                            </div>
                            {getGridCount() > 1 && (
                              <span className="absolute -top-1.5 -right-1.5 text-[9px] font-bold px-1 py-px rounded-full bg-ghost-accent text-white leading-none">
                                {'\u00D7'}{getGridCount()}
                              </span>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-medium text-ghost-text group-hover:text-white transition-colors truncate">
                                {template.name}
                              </span>
                              {template.provider && (
                                <span
                                  className="text-[9px] px-1 py-px rounded-full font-semibold text-white/90 shrink-0"
                                  style={{ backgroundColor: getProviderColor(template.provider) }}
                                >
                                  {template.provider === 'gemini' ? 'G' : template.provider === 'codex' ? 'O' : 'C'}
                                </span>
                              )}
                            </div>
                            <span className="text-xs text-ghost-text-dim/60 block truncate">
                              {template.description}
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-1 mt-2">
                          {template.tags.slice(0, 3).map((tag) => (
                            <span
                              key={tag}
                              className="text-xs px-2 py-px rounded text-ghost-text-dim/50"
                              style={{ backgroundColor: `${template.avatar.color}08` }}
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      </button>
                    ))}
                  </div>
                </motion.div>
              )
            })}

            {/* No results */}
            {filteredTemplates.length === 0 && (
              <div className="text-center py-6">
                <Search className="w-5 h-5 text-ghost-text-dim/20 mx-auto mb-2" />
                <p className="text-xs text-ghost-text-dim/40">No specialists match "{specialistSearch}"</p>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </div>
  )
}
