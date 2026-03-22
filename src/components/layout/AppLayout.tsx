import { useState, useCallback, useEffect, useRef } from 'react'
import { AnimatePresence } from 'framer-motion'
import { GlobalDock } from './GlobalDock'
import { VibeSidebar } from './VibeSidebar'
import { TerminalContainer } from '../terminal/TerminalContainer'
import { CommandPalette } from '../common/CommandPalette'
import { ToastContainer } from '../common/ToastContainer'
import { SettingsModal, type SettingsTab } from '../settings/SettingsModal'
import { SubAgentMonitor } from '../agents/SubAgentMonitor'
import { SwarmWizard } from '../swarm/SwarmWizard'
import { SwarmDashboard } from '../swarm/SwarmDashboard'
import { SwarmViewToggle } from '../swarm/SwarmViewToggle'
import { useSwarmOrchestrator } from '../../hooks/useSwarmOrchestrator'
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts'
import { UpdateBanner } from '../common/UpdateBanner'
import { useTerminalStore } from '../../stores/terminalStore'
import { useAgentStore } from '../../stores/agentStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useWorkspaceStore } from '../../stores/workspaceStore'
import { useSwarmStore } from '../../stores/swarmStore'
import { loadTabSnapshot, clearTabSnapshot } from '../../lib/tabSnapshot'
import { SidebarView } from '../../lib/types'

export function AppLayout() {
  const sessions = useTerminalStore((s) => s.sessions)
  const [activeView, setActiveView] = useState<SidebarView | null>(null)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('appearance')
  const [monitorOpen, setMonitorOpen] = useState(false)
  const wizardOpen = useSwarmStore((s) => s.wizard.isOpen)
  const activeSwarmId = useSwarmStore((s) => s.activeSwarmId)
  const swarmViewMode = useSwarmStore((s) => s.swarmViewMode)
  const openWizard = useSwarmStore((s) => s.openWizard)
  const closeWizard = useSwarmStore((s) => s.closeWizard)
  const setActiveSwarm = useSwarmStore((s) => s.setActiveSwarm)

  // Determine if the swarm dashboard should be shown as the main view
  const swarms = useSwarmStore((s) => s.swarms)
  const activeSwarm = activeSwarmId ? swarms.find((s) => s.id === activeSwarmId) : undefined
  const isSwarmRunning = activeSwarm && (activeSwarm.status === 'running' || activeSwarm.status === 'launching' || activeSwarm.status === 'paused')
  const showDashboardMode = isSwarmRunning && swarmViewMode === 'dashboard'

  const setSidebarView = useCallback((view: SidebarView | null) => {
    setSettingsOpen(false)
    setActiveView(view)
  }, [])

  const closeSettings = useCallback(() => {
    setSettingsOpen(false)
  }, [])

  const openSettings = useCallback((tab: SettingsTab = 'appearance') => {
    setSettingsTab(tab)
    setSettingsOpen(true)
  }, [])

  const { launchSwarmAgents } = useSwarmOrchestrator()

  const handleSwarmLaunch = useCallback(async (swarmId: string) => {
    closeWizard()
    setActiveSwarm(swarmId)
    // Auto-switch to dashboard mode on launch
    useSwarmStore.getState().setSwarmViewMode('dashboard')
    // Close sidebar — dashboard IS the main view now
    setSidebarView(null)

    const swarm = useSwarmStore.getState().getSwarm(swarmId)
    if (swarm) {
      const paneId = `pane${Date.now()}`
      await launchSwarmAgents(swarm, paneId)
    }
  }, [closeWizard, setActiveSwarm, setSidebarView, launchSwarmAgents])

  const handleNavigate = useCallback((view: string) => {
    if (view === 'settings') {
      openSettings()
      return
    }
    if (view === 'swarm') {
      const activeSwarm = useSwarmStore.getState().getActiveSwarm()
      if (!activeSwarm) {
        openWizard()
        setSidebarView('swarm')
        return
      }
    }
    setSidebarView(view as SidebarView)
  }, [openSettings, openWizard, setSidebarView])

  const handleQuickLaunch = useCallback(() => {
    setSettingsOpen(false)
    setActiveView(null)
    const cwd = useWorkspaceStore.getState().currentPath
    useTerminalStore.getState().addSession({
      id: `term-quicklaunch-${Date.now()}`,
      title: 'New Session',
      cwd,
      showQuickLaunch: true,
      sessionType: 'ghostcode',
    })
  }, [])

  const handleSpawnTerminal = useCallback(() => {
    const cwd = useWorkspaceStore.getState().currentPath
    useTerminalStore.getState().addSession({
      id: `term-standalone-${Date.now()}`,
      title: 'Terminal',
      cwd,
    })
    setSettingsOpen(false)
  }, [])

  const toggleCommandPalette = useCallback(() => {
    setCommandPaletteOpen((prev) => !prev)
  }, [])

  const handleToggleMonitor = useCallback(() => {
    setMonitorOpen((prev) => !prev)
  }, [])

  // Restore previous tabs on startup
  const restoredRef = useRef(false)
  useEffect(() => {
    if (restoredRef.current) return
    restoredRef.current = true

    const restore = async () => {
      const restoreTabs = useSettingsStore.getState().restoreTabs
      if (!restoreTabs) return

      const snapshot = await loadTabSnapshot()
      if (!snapshot) return

      await clearTabSnapshot()

      const { addAgent, setAgentStatus, updateAgent } = useAgentStore.getState()
      const {
        addSession,
        addGroup,
        setActiveSession,
        setActiveWorkspace,
        setViewMode,
        setTabsCollapsed,
      } = useTerminalStore.getState()

      const agentIdMap = new Map<string, string>()
      const sessionIdMap = new Map<string, string>()

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

      const restoredSessionIds: string[] = []
      for (const saved of snapshot.sessions) {
        const newId = `term-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
        const mappedAgentId = saved.agentId ? agentIdMap.get(saved.agentId) : undefined
        sessionIdMap.set(saved.id, newId)

        addSession({
          id: newId,
          title: saved.title,
          cwd: saved.cwd,
          shell: saved.shell,
          description: saved.description,
          agentId: mappedAgentId,
          skipAutoLaunch: true,
        })
        restoredSessionIds.push(newId)

        if (mappedAgentId) {
          updateAgent(mappedAgentId, { terminalId: newId })
        }
      }

      if (snapshot.groups && snapshot.groups.length > 0) {
        for (const group of snapshot.groups) {
          const mappedSessionIds = group.sessionIds
            .map((oldId) => sessionIdMap.get(oldId))
            .filter((id): id is string => !!id)
          if (mappedSessionIds.length < 2) continue
          addGroup({
            ...group,
            sessionIds: mappedSessionIds,
          })
        }
      }

      if (snapshot.viewMode) {
        setViewMode(snapshot.viewMode)
      }
      setTabsCollapsed(!!snapshot.tabsCollapsed)

      if (restoredSessionIds.length > 0) {
        const restoredActiveSessionId = snapshot.activeSessionId
          ? sessionIdMap.get(snapshot.activeSessionId)
          : undefined
        if (restoredActiveSessionId) {
          setActiveSession(restoredActiveSessionId)
        } else {
          const idx = Math.min(snapshot.activeSessionIndex, restoredSessionIds.length - 1)
          setActiveSession(restoredSessionIds[Math.max(0, idx)])
        }
      }

      if (snapshot.activeWorkspaceId) {
        if (snapshot.groups?.some((g) => g.id === snapshot.activeWorkspaceId)) {
          setActiveWorkspace(snapshot.activeWorkspaceId)
        } else {
          const mappedWorkspaceId = sessionIdMap.get(snapshot.activeWorkspaceId)
          if (mappedWorkspaceId) {
            setActiveWorkspace(mappedWorkspaceId)
          }
        }
      }
    }

    restore()
  }, [])

  const handleToggleSidebar = useCallback(() => {
    setActiveView((prev) => (prev ? null : 'swarm'))
  }, [])

  useKeyboardShortcuts({
    onToggleCommandPalette: toggleCommandPalette,
    onNavigate: handleNavigate,
    onClearNavigation: () => setSidebarView(null),
    onToggleQuickLaunch: handleQuickLaunch,
    onOpenSettingsTab: (tab: SettingsTab) => openSettings(tab),
    onToggleMonitor: handleToggleMonitor,
    onToggleSidebar: handleToggleSidebar,
    isSettingsOpen: settingsOpen,
    isCommandPaletteOpen: commandPaletteOpen,
  })

  // Close swarm sidebar when swarm is stopped/completed
  useEffect(() => {
    if (!activeSwarmId && activeView === 'swarm') {
      setActiveView(null)
    }
  }, [activeSwarmId, activeView])

  // Refit on activeView / swarm view mode change so terminal resizes if panel covers it
  useEffect(() => {
    setTimeout(() => window.dispatchEvent(new CustomEvent('ghostshell:refit')), 50)
  }, [activeView, monitorOpen, swarmViewMode])

  useEffect(() => {
    const handleOpenSettings = () => openSettings('appearance')
    window.addEventListener('ghostshell:open-settings', handleOpenSettings)
    return () => window.removeEventListener('ghostshell:open-settings', handleOpenSettings)
  }, [openSettings])

  return (
    <div className="ghost-app-shell h-screen w-screen overflow-hidden flex flex-col font-sans text-ghost-text">
      <GlobalDock
        onOpenSettings={openSettings}
        onSpawnTerminal={handleSpawnTerminal}
      />

      <div className="relative flex min-h-0 flex-1 px-3 pb-3">
        {/* Main Content Area */}
        <div className="flex-1 min-w-0 relative">
          {/* Dashboard overlay (full-width, shown when in dashboard mode) */}
          {showDashboardMode && (
            <div className="absolute inset-0 z-10">
              <SwarmDashboard />
            </div>
          )}

          {/* Terminals always stay mounted to keep PTY sessions alive.
              Hidden behind dashboard when in dashboard mode. */}
          <div className={showDashboardMode ? 'invisible h-full' : 'h-full'}>
            <TerminalContainer />
          </div>
        </div>

        {/* Sidebar Context — hidden when dashboard mode is active */}
        {!showDashboardMode && <VibeSidebar activeView={activeView} />}
      </div>

      {/* Floating view mode toggle when swarm is active */}
      {isSwarmRunning && <SwarmViewToggle />}

      {monitorOpen && (
        <div className="shrink-0 px-3 pb-3">
          <SubAgentMonitor height={320} onClose={() => setMonitorOpen(false)} />
        </div>
      )}

      <UpdateBanner />

      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        onNavigate={handleNavigate}
        onToggleMonitor={handleToggleMonitor}
        onToggleSidebar={() => {}} // Legacy
      />

      <SettingsModal
        isOpen={settingsOpen}
        initialTab={settingsTab}
        onClose={closeSettings}
      />

      <AnimatePresence>
        {wizardOpen && (
          <SwarmWizard
            key="swarm-wizard"
            onClose={closeWizard}
            onLaunch={handleSwarmLaunch}
          />
        )}
      </AnimatePresence>

      <ToastContainer />
    </div>
  )
}
