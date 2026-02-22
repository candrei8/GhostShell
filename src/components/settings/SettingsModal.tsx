import { useState, useEffect, useRef, useCallback } from 'react'
import { X, Download, RefreshCw } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useSettingsStore } from '../../stores/settingsStore'
import { useTerminalStore } from '../../stores/terminalStore'
import { useWorkspaceStore } from '../../stores/workspaceStore'
import { ThemeCustomizer } from './ThemeCustomizer'
import { Toggle } from '../common/Toggle'
import { RangeSlider } from '../common/RangeSlider'
import { CLAUDE_MODELS, GEMINI_MODELS, getProviderColor, getInstallCommand, getUpdateCommand } from '../../lib/providers'
import { Provider } from '../../lib/types'

type SettingsTab = 'appearance' | 'providers' | 'terminal'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

const tabs: { id: SettingsTab; label: string }[] = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'providers', label: 'AI Providers' },
  { id: 'terminal', label: 'Terminal' },
]

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('appearance')
  const panelRef = useRef<HTMLDivElement>(null)

  const {
    fontSize,
    terminalFontSize,
    cursorBlink,
    cursorStyle,
    muteNotifications,
    claudeCliPath,
    defaultModel,
    defaultSkipPermissions,
    defaultProvider,
    geminiCliPath,
    defaultGeminiModel,
    setFontSize,
    setTerminalFontSize,
    setCursorBlink,
    setCursorStyle,
    setMuteNotifications,
    setClaudeCliPath,
    setDefaultModel,
    setDefaultSkipPermissions,
    setDefaultProvider,
    setGeminiCliPath,
    setDefaultGeminiModel,
  } = useSettingsStore()

  // Run a command in a new dedicated terminal
  const runInTerminal = useCallback((title: string, command: string) => {
    const sessionId = `setup-${Date.now()}`
    const cwd = useWorkspaceStore.getState().currentPath || '.'
    useTerminalStore.getState().addSession({ id: sessionId, title, cwd })
    // Wait for PTY to initialize, then write command
    setTimeout(() => {
      try {
        window.ghostshell.ptyWrite(sessionId, command + '\r')
      } catch {
        // PTY may not be ready
      }
    }, 500)
    onClose()
  }, [onClose])

  const handleInstallCli = useCallback((provider: Provider) => {
    const label = provider === 'gemini' ? 'Gemini' : 'Claude'
    runInTerminal(`Install ${label} CLI`, getInstallCommand(provider))
  }, [runInTerminal])

  const handleUpdateCli = useCallback((provider: Provider) => {
    const label = provider === 'gemini' ? 'Gemini' : 'Claude'
    runInTerminal(`Update ${label} CLI`, getUpdateCommand(provider))
  }, [runInTerminal])

  // Close on Escape, focus trap
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    panelRef.current?.focus()
    return () => document.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  const selectClass = 'w-full h-10 px-3 bg-ghost-bg border border-ghost-border rounded-lg text-sm text-ghost-text focus:outline-none focus:border-ghost-accent transition-colors appearance-none cursor-pointer ghost-select'
  const inputClass = 'w-full h-10 px-3 bg-ghost-bg border border-ghost-border rounded-lg text-sm text-ghost-text font-mono focus:outline-none focus:border-ghost-accent transition-colors'
  const actionBtnClass = 'h-8 px-3 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all border'

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/60"
            onClick={onClose}
            initial={{ backdropFilter: 'blur(0px)' }}
            animate={{ backdropFilter: 'blur(4px)' }}
            exit={{ backdropFilter: 'blur(0px)' }}
          />

          {/* Panel */}
          <motion.div
            ref={panelRef}
            tabIndex={-1}
            className="relative w-[560px] max-h-[80vh] bg-ghost-surface rounded-xl border border-ghost-border shadow-2xl flex flex-col overflow-hidden outline-none"
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.15 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-ghost-border shrink-0">
              <h2 className="text-sm font-bold text-ghost-text uppercase tracking-wider">Settings</h2>
              <button
                onClick={onClose}
                className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 text-ghost-text-dim hover:text-ghost-text transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-0 px-5 border-b border-ghost-border shrink-0">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-2.5 text-xs font-medium transition-colors relative ${
                    activeTab === tab.id
                      ? 'text-ghost-accent'
                      : 'text-ghost-text-dim hover:text-ghost-text'
                  }`}
                >
                  {tab.label}
                  {activeTab === tab.id && (
                    <motion.div
                      layoutId="settings-tab-indicator"
                      className="absolute bottom-0 left-2 right-2 h-[2px] bg-ghost-accent rounded-t"
                    />
                  )}
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-5 py-5">
              <AnimatePresence mode="wait">
                {activeTab === 'appearance' && (
                  <motion.div
                    key="appearance"
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 8 }}
                    transition={{ duration: 0.12 }}
                    className="flex flex-col gap-6"
                  >
                    <ThemeCustomizer />
                    <RangeSlider
                      label="UI Font Size"
                      min={10}
                      max={18}
                      value={fontSize}
                      onChange={setFontSize}
                    />
                  </motion.div>
                )}

                {activeTab === 'providers' && (
                  <motion.div
                    key="providers"
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 8 }}
                    transition={{ duration: 0.12 }}
                    className="flex flex-col gap-6"
                  >
                    {/* Provider toggle */}
                    <div>
                      <label className="text-xs text-ghost-text-dim uppercase tracking-wider mb-2 block">Default Provider</label>
                      <div className="flex gap-1 p-0.5 bg-ghost-bg rounded-lg border border-ghost-border w-fit">
                        <button
                          onClick={() => setDefaultProvider('claude')}
                          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                            defaultProvider === 'claude' ? 'text-white' : 'text-ghost-text-dim hover:bg-white/5'
                          }`}
                          style={defaultProvider === 'claude' ? { backgroundColor: getProviderColor('claude') } : undefined}
                        >
                          Claude
                        </button>
                        <button
                          onClick={() => setDefaultProvider('gemini')}
                          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                            defaultProvider === 'gemini' ? 'text-white' : 'text-ghost-text-dim hover:bg-white/5'
                          }`}
                          style={defaultProvider === 'gemini' ? { backgroundColor: getProviderColor('gemini') } : undefined}
                        >
                          Gemini
                        </button>
                      </div>
                    </div>

                    {/* Active provider config */}
                    <AnimatePresence mode="wait">
                      {defaultProvider === 'claude' ? (
                        <motion.div
                          key="claude-settings"
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          transition={{ duration: 0.1 }}
                          className="flex flex-col gap-4"
                        >
                          <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: getProviderColor('claude') }} />
                            <span className="text-sm font-semibold text-ghost-text">Claude</span>
                          </div>

                          <div>
                            <label className="text-xs text-ghost-text-dim mb-1.5 block">Default Model</label>
                            <select
                              value={defaultModel}
                              onChange={(e) => setDefaultModel(e.target.value)}
                              className={selectClass}
                            >
                              {CLAUDE_MODELS.map((m) => (
                                <option key={m.id} value={m.id}>{m.name}</option>
                              ))}
                            </select>
                          </div>

                          <Toggle
                            checked={defaultSkipPermissions}
                            onChange={setDefaultSkipPermissions}
                            label="Skip Permissions"
                            description="Auto-approve all tool calls. Use with caution."
                            color="orange"
                          />

                          <div>
                            <label className="text-xs text-ghost-text-dim mb-1.5 block">CLI Path</label>
                            <input
                              type="text"
                              value={claudeCliPath}
                              onChange={(e) => setClaudeCliPath(e.target.value)}
                              className={inputClass}
                            />
                            <p className="text-xs text-ghost-text-dim/60 mt-1.5">Path to the Claude CLI binary</p>
                          </div>

                          {/* Install / Update */}
                          <div>
                            <label className="text-xs text-ghost-text-dim mb-1.5 block">CLI Management</label>
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleInstallCli('claude')}
                                className={`${actionBtnClass} border-ghost-border bg-ghost-bg text-ghost-text hover:border-ghost-accent/40 hover:bg-ghost-accent/5`}
                              >
                                <Download className="w-3.5 h-3.5" />
                                Install
                              </button>
                              <button
                                onClick={() => handleUpdateCli('claude')}
                                className={`${actionBtnClass} border-ghost-border bg-ghost-bg text-ghost-text hover:border-ghost-accent/40 hover:bg-ghost-accent/5`}
                              >
                                <RefreshCw className="w-3.5 h-3.5" />
                                Update to Latest
                              </button>
                            </div>
                            <p className="text-xs text-ghost-text-dim/60 mt-1.5">Opens a terminal to install or update the CLI</p>
                          </div>
                        </motion.div>
                      ) : (
                        <motion.div
                          key="gemini-settings"
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          transition={{ duration: 0.1 }}
                          className="flex flex-col gap-4"
                        >
                          <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: getProviderColor('gemini') }} />
                            <span className="text-sm font-semibold text-ghost-text">Gemini</span>
                          </div>

                          <div>
                            <label className="text-xs text-ghost-text-dim mb-1.5 block">Default Model</label>
                            <select
                              value={defaultGeminiModel}
                              onChange={(e) => setDefaultGeminiModel(e.target.value)}
                              className={selectClass}
                            >
                              {GEMINI_MODELS.map((m) => (
                                <option key={m.id} value={m.id}>{m.name}</option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="text-xs text-ghost-text-dim mb-1.5 block">CLI Path</label>
                            <input
                              type="text"
                              value={geminiCliPath}
                              onChange={(e) => setGeminiCliPath(e.target.value)}
                              className={inputClass}
                            />
                            <p className="text-xs text-ghost-text-dim/60 mt-1.5">Path to the Gemini CLI binary</p>
                          </div>

                          {/* Install / Update */}
                          <div>
                            <label className="text-xs text-ghost-text-dim mb-1.5 block">CLI Management</label>
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleInstallCli('gemini')}
                                className={`${actionBtnClass} border-ghost-border bg-ghost-bg text-ghost-text hover:border-ghost-accent/40 hover:bg-ghost-accent/5`}
                              >
                                <Download className="w-3.5 h-3.5" />
                                Install
                              </button>
                              <button
                                onClick={() => handleUpdateCli('gemini')}
                                className={`${actionBtnClass} border-ghost-border bg-ghost-bg text-ghost-text hover:border-ghost-accent/40 hover:bg-ghost-accent/5`}
                              >
                                <RefreshCw className="w-3.5 h-3.5" />
                                Update to Latest
                              </button>
                            </div>
                            <p className="text-xs text-ghost-text-dim/60 mt-1.5">Opens a terminal to install or update the CLI</p>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                )}

                {activeTab === 'terminal' && (
                  <motion.div
                    key="terminal"
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 8 }}
                    transition={{ duration: 0.12 }}
                    className="flex flex-col gap-6"
                  >
                    <RangeSlider
                      label="Terminal Font Size"
                      min={10}
                      max={24}
                      value={terminalFontSize}
                      onChange={setTerminalFontSize}
                    />

                    <div>
                      <label className="text-xs text-ghost-text-dim mb-2 block">Cursor Style</label>
                      <div className="flex gap-1 p-0.5 bg-ghost-bg rounded-lg border border-ghost-border w-fit">
                        {(['bar', 'block', 'underline'] as const).map((style) => (
                          <button
                            key={style}
                            onClick={() => setCursorStyle(style)}
                            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all capitalize ${
                              cursorStyle === style
                                ? 'bg-ghost-accent text-white'
                                : 'text-ghost-text-dim hover:bg-white/5 hover:text-ghost-text'
                            }`}
                          >
                            {style}
                          </button>
                        ))}
                      </div>
                    </div>

                    <Toggle
                      checked={cursorBlink}
                      onChange={setCursorBlink}
                      label="Cursor Blink"
                    />

                    <Toggle
                      checked={muteNotifications}
                      onChange={setMuteNotifications}
                      label="Mute Notifications"
                      description="Suppress all toast and OS notifications."
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
