import { useRef, useState, useCallback, useEffect, useMemo, type MouseEvent as ReactMouseEvent } from 'react'
import { X, Terminal as TerminalIcon } from 'lucide-react'
import { useTerminal } from '../../hooks/useTerminal'
import { usePty } from '../../hooks/usePty'
import { useTerminalStore } from '../../stores/terminalStore'
import { TerminalSearch } from './TerminalSearch'
import { MultiLineInput } from './MultiLineInput'
import { QuickLaunch } from './QuickLaunch'
import { TerminalCommandBar } from './TerminalCommandBar'
import { useAgentStore } from '../../stores/agentStore'
import { useActivityStore } from '../../stores/activityStore'
import { useCompanionStore } from '../../stores/companionStore'
import { useCommandBlockStore } from '../../stores/commandBlockStore'
import { ActivityIcon } from '../agents/ActivityIcon'
import { TerminalSession } from '../../lib/types'
import { resolveProvider, getProviderColor } from '../../lib/providers'
import { ContextGauge } from '../agents/ContextGauge'
import { TerminalContextPanel } from './TerminalContextPanel'
import { hasContextMetrics } from '../../lib/contextMetrics'
import { SHORTCUT_EVENTS } from '../../lib/shortcutEvents'

const SMART_INPUT_FOCUS_EVENT = 'ghostshell:focus-command-bar'

interface TerminalPaneProps {
  session: TerminalSession
  isActive?: boolean
  onClose?: () => void
  onClick?: () => void
  showPaneLabel?: boolean
  searchOpen?: boolean
  onSearchClose?: () => void
  outputViewMode?: 'terminal' | 'companion'
}

export function TerminalPane({
  session,
  isActive,
  onClose,
  onClick,
  showPaneLabel = true,
  searchOpen: externalSearchOpen,
  onSearchClose,
  outputViewMode,
}: TerminalPaneProps) {
  const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null)

  const agent = useAgentStore((s) =>
    session.agentId ? s.agents.find((a) => a.id === session.agentId) : undefined,
  )
  const activityId = session.agentId || session.id
  // Select only the fields TerminalPane actually renders to avoid re-renders
  // from high-frequency activityLog/subAgents changes (e.g. spinner frames).
  const activityName = useActivityStore((s) => s.activities[activityId]?.currentActivity || null)
  const activityDetail = useActivityStore((s) => s.activities[activityId]?.currentDetail || null)
  const activityStartedAt = useActivityStore((s) => s.activities[activityId]?.lastActivityTime || null)
  const activityContextMetrics = useActivityStore((s) => s.activities[activityId]?.contextMetrics)
  const companionSession = useCompanionStore((s) => s.sessions[session.id])
  const blocksForSession = useCommandBlockStore((s) => s.blocksBySession[session.id])
  const companionEntries = companionSession?.entries ?? []
  const commandBlocks = blocksForSession ?? []

  const sessionProvider = session.detectedProvider
  const provider = agent ? resolveProvider(agent) : sessionProvider
  const showSmartInput = !session.agentId && session.sessionType !== 'ghostswarm' && !session.detectedProvider
  const focusSmartInput = useCallback(() => {
    window.dispatchEvent(
      new CustomEvent(SMART_INPUT_FOCUS_EVENT, {
        detail: { sessionId: session.id },
      }),
    )
  }, [session.id])
  const { terminal, searchNext, searchPrev, clearSearch } = useTerminal(
    containerEl,
    isActive,
    provider,
    showSmartInput,
  )
  const [localSearchOpen, setLocalSearchOpen] = useState(false)
  const [labelHovered, setLabelHovered] = useState(false)
  const [contextOpen, setContextOpen] = useState(outputViewMode === 'companion')
  const [multiLineOpen, setMultiLineOpen] = useState(false)

  const searchOpen = externalSearchOpen !== undefined ? externalSearchOpen : localSearchOpen
  const providerColor = provider ? getProviderColor(provider) : '#e4e4e7'
  const hasContextData = useMemo(
    () =>
      !!provider ||
      hasContextMetrics(activityContextMetrics) ||
      companionEntries.length > 0 ||
      commandBlocks.length > 0,
    [provider, activityContextMetrics, companionEntries.length, commandBlocks.length],
  )

  // Title and Description editing state
  const updateSession = useTerminalStore((s) => s.updateSession)

  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [titleInput, setTitleInput] = useState(session.title)
  const titleInputRef = useRef<HTMLInputElement>(null)

  const [isEditingDesc, setIsEditingDesc] = useState(false)
  const [descInput, setDescInput] = useState(session.description || '')
  const descInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!isEditingTitle) {
      setTitleInput(session.title)
    }
  }, [session.title, isEditingTitle])

  useEffect(() => {
    if (!isEditingDesc) {
      setDescInput(session.description || '')
    }
  }, [session.description, isEditingDesc])

  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus()
      titleInputRef.current.select()
    }
  }, [isEditingTitle])

  useEffect(() => {
    if (isEditingDesc && descInputRef.current) {
      descInputRef.current.focus()
      descInputRef.current.select()
    }
  }, [isEditingDesc])

  const handleTitleSubmit = () => {
    if (titleInput.trim() && titleInput !== session.title) {
      updateSession(session.id, { title: titleInput.trim() })
    } else {
      setTitleInput(session.title)
    }
    setIsEditingTitle(false)
  }

  const handleDescSubmit = () => {
    if (descInput !== session.description) {
      updateSession(session.id, { description: descInput.trim() || undefined })
    }
    setIsEditingDesc(false)
  }

  usePty({
    sessionId: session.id,
    terminal,
    cwd: session.cwd,
    shell: session.shell,
    agentId: session.agentId,
    autoLaunch: !!session.agentId && !session.skipAutoLaunch,
    readOnly: showSmartInput,
  })

  const handleToggleSearch = useCallback(() => {
    if (externalSearchOpen !== undefined) return
    setLocalSearchOpen((prev) => !prev)
  }, [externalSearchOpen])

  const handleSearchClose = useCallback(() => {
    if (onSearchClose) {
      onSearchClose()
    } else {
      setLocalSearchOpen(false)
    }
  }, [onSearchClose])

  useEffect(() => {
    if (!isActive) return

    const handleRenameRequest = () => {
      setTitleInput(session.title)
      setIsEditingTitle(true)
    }

    window.addEventListener(SHORTCUT_EVENTS.renameTab, handleRenameRequest as EventListener)
    return () =>
      window.removeEventListener(SHORTCUT_EVENTS.renameTab, handleRenameRequest as EventListener)
  }, [isActive, session.title])

  useEffect(() => {
    if (!isActive) return

    const handleSearchRequest = () => {
      handleToggleSearch()
    }

    window.addEventListener(
      SHORTCUT_EVENTS.toggleTerminalSearch,
      handleSearchRequest as EventListener,
    )

    return () =>
      window.removeEventListener(
        SHORTCUT_EVENTS.toggleTerminalSearch,
        handleSearchRequest as EventListener,
      )
  }, [handleToggleSearch, isActive])

  // Fallback multi-line overlay for terminals without native newline handling.
  useEffect(() => {
    if (!isActive) return
    const handleMultiLine = () => setMultiLineOpen(true)
    window.addEventListener(SHORTCUT_EVENTS.openMultiLineInput, handleMultiLine as EventListener)
    return () =>
      window.removeEventListener(SHORTCUT_EVENTS.openMultiLineInput, handleMultiLine as EventListener)
  }, [isActive])

  // ── Warp-style terminal event handlers ─────────────────────────────
  useEffect(() => {
    if (!isActive || !terminal) return

    const handleClear = () => {
      terminal.clear()
    }

    const handleClearScrollback = () => {
      terminal.clear()
      terminal.reset()
    }

    const handleScrollToTop = () => {
      terminal.scrollToTop()
    }

    const handleScrollToBottom = () => {
      terminal.scrollToBottom()
    }

    const handleSelectAll = () => {
      terminal.selectAll()
    }

    const handleCopyPath = () => {
      const path = session.cwd
      if (path) {
        navigator.clipboard.writeText(path).catch(() => {})
      }
    }

    const handleFocusTerminal = () => {
      if (showSmartInput) {
        focusSmartInput()
        return
      }
      terminal.focus()
    }

    window.addEventListener(SHORTCUT_EVENTS.clearTerminal, handleClear as EventListener)
    window.addEventListener(SHORTCUT_EVENTS.clearScrollback, handleClearScrollback as EventListener)
    window.addEventListener(SHORTCUT_EVENTS.scrollToTop, handleScrollToTop as EventListener)
    window.addEventListener(SHORTCUT_EVENTS.scrollToBottom, handleScrollToBottom as EventListener)
    window.addEventListener(SHORTCUT_EVENTS.selectAll, handleSelectAll as EventListener)
    window.addEventListener(SHORTCUT_EVENTS.copyPath, handleCopyPath as EventListener)
    window.addEventListener(SHORTCUT_EVENTS.focusTerminal, handleFocusTerminal as EventListener)

    return () => {
      window.removeEventListener(SHORTCUT_EVENTS.clearTerminal, handleClear as EventListener)
      window.removeEventListener(SHORTCUT_EVENTS.clearScrollback, handleClearScrollback as EventListener)
      window.removeEventListener(SHORTCUT_EVENTS.scrollToTop, handleScrollToTop as EventListener)
      window.removeEventListener(SHORTCUT_EVENTS.scrollToBottom, handleScrollToBottom as EventListener)
      window.removeEventListener(SHORTCUT_EVENTS.selectAll, handleSelectAll as EventListener)
      window.removeEventListener(SHORTCUT_EVENTS.copyPath, handleCopyPath as EventListener)
      window.removeEventListener(SHORTCUT_EVENTS.focusTerminal, handleFocusTerminal as EventListener)
    }
  }, [focusSmartInput, isActive, session.cwd, showSmartInput, terminal])

  const handleMultiLineSubmit = useCallback(
    (text: string) => {
      if (!session.id) return
      // Detect provider to use the correct multiline sequence
      const provider = agent
        ? resolveProvider(agent)
        : session.detectedProvider || 'claude'
      const isClaudeProvider = provider === 'claude'

      const lines = text.split('\n')
      for (let i = 0; i < lines.length; i++) {
        if (lines[i]) {
          window.ghostshell.ptyWrite(session.id, lines[i])
        }
        if (i < lines.length - 1) {
          // For Claude: "\" + Enter triggers multiline continuation
          // For Codex/Gemini: raw LF works as newline
          if (isClaudeProvider) {
            window.ghostshell.ptyWrite(session.id, '\\')
            window.ghostshell.ptyWrite(session.id, '\r')
          } else {
            window.ghostshell.ptyWrite(session.id, '\n')
          }
        }
      }
      // Final Enter to submit
      window.ghostshell.ptyWrite(session.id, '\r')
      setTimeout(() => {
        if (showSmartInput) {
          focusSmartInput()
        } else {
          terminal?.focus()
        }
      }, 50)
    },
    [session.id, terminal, agent, session.detectedProvider, showSmartInput, focusSmartInput],
  )

  const paneStyle = useMemo(() => ({
    background: 'var(--ghost-bg)',
  }), [])

  const handleQuickLaunchComplete = () => {
    updateSession(session.id, { showQuickLaunch: false })
  }

  const handleTerminalCanvasMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!showSmartInput) return
    const target = event.target as HTMLElement | null
    if (!target?.closest('.xterm')) return
    event.preventDefault()
    focusSmartInput()
  }

  // If this session should show QuickLaunch, render it instead of terminal
  if (session.showQuickLaunch) {
    return (
      <div
        data-terminal-pane
        data-smart-input-active={showSmartInput ? 'true' : undefined}
        className="terminal-pane relative flex h-full flex-col overflow-hidden bg-ghost-bg"
        onClick={(event) => {
          onClick?.()
          const target = event.target as HTMLElement | null
          if (showSmartInput && !target?.closest('button,input,textarea,a,[role="button"]')) {
            focusSmartInput()
          }
        }}
      >
        <QuickLaunch sessionId={session.id} onLaunched={handleQuickLaunchComplete} />
      </div>
    )
  }

  return (
    <div
      data-terminal-pane
      data-smart-input-active={showSmartInput ? 'true' : undefined}
      className="terminal-pane relative flex h-full flex-col overflow-hidden"
      style={paneStyle}
      onClick={(event) => {
        onClick?.()
        const target = event.target as HTMLElement | null
        if (showSmartInput && !target?.closest('button,input,textarea,a,[role="button"]')) {
          focusSmartInput()
        }
      }}
      onMouseEnter={() => setLabelHovered(true)}
      onMouseLeave={() => setLabelHovered(false)}
    >

      {/* Pane Header */}
      {showPaneLabel && (
        <div
          className="pane-header shrink-0 flex items-center justify-between px-3 py-1.5 border-b"
          style={{
            borderColor: 'color-mix(in srgb, var(--ghost-border) 70%, transparent)',
            background: 'color-mix(in srgb, var(--ghost-sidebar) 55%, transparent)',
          }}
        >

          {/* Left: Identity */}
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            {/* Agent dot or terminal icon */}
            <div className="shrink-0">
              {agent ? (
                <div className="relative">
                  <div
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: providerColor }}
                  />
                  {agent.status === 'working' && (
                    <div
                      className="absolute inset-0 animate-ping rounded-full opacity-40"
                      style={{ backgroundColor: providerColor }}
                    />
                  )}
                </div>
              ) : (
                <TerminalIcon className="h-3 w-3 text-white/25" />
              )}
            </div>

            <div className="flex items-center gap-2 min-w-0 flex-1">
              {/* Title */}
              {isEditingTitle ? (
                <input
                  ref={titleInputRef}
                  value={titleInput}
                  onChange={(e) => setTitleInput(e.target.value)}
                  onBlur={handleTitleSubmit}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleTitleSubmit()
                    if (e.key === 'Escape') {
                      setTitleInput(session.title)
                      setIsEditingTitle(false)
                    }
                  }}
                  className="max-w-[180px] rounded-md border px-1.5 py-0.5 text-[12px] font-medium outline-none focus:shadow-none"
                  style={{
                    borderColor: 'var(--ghost-border)',
                    background: 'color-mix(in srgb, var(--ghost-sidebar) 70%, transparent)',
                    color: 'var(--ghost-text)',
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--ghost-accent)' }}
                  onBlurCapture={(e) => { e.currentTarget.style.borderColor = 'var(--ghost-border)' }}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span
                  onDoubleClick={(e) => {
                    e.stopPropagation()
                    setIsEditingTitle(true)
                  }}
                  className={`cursor-text truncate text-[12px] font-medium transition-colors ${isActive ? 'text-white/80' : 'text-white/45'}`}
                  title="Double-click to rename"
                >
                  {session.title}
                </span>
              )}

              {/* Activity indicator */}
              {!isEditingTitle && agent && activityName && activityName !== 'idle' && (
                <div className="shrink-0 scale-85 origin-left">
                  <ActivityIcon
                    activity={activityName}
                    detail={activityDetail || undefined}
                    size="xs"
                    startedAt={activityStartedAt || undefined}
                    showElapsed={activityName === 'thinking'}
                    showLabel={false}
                  />
                </div>
              )}

              {/* Inline description */}
              {!isEditingTitle && !isEditingDesc && (
                <span className="hidden lg:inline truncate text-[10px] text-white/20">
                  {session.description && (
                    <>
                      <span className="mx-1">&bull;</span>
                      <span
                        onClick={(e) => {
                          e.stopPropagation()
                          setIsEditingDesc(true)
                        }}
                        className="cursor-text hover:text-white/40 transition-colors"
                      >
                        {session.description}
                      </span>
                    </>
                  )}
                  {session.cwd && (
                    <>
                      <span className="mx-1">&bull;</span>
                      {session.cwd.split(/[/\\]/).pop()}
                    </>
                  )}
                </span>
              )}

              {isEditingDesc && (
                <input
                  ref={descInputRef}
                  value={descInput}
                  onChange={(e) => setDescInput(e.target.value)}
                  onBlur={handleDescSubmit}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleDescSubmit()
                    if (e.key === 'Escape') {
                      setDescInput(session.description || '')
                      setIsEditingDesc(false)
                    }
                  }}
                  className="max-w-[220px] rounded-md border px-1.5 py-0.5 text-[10px] outline-none"
                  style={{
                    borderColor: 'color-mix(in srgb, var(--ghost-border) 80%, transparent)',
                    background: 'color-mix(in srgb, var(--ghost-sidebar) 70%, transparent)',
                    color: 'color-mix(in srgb, var(--ghost-text) 70%, transparent)',
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--ghost-accent)' }}
                  onBlurCapture={(e) => { e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--ghost-border) 80%, transparent)' }}
                  placeholder="Set task focus..."
                  onClick={(e) => e.stopPropagation()}
                />
              )}
            </div>
          </div>

          {/* Right: Context gauge + close */}
          <div className="flex items-center gap-2 shrink-0 pl-2">
            {provider && hasContextData && (
              <ContextGauge
                provider={provider}
                metrics={activityContextMetrics}
                active={contextOpen}
                onClick={() => setContextOpen((prev) => !prev)}
              />
            )}

            {onClose && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onClose()
                }}
                className={`flex h-5 w-5 items-center justify-center rounded-md text-white/20 transition-all hover:bg-rose-500/15 hover:text-rose-300 ${labelHovered ? 'opacity-100' : 'opacity-0'
                  }`}
                title="Close"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

        </div>
      )}

      {/* Terminal Canvas */}
      <div className="flex min-h-0 flex-1 bg-transparent">
        <div className="flex min-w-0 flex-1 flex-col">
          <div
            className="relative min-h-0 flex-1"
            onMouseDownCapture={handleTerminalCanvasMouseDown}
            onDoubleClickCapture={handleTerminalCanvasMouseDown}
          >
            <div ref={setContainerEl} className="absolute inset-0" />

            {searchOpen && (
              <div className="absolute top-2 right-4 z-20">
                <TerminalSearch
                  isOpen={searchOpen}
                  onClose={handleSearchClose}
                  onSearchNext={searchNext}
                  onSearchPrev={searchPrev}
                  onClear={clearSearch}
                />
              </div>
            )}

            {multiLineOpen && (
              <MultiLineInput
                onSubmit={handleMultiLineSubmit}
                onClose={() => {
                  setMultiLineOpen(false)
                  setTimeout(() => {
                    if (showSmartInput) {
                      focusSmartInput()
                    } else {
                      terminal?.focus()
                    }
                  }, 50)
                }}
              />
            )}

            {showSmartInput && (
              <div
                className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-px"
                style={{ background: 'color-mix(in srgb, var(--ghost-border) 60%, transparent)' }}
              />
            )}
          </div>

          {showSmartInput && (
            <TerminalCommandBar
              sessionId={session.id}
              cwd={session.cwd}
              provider={provider}
              isActive={!!isActive}
            />
          )}
        </div>

        {contextOpen && (
          <div className="min-h-0">
            <TerminalContextPanel
              session={session}
              provider={provider}
              activityId={activityId}
              entries={companionEntries}
              blocks={commandBlocks}
              onClose={() => setContextOpen(false)}
            />
          </div>
        )}
      </div>

    </div>
  )
}
