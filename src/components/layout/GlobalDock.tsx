import { useState, useEffect, useCallback, type MouseEvent as ReactMouseEvent } from 'react'
import { motion } from 'framer-motion'
import {
  Bell,
  BellOff,
  Blocks,
  Clock3,
  FolderOpen,
  GitBranch,
  Minus,
  Network,
  Plus,
  Settings as SettingsIcon,
  Square,
  Terminal,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useWorkspaceStore } from '../../stores/workspaceStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useTerminalStore } from '../../stores/terminalStore'
import { useNotificationStore } from '../../stores/notificationStore'
import { GitStatus, SidebarView } from '../../lib/types'

interface GlobalDockProps {
  activeView: SidebarView | null
  onViewChange: (view: SidebarView | null) => void
  onOpenSettings: (tab?: 'appearance' | 'providers' | 'terminal') => void
  onQuickLaunch: () => void
  onSpawnTerminal: () => void
}

type DockView = Extract<SidebarView, 'files' | 'history' | 'blocks' | 'swarm'>

interface NavItem {
  id: DockView
  label: string
  icon: LucideIcon
  color: string
}

const NAV_ITEMS: NavItem[] = [
  { id: 'swarm', label: 'Swarm', icon: Network, color: '#22d3ee' },
  { id: 'files', label: 'Files', icon: FolderOpen, color: '#fbbf24' },
  { id: 'history', label: 'History', icon: Clock3, color: '#a78bfa' },
  { id: 'blocks', label: 'Blocks', icon: Blocks, color: '#fb7185' },
]

export function GlobalDock({
  activeView,
  onViewChange,
  onOpenSettings,
  onQuickLaunch,
  onSpawnTerminal,
}: GlobalDockProps) {
  const currentPath = useWorkspaceStore((s) => s.currentPath)
  const [isMaximized, setIsMaximized] = useState(false)
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null)
  const muteNotifications = useSettingsStore((s) => s.muteNotifications)
  const setMuteNotifications = useSettingsStore((s) => s.setMuteNotifications)
  const sessionCount = useTerminalStore((s) => s.sessions.length)
  const hasSessions = sessionCount > 0
  const addNotification = useNotificationStore((s) => s.addNotification)

  useEffect(() => {
    let mounted = true

    const check = async () => {
      try {
        const maximized = await window.ghostshell.windowIsMaximized()
        if (mounted) setIsMaximized(maximized)
      } catch {
        // Ignore
      }
    }

    check()

    const onResize = () => { void check() }
    window.addEventListener('resize', onResize)
    return () => {
      mounted = false
      window.removeEventListener('resize', onResize)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    let pollTimer: ReturnType<typeof setTimeout> | null = null
    let inFlight = false

    const fetchGit = async () => {
      if (inFlight) return
      inFlight = true
      try {
        const status = await window.ghostshell.gitStatus(currentPath)
        if (!cancelled) setGitStatus(status)
      } catch {
        if (!cancelled) setGitStatus(null)
      } finally {
        inFlight = false
        if (!cancelled) {
          pollTimer = setTimeout(() => {
            void fetchGit()
          }, 10000)
        }
      }
    }

    void fetchGit()
    return () => {
      cancelled = true
      if (pollTimer) {
        clearTimeout(pollTimer)
      }
    }
  }, [currentPath])

  const handleMaximize = useCallback(async () => {
    window.ghostshell.windowMaximize()
    setTimeout(async () => {
      try {
        const maximized = await window.ghostshell.windowIsMaximized()
        setIsMaximized(maximized)
      } catch {
        // Ignore
      }
    }, 100)
  }, [])

  const handleDockDoubleClick = useCallback((e: ReactMouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement
    if (target.closest('.titlebar-no-drag')) return
    void handleMaximize()
  }, [handleMaximize])

  const handleQuickLaunchAction = useCallback((e: ReactMouseEvent<HTMLButtonElement>) => {
    if (e.shiftKey) {
      onSpawnTerminal()
      addNotification({
        type: 'success',
        title: 'Terminal launched',
        message: 'Opened a plain terminal instantly from navbar.',
        source: 'Navbar',
        tier: 'toast',
      })
      return
    }
    if (e.altKey) {
      onOpenSettings('terminal')
      return
    }
    onQuickLaunch()
  }, [addNotification, onOpenSettings, onQuickLaunch, onSpawnTerminal])

  const handleQuickLaunchContext = useCallback((e: ReactMouseEvent<HTMLButtonElement>) => {
    e.preventDefault()
    onSpawnTerminal()
    addNotification({
      type: 'success',
      title: 'Terminal launched',
      message: 'Right-click shortcut: plain terminal created.',
      source: 'Navbar',
      tier: 'toast',
    })
  }, [addNotification, onSpawnTerminal])

  const handleSettingsAction = useCallback((e: ReactMouseEvent<HTMLButtonElement>) => {
    if (e.altKey) {
      onOpenSettings('providers')
      return
    }
    if (e.shiftKey) {
      onOpenSettings('terminal')
      return
    }
    onOpenSettings('appearance')
  }, [onOpenSettings])

  const handleNotificationAction = useCallback((e: ReactMouseEvent<HTMLButtonElement>) => {
    if (e.shiftKey) {
      if (muteNotifications) {
        setMuteNotifications(false)
      }
      addNotification({
        type: 'info',
        title: 'Notification preview',
        message: 'Shift+Click on bell sends a test toast.',
        source: 'Navbar',
        tier: 'toast',
        allowWhileMuted: true,
        dedupeKey: 'navbar:notification-preview',
      })
      return
    }

    const nextMuted = !muteNotifications
    setMuteNotifications(nextMuted)
    addNotification({
      type: nextMuted ? 'warning' : 'success',
      title: nextMuted ? 'Notifications muted' : 'Notifications enabled',
      message: nextMuted ? 'You can still preview via Shift+Click on bell.' : 'Toast and system notifications are active.',
      source: 'Navbar',
      tier: 'toast',
      allowWhileMuted: true,
      dedupeKey: 'navbar:notification-toggle',
    })
  }, [addNotification, muteNotifications, setMuteNotifications])

  const toggleView = useCallback(
    (view: DockView) => {
      onViewChange(activeView === view ? null : view)
    },
    [activeView, onViewChange],
  )

  const safeCurrentPath = typeof currentPath === 'string' ? currentPath : ''
  const projectName = safeCurrentPath.split(/[/\\]/).filter(Boolean).pop() || 'GhostShell'
  const gitDirtyCount = gitStatus ? gitStatus.total : 0
  const hasChanges = gitDirtyCount > 0
  const branchLabel = gitStatus?.isRepo ? gitStatus.branch : null

  return (
    <div className="mx-auto w-full max-w-[1680px]">
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        onDoubleClick={handleDockDoubleClick}
        className="titlebar-drag dock-bar relative overflow-hidden rounded-[26px]"
      >
        <div className="relative flex items-center gap-3 px-4 py-3">

          {/* ── Left: Identity ────────────────────────────── */}
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.12] text-white/76">
              <Terminal className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-[15px] font-semibold tracking-tight text-white">{projectName}</span>
                {branchLabel && (
                  <span className="dock-git-pill flex items-center gap-1.5 rounded-lg px-2 py-1">
                    <GitBranch className="h-3 w-3" />
                    <span className="text-[11px] font-medium">{branchLabel}</span>
                    {hasChanges && (
                      <span className="ml-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-amber-400/20 px-1 text-[10px] font-semibold text-amber-300">
                        {gitDirtyCount}
                      </span>
                    )}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* ── Center: Navigation ────────────────────────── */}
          <div className="titlebar-no-drag mx-auto flex items-center gap-1 rounded-2xl border border-white/[0.12] bg-white/[0.06] p-1.5">
            {/* Quick Launch */}
            <button
              onClick={handleQuickLaunchAction}
              onContextMenu={handleQuickLaunchContext}
              title="New session (Ctrl+Space)"
              className="dock-new-btn group flex h-10 items-center gap-2 rounded-[14px] px-4 transition-all"
            >
              <Plus className="h-3.5 w-3.5" />
              <span className="text-[12px] font-semibold">{hasSessions ? 'New' : 'Start'}</span>
            </button>

            <div className="mx-1 h-6 w-px bg-white/[0.15]" />

            {/* Nav Items */}
            {NAV_ITEMS.map((item) => {
              const active = activeView === item.id
              const Icon = item.icon
              return (
                <button
                  key={item.id}
                  onClick={() => toggleView(item.id)}
                  title={item.label}
                  className={`relative flex h-10 items-center gap-2 rounded-[14px] px-4 text-[12px] font-medium transition-all ${
                    active
                      ? 'text-white'
                      : 'text-white/60 hover:text-white/85'
                  }`}
                >
                  {active && (
                    <motion.div
                      layoutId="dock-active-pill"
                      transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                      className="absolute inset-0 rounded-[10px]"
                      style={{
                        background: `linear-gradient(135deg, ${item.color}20, ${item.color}08)`,
                        border: `1px solid ${item.color}30`,
                        boxShadow: `0 0 12px ${item.color}10`,
                      }}
                    />
                  )}
                  <Icon className="relative z-10 h-3.5 w-3.5" style={active ? { color: item.color } : undefined} />
                  <span className="relative z-10 hidden lg:inline">{item.label}</span>
                </button>
              )
            })}
          </div>

          {/* ── Right: Controls ───────────────────────────── */}
          <div className="ml-auto flex items-center gap-1.5">
            {/* Session count (when >0) */}
            {hasSessions && (
              <span className="mr-1 hidden items-center gap-1.5 rounded-lg bg-white/[0.08] px-2.5 py-1 text-[11px] font-medium text-white/64 xl:flex">
                <span className="h-2 w-2 rounded-full bg-emerald-400/80 shadow-[0_0_6px_rgba(52,211,153,0.5)]" />
                {sessionCount}
              </span>
            )}

            {/* Utility buttons */}
            <div className="titlebar-no-drag flex items-center gap-1 rounded-xl border border-white/[0.12] bg-white/[0.06] p-1">
              <DockIconBtn
                icon={muteNotifications ? BellOff : Bell}
                onClick={handleNotificationAction}
                title="Notifications"
                accent={!muteNotifications}
              />
              <DockIconBtn
                icon={SettingsIcon}
                onClick={handleSettingsAction}
                title="Settings"
              />
            </div>

            {/* Window controls */}
            <div className="titlebar-no-drag flex items-center gap-1 rounded-xl border border-white/[0.12] bg-white/[0.06] p-1">
              <DockIconBtn icon={Minus} onClick={() => window.ghostshell.windowMinimize()} title="Minimize" />
              <button
                onClick={handleMaximize}
                title={isMaximized ? 'Restore' : 'Maximize'}
                className="dock-icon-btn"
              >
                {isMaximized ? (
                  <div className="relative h-3 w-3">
                    <div className="absolute left-0 top-0 h-2.5 w-2.5 rounded-[1.5px] border-[1.5px] border-current opacity-60" />
                    <div className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-[1.5px] border-[1.5px] border-current" />
                  </div>
                ) : (
                  <Square className="h-3 w-3" />
                )}
              </button>
              <DockIconBtn icon={X} onClick={() => window.ghostshell.windowClose()} title="Close" danger />
            </div>
          </div>

        </div>
      </motion.div>
    </div>
  )
}

function DockIconBtn({
  icon: Icon,
  onClick,
  title,
  accent = false,
  danger = false,
}: {
  icon: LucideIcon
  onClick: (e: ReactMouseEvent<HTMLButtonElement>) => void
  title: string
  accent?: boolean
  danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`dock-icon-btn ${
        accent ? 'text-white/80' : danger ? 'hover:!bg-red-500/60 hover:!text-white' : ''
      }`}
    >
      <Icon className="h-3 w-3" />
    </button>
  )
}
