import { useState, useEffect, useCallback, useMemo } from 'react'
import { Terminal as TerminalIcon } from 'lucide-react'
import { useTerminalStore } from '../../stores/terminalStore'
import { useWorkspaceStore } from '../../stores/workspaceStore'
import { TerminalPane } from './TerminalPane'
import { AgentHUD } from '../agents/AgentHUD'
import { PaneGrid } from './PaneGrid'
import { SHORTCUT_EVENTS } from '../../lib/shortcutEvents'
import { openQuickLaunchSession } from '../../lib/sessionLaunch'

export function TerminalContainer() {
  const sessions = useTerminalStore((s) => s.sessions)
  const activeSessionId = useTerminalStore((s) => s.activeSessionId)
  const activeWorkspaceId = useTerminalStore((s) => s.activeWorkspaceId)
  const maximizedSessionId = useTerminalStore((s) => s.maximizedSessionId)
  const viewMode = useTerminalStore((s) => s.viewMode)
  const groups = useTerminalStore((s) => s.groups)
  const setActiveSession = useTerminalStore((s) => s.setActiveSession)
  const setActiveWorkspace = useTerminalStore((s) => s.setActiveWorkspace)
  const getWorkspaces = useTerminalStore((s) => s.getWorkspaces)
  const removeSession = useTerminalStore((s) => s.removeSession)
  const toggleMaximize = useTerminalStore((s) => s.toggleMaximize)
  const duplicateSession = useTerminalStore((s) => s.duplicateSession)

  const [hudOpen, setHudOpen] = useState(false)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.code === 'Space') {
        e.preventDefault()
        setHudOpen(true)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    // Coalesce duplicate new-terminal events fired within one keypress (e.g. an
    // xterm intercept + the global shortcut handler both firing) so Ctrl+T
    // always opens exactly one terminal.
    let lastNewTerminalAt = 0
    const handleNewTerminalRequest = () => {
      const now = Date.now()
      if (now - lastNewTerminalAt < 250) return
      lastNewTerminalAt = now
      const cwd = useWorkspaceStore.getState().currentPath
      useTerminalStore.getState().addSession({
        id: `term-standalone-${now}`,
        title: 'Terminal',
        cwd,
      })
    }

    let lastSplitAt = 0
    const handleSplitRequest = () => {
      const now = Date.now()
      if (now - lastSplitAt < 250) return
      lastSplitAt = now
      const currentSessionId = useTerminalStore.getState().activeSessionId
      if (!currentSessionId) return
      useTerminalStore.getState().duplicateSession(currentSessionId)
    }

    window.addEventListener(SHORTCUT_EVENTS.newTerminal, handleNewTerminalRequest as EventListener)
    window.addEventListener(SHORTCUT_EVENTS.splitSession, handleSplitRequest as EventListener)
    return () => {
      window.removeEventListener(
        SHORTCUT_EVENTS.newTerminal,
        handleNewTerminalRequest as EventListener,
      )
      window.removeEventListener(
        SHORTCUT_EVENTS.splitSession,
        handleSplitRequest as EventListener,
      )
    }
  }, [])

  // When the window gets focus back (restore, Alt+Tab, end of a resize) and
  // keyboard focus fell to <body>, return it to the active pane so typing
  // resumes without an extra click. Never steals focus from a real control.
  useEffect(() => {
    const handleWindowFocus = () => {
      requestAnimationFrame(() => {
        const active = document.activeElement
        if (active && active !== document.body) return
        window.dispatchEvent(new CustomEvent(SHORTCUT_EVENTS.focusTerminal))
      })
    }
    window.addEventListener('focus', handleWindowFocus)
    return () => window.removeEventListener('focus', handleWindowFocus)
  }, [])

  const hasNoSessions = sessions.length === 0

  const workspaces = useMemo(() => getWorkspaces(), [getWorkspaces, sessions, groups])

  const resolvedActiveWorkspaceId = useMemo(() => {
    if (activeWorkspaceId && workspaces.some((w) => w.id === activeWorkspaceId)) {
      return activeWorkspaceId
    }
    if (activeSessionId) {
      const bySession = workspaces.find((w) => w.sessionIds.includes(activeSessionId))
      if (bySession) return bySession.id
    }
    return workspaces[0]?.id || null
  }, [activeWorkspaceId, activeSessionId, workspaces])

  useEffect(() => {
    if (!resolvedActiveWorkspaceId) return
    if (resolvedActiveWorkspaceId !== activeWorkspaceId) {
      setActiveWorkspace(resolvedActiveWorkspaceId)
    }
  }, [resolvedActiveWorkspaceId, activeWorkspaceId, setActiveWorkspace])

  const activeWorkspace = useMemo(
    () => workspaces.find((w) => w.id === resolvedActiveWorkspaceId),
    [workspaces, resolvedActiveWorkspaceId],
  )

  const maximizedId =
    maximizedSessionId && sessions.some((s) => s.id === maximizedSessionId) ? maximizedSessionId : null

  // Layout groups: grid mode tiles every session together; tabs mode lays out
  // each workspace over the whole area, so a hidden tab already has the size it
  // will have when selected.
  const layoutGroups = useMemo(
    () => (viewMode === 'grid' ? [sessions.map((s) => s.id)] : workspaces.map((w) => w.sessionIds)),
    [viewMode, sessions, workspaces],
  )

  // Which sessions are visible right now. Every session stays mounted; this
  // only drives CSS visibility so layout changes never unmount a pane (and
  // therefore never kill a live PTY). A maximized pane only takes over the view
  // it belongs to — switching to another tab shows that tab, not the maximized
  // pane from elsewhere.
  const visibleSessionIds = useMemo(() => {
    if (viewMode === 'grid') {
      return maximizedId ? [maximizedId] : sessions.map((s) => s.id)
    }
    if (activeWorkspace) {
      return maximizedId && activeWorkspace.sessionIds.includes(maximizedId)
        ? [maximizedId]
        : activeWorkspace.sessionIds
    }
    return sessions[0] ? [sessions[0].id] : []
  }, [activeWorkspace, maximizedId, sessions, viewMode])

  const isSingleVisible = visibleSessionIds.length === 1
  const visibleSet = useMemo(() => new Set(visibleSessionIds), [visibleSessionIds])

  const renderPane = useCallback(
    (session: (typeof sessions)[number]) => (
      // No key here — PaneGrid keys the wrapping cell by session.id.
      <div
        className="w-full h-full relative"
        onMouseDownCapture={() => {
          if (session.id !== activeSessionId) {
            setActiveSession(session.id)
          }
        }}
      >
        <TerminalPane
          session={session}
          isActive={visibleSet.has(session.id) && (isSingleVisible || session.id === activeSessionId)}
          isMaximized={maximizedId === session.id}
          onClose={() => removeSession(session.id)}
          onClick={() => setActiveSession(session.id)}
          onToggleMaximize={() => toggleMaximize(session.id)}
          onSplit={() => duplicateSession(session.id)}
          showPaneLabel={true}
        />
      </div>
    ),
    [
      activeSessionId,
      duplicateSession,
      isSingleVisible,
      maximizedId,
      removeSession,
      setActiveSession,
      toggleMaximize,
      visibleSet,
    ],
  )

  return (
    <div className="flex-1 flex flex-col overflow-hidden h-full w-full relative">

      {/* Workspace Area — a single mounted set of panes; tabs/grid/maximize
          only toggle CSS visibility so no layout change ever kills a PTY. */}
      <div className="flex-1 min-h-0 relative">
        <PaneGrid
          sessions={sessions}
          groups={layoutGroups}
          visibleSessionIds={visibleSessionIds}
          maximizedSessionId={maximizedId}
          focusedSessionId={activeSessionId}
          renderPane={renderPane}
        />
      </div>

      {hasNoSessions && (
        <div className="absolute inset-0 z-20 flex items-center justify-center">
          <div
            className="flex w-[320px] flex-col items-center gap-5 px-8 py-9 text-center"
            style={{
              background: 'var(--pane-bg)',
              border: '1px solid var(--pane-border)',
              borderRadius: 'var(--pane-radius)',
            }}
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.03]">
              <TerminalIcon className="h-5 w-5 text-white/30" />
            </div>

            <div className="space-y-1">
              <p className="text-[13px] font-semibold text-white/80">No active sessions</p>
              <p className="text-[12px] text-white/40">Start an agent or a plain terminal.</p>
            </div>

            <button
              onClick={openQuickLaunchSession}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-[#38bdf8] px-4 text-[12.5px] font-semibold text-[#050812] transition-colors hover:bg-[#38bdf8]/90 active:bg-[#38bdf8]/80"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
              New session
            </button>

            <p className="text-[11px] text-white/30">
              or press
              <kbd className="ml-1.5 rounded-md border border-white/[0.08] bg-white/[0.05] px-1.5 py-0.5 font-mono text-[10.5px] text-white/50">Ctrl+Space</kbd>
            </p>
          </div>
        </div>
      )}

      {hudOpen && (
        <AgentHUD onClose={() => setHudOpen(false)} />
      )}
    </div>
  )
}
