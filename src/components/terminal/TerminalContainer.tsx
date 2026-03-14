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
    const handleSplitRequest = () => {
      const currentSessionId = useTerminalStore.getState().activeSessionId
      if (!currentSessionId) return
      useTerminalStore.getState().duplicateSession(currentSessionId)
    }

    window.addEventListener(SHORTCUT_EVENTS.splitSession, handleSplitRequest as EventListener)
    return () =>
      window.removeEventListener(
        SHORTCUT_EVENTS.splitSession,
        handleSplitRequest as EventListener,
      )
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

  const renderWorkspace = useCallback((workspaceSessions: typeof sessions, workspaceId: string, isVisible: boolean) => {
    if (workspaceSessions.length === 0) return null

    const wrapperClassName = viewMode === 'tabs'
      ? (isVisible ? 'absolute inset-0' : 'absolute inset-0 hidden')
      : 'absolute inset-0'

    if (workspaceSessions.length === 1 && viewMode === 'tabs') {
      const session = workspaceSessions[0]
      return (
        <div key={workspaceId} className={wrapperClassName} aria-hidden={!isVisible}>
          <TerminalPane
            session={session}
            isActive={isVisible}
            onClose={() => removeSession(session.id)}
            onClick={() => setActiveSession(session.id)}
            showPaneLabel={true}
          />
        </div>
      )
    }

    return (
      <div key={workspaceId} className={wrapperClassName} aria-hidden={!isVisible}>
        <BentoLayout
          sessions={workspaceSessions}
          maximizedSessionId={maximizedSessionId}
          renderPane={(session) => (
            <div
              key={session.id}
              className="w-full h-full relative"
              onMouseDownCapture={() => {
                if (session.id !== activeSessionId) {
                  setActiveSession(session.id)
                }
              }}
            >
              <TerminalPane
                session={session}
                isActive={isVisible && session.id === activeSessionId}
                onClose={() => removeSession(session.id)}
                onClick={() => setActiveSession(session.id)}
                showPaneLabel={true}
              />
            </div>
          )}
        />
      </div>
    )
  }, [activeSessionId, maximizedSessionId, removeSession, setActiveSession, viewMode])

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-ghost-bg h-full w-full relative">

      {/* Workspace Area */}
      <div className="flex-1 min-h-0 relative">
        {viewMode === 'tabs'
          ? workspaces.map((workspace) =>
            renderWorkspace(
              sessions.filter((session) => workspace.sessionIds.includes(session.id)),
              workspace.id,
              workspace.id === resolvedActiveWorkspaceId,
            ),
          )
          : renderWorkspace(sessions, 'grid-view', true)}
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
