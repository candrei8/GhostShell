import { useState, useEffect, useCallback, useMemo } from 'react'
import { Terminal as TerminalIcon } from 'lucide-react'
import { useTerminalStore } from '../../stores/terminalStore'
import { useWorkspaceStore } from '../../stores/workspaceStore'
import { useSwarmStore } from '../../stores/swarmStore'
import { TerminalPane } from './TerminalPane'
import { AgentHUD } from '../agents/AgentHUD'
import { BentoLayout } from './BentoLayout'
import { SessionTypeSelector } from './SessionTypeSelector'
import { SHORTCUT_EVENTS } from '../../lib/shortcutEvents'
import { type SessionType } from '../../lib/types'

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

  const [hudOpen, setHudOpen] = useState(false)
  const [showTypeSelector, setShowTypeSelector] = useState(false)

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

  // Which sessions are visible right now. Every session stays mounted; this
  // only drives CSS visibility so layout changes never unmount a pane (and
  // therefore never kill a live PTY).
  const visibleSessionIds = useMemo(() => {
    if (maximizedSessionId && sessions.some((s) => s.id === maximizedSessionId)) {
      return [maximizedSessionId]
    }
    if (viewMode === 'grid') {
      return sessions.map((s) => s.id)
    }
    const ws = workspaces.find((w) => w.id === resolvedActiveWorkspaceId)
    if (ws) return ws.sessionIds
    return sessions[0] ? [sessions[0].id] : []
  }, [maximizedSessionId, viewMode, sessions, workspaces, resolvedActiveWorkspaceId])

  // A visibility/layout change (maximize toggle, tabs↔grid) doesn't resize the
  // DOM node, so nudge all terminals to refit after the CSS settles.
  useEffect(() => {
    const t = setTimeout(() => window.dispatchEvent(new CustomEvent('ghostshell:refit')), 60)
    return () => clearTimeout(t)
  }, [viewMode, maximizedSessionId, visibleSessionIds])

  const handleTypeSelected = useCallback((type: SessionType) => {
    setShowTypeSelector(false)

    if (type === 'ghostswarm') {
      useSwarmStore.getState().openWizard()
    } else {
      const cwd = useWorkspaceStore.getState().currentPath
      useTerminalStore.getState().addSession({
        id: `term-quicklaunch-${Date.now()}`,
        title: 'New Session',
        cwd,
        showQuickLaunch: true,
        sessionType: 'ghostcode',
      })
    }
  }, [])

  const isSingleVisible = visibleSessionIds.length === 1
  const visibleSet = useMemo(() => new Set(visibleSessionIds), [visibleSessionIds])

  const renderPane = useCallback(
    (session: (typeof sessions)[number]) => (
      // No key here — BentoLayout keys the wrapping cell by session.id.
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
          onClose={() => removeSession(session.id)}
          onClick={() => setActiveSession(session.id)}
          showPaneLabel={true}
        />
      </div>
    ),
    [activeSessionId, isSingleVisible, removeSession, setActiveSession, visibleSet],
  )

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-ghost-bg h-full w-full relative">

      {/* Workspace Area — a single mounted set of panes; tabs/grid/maximize
          only toggle CSS visibility so no layout change ever kills a PTY. */}
      <div className="flex-1 min-h-0 relative">
        <BentoLayout
          sessions={sessions}
          visibleSessionIds={visibleSessionIds}
          maximizedSessionId={maximizedSessionId}
          renderPane={renderPane}
        />
      </div>

      {hasNoSessions && !showTypeSelector && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-ghost-bg">
          <div className="text-center space-y-6">
            <div className="relative mx-auto w-14 h-14">
              <div className="absolute inset-0 rounded-2xl bg-white/[0.03] border border-white/[0.06]" />
              <div className="absolute inset-0 flex items-center justify-center">
                <TerminalIcon className="w-6 h-6 text-white/25" />
              </div>
            </div>

            <button
              onClick={() => setShowTypeSelector(true)}
              className="group relative inline-flex h-11 items-center justify-center gap-2 overflow-hidden rounded-xl bg-[#38bdf8] px-6 text-[13px] font-semibold text-[#050812] transition-all hover:bg-[#38bdf8]/90 hover:scale-[1.02] active:scale-[0.98]"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
              Start New Session
            </button>

            <div className="space-y-1.5 pt-2">
              <p className="text-[13px] font-medium text-white/50">No active sessions</p>
              <p className="text-[12px] text-white/30">
                Or press <kbd className="font-mono text-white/50 bg-white/[0.06] border border-white/[0.08] px-1.5 py-0.5 rounded-md text-[11px] ml-1">Ctrl+Space</kbd>
              </p>
            </div>
          </div>
        </div>
      )}

      {showTypeSelector && (
        <SessionTypeSelector
          onSelect={handleTypeSelected}
          onClose={() => setShowTypeSelector(false)}
        />
      )}

      {hudOpen && (
        <AgentHUD onClose={() => setHudOpen(false)} />
      )}
    </div>
  )
}
