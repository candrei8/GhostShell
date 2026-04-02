import { useMemo, useState } from 'react'
import { X, FolderOpen, Zap, Users, Minus, Plus } from 'lucide-react'
import { motion } from 'framer-motion'
import { AgentAvatar } from './AgentAvatar'
import { defaultAvatars } from '../../lib/avatars'
import { agentTemplates, AgentTemplate } from '../../lib/agent-templates'
import { AgentAvatarConfig, ClaudeConfig, GeminiConfig, CodexConfig, Provider } from '../../lib/types'
import { useAgent } from '../../hooks/useAgent'
import { useThreadStore } from '../../stores/threadStore'
import { useWorkspaceStore } from '../../stores/workspaceStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { selectDirectorySafe } from '../../lib/ghostshell'
import { getDefaultModel, getProviderColor } from '../../lib/providers'

interface AgentCreatorProps {
  onClose: () => void
}

type Tab = 'templates' | 'custom' | 'squad'

function isProvider(value: unknown): value is Provider {
  return value === 'claude' || value === 'gemini' || value === 'codex'
}

function sanitizeProvider(value: unknown): Provider {
  return isProvider(value) ? value : 'claude'
}

export function AgentCreator({ onClose }: AgentCreatorProps) {
  const defaultProvider = useSettingsStore((s) => s.defaultProvider)
  const defaultModel = useSettingsStore((s) => s.defaultModel)
  const defaultGeminiModel = useSettingsStore((s) => s.defaultGeminiModel)
  const defaultCodexModel = useSettingsStore((s) => s.defaultCodexModel)
  const lastAgentFolder = useSettingsStore((s) => s.lastAgentFolder)
  const setLastAgentFolder = useSettingsStore((s) => s.setLastAgentFolder)
  const safeDefaultProvider = sanitizeProvider(defaultProvider)
  const [tab, setTab] = useState<Tab>('templates')
  const [provider, setProvider] = useState<Provider>(safeDefaultProvider)
  const [name, setName] = useState('')
  const [selectedAvatar, setSelectedAvatar] = useState<AgentAvatarConfig>(defaultAvatars[0])
  const [selectedThread, setSelectedThread] = useState('')
  const [projectPath, setProjectPath] = useState(
    (typeof lastAgentFolder === 'string' && lastAgentFolder) ||
      useWorkspaceStore.getState().currentPath,
  )
  const resolveConfiguredModel = (targetProvider: Provider): string => {
    if (targetProvider === 'gemini') return defaultGeminiModel || getDefaultModel('gemini')
    if (targetProvider === 'codex') return defaultCodexModel || getDefaultModel('codex')
    return defaultModel || getDefaultModel('claude')
  }
  const [systemPrompt, setSystemPrompt] = useState('')
  const [skipPermissions, setSkipPermissions] = useState(false)
  const [yoloMode, setYoloMode] = useState(false)
  const [sandboxMode, setSandboxMode] = useState(false)
  const [fullAutoMode, setFullAutoMode] = useState(false)
  const [codexSandbox, setCodexSandbox] = useState<CodexConfig['sandbox']>('workspace-write')
  const [squadPicks, setSquadPicks] = useState<Record<string, number>>({})
  const { createAgent, createAgentGroup } = useAgent()
  const threads = useThreadStore((s) => s.threads)
  const setCurrentPath = useWorkspaceStore((s) => s.setCurrentPath)

  const handleProviderChange = (p: Provider) => {
    setProvider(p)
  }

  const selectProject = async () => {
    const path = await selectDirectorySafe()
    if (path) {
      setProjectPath(path)
      setCurrentPath(path)
      setLastAgentFolder(path)
    }
  }

  /** Parse --allowedTools from claudeFlags so the config reflects the template tool restrictions */
  const extractAllowedTools = (flags: string[]): string[] => {
    const idx = flags.indexOf('--allowedTools')
    if (idx !== -1 && idx + 1 < flags.length) {
      return flags[idx + 1].split(',')
    }
    return []
  }

  const handleTemplateCreate = (template: AgentTemplate) => {
    if (projectPath) setLastAgentFolder(projectPath)
    const templateProvider = sanitizeProvider(template.provider || provider)
    if (templateProvider === 'gemini') {
      const geminiCfg: GeminiConfig = { model: resolveConfiguredModel(templateProvider), yolo: yoloMode, sandbox: sandboxMode }
      createAgent(
        template.name, template.avatar, template.avatar.color,
        {}, projectPath || undefined, template.id, selectedThread || undefined, true,
        'gemini', geminiCfg,
      )
    } else if (templateProvider === 'codex') {
      const codexCfg: CodexConfig = { fullAuto: fullAutoMode, sandbox: codexSandbox }
      createAgent(
        template.name, template.avatar, template.avatar.color,
        {}, projectPath || undefined, template.id, selectedThread || undefined, true,
        'codex', undefined, codexCfg,
      )
    } else {
      const config: ClaudeConfig = {
        model: resolveConfiguredModel(templateProvider),
        dangerouslySkipPermissions: skipPermissions,
        systemPrompt: template.systemPrompt,
        allowedTools: extractAllowedTools(template.claudeFlags),
        customFlags: template.claudeFlags,
      }
      createAgent(
        template.name, template.avatar, template.avatar.color,
        config, projectPath || undefined, template.id, selectedThread || undefined, true,
        'claude',
      )
    }
    onClose()
  }

  const filteredTemplates = useMemo(
    () => agentTemplates.filter((t) => !t.provider || t.provider === provider),
    [provider],
  )

  const squadTotal = useMemo(
    () => Object.values(squadPicks).reduce((a, b) => a + b, 0),
    [squadPicks],
  )

  const adjustSquadPick = (templateId: string, delta: number) => {
    setSquadPicks((prev) => {
      const cur = prev[templateId] || 0
      const next = Math.max(0, Math.min(9, cur + delta))
      if (next === 0) {
        const { [templateId]: _, ...rest } = prev
        return rest
      }
      return { ...prev, [templateId]: next }
    })
  }

  const handleSquadLaunch = () => {
    if (squadTotal === 0) return
    if (projectPath) setLastAgentFolder(projectPath)

    const configs = Object.entries(squadPicks).flatMap(([templateId, qty]) => {
      const template = agentTemplates.find((t) => t.id === templateId)
      if (!template || qty <= 0) return []
      const templateProvider = sanitizeProvider(template.provider || provider)
      return Array.from({ length: qty }, (_, i) => {
        const agentName = qty > 1 ? `${template.name} ${i + 1}` : template.name
        if (templateProvider === 'gemini') {
          return {
            name: agentName,
            avatar: template.avatar,
            color: template.avatar.color,
            claudeConfig: {} as ClaudeConfig,
            cwd: projectPath || undefined,
            templateId: template.id,
            provider: 'gemini' as Provider,
            geminiConfig: { model: resolveConfiguredModel(templateProvider), yolo: yoloMode, sandbox: sandboxMode } as GeminiConfig,
          }
        }
        if (templateProvider === 'codex') {
          return {
            name: agentName,
            avatar: template.avatar,
            color: template.avatar.color,
            claudeConfig: {} as ClaudeConfig,
            cwd: projectPath || undefined,
            templateId: template.id,
            provider: 'codex' as Provider,
            codexConfig: { fullAuto: fullAutoMode, sandbox: codexSandbox } as CodexConfig,
          }
        }
        return {
          name: agentName,
          avatar: template.avatar,
          color: template.avatar.color,
          claudeConfig: {
            dangerouslySkipPermissions: skipPermissions,
            systemPrompt: template.systemPrompt,
            allowedTools: extractAllowedTools(template.claudeFlags),
            customFlags: template.claudeFlags,
          } as ClaudeConfig,
          cwd: projectPath || undefined,
          templateId: template.id,
          provider: 'claude' as Provider,
        }
      })
    })

    if (configs.length > 0) {
      createAgentGroup(configs, `Squad (${configs.length})`)
    }
    onClose()
  }

  const handleCustomCreate = () => {
    if (!name.trim()) return
    if (projectPath) setLastAgentFolder(projectPath)
    if (provider === 'gemini') {
      const geminiCfg: GeminiConfig = { model: resolveConfiguredModel(provider), yolo: yoloMode, sandbox: sandboxMode }
      createAgent(
        name.trim(), selectedAvatar, selectedAvatar.color,
        {}, projectPath || undefined, undefined, selectedThread || undefined, true,
        'gemini', geminiCfg,
      )
    } else if (provider === 'codex') {
      const codexCfg: CodexConfig = { fullAuto: fullAutoMode, sandbox: codexSandbox }
      createAgent(
        name.trim(), selectedAvatar, selectedAvatar.color,
        {}, projectPath || undefined, undefined, selectedThread || undefined, true,
        'codex', undefined, codexCfg,
      )
    } else {
      const config: ClaudeConfig = {
        model: resolveConfiguredModel(provider),
        dangerouslySkipPermissions: skipPermissions,
        systemPrompt: systemPrompt.trim() || undefined,
      }
      createAgent(
        name.trim(), selectedAvatar, selectedAvatar.color,
        config, projectPath || undefined, undefined, selectedThread || undefined, true,
        'claude',
      )
    }
    onClose()
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="w-[640px] max-h-[85vh] bg-ghost-surface border border-ghost-border rounded-md shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-3">
          <h2 className="text-base font-semibold text-ghost-text">New Agent</h2>
          <button onClick={onClose} className="w-6 h-6 flex items-center justify-center rounded hover:bg-slate-800">
            <X className="w-4 h-4 text-ghost-text-dim" />
          </button>
        </div>

        {/* Provider Toggle */}
        <div className="flex px-5 gap-1 mb-3">
          <div className="flex gap-1 p-1 bg-ghost-bg rounded-md border border-ghost-border mr-3">
            <button
              onClick={() => handleProviderChange('claude')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                provider === 'claude' ? 'text-white' : 'text-ghost-text-dim hover:bg-slate-800/50'
              }`}
              style={provider === 'claude' ? { backgroundColor: getProviderColor('claude') } : undefined}
            >
              Claude
            </button>
            <button
              onClick={() => handleProviderChange('gemini')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                provider === 'gemini' ? 'text-white' : 'text-ghost-text-dim hover:bg-slate-800/50'
              }`}
              style={provider === 'gemini' ? { backgroundColor: getProviderColor('gemini') } : undefined}
            >
              Gemini
            </button>
            <button
              onClick={() => handleProviderChange('codex')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                provider === 'codex' ? 'text-white' : 'text-ghost-text-dim hover:bg-slate-800/50'
              }`}
              style={provider === 'codex' ? { backgroundColor: getProviderColor('codex') } : undefined}
            >
              Codex
            </button>
          </div>

          <button
            onClick={() => setTab('templates')}
            className={`px-4 py-2 rounded-sm text-sm font-medium transition-colors ${
              tab === 'templates' ? 'bg-ghost-accent/20 text-ghost-accent' : 'text-ghost-text-dim hover:bg-slate-800/50'
            }`}
          >
            Templates
          </button>
          <button
            onClick={() => setTab('custom')}
            className={`px-4 py-2 rounded-sm text-sm font-medium transition-colors ${
              tab === 'custom' ? 'bg-ghost-accent/20 text-ghost-accent' : 'text-ghost-text-dim hover:bg-slate-800/50'
            }`}
          >
            Custom
          </button>
          <button
            onClick={() => setTab('squad')}
            className={`px-4 py-2 rounded-sm text-sm font-medium transition-colors flex items-center gap-1.5 ${
              tab === 'squad' ? 'bg-ghost-accent/20 text-ghost-accent' : 'text-ghost-text-dim hover:bg-slate-800/50'
            }`}
          >
            <Users className="w-3 h-3" />
            Squad
          </button>
        </div>

        {/* Shared: Project dir + options */}
        <div className="px-5 mb-3 flex flex-col gap-3">
          <div className="flex gap-2">
            <button
              onClick={selectProject}
              className="flex-1 h-11 px-3 bg-ghost-bg border border-ghost-border rounded-sm flex items-center gap-2 hover:border-ghost-accent/50 transition-colors text-left"
            >
              <FolderOpen className="w-3.5 h-3.5 text-ghost-text-dim shrink-0" />
              <span className="text-xs text-ghost-text truncate">{projectPath || 'Select project...'}</span>
            </button>
          </div>

          {/* Provider-specific options */}
          {provider === 'claude' ? (
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={skipPermissions} onChange={(e) => setSkipPermissions(e.target.checked)} className="sr-only" />
              <div className={`w-8 h-4 rounded-full transition-colors flex items-center px-0.5 ${skipPermissions ? 'bg-orange-500' : 'bg-ghost-border'}`}>
                <div className={`w-3 h-3 rounded-full bg-white transition-transform ${skipPermissions ? 'translate-x-4' : 'translate-x-0'}`} />
              </div>
              <span className="text-xs text-ghost-text">--dangerously-skip-permissions</span>
            </label>
          ) : provider === 'codex' ? (
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={fullAutoMode} onChange={(e) => setFullAutoMode(e.target.checked)} className="sr-only" />
                <div className={`w-8 h-4 rounded-full transition-colors flex items-center px-0.5 ${fullAutoMode ? 'bg-orange-500' : 'bg-ghost-border'}`}>
                  <div className={`w-3 h-3 rounded-full bg-white transition-transform ${fullAutoMode ? 'translate-x-4' : 'translate-x-0'}`} />
                </div>
                <span className="text-xs text-ghost-text">--full-auto (auto-approve)</span>
              </label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-ghost-text-dim shrink-0">Sandbox:</span>
                <select
                  value={codexSandbox}
                  onChange={(e) => setCodexSandbox(e.target.value as CodexConfig['sandbox'])}
                  className="h-7 px-2 bg-ghost-bg border border-ghost-border rounded-sm text-xs text-ghost-text focus:outline-none focus:border-ghost-accent"
                >
                  <option value="workspace-write">workspace-write</option>
                  <option value="read-only">read-only</option>
                  <option value="danger-full-access">danger-full-access</option>
                </select>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={yoloMode} onChange={(e) => setYoloMode(e.target.checked)} className="sr-only" />
                <div className={`w-8 h-4 rounded-full transition-colors flex items-center px-0.5 ${yoloMode ? 'bg-orange-500' : 'bg-ghost-border'}`}>
                  <div className={`w-3 h-3 rounded-full bg-white transition-transform ${yoloMode ? 'translate-x-4' : 'translate-x-0'}`} />
                </div>
                <span className="text-xs text-ghost-text">--yolo (auto-approve)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={sandboxMode} onChange={(e) => setSandboxMode(e.target.checked)} className="sr-only" />
                <div className={`w-8 h-4 rounded-full transition-colors flex items-center px-0.5 ${sandboxMode ? 'bg-blue-500' : 'bg-ghost-border'}`}>
                  <div className={`w-3 h-3 rounded-full bg-white transition-transform ${sandboxMode ? 'translate-x-4' : 'translate-x-0'}`} />
                </div>
                <span className="text-xs text-ghost-text">--sandbox</span>
              </label>
            </div>
          )}
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto px-5 pb-5">
          {tab === 'templates' ? (
            <div className="grid grid-cols-2 gap-2">
              {filteredTemplates.map((template) => (
                <button
                  key={template.id}
                  onClick={() => handleTemplateCreate(template)}
                  className="p-5 bg-ghost-bg border border-ghost-border rounded-md text-left hover:border-ghost-accent/50 hover:bg-ghost-accent/5 transition-all group"
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <AgentAvatar avatar={template.avatar} size="sm" />
                    <span className="text-sm font-medium text-ghost-text group-hover:text-ghost-accent">{template.name}</span>
                    {template.provider && (
                      <span
                        className="text-[10px] px-1.5 py-px rounded-full font-medium text-white/90"
                        style={{ backgroundColor: getProviderColor(template.provider) }}
                      >
                        {template.provider === 'gemini' ? 'G' : template.provider === 'codex' ? 'O' : 'C'}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-ghost-text-dim leading-relaxed mb-1.5">{template.description}</p>
                  <div className="flex flex-wrap gap-1">
                    {template.tags.slice(0, 3).map((tag) => (
                      <span key={tag} className="text-xs px-1.5 py-0.5 rounded bg-ghost-border/50 text-ghost-text-dim">{tag}</span>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          ) : tab === 'custom' ? (
            <div className="flex flex-col gap-3">
              {/* Name */}
              <div>
                <label className="text-xs text-ghost-text-dim uppercase tracking-wider mb-1 block">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={provider === 'gemini' ? 'e.g. Gemini Agent' : provider === 'codex' ? 'e.g. Codex Agent' : 'e.g. Frontend Agent'}
                  className="w-full h-12 px-3 bg-ghost-bg border border-ghost-border rounded-md text-sm text-ghost-text placeholder:text-ghost-text-dim/50 focus:outline-none focus:border-ghost-accent transition-colors"
                  autoFocus
                />
              </div>

              {/* Avatar */}
              <div>
                <label className="text-xs text-ghost-text-dim uppercase tracking-wider mb-1.5 block">Avatar</label>
                <div className="grid grid-cols-8 gap-1">
                  {defaultAvatars.map((avatar) => (
                    <button
                      key={avatar.id}
                      onClick={() => setSelectedAvatar(avatar)}
                      className={`w-10 h-10 rounded-sm flex items-center justify-center transition-all ${
                        selectedAvatar.id === avatar.id ? 'bg-ghost-accent/20 ring-2 ring-ghost-accent' : 'hover:bg-slate-800'
                      }`}
                      title={avatar.name}
                    >
                      <AgentAvatar avatar={avatar} size="sm" />
                    </button>
                  ))}
                </div>
              </div>

              {/* System Prompt (Claude only — Gemini uses GEMINI.md) */}
              {provider === 'claude' && (
                <div>
                  <label className="text-xs text-ghost-text-dim uppercase tracking-wider mb-1 block">System Prompt (optional)</label>
                  <textarea
                    value={systemPrompt}
                    onChange={(e) => setSystemPrompt(e.target.value)}
                    placeholder="Custom instructions for Claude..."
                    rows={4}
                    className="w-full px-3 py-2 bg-ghost-bg border border-ghost-border rounded-sm text-xs text-ghost-text placeholder:text-ghost-text-dim/50 focus:outline-none focus:border-ghost-accent transition-colors resize-none font-mono"
                  />
                </div>
              )}
              {provider === 'gemini' && (
                <div className="px-3 py-2 bg-blue-500/5 border border-blue-500/20 rounded-sm">
                  <p className="text-xs text-blue-300/70">Gemini uses GEMINI.md files for system instructions. Place a GEMINI.md in your project root.</p>
                </div>
              )}
              {provider === 'codex' && (
                <div className="px-3 py-2 bg-emerald-500/5 border border-emerald-500/20 rounded-sm">
                  <p className="text-xs text-emerald-300/70">Codex uses AGENTS.md files for system instructions. Place an AGENTS.md in your project root.</p>
                </div>
              )}

              {/* Thread */}
              {threads.length > 0 && (
                <div>
                  <label className="text-xs text-ghost-text-dim uppercase tracking-wider mb-1 block">Thread</label>
                  <select
                    value={selectedThread}
                    onChange={(e) => setSelectedThread(e.target.value)}
                    className="w-full h-9 px-3 bg-ghost-bg border border-ghost-border rounded-sm text-xs text-ghost-text focus:outline-none focus:border-ghost-accent"
                  >
                    <option value="">None</option>
                    {threads.map((t) => (
                      <option key={t.id} value={t.id}>{t.icon} {t.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <button
                onClick={handleCustomCreate}
                disabled={!name.trim()}
                className="w-full h-12 text-white rounded-md font-medium text-base flex items-center justify-center gap-2 hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-1"
                style={{ backgroundColor: getProviderColor(provider) }}
              >
                <Zap className="w-4 h-4" />
                Create {provider === 'gemini' ? 'Gemini' : provider === 'codex' ? 'Codex' : 'Claude'} Agent
              </button>
            </div>
          ) : (
            /* Squad Tab */
            <div className="flex flex-col gap-2">
              <p className="text-xs text-ghost-text-dim mb-1">Pick templates and quantities to launch a squad of agents at once.</p>
              {filteredTemplates.map((template) => {
                const qty = squadPicks[template.id] || 0
                return (
                  <div
                    key={template.id}
                    className={`flex items-center gap-3 p-4 rounded-md border transition-all ${
                      qty > 0 ? 'bg-ghost-accent/5 border-ghost-accent/30' : 'bg-ghost-bg border-ghost-border hover:border-ghost-border/80'
                    }`}
                  >
                    <AgentAvatar avatar={template.avatar} size="md" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium text-ghost-text truncate">{template.name}</span>
                        {template.provider && (
                          <span
                            className="text-[10px] px-1.5 py-px rounded-full font-medium text-white/90 shrink-0"
                            style={{ backgroundColor: getProviderColor(template.provider) }}
                          >
                            {template.provider === 'gemini' ? 'G' : template.provider === 'codex' ? 'O' : 'C'}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-ghost-text-dim truncate">{template.description}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => adjustSquadPick(template.id, -1)}
                        disabled={qty === 0}
                        className="w-6 h-6 rounded-md flex items-center justify-center bg-ghost-surface border border-ghost-border hover:border-ghost-accent/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        <Minus className="w-3 h-3 text-ghost-text-dim" />
                      </button>
                      <span className={`w-6 text-center text-xs font-semibold ${qty > 0 ? 'text-ghost-accent' : 'text-ghost-text-dim/40'}`}>
                        {qty}
                      </span>
                      <button
                        onClick={() => adjustSquadPick(template.id, 1)}
                        disabled={qty >= 9}
                        className="w-6 h-6 rounded-md flex items-center justify-center bg-ghost-surface border border-ghost-border hover:border-ghost-accent/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        <Plus className="w-3 h-3 text-ghost-text-dim" />
                      </button>
                    </div>
                  </div>
                )
              })}

              <button
                onClick={handleSquadLaunch}
                disabled={squadTotal === 0}
                className="w-full h-12 bg-ghost-accent text-white rounded-md font-medium text-base flex items-center justify-center gap-2 hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-2"
              >
                <Users className="w-4 h-4" />
                Launch Squad ({squadTotal} agent{squadTotal !== 1 ? 's' : ''})
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}
