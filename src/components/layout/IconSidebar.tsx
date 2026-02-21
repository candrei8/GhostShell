import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Layers,
  FolderOpen,
  Settings as SettingsIcon,
  Terminal,
  PanelLeftClose,
  PanelLeftOpen,
  XOctagon,
  Clock,
  Plus,
  Cpu,
} from 'lucide-react'
import { SidebarView } from '../../lib/types'
import { useAgentStore } from '../../stores/agentStore'
import { useTerminalStore } from '../../stores/terminalStore'
import { useActivityStore } from '../../stores/activityStore'

interface IconSidebarProps {
  activeView: SidebarView
  onViewChange: (view: SidebarView) => void
  onHome: () => void
  onQuickLaunch: () => void
  isSidebarCollapsed: boolean
  onToggleSidebar: () => void
  monitorOpen?: boolean
  onToggleMonitor?: () => void
}

// Only real sidebar views — settings opens as modal, handled separately
const navItems: { view: SidebarView; icon: typeof Layers; label: string; shortcut: string }[] = [
  { view: 'agents', icon: Layers, label: 'Agents', shortcut: '' },
  { view: 'files', icon: FolderOpen, label: 'Files', shortcut: '' },
  { view: 'history', icon: Clock, label: 'History', shortcut: 'Ctrl+Shift+H' },
]

/* ── Animated tooltip ── */
function SidebarTooltip({ label, shortcut }: { label: string; shortcut?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -6, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: -4, scale: 0.95 }}
      transition={{ duration: 0.12, ease: 'easeOut' }}
      className="absolute left-full ml-2.5 top-1/2 -translate-y-1/2 z-50 pointer-events-none"
    >
      <div className="bg-ghost-surface border border-ghost-border/60 rounded-md px-2.5 py-1 shadow-lg shadow-black/30 whitespace-nowrap flex items-center gap-1.5">
        <span className="text-xs text-ghost-text font-medium">{label}</span>
        {shortcut && (
          <span className="text-[10px] text-ghost-text-dim/50 font-mono">{shortcut}</span>
        )}
      </div>
    </motion.div>
  )
}

/* ── Motion button wrapper ── */
function IconButton({
  children,
  onClick,
  className,
  label,
  shortcut,
}: {
  children: React.ReactNode
  onClick: () => void
  className: string
  label: string
  shortcut?: string
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <motion.button
      onClick={onClick}
      className={className}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      whileHover={{ scale: 1.08 }}
      whileTap={{ scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 400, damping: 20 }}
    >
      {children}
      <AnimatePresence>
        {hovered && <SidebarTooltip label={label} shortcut={shortcut} />}
      </AnimatePresence>
    </motion.button>
  )
}

export function IconSidebar({
  activeView,
  onViewChange,
  onHome,
  onQuickLaunch,
  isSidebarCollapsed,
  onToggleSidebar,
  monitorOpen,
  onToggleMonitor,
}: IconSidebarProps) {
  const agents = useAgentStore((s) => s.agents)
  const activities = useActivityStore((s) => s.activities)
  const [confirmKill, setConfirmKill] = useState(false)

  const handleKillAll = useCallback(() => {
    if (!confirmKill) {
      setConfirmKill(true)
      setTimeout(() => setConfirmKill(false), 3000)
      return
    }
    const sessionsState = useTerminalStore.getState()
    const agentsState = useAgentStore.getState()
    sessionsState.sessions.forEach((s) => {
      try {
        window.ghostshell.ptyKill(s.id)
      } catch {}
    })
    sessionsState.sessions.forEach((s) => sessionsState.removeSession(s.id))
    agentsState.agents.forEach((a) => agentsState.removeAgent(a.id))
    setConfirmKill(false)
  }, [confirmKill])

  const workingCount = agents.filter((a) => a.status === 'working').length
  const activeSubAgentCount = Object.values(activities).reduce((sum, act) => {
    return sum + (act.subAgents?.filter((s) => s.status === 'running' || s.status === 'spawning').length || 0)
  }, 0)

  return (
    <div className="w-12 h-full bg-ghost-sidebar flex flex-col items-center py-2 border-r border-ghost-border shrink-0">
      {/* Logo / Home */}
      <IconButton
        onClick={onHome}
        className={`w-8 h-8 rounded-lg bg-ghost-accent/10 flex items-center justify-center mb-1 hover:bg-ghost-accent/20 transition-colors relative ${
          workingCount > 0 ? 'animate-breathe' : ''
        }`}
        label="Home"
      >
        <Terminal className="w-4 h-4 text-ghost-accent" />
      </IconButton>

      <div className="w-5 separator-glow my-1.5" />

      {/* Navigation */}
      <div className="flex flex-col gap-0.5 flex-1">
        {navItems.map(({ view, icon: Icon, label, shortcut }) => (
          <IconButton
            key={view}
            onClick={() => onViewChange(view)}
            className={`w-9 h-9 flex items-center justify-center rounded-lg transition-all relative ${
              activeView === view
                ? 'bg-ghost-accent/15 text-ghost-accent'
                : 'text-ghost-text-dim hover:bg-white/5 hover:text-ghost-text'
            }`}
            label={label}
            shortcut={shortcut || undefined}
          >
            {/* Active indicator pill with layoutId for morphing */}
            {activeView === view && (
              <motion.div
                layoutId="sidebar-active-pill"
                className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-4 bg-ghost-accent rounded-r glow-accent-sm"
                transition={{ type: 'spring', stiffness: 350, damping: 28 }}
              />
            )}
            <Icon className="w-[17px] h-[17px]" />
            {/* Working agents badge */}
            {view === 'agents' && workingCount > 0 && (
              <motion.div
                className="absolute -top-0.5 -right-0.5 flex items-center justify-center"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 500, damping: 25 }}
              >
                <div className="w-3.5 h-3.5 rounded-full bg-ghost-success flex items-center justify-center pulse-ring">
                  <span className="text-[8px] font-bold text-ghost-bg">{workingCount}</span>
                </div>
              </motion.div>
            )}
          </IconButton>
        ))}
      </div>

      {/* Bottom actions */}
      <div className="flex flex-col items-center gap-0.5 mt-auto">
        {/* Sub-Agent Monitor */}
        {onToggleMonitor && (
          <IconButton
            onClick={onToggleMonitor}
            className={`w-9 h-9 flex items-center justify-center rounded-lg transition-all relative ${
              monitorOpen
                ? 'bg-indigo-400/15 text-indigo-400'
                : 'text-ghost-text-dim hover:bg-white/5 hover:text-ghost-text'
            }`}
            label="Sub-Agent Monitor"
            shortcut="Ctrl+Shift+M"
          >
            <Cpu className="w-[17px] h-[17px]" />
            {activeSubAgentCount > 0 && (
              <motion.div
                className="absolute -top-0.5 -right-0.5 flex items-center justify-center"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 500, damping: 25 }}
              >
                <div className="w-3.5 h-3.5 rounded-full bg-indigo-500 flex items-center justify-center pulse-ring">
                  <span className="text-[8px] font-bold text-white">{activeSubAgentCount}</span>
                </div>
              </motion.div>
            )}
          </IconButton>
        )}

        {/* Quick launch / New agent */}
        <IconButton
          onClick={onQuickLaunch}
          className="w-9 h-9 flex items-center justify-center rounded-lg text-ghost-accent hover:bg-ghost-accent/15 transition-colors relative"
          label="New Agent"
          shortcut="Quick Launch"
        >
          <Plus className="w-[17px] h-[17px]" />
        </IconButton>

        {/* Kill all - only when agents exist */}
        <AnimatePresence>
          {agents.length > 0 && (
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 22 }}
            >
              <IconButton
                onClick={handleKillAll}
                className={`w-9 h-9 flex items-center justify-center rounded-lg transition-all relative ${
                  confirmKill
                    ? 'bg-red-500/20 text-red-400'
                    : 'text-ghost-text-dim/50 hover:bg-red-500/15 hover:text-red-400'
                }`}
                label={confirmKill ? 'Click to KILL ALL' : 'Kill All Agents'}
              >
                <motion.div
                  animate={confirmKill ? { rotate: [0, -4, 4, -4, 4, 0] } : { rotate: 0 }}
                  transition={{ duration: 0.4, ease: 'easeInOut' }}
                >
                  <XOctagon className="w-[15px] h-[15px]" />
                </motion.div>
              </IconButton>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="w-5 separator-glow my-1" />

        {/* Settings */}
        <IconButton
          onClick={() => onViewChange('settings')}
          className="w-9 h-9 flex items-center justify-center rounded-lg text-ghost-text-dim hover:bg-white/5 hover:text-ghost-text transition-colors relative"
          label="Settings"
          shortcut="Ctrl+,"
        >
          <SettingsIcon className="w-[17px] h-[17px]" />
        </IconButton>

        {/* Sidebar toggle */}
        <IconButton
          onClick={onToggleSidebar}
          className="w-9 h-9 flex items-center justify-center rounded-lg text-ghost-text-dim hover:bg-white/5 hover:text-ghost-text transition-colors relative"
          label={isSidebarCollapsed ? 'Show Sidebar' : 'Hide Sidebar'}
        >
          <motion.div
            animate={{ rotate: isSidebarCollapsed ? 180 : 0 }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
          >
            {isSidebarCollapsed ? (
              <PanelLeftOpen className="w-[17px] h-[17px]" />
            ) : (
              <PanelLeftClose className="w-[17px] h-[17px]" />
            )}
          </motion.div>
        </IconButton>
      </div>
    </div>
  )
}
