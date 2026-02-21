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
  const refitTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleHome = () => {
    setShowQuickLaunch(true)
    setActiveView('agents')
    setIsSidebarCollapsed(false)
  }

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

  // Fire ghostshell:refit when monitor open/height changes so xterm recalculates
  useEffect(() => {
    if (refitTimer.current) clearTimeout(refitTimer.current)
    refitTimer.current = setTimeout(() => {
      window.dispatchEvent(new CustomEvent('ghostshell:refit'))
    }, 50)
    return () => {
      if (refitTimer.current) clearTimeout(refitTimer.current)
    }
  }, [monitorOpen, monitorHeight])

  const handleToggleMonitor = useCallback(() => {
    setMonitorOpen((prev) => !prev)
  }, [])

  // Dismiss QuickLaunch when an agent card click switches the active session
  useEffect(() => {
    if (activeSessionId && sessions.length > 0) {
      setShowQuickLaunch(false)
    }
  }, [activeSessionId, sessions.length])

  useKeyboardShortcuts({
    onToggleCommandPalette: toggleCommandPalette,
    onNavigate: handleNavigate,
    onToggleMonitor: handleToggleMonitor,
  })

  return (
    <div className="h-screen w-screen flex flex-col bg-ghost-bg overflow-hidden">
      <TitleBar onToggleCommandPalette={toggleCommandPalette} />
      <UpdateBanner />
      <div className="flex flex-1 overflow-hidden">
        <IconSidebar
          activeView={activeView}
          onViewChange={handleNavigate}
          onHome={handleHome}
          onQuickLaunch={handleQuickLaunch}
          isSidebarCollapsed={isSidebarCollapsed}
          onToggleSidebar={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          monitorOpen={monitorOpen}
          onToggleMonitor={handleToggleMonitor}
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
      />
      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <ToastContainer />
    </div>
  )
}
