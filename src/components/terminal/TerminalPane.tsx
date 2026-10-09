import { useState, useCallback, useEffect, useMemo, type MouseEvent as ReactMouseEvent } from 'react'
import { useTerminal } from '../../hooks/useTerminal'
import { usePty } from '../../hooks/usePty'
import { useTerminalStore } from '../../stores/terminalStore'
import { TerminalSearch } from './TerminalSearch'
import { MultiLineInput } from './MultiLineInput'
import { QuickLaunch } from './QuickLaunch'
import { TerminalCommandBar } from './TerminalCommandBar'
import { PaneHeader, type PaneStatus } from './PaneHeader'
import { useAgentStore } from '../../stores/agentStore'
import { useActivityStore } from '../../stores/activityStore'
import { getActivityConfig } from '../agents/ActivityIcon'
import { TerminalSession } from '../../lib/types'
import { resolveProvider } from '../../lib/providers'
import { submitPromptToSession } from '../../lib/terminalPromptSubmission'
import { SHORTCUT_EVENTS } from '../../lib/shortcutEvents'

const SMART_INPUT_FOCUS_EVENT = 'ghostshell:focus-command-bar'

interface TerminalPaneProps {
  session: TerminalSession
  isActive?: boolean
  isMaximized?: boolean
  onClose?: () => void
  onClick?: () => void
  onToggleMaximize?: () => void
  onSplit?: () => void
  showPaneLabel?: boolean
  searchOpen?: boolean
  onSearchClose?: () => void
}

// If no fresh activity event arrives within this window, the regex-based
// activity detector is treated as stale and the header shows idle. This makes a
// stuck "Thinking…" impossible: the indicator self-clears when output stops.
const ACTIVITY_STALE_MS = 8000

/** Compact elapsed like "12s" / "2m 05s". */
function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${(s % 60).toString().padStart(2, '0')}s`
  return `${Math.floor(m / 60)}h ${(m % 60).toString().padStart(2, '0')}m`
}

/**
 * Live status derived from the activity store, guarded against a stuck detector:
 * returns `{ busy, elapsed }` where `busy` flips false once activity goes stale.
 */
function useLiveActivity(activityName: string | null, startedAt: number | null) {
  const rawBusy = !!activityName && activityName !== 'idle'
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!rawBusy) return
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [rawBusy, startedAt])

  const fresh = rawBusy && !!startedAt && now - startedAt < ACTIVITY_STALE_MS
  return {
    busy: fresh,
    elapsed: fresh && startedAt ? formatElapsed(now - startedAt) : null,
  }
}

export function TerminalPane({
  session,
  isActive,
  isMaximized = false,
  onClose,
  onClick,
  onToggleMaximize,
  onSplit,
  showPaneLabel = true,
  searchOpen: externalSearchOpen,
  onSearchClose,
}: TerminalPaneProps) {
  const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null)

  const agent = useAgentStore((s) =>
    session.agentId ? s.agents.find((a) => a.id === session.agentId) : undefined,
  )
  const activityId = session.agentId || session.id
  // Select only the fields the header renders to avoid re-renders from
  // high-frequency activityLog/subAgents changes (e.g. spinner frames).
  const activityName = useActivityStore((s) => s.activities[activityId]?.currentActivity || null)
  const activityStartedAt = useActivityStore((s) => s.activities[activityId]?.lastActivityTime || null)

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
  const [multiLineOpen, setMultiLineOpen] = useState(false)

  const searchOpen = externalSearchOpen !== undefined ? externalSearchOpen : localSearchOpen

  // ── Minimal status line: "Thinking · 12s" as plain typography ────────
  // busy self-clears when the detector goes stale, so it can never get stuck.
  const { busy: isBusy, elapsed: elapsedLabel } = useLiveActivity(activityName, activityStartedAt)
  const statusLabel = isBusy && activityName ? getActivityConfig(activityName).label : null

  const paneStatus: PaneStatus =
    agent?.status === 'error'
      ? 'error'
      : agent?.status === 'offline'
        ? 'offline'
        : isBusy
          ? 'busy'
          : 'alive'

  const updateSession = useTerminalStore((s) => s.updateSession)
  const renameSession = useTerminalStore((s) => s.renameSession)
  const handleRename = useCallback(
    (title: string) => renameSession(session.id, title),
    [session.id, renameSession],
  )

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
      // Single source of truth: registers the prompt in history/blocks/companion
      // and uses the correct per-provider soft-newline sequence (ESC+CR for
      // Claude, LF for Codex/Gemini, plain CR for shells).
      submitPromptToSession(session.id, text, session.cwd)
      setTimeout(() => {
        if (showSmartInput) {
          focusSmartInput()
        } else {
          terminal?.focus()
        }
      }, 50)
    },
    [session.id, session.cwd, terminal, showSmartInput, focusSmartInput],
  )

  const paneStyle = useMemo(() => ({
    background: 'var(--pane-bg)',
  }), [])

  const handleClear = useCallback(() => {
    terminal?.clear()
  }, [terminal])

  // Put keyboard focus back into this pane's input once layout has settled
  // (two frames: the visibility flip of a maximize lands on the first).
  const focusPane = useCallback(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (showSmartInput) {
          focusSmartInput()
          return
        }
        try { terminal?.focus() } catch { /* disposed */ }
      })
    })
  }, [focusSmartInput, showSmartInput, terminal])

  const handleMaximizeToggle = useCallback(() => {
    onToggleMaximize?.()
    focusPane()
  }, [focusPane, onToggleMaximize])

  // In smart-input panes the xterm textarea is a dead end for keystrokes (the
  // terminal is read-only); if anything focuses it — xterm's own mousedown,
  // a programmatic focus — hand focus to the command bar instead.
  useEffect(() => {
    if (!showSmartInput || !containerEl) return
    const handleFocusIn = (event: FocusEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.classList.contains('xterm-helper-textarea')) focusSmartInput()
    }
    containerEl.addEventListener('focusin', handleFocusIn)
    return () => containerEl.removeEventListener('focusin', handleFocusIn)
  }, [containerEl, focusSmartInput, showSmartInput])

  const handleSplit = useCallback(() => {
    onSplit?.()
  }, [onSplit])

  const header = showPaneLabel ? (
    <PaneHeader
      title={session.title}
      cwd={session.cwd}
      provider={provider}
      status={paneStatus}
      statusLabel={statusLabel}
      elapsedLabel={elapsedLabel}
      isActive={!!isActive}
      isMaximized={isMaximized}
      onRename={handleRename}
      onToggleMaximize={handleMaximizeToggle}
      onSplit={handleSplit}
      onClose={onClose}
      onSearch={handleToggleSearch}
      onClear={handleClear}
      onFocusPane={focusPane}
    />
  ) : null

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
        className="terminal-pane relative flex h-full flex-col overflow-hidden"
        onClick={(event) => {
          onClick?.()
          const target = event.target as HTMLElement | null
          if (showSmartInput && !target?.closest('button,input,textarea,a,[role="button"]')) {
            focusSmartInput()
          }
        }}
      >
        {/* No pane header: there is no terminal yet, only the setup screen. */}
        <QuickLaunch sessionId={session.id} onLaunched={handleQuickLaunchComplete} />
      </div>
    )
  }

  return (
    <div
      data-terminal-pane
      data-smart-input-active={showSmartInput ? 'true' : undefined}
      className="terminal-pane group relative flex h-full flex-col overflow-hidden"
      style={paneStyle}
      onClick={(event) => {
        onClick?.()
        const target = event.target as HTMLElement | null
        if (showSmartInput && !target?.closest('button,input,textarea,a,[role="button"]')) {
          focusSmartInput()
        }
      }}
    >

      {header}

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
      </div>

    </div>
  )
}
