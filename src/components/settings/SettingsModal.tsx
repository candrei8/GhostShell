import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { X, Download, RefreshCw, Volume2, Settings, Palette, Terminal, Cpu, Keyboard } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useSettingsStore, type NotificationTimingMode, type TerminalOutputEmphasis } from '../../stores/settingsStore'
import { useNotificationStore } from '../../stores/notificationStore'
import { useTerminalStore } from '../../stores/terminalStore'
import { useWorkspaceStore } from '../../stores/workspaceStore'
import { ThemeCustomizer } from './ThemeCustomizer'
import { ShortcutsTab } from './ShortcutsTab'
import { Toggle } from '../common/Toggle'
import { RangeSlider } from '../common/RangeSlider'
import { getProviderColor, getInstallCommand, getUpdateCommand, resolveModelsForProvider } from '../../lib/providers'
import { useModelStore } from '../../stores/modelStore'
import { playNotificationSound } from '../../lib/sounds'
import { submitPromptToSession } from '../../lib/terminalPromptSubmission'
import { Provider } from '../../lib/types'
import { CLI_VISUAL_PROFILE_OPTIONS } from '../../lib/terminalPresets'
import type { LucideIcon } from 'lucide-react'

export type SettingsTab = 'appearance' | 'providers' | 'terminal' | 'shortcuts'

const SETTINGS_TABS = new Set<SettingsTab>(['appearance', 'providers', 'terminal', 'shortcuts'])
const SETTINGS_PROVIDERS = new Set<Provider>(['claude', 'gemini', 'codex'])

interface SettingsModalProps {
  isOpen: boolean
  initialTab?: SettingsTab
  onClose: () => void
}

const tabs: { id: SettingsTab; label: string; icon: LucideIcon }[] = [
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'providers', label: 'AI Providers', icon: Cpu },
  { id: 'terminal', label: 'Terminal', icon: Terminal },
  { id: 'shortcuts', label: 'Shortcuts', icon: Keyboard },
]

const notificationTimingModes: { id: NotificationTimingMode; label: string; hint: string }[] = [
  { id: 'aggressive', label: 'Aggressive', hint: 'Notifies quickly after prompt return.' },
  { id: 'balanced', label: 'Balanced', hint: 'Good default for most workflows.' },
  { id: 'silent', label: 'Silent', hint: 'Only longer command runs trigger success toasts.' },
]

const terminalOutputEmphasisOptions: { id: TerminalOutputEmphasis; label: string; hint: string }[] = [
  { id: 'off', label: 'Off', hint: 'Show raw terminal output with no extra highlight layer.' },
  { id: 'balanced', label: 'Balanced', hint: 'Highlight actions, errors, prompts, and context without overwhelming the log.' },
  { id: 'vivid', label: 'Vivid', hint: 'Use stronger line-level emphasis so important agent output stands out immediately.' },
]

function sanitizeSettingsTab(tab: SettingsTab | undefined): SettingsTab {
  return tab && SETTINGS_TABS.has(tab) ? tab : 'appearance'
}

function sanitizeProvider(provider: Provider): Provider {
  return SETTINGS_PROVIDERS.has(provider) ? provider : 'claude'
}

function clampValue(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  if (value < min) return min
  if (value > max) return max
  return value
}

function formatSyncTime(timestamp: number): string {
  if (!timestamp) return 'Pending sync'
  return new Date(timestamp).toLocaleString()
}

export function SettingsModal({ isOpen, initialTab = 'appearance', onClose }: SettingsModalProps) {
  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <SettingsModalContent
          key="settings-modal"
          initialTab={initialTab}
          onClose={onClose}
        />
      )}
    </AnimatePresence>,
    document.body,
  )
}

function SettingsModalContent({ initialTab, onClose }: { initialTab: SettingsTab; onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<SettingsTab>(sanitizeSettingsTab(initialTab))
  const panelRef = useRef<HTMLDivElement>(null)

  const {
    fontSize,
    terminalFontSize,
    cursorBlink,
    cursorStyle,
    cliVisualProfile,
    terminalOutputEmphasis,
    restoreTabs,
    muteNotifications,
    notificationVolume,
    notificationTimingMode,
    claudeCliPath,
    defaultModel,
    defaultSkipPermissions,
    defaultProvider,
    geminiCliPath,
    defaultGeminiModel,
    codexCliPath,
    defaultCodexModel,
    setFontSize,
    setTerminalFontSize,
    setCursorBlink,
    setCursorStyle,
    setCliVisualProfile,
    setTerminalOutputEmphasis,
    setRestoreTabs,
    setMuteNotifications,
    setNotificationVolume,
    setNotificationTimingMode,
    setClaudeCliPath,
    setDefaultModel,
    setDefaultSkipPermissions,
    setDefaultProvider,
    setGeminiCliPath,
    setDefaultGeminiModel,
    setCodexCliPath,
    setDefaultCodexModel,
  } = useSettingsStore()

  const runInTerminal = useCallback((title: string, command: string) => {
    const sessionId = `setup-${Date.now()}`
    const cwd = useWorkspaceStore.getState().currentPath || '.'
    useTerminalStore.getState().addSession({ id: sessionId, title, cwd })
    setTimeout(() => {
      try {
        submitPromptToSession(sessionId, command, cwd)
      } catch {
        // PTY may not be ready
      }
    }, 500)
    onClose()
  }, [onClose])

  const handleInstallCli = useCallback((provider: Provider) => {
    const label = provider === 'gemini' ? 'Gemini' : provider === 'codex' ? 'Codex' : 'Claude'
    runInTerminal(`Install ${label} CLI`, getInstallCommand(provider))
  }, [runInTerminal])

  const handleUpdateCli = useCallback((provider: Provider) => {
    const label = provider === 'gemini' ? 'Gemini' : provider === 'codex' ? 'Codex' : 'Claude'
    runInTerminal(`Update ${label} CLI`, getUpdateCommand(provider))
  }, [runInTerminal])

  const handlePreviewNotification = useCallback(() => {
    useNotificationStore.getState().addNotification({
      type: 'success',
      title: 'Agent finished',
      message: `Task completed successfully. Timing: ${notificationTimingMode}.`,
      source: 'Settings',
      tier: 'toast',
      allowWhileMuted: true,
    })
  }, [notificationTimingMode])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    panelRef.current?.focus()
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  useEffect(() => {
    setActiveTab(sanitizeSettingsTab(initialTab))
  }, [initialTab])

  const selectClass = 'w-full h-10 px-3 bg-[#0a0e18] border border-white/[0.08] rounded-lg text-sm text-white/90 focus:outline-none focus:border-[#38bdf8]/50 transition-colors appearance-none cursor-pointer'
  const inputClass = 'w-full h-10 px-3 bg-[#0a0e18] border border-white/[0.08] rounded-lg text-sm text-white/90 font-mono focus:outline-none focus:border-[#38bdf8]/50 transition-colors'
  const actionBtnClass = 'h-9 px-3 rounded-lg text-xs font-semibold uppercase tracking-[0.12em] flex items-center gap-1.5 transition-all border'
  const sectionClass = 'rounded-xl border border-white/[0.06] bg-white/[0.02] p-5'

  const discoveredModels = useModelStore((s) => s.discovered)
  const fetchingModels = useModelStore((s) => s.fetching)
  const refreshModels = useModelStore((s) => s.fetchAll)
  const ensureFreshModels = useModelStore((s) => s.ensureFresh)
  const cliStatus = useModelStore((s) => s.cliStatus)
  const lastFetched = useModelStore((s) => s.lastFetched)

  const claudeModels = useMemo(
    () => resolveModelsForProvider('claude', discoveredModels.claude, defaultModel),
    [defaultModel, discoveredModels.claude],
  )
  const geminiModels = useMemo(
    () => resolveModelsForProvider('gemini', discoveredModels.gemini, defaultGeminiModel),
    [defaultGeminiModel, discoveredModels.gemini],
  )
  const codexModels = useMemo(
    () => resolveModelsForProvider('codex', discoveredModels.codex, defaultCodexModel),
    [defaultCodexModel, discoveredModels.codex],
  )

  useEffect(() => {
    if (activeTab !== 'providers') return
    void ensureFreshModels()
  }, [activeTab, ensureFreshModels])

  const providerConfigs = useMemo(() => ({
    claude: {
      id: 'claude' as const,
      label: 'Claude',
      models: claudeModels,
      modelValue: defaultModel,
      onModelChange: setDefaultModel,
      cliPath: claudeCliPath,
      onCliPathChange: setClaudeCliPath,
      cliHint: 'Path to the Claude CLI binary',
      cliStatus: cliStatus.claude,
      lastFetched: lastFetched.claude,
      isFetching: fetchingModels.claude,
    },
    gemini: {
      id: 'gemini' as const,
      label: 'Gemini',
      models: geminiModels,
      modelValue: defaultGeminiModel,
      onModelChange: setDefaultGeminiModel,
      cliPath: geminiCliPath,
      onCliPathChange: setGeminiCliPath,
      cliHint: 'Path to the Gemini CLI binary',
      cliStatus: cliStatus.gemini,
      lastFetched: lastFetched.gemini,
      isFetching: fetchingModels.gemini,
    },
    codex: {
      id: 'codex' as const,
      label: 'Codex',
      models: codexModels,
      modelValue: defaultCodexModel,
      onModelChange: setDefaultCodexModel,
      cliPath: codexCliPath,
      onCliPathChange: setCodexCliPath,
      cliHint: 'Path to the Codex CLI binary',
      cliStatus: cliStatus.codex,
      lastFetched: lastFetched.codex,
      isFetching: fetchingModels.codex,
    },
  }), [
    claudeModels,
    cliStatus.claude,
    cliStatus.codex,
    cliStatus.gemini,
    fetchingModels.claude,
    fetchingModels.codex,
    fetchingModels.gemini,
    geminiModels,
    codexModels,
    claudeCliPath,
    defaultCodexModel,
    defaultGeminiModel,
    defaultModel,
    geminiCliPath,
    codexCliPath,
    lastFetched.claude,
    lastFetched.codex,
    lastFetched.gemini,
    setClaudeCliPath,
    setDefaultCodexModel,
    setDefaultGeminiModel,
    setDefaultModel,
    setGeminiCliPath,
    setCodexCliPath,
  ])

  const safeDefaultProvider = sanitizeProvider(defaultProvider)
  const activeProviderConfig = providerConfigs[safeDefaultProvider]
  const activeProviderModelValue = activeProviderConfig.models.some((model) => model.id === activeProviderConfig.modelValue)
    ? activeProviderConfig.modelValue
    : activeProviderConfig.models[0]?.id || ''
  const safeFontSize = clampValue(fontSize, 10, 18, 13)
  const safeTerminalFontSize = clampValue(terminalFontSize, 10, 24, 14)
  const safeNotificationVolume = clampValue(notificationVolume, 0, 100, 50)
  const isShortcutsTab = activeTab === 'shortcuts'

  return (
    <motion.div
      className="fixed inset-0 flex items-center justify-center"
      style={{ zIndex: 9999 }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      {/* Backdrop */}
      <motion.div
        className="absolute inset-0 bg-black/80"
        style={{ backdropFilter: 'blur(8px)' }}
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      />

      {/* Panel */}
      <motion.div
        ref={panelRef}
        tabIndex={-1}
        className={`relative flex max-h-[85vh] overflow-hidden rounded-2xl outline-none border border-white/[0.08] transition-[width] duration-200 ${
          isShortcutsTab ? 'w-[min(1180px,96vw)]' : 'w-[min(920px,94vw)]'
        }`}
        style={{
          background: '#0c1020',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.04)',
        }}
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      >
        {/* ── Left sidebar nav ── */}
        <div className="flex w-[200px] shrink-0 flex-col border-r border-white/[0.06] bg-white/[0.015]">
          <div className="flex items-center gap-2.5 px-5 pt-5 pb-4">
            <Settings className="h-4 w-4 text-[#38bdf8]" />
            <span className="text-sm font-semibold text-white/90 tracking-wide">Settings</span>
          </div>

          <nav className="flex flex-col gap-0.5 px-3 pb-4 flex-1">
            {tabs.map((tab) => {
              const Icon = tab.icon
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-all text-left ${
                    isActive
                      ? 'bg-[#38bdf8]/10 text-[#38bdf8]'
                      : 'text-white/40 hover:text-white/70 hover:bg-white/[0.04]'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {tab.label}
                </button>
              )
            })}
          </nav>

          <div className="px-5 pb-4">
            <p className="text-[10px] text-white/20 uppercase tracking-widest">GhostShell</p>
          </div>
        </div>

        {/* ── Right content area ── */}
        <div className="flex flex-1 flex-col min-w-0">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06] shrink-0">
            <div>
              <h2 className="text-[15px] font-semibold text-white/90">
                {tabs.find((t) => t.id === activeTab)?.label}
              </h2>
              <p className="mt-0.5 text-xs text-white/30">
                {activeTab === 'appearance' && 'Theme, fonts, and visual preferences.'}
                {activeTab === 'providers' && 'Configure AI provider CLIs and models.'}
                {activeTab === 'terminal' && 'Terminal behavior, cursor, and notifications.'}
                {activeTab === 'shortcuts' && 'Keyboard shortcuts and key bindings.'}
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.08] text-white/30 hover:text-white/60 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Content */}
          <div className={`flex-1 overflow-y-auto py-5 ${isShortcutsTab ? 'px-4' : 'px-6'}`}>
            {activeTab === 'appearance' && (
              <div className="flex flex-col gap-5">
                <div className={sectionClass}>
                  <ThemeCustomizer />
                </div>
                <div className={sectionClass}>
                  <RangeSlider
                    label="UI Font Size"
                    min={10}
                    max={18}
                    value={safeFontSize}
                    onChange={setFontSize}
                  />
                </div>
              </div>
            )}

            {activeTab === 'providers' && (
              <div className="flex flex-col gap-5">
                <div className={sectionClass}>
                  <label className="text-xs text-white/40 uppercase tracking-[0.15em] mb-3 block">Default Provider</label>
                  <div className="flex flex-wrap gap-2">
                    {(['claude', 'gemini', 'codex'] as Provider[]).map((providerId) => (
                      <button
                        key={providerId}
                        onClick={() => setDefaultProvider(providerId)}
                        className={`px-4 py-2 rounded-lg text-xs font-semibold uppercase tracking-[0.12em] transition-all border ${
                          safeDefaultProvider === providerId
                            ? 'text-white border-transparent'
                            : 'text-white/40 border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.06] hover:text-white/70'
                        }`}
                        style={safeDefaultProvider === providerId ? { backgroundColor: getProviderColor(providerId) } : undefined}
                      >
                        {providerId}
                      </button>
                    ))}
                  </div>
                </div>

                <div className={`${sectionClass} flex flex-col gap-5`}>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: getProviderColor(safeDefaultProvider) }} />
                    <span className="text-sm font-semibold text-white/90">{activeProviderConfig.label}</span>
                  </div>

                  <div>
                    <label className="text-sm text-white/40 mb-1.5 block">Default Model</label>
                    <select
                      value={activeProviderModelValue}
                      onChange={(e) => activeProviderConfig.onModelChange(e.target.value)}
                      className={selectClass}
                    >
                      {activeProviderConfig.models.map((m) => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  </div>

                  {safeDefaultProvider === 'claude' && (
                    <div className="rounded-lg border border-amber-300/20 bg-amber-300/[0.04] p-1">
                      <Toggle
                        checked={defaultSkipPermissions}
                        onChange={setDefaultSkipPermissions}
                        label="Skip Permissions"
                        description="Auto-approve all tool calls. Use with caution."
                        color="orange"
                      />
                    </div>
                  )}

                  <div>
                    <label className="text-sm text-white/40 mb-1.5 block">CLI Path</label>
                    <input
                      type="text"
                      value={activeProviderConfig.cliPath}
                      onChange={(e) => activeProviderConfig.onCliPathChange(e.target.value)}
                      onBlur={() => {
                        void ensureFreshModels(activeProviderConfig.id, 0)
                      }}
                      className={inputClass}
                    />
                    <p className="text-xs text-white/25 mt-1.5">{activeProviderConfig.cliHint}</p>
                  </div>

                  <div>
                    <label className="text-sm text-white/40 mb-1.5 block">CLI Management</label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => handleInstallCli(safeDefaultProvider)}
                        className={`${actionBtnClass} border-white/[0.08] bg-white/[0.02] text-white/60 hover:border-[#38bdf8]/30 hover:bg-[#38bdf8]/[0.06] hover:text-white/80`}
                      >
                        <Download className="w-3.5 h-3.5" />
                        Install
                      </button>
                      <button
                        onClick={() => handleUpdateCli(safeDefaultProvider)}
                        className={`${actionBtnClass} border-white/[0.08] bg-white/[0.02] text-white/60 hover:border-[#38bdf8]/30 hover:bg-[#38bdf8]/[0.06] hover:text-white/80`}
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Update
                      </button>
                    </div>
                    <p className="text-xs text-white/25 mt-1.5">Opens a terminal and runs install/update commands.</p>
                  </div>

                  <div>
                    <label className="text-sm text-white/40 mb-1.5 block">Model Discovery</label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => void ensureFreshModels(activeProviderConfig.id, 0)}
                        disabled={activeProviderConfig.isFetching}
                        className={`${actionBtnClass} border-white/[0.08] bg-white/[0.02] text-white/60 hover:border-[#38bdf8]/30 hover:bg-[#38bdf8]/[0.06] hover:text-white/80 disabled:opacity-40`}
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${activeProviderConfig.isFetching ? 'animate-spin' : ''}`} />
                        {activeProviderConfig.isFetching ? 'Scanning...' : `Refresh ${activeProviderConfig.label}`}
                      </button>
                      <button
                        onClick={() => void refreshModels(true)}
                        disabled={fetchingModels.claude || fetchingModels.gemini || fetchingModels.codex}
                        className={`${actionBtnClass} border-white/[0.08] bg-white/[0.02] text-white/60 hover:border-[#38bdf8]/30 hover:bg-[#38bdf8]/[0.06] hover:text-white/80 disabled:opacity-40`}
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${(fetchingModels.claude || fetchingModels.gemini || fetchingModels.codex) ? 'animate-spin' : ''}`} />
                        Refresh All
                      </button>
                    </div>
                    <div className="mt-2 space-y-1 text-xs text-white/25">
                      <p>
                        {activeProviderConfig.cliStatus?.installed
                          ? `CLI detected: ${activeProviderConfig.cliStatus.version || 'installed'}`
                          : 'CLI status: not detected'}
                      </p>
                      <p>
                        {activeProviderConfig.models.length} models loaded. Last sync: {formatSyncTime(activeProviderConfig.lastFetched)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'terminal' && (
              <div className="flex flex-col gap-5">
                <div className={sectionClass}>
                  <RangeSlider
                    label="Terminal Font Size"
                    min={10}
                    max={24}
                    value={safeTerminalFontSize}
                    onChange={setTerminalFontSize}
                  />
                </div>

                <div className={sectionClass}>
                  <label className="text-xs text-white/40 uppercase tracking-[0.15em] mb-3 block">Cursor Style</label>
                  <div className="flex gap-1 p-1 bg-[#0a0e18] rounded-lg border border-white/[0.08] w-fit">
                    {(['bar', 'block', 'underline'] as const).map((style) => (
                      <button
                        key={style}
                        onClick={() => setCursorStyle(style)}
                        className={`px-3 py-1.5 rounded-md text-xs font-semibold uppercase tracking-[0.12em] transition-all ${
                          cursorStyle === style
                            ? 'bg-[#38bdf8] text-white'
                            : 'text-white/30 hover:bg-white/[0.06] hover:text-white/60'
                        }`}
                      >
                        {style}
                      </button>
                    ))}
                  </div>

                  <label className="text-xs text-white/40 uppercase tracking-[0.15em] mt-5 mb-3 block">CLI Visual Profile</label>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {CLI_VISUAL_PROFILE_OPTIONS.map((profile) => (
                      <button
                        key={profile.id}
                        onClick={() => setCliVisualProfile(profile.id)}
                        className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${
                          cliVisualProfile === profile.id
                            ? 'border-[#38bdf8]/30 bg-[#38bdf8]/[0.08] text-[#38bdf8]'
                            : 'border-white/[0.06] bg-white/[0.02] text-white/40 hover:border-white/[0.12] hover:text-white/60'
                        }`}
                      >
                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em]">{profile.label}</p>
                        <p className="text-[11px] mt-0.5 opacity-70 normal-case">{profile.hint}</p>
                      </button>
                    ))}
                  </div>

                  <label className="text-xs text-white/40 uppercase tracking-[0.15em] mt-5 mb-3 block">Agent Output Emphasis</label>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {terminalOutputEmphasisOptions.map((option) => (
                      <button
                        key={option.id}
                        onClick={() => setTerminalOutputEmphasis(option.id)}
                        className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${
                          terminalOutputEmphasis === option.id
                            ? 'border-[#38bdf8]/30 bg-[#38bdf8]/[0.08] text-[#38bdf8]'
                            : 'border-white/[0.06] bg-white/[0.02] text-white/40 hover:border-white/[0.12] hover:text-white/60'
                        }`}
                      >
                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em]">{option.label}</p>
                        <p className="text-[11px] mt-0.5 opacity-70 normal-case">{option.hint}</p>
                      </button>
                    ))}
                  </div>
                  <p className="mt-3 text-xs text-white/20">
                    Applies only to AI and agent terminal rendering. Raw PTY output, parsing, and exports stay unchanged.
                  </p>
                </div>

                <div className={sectionClass}>
                  <Toggle
                    checked={cursorBlink}
                    onChange={setCursorBlink}
                    label="Cursor Blink"
                  />

                  <Toggle
                    checked={restoreTabs}
                    onChange={setRestoreTabs}
                    label="Restore Previous Tabs"
                    description="Reopen terminal tabs and agents from your last session."
                  />

                  <Toggle
                    checked={muteNotifications}
                    onChange={setMuteNotifications}
                    label="Mute Notifications"
                    description="Suppress all toast and OS notifications."
                  />
                </div>

                <div className={`${sectionClass} flex flex-col gap-4 ${muteNotifications ? 'opacity-40 pointer-events-none' : ''}`}>
                  <RangeSlider
                    label="Notification Volume"
                    min={0}
                    max={100}
                    value={safeNotificationVolume}
                    onChange={setNotificationVolume}
                    unit="%"
                  />
                  <div className="flex flex-col gap-2">
                    <label className="text-sm text-white/40">Completion Notification Timing</label>
                    <div className="flex gap-1 p-1 bg-[#0a0e18] rounded-lg border border-white/[0.08] w-fit">
                      {notificationTimingModes.map((mode) => (
                        <button
                          key={mode.id}
                          onClick={() => setNotificationTimingMode(mode.id)}
                          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                            notificationTimingMode === mode.id
                              ? 'bg-[#38bdf8] text-white'
                              : 'text-white/30 hover:bg-white/[0.06] hover:text-white/60'
                          }`}
                        >
                          {mode.label}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-white/20">
                      {notificationTimingModes.find((mode) => mode.id === notificationTimingMode)?.hint}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => playNotificationSound('success')}
                      className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-white/[0.02] border border-white/[0.08] text-xs text-white/40 hover:text-white/70 hover:border-white/[0.15] transition-colors w-fit"
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                      Test Sound
                    </button>
                    <button
                      onClick={handlePreviewNotification}
                      className="flex items-center h-8 px-3 rounded-lg bg-white/[0.02] border border-white/[0.08] text-xs text-white/40 hover:text-white/70 hover:border-white/[0.15] transition-colors w-fit"
                    >
                      Preview Toast
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'shortcuts' && <ShortcutsTab />}
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}
