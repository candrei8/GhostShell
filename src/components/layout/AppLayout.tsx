import { useState, useCallback, useEffect, useRef } from 'react'
import { GlobalDock } from './GlobalDock'
import { VibeSidebar } from './VibeSidebar'
import { TerminalContainer } from '../terminal/TerminalContainer'
import { CommandPalette } from '../common/CommandPalette'
import { ToastContainer } from '../common/ToastContainer'
import { SettingsModal, type SettingsTab } from '../settings/SettingsModal'
import { SubAgentMonitor } from '../agents/SubAgentMonitor'
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts'
import { UpdateBanner } from '../common/UpdateBanner'
import { useTerminalStore } from '../../stores/terminalStore'
import { useAgentStore } from '../../stores/agentStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useWorkspaceStore } from '../../stores/workspaceStore'
import { loadTabSnapshot, clearTabSnapshot } from '../../lib/tabSnapshot'
import { SidebarView } from '../../lib/types'

export function AppLayout() {
  const sessions = useTerminalStore((s) => s.sessions)
  const [activeView, setActiveView] = useState<SidebarView | null>(null)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [showQuickLaunch, setShowQuickLaunch] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('appearance')
  const [monitorOpen, setMonitorOpen] = useState(false)

  const setSidebarView = useCallback((view: SidebarView | null) => {
    setSettingsOpen(false)
    setActiveView(view)
    if (view) {
      setShowQuickLaunch(false)
    }
  }, [])

  const closeSettings = useCallback(() => {
    setSettingsOpen(false)
  }, [])

  const openSettings = useCallback((tab: SettingsTab = 'appearance') => {
    setSettingsTab(tab)
    setSettingsOpen(true)
    setActiveView(null)
    setShowQuickLaunch(false)
  }, [])

  const handleNavigate = useCallback((view: string) => {
    if (view === 'settings') {
      openSettings()
      return
    }
    setSidebarView(view as SidebarView)
  }, [openSettings, setSidebarView])

  const handleShowQuickLaunch = useCallback((show: boolean) => {
    setShowQuickLaunch(show)
  }, [])

  const handleQuickLaunch = useCallback(() => {
    setSettingsOpen(false)
    setShowQuickLaunch(true)
    setActiveView(null)
  }, [])

  const handleSpawnTerminal = useCallback(() => {
    const cwd = useWorkspaceStore.getState().currentPath
    useTerminalStore.getState().addSession({
      id: `term-standalone-${Date.now()}`,
      title: 'Terminal',
      cwd,
    })
    setSettingsOpen(false)
    setShowQuickLaunch(false)
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

  useKeyboardShortcuts({
    onToggleCommandPalette: toggleCommandPalette,
    onNavigate: handleNavigate,
    onClearNavigation: () => setSidebarView(null),
    onToggleQuickLaunch: handleQuickLaunch,
    onOpenSettingsTab: (tab: SettingsTab) => openSettings(tab),
    onToggleMonitor: handleToggleMonitor,
    isSettingsOpen: settingsOpen,
    isCommandPaletteOpen: commandPaletteOpen,
  })

  // Refit on activeView change so terminal resizes if panel covers it
  useEffect(() => {
    setTimeout(() => window.dispatchEvent(new CustomEvent('ghostshell:refit')), 50)
  }, [activeView, monitorOpen])

  return (
    <div className="ghost-app-shell h-screen w-screen overflow-hidden flex flex-col font-sans text-ghost-text">
      <div className="shrink-0 px-3 pt-3">
        <GlobalDock
          activeView={activeView}
          onViewChange={setSidebarView}
          onOpenSettings={openSettings}
          onQuickLaunch={handleQuickLaunch}
          onSpawnTerminal={handleSpawnTerminal}
        />
      </div>

      <div className="relative flex min-h-0 flex-1 px-3 pb-3 pt-2">
        {/* Terminals Area */}
        <div className="flex-1 min-w-0 relative">
          <TerminalContainer
            showQuickLaunch={showQuickLaunch}
            onShowQuickLaunch={handleShowQuickLaunch}
          />
        </div>

        {/* Sidebar Context */}
        <VibeSidebar activeView={activeView} />
      </div>

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

      <ToastContainer />
    </div>
  )
}
