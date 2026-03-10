import { useState, useEffect, useCallback, useMemo } from 'react'
import { Terminal as TerminalIcon } from 'lucide-react'
import { useTerminalStore } from '../../stores/terminalStore'
import { TerminalPane } from './TerminalPane'
import { QuickLaunch } from './QuickLaunch'
import { AgentHUD } from '../agents/AgentHUD'
import { BentoLayout } from './BentoLayout'
import { TerminalTabs } from './TerminalTabs'
import { SHORTCUT_EVENTS } from '../../lib/shortcutEvents'

interface TerminalContainerProps {
  showQuickLaunch: boolean
  onShowQuickLaunch: (show: boolean) => void
}

export function TerminalContainer({ showQuickLaunch, onShowQuickLaunch }: TerminalContainerProps) {
  const sessions = useTerminalStore((s) => s.sessions)
  const activeSessionId = useTerminalStore((s) => s.activeSessionId)
  const activeWorkspaceId = useTerminalStore((s) => s.activeWorkspaceId)
  const maximizedSessionId = useTerminalStore((s) => s.maximizedSessionId)
  const viewMode = useTerminalStore((s) => s.viewMode)
  const tabsCollapsed = useTerminalStore((s) => s.tabsCollapsed)
  const groups = useTerminalStore((s) => s.groups)
  const setActiveSession = useTerminalStore((s) => s.setActiveSession)
  const setActiveWorkspace = useTerminalStore((s) => s.setActiveWorkspace)
  const closeWorkspace = useTerminalStore((s) => s.closeWorkspace)
  const getWorkspaces = useTerminalStore((s) => s.getWorkspaces)
  const removeSession = useTerminalStore((s) => s.removeSession)

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

  const renderWorkspace = useCallback((workspaceSessions: typeof sessions, workspaceId: string, isVisible: boolean) => {
    if (workspaceSessions.length === 0) return null

    const wrapperClassName = viewMode === 'tabs'
      ? (isVisible ? 'absolute inset-0' : 'absolute inset-0 hidden')
      : 'absolute inset-0'

    if (workspaceSessions.length === 1 && viewMode === 'tabs') {
      const session = workspaceSessions[0]
      return (
        <div key={workspaceId} className={wrapperClassName} aria-hidden={!isVisible}>
          <div className="w-full h-full p-2 pb-0">
            <TerminalPane
              session={session}
              isActive={isVisible}
              onClose={() => removeSession(session.id)}
              onClick={() => setActiveSession(session.id)}
              showPaneLabel={true}
            />
          </div>
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
              className="w-full h-full relative p-1"
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

  const showTabs = sessions.length > 0 && !tabsCollapsed

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-ghost-bg h-full w-full relative">

      {/* Top Tabs Bar */}
      {showTabs && (
        <TerminalTabs
          workspaces={workspaces}
          activeWorkspaceId={resolvedActiveWorkspaceId}
          onNewTab={() => onShowQuickLaunch(true)}
          onSelectWorkspace={(ws) => setActiveWorkspace(ws.id)}
          onCloseWorkspace={(ws) => closeWorkspace(ws.id)}
        />
      )}

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

      {showQuickLaunch && (
        <div className="absolute inset-0 z-30 flex flex-col bg-ghost-bg/98 overflow-hidden">
          <QuickLaunch onLaunched={() => onShowQuickLaunch(false)} />
        </div>
      )}

      {hasNoSessions && !showQuickLaunch && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-ghost-bg">
          <div className="text-center space-y-5">
            <div className="relative mx-auto w-14 h-14">
              <div className="absolute inset-0 rounded-2xl bg-white/[0.03] border border-white/[0.06]" />
              <div className="absolute inset-0 flex items-center justify-center">
                <TerminalIcon className="w-6 h-6 text-white/25" />
              </div>
            </div>
            <div className="space-y-1.5">
              <p className="text-[13px] font-medium text-white/60">No active sessions</p>
              <p className="text-[12px] text-white/25">
                Press <kbd className="font-mono text-white/40 bg-white/[0.06] border border-white/[0.08] px-1.5 py-0.5 rounded-md text-[11px]">Ctrl+Space</kbd> or click <button onClick={() => onShowQuickLaunch(true)} className="text-white/50 underline underline-offset-2 decoration-white/20 hover:text-white/70 transition-colors">Launch</button>
              </p>
            </div>
          </div>
        </div>
      )}

      {hudOpen && (
        <AgentHUD onClose={() => setHudOpen(false)} />
      )}
    </div>
  )
}
