import { useState, useCallback, useEffect, useRef } from 'react'
import { TitleBar } from './TitleBar'
import { IconSidebar } from './IconSidebar'
import { SecondarySidebar } from './SecondarySidebar'
import { TerminalContainer } from '../terminal/TerminalContainer'
import { CommandPalette } from '../common/CommandPalette'
import { ToastContainer } from '../common/ToastContainer'
import { SettingsModal } from '../settings/SettingsModal'
import { SubAgentMonitor } from '../agents/SubAgentMonitor'
import { ResizeHandle } from '../common/ResizeHandle'
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts'
import { UpdateBanner } from '../common/UpdateBanner'
import { useTerminalStore } from '../../stores/terminalStore'
import { useAgentStore } from '../../stores/agentStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { loadTabSnapshot, clearTabSnapshot } from '../../lib/tabSnapshot'
import { SidebarView } from '../../lib/types'

export function AppLayout() {
  const sessions = useTerminalStore((s) => s.sessions)
  const activeSessionId = useTerminalStore((s) => s.activeSessionId)
  const [activeView, setActiveView] = useState<SidebarView>('agents')
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [showQuickLaunch, setShowQuickLaunch] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [monitorOpen, setMonitorOpen] = useState(false)
  const [monitorHeight, setMonitorHeight] = useState(250)
  const handleNavigate = useCallback((view: string) => {
    if (view === 'settings') {
      setSettingsOpen(true)
      return
    }
    setActiveView(view as SidebarView)
    setIsSidebarCollapsed(false)
    setShowQuickLaunch(false)
  }, [])

  const handleShowQuickLaunch = useCallback((show: boolean) => {
    setShowQuickLaunch(show)
  }, [])

  const handleQuickLaunch = useCallback(() => {
    setShowQuickLaunch(true)
  }, [])

  const toggleCommandPalette = useCallback(() => {
    setCommandPaletteOpen((prev) => !prev)
  }, [])

  // Fire ghostshell:refit when layout-affecting state changes so xterm recalculates.
  // Staggered: 50ms for quick changes, 350ms for sidebar collapse animation (250ms) + settle.
  useEffect(() => {
    const t1 = setTimeout(() => window.dispatchEvent(new CustomEvent('ghostshell:refit')), 50)
    const t2 = setTimeout(() => window.dispatchEvent(new CustomEvent('ghostshell:refit')), 350)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [monitorOpen, monitorHeight, isSidebarCollapsed])

  const handleToggleMonitor = useCallback(() => {
    setMonitorOpen((prev) => !prev)
  }, [])

  // Dismiss QuickLaunch when an agent card click switches the active session
  useEffect(() => {
    if (activeSessionId && sessions.length > 0) {
      setShowQuickLaunch(false)
    }
  }, [activeSessionId, sessions.length])

  // Restore previous tabs on startup (one-time)
  const restoredRef = useRef(false)
  useEffect(() => {
    if (restoredRef.current) return
    restoredRef.current = true

    const restore = async () => {
      const restoreTabs = useSettingsStore.getState().restoreTabs
      if (!restoreTabs) return

      const snapshot = await loadTabSnapshot()
      if (!snapshot) return

      // Clear immediately to prevent double-restore
      await clearTabSnapshot()

      const { addAgent, setAgentStatus, updateAgent } = useAgentStore.getState()
      const { addSession, setActiveSession, setViewMode } = useTerminalStore.getState()

      // Map old agent IDs to new ones
      const agentIdMap = new Map<string, string>()

      // Restore agents as 'offline'
      for (const saved of snapshot.agents) {
        const agent = addAgent(
          saved.name,
          saved.avatar,
          saved.color,
          saved.claudeConfig,
          saved.cwd,
          saved.templateId,
          saved.provider,
          saved.geminiConfig,
          saved.codexConfig,
        )
        agentIdMap.set(saved.originalId, agent.id)
        setAgentStatus(agent.id, 'offline')
        if (saved.hasConversation) {
          updateAgent(agent.id, { hasConversation: true })
        }
      }

      // Restore sessions
      const restoredSessionIds: string[] = []
      for (const saved of snapshot.sessions) {
        const newId = `term-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
        const mappedAgentId = saved.agentId ? agentIdMap.get(saved.agentId) : undefined

        addSession({
          id: newId,
          title: saved.title,
          cwd: saved.cwd,
          shell: saved.shell,
          agentId: mappedAgentId,
          skipAutoLaunch: true,
        })
        restoredSessionIds.push(newId)

        // Link agent back to its terminal
        if (mappedAgentId) {
          updateAgent(mappedAgentId, { terminalId: newId })
        }
      }

      // Restore view mode
      if (snapshot.viewMode) {
        setViewMode(snapshot.viewMode)
      }

      // Restore active session
      if (restoredSessionIds.length > 0) {
        const idx = Math.min(snapshot.activeSessionIndex, restoredSessionIds.length - 1)
        setActiveSession(restoredSessionIds[Math.max(0, idx)])
      }
    }

    restore()
  }, [])

  useKeyboardShortcuts({
    onToggleCommandPalette: toggleCommandPalette,
    onNavigate: handleNavigate,
    onToggleMonitor: handleToggleMonitor,
  })

  return (
    <div className="h-screen w-screen flex flex-col bg-ghost-bg overflow-hidden">
      <TitleBar />
      <UpdateBanner />
      <div className="flex flex-1 overflow-hidden">
        <IconSidebar
          activeView={activeView}
          onViewChange={handleNavigate}
          onQuickLaunch={handleQuickLaunch}
        />
        <SecondarySidebar activeView={activeView} collapsed={isSidebarCollapsed} />
        <div className="flex-1 flex flex-col overflow-hidden">
          <TerminalContainer
            showQuickLaunch={showQuickLaunch}
            onShowQuickLaunch={handleShowQuickLaunch}
          />
          {monitorOpen && (
            <>
              <ResizeHandle
                currentHeight={monitorHeight}
                onResize={setMonitorHeight}
                minHeight={150}
                maxHeight={500}
              />
              <SubAgentMonitor height={monitorHeight} onClose={() => setMonitorOpen(false)} />
            </>
          )}
        </div>
      </div>

      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        onNavigate={handleNavigate}
        onToggleMonitor={handleToggleMonitor}
        onToggleSidebar={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
      />
      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <ToastContainer />
    </div>
  )
}
