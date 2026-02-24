import { useState, useEffect, useRef, useMemo } from 'react'
import {
  Terminal,
  Zap,
  Copy,
  Maximize2,
  X,
  Radio,
  Search,
  Settings,
  Users,
  FolderOpen,
  Clock,
  XOctagon,
  Cpu,
  PanelLeftClose,
  Bell,
  BellOff,
} from 'lucide-react'
import { useTerminalStore } from '../../stores/terminalStore'
import { useWorkspaceStore } from '../../stores/workspaceStore'
import { useAgentStore } from '../../stores/agentStore'
import { useSettingsStore } from '../../stores/settingsStore'

interface CommandAction {
  id: string
  label: string
  description?: string
  icon: React.ReactNode
  shortcut?: string
  action: () => void
  category: string
}

interface CommandPaletteProps {
  isOpen: boolean
  onClose: () => void
  onNavigate?: (view: string) => void
  onToggleMonitor?: () => void
  onToggleSidebar?: () => void
}

export function CommandPalette({ isOpen, onClose, onNavigate, onToggleMonitor, onToggleSidebar }: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const sessions = useTerminalStore((s) => s.sessions)
  const activeSessionId = useTerminalStore((s) => s.activeSessionId)
  const addSession = useTerminalStore((s) => s.addSession)
  const toggleMaximize = useTerminalStore((s) => s.toggleMaximize)
  const setSyncInputs = useTerminalStore((s) => s.setSyncInputs)
  const syncInputsMode = useTerminalStore((s) => s.syncInputsMode)
  const duplicateSession = useTerminalStore((s) => s.duplicateSession)
  const setActiveSession = useTerminalStore((s) => s.setActiveSession)
  const currentPath = useWorkspaceStore((s) => s.currentPath)
  const agents = useAgentStore((s) => s.agents)

  const commands = useMemo<CommandAction[]>(() => {
    const cmds: CommandAction[] = [
      {
        id: 'new-terminal',
        label: 'New Terminal',
        description: 'Open a new terminal tab',
        icon: <Terminal className="w-4 h-4" />,
        shortcut: 'Ctrl+Shift+T',
        action: () => {
          addSession({ id: `term-standalone-${Date.now()}`, title: 'Terminal', cwd: currentPath })
          onClose()
        },
        category: 'Terminal',
      },
      {
        id: 'duplicate-tab',
        label: 'Duplicate Tab',
        description: 'Duplicate the active terminal tab',
        icon: <Copy className="w-4 h-4" />,
        shortcut: 'Ctrl+Shift+D',
        action: () => {
          if (activeSessionId) duplicateSession(activeSessionId)
          onClose()
        },
        category: 'Terminal',
      },
      {
        id: 'maximize-pane',
        label: 'Toggle Maximize Pane',
        description: 'Maximize or restore the active pane',
        icon: <Maximize2 className="w-4 h-4" />,
        shortcut: 'Ctrl+Shift+Enter',
        action: () => {
          if (activeSessionId) toggleMaximize(activeSessionId)
          onClose()
        },
        category: 'Terminal',
      },
      {
        id: 'close-tab',
        label: 'Close Tab',
        description: 'Close the active terminal tab',
        icon: <X className="w-4 h-4" />,
        shortcut: 'Ctrl+Shift+W',
        action: () => {
          // Handled by keyboard shortcuts hook
          onClose()
        },
        category: 'Terminal',
      },
      {
        id: 'sync-inputs',
        label: syncInputsMode === 'off' ? 'Enable Synchronized Inputs' : 'Disable Synchronized Inputs',
        description: 'Send commands to all visible panes simultaneously',
        icon: <Radio className="w-4 h-4" />,
        shortcut: 'Ctrl+Alt+I',
        action: () => {
          setSyncInputs(syncInputsMode === 'off' ? 'all' : 'off')
          onClose()
        },
        category: 'Terminal',
      },
      {
        id: 'quick-launch',
        label: 'Quick Launch',
        description: 'Open the Quick Launch panel',
        icon: <Zap className="w-4 h-4" />,
        action: () => {
          onClose()
          // This would need to be wired to the quick launch state
        },
        category: 'Terminal',
      },
      // Navigation
      {
        id: 'nav-agents',
        label: 'Show Agents Panel',
        description: 'Navigate to the agents sidebar',
        icon: <Users className="w-4 h-4" />,
        action: () => {
          onNavigate?.('agents')
          onClose()
        },
        category: 'Navigation',
      },
      {
        id: 'nav-files',
        label: 'Show Files Panel',
        description: 'Navigate to the file explorer',
        icon: <FolderOpen className="w-4 h-4" />,
        action: () => {
          onNavigate?.('files')
          onClose()
        },
        category: 'Navigation',
      },
      {
        id: 'nav-history',
        label: 'Show Command History',
        description: 'View and re-send previous commands',
        icon: <Clock className="w-4 h-4" />,
        shortcut: 'Ctrl+Shift+H',
        action: () => {
          onNavigate?.('history')
          onClose()
        },
        category: 'Navigation',
      },
      {
        id: 'nav-settings',
        label: 'Open Settings',
        description: 'Navigate to app settings',
        icon: <Settings className="w-4 h-4" />,
        shortcut: 'Ctrl+,',
        action: () => {
          onNavigate?.('settings')
          onClose()
        },
        category: 'Navigation',
      },
      {
        id: 'search-terminal',
        label: 'Search in Terminal',
        description: 'Find text in the active terminal',
        icon: <Search className="w-4 h-4" />,
        shortcut: 'Ctrl+Shift+F',
        action: () => {
          onClose()
          // Dispatch event that TerminalPane listens for
          const e = new KeyboardEvent('keydown', { ctrlKey: true, shiftKey: true, key: 'F', bubbles: true })
          window.dispatchEvent(e)
        },
        category: 'Terminal',
      },
      // --- Absorbed actions from removed UI elements ---
      {
        id: 'kill-all-agents',
        label: 'Kill All Agents',
        description: 'Terminate all agents and close their terminals',
        icon: <XOctagon className="w-4 h-4" />,
        action: () => {
          const sessionsState = useTerminalStore.getState()
          const agentsState = useAgentStore.getState()
          sessionsState.sessions.forEach((s) => {
            try { window.ghostshell.ptyKill(s.id) } catch {}
          })
          sessionsState.sessions.forEach((s) => sessionsState.removeSession(s.id))
          agentsState.agents.forEach((a) => agentsState.removeAgent(a.id))
          onClose()
        },
        category: 'Terminal',
      },
      {
        id: 'toggle-monitor',
        label: 'Toggle Sub-Agent Monitor',
        description: 'Show or hide the sub-agent monitor panel',
        icon: <Cpu className="w-4 h-4" />,
        shortcut: 'Ctrl+Shift+M',
        action: () => {
          onToggleMonitor?.()
          onClose()
        },
        category: 'Navigation',
      },
      {
        id: 'toggle-sidebar',
        label: 'Toggle Sidebar',
        description: 'Show or hide the secondary sidebar',
        icon: <PanelLeftClose className="w-4 h-4" />,
        shortcut: 'Ctrl+B',
        action: () => {
          onToggleSidebar?.()
          onClose()
        },
        category: 'Navigation',
      },
      {
        id: 'toggle-mute',
        label: useSettingsStore.getState().muteNotifications ? 'Unmute Notifications' : 'Mute Notifications',
        description: 'Toggle notification muting',
        icon: useSettingsStore.getState().muteNotifications ? <BellOff className="w-4 h-4" /> : <Bell className="w-4 h-4" />,
        action: () => {
          const current = useSettingsStore.getState().muteNotifications
          useSettingsStore.getState().setMuteNotifications(!current)
          onClose()
        },
        category: 'Navigation',
      },
    ]

    // Add switch-to-session commands
    sessions.forEach((session, index) => {
      const agent = session.agentId ? agents.find((a) => a.id === session.agentId) : undefined
      cmds.push({
        id: `switch-${session.id}`,
        label: `Switch to: ${session.title}`,
        description: agent ? `Agent: ${agent.name}` : 'Terminal session',
        icon: <Terminal className="w-4 h-4" />,
        shortcut: index < 9 ? `Ctrl+${index + 1}` : undefined,
        action: () => {
          setActiveSession(session.id)
          onClose()
        },
        category: 'Sessions',
      })
    })

    return cmds
  }, [sessions, activeSessionId, syncInputsMode, agents, currentPath, addSession, duplicateSession, toggleMaximize, setSyncInputs, setActiveSession, onClose, onNavigate])

  const filtered = useMemo(() => {
    if (!query.trim()) return commands
    const lower = query.toLowerCase()
    return commands.filter(
      (cmd) =>
        cmd.label.toLowerCase().includes(lower) ||
        cmd.description?.toLowerCase().includes(lower) ||
        cmd.category.toLowerCase().includes(lower),
    )
  }, [commands, query])

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen])

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const selected = listRef.current.children[selectedIndex] as HTMLElement
      if (selected) {
        selected.scrollIntoView({ block: 'nearest' })
      }
    }
  }, [selectedIndex])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((prev) => Math.min(prev + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((prev) => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filtered[selectedIndex]) {
        filtered[selectedIndex].action()
      }
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15%]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative w-full max-w-lg bg-ghost-surface border border-ghost-border rounded-2xl shadow-qubria-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-2 px-5 py-4 border-b border-ghost-border">
          <Search className="w-4 h-4 text-ghost-text-dim shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command..."
            className="flex-1 bg-transparent text-sm text-ghost-text placeholder-ghost-text-dim/50 outline-none"
          />
          <kbd className="text-2xs px-1.5 py-0.5 rounded bg-ghost-border/50 text-ghost-text-dim">Esc</kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-80 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-ghost-text-dim">No commands found</div>
          ) : (
            filtered.map((cmd, index) => (
              <button
                key={cmd.id}
                onClick={cmd.action}
                className={`w-full px-5 py-2.5 flex items-center gap-3 text-left transition-colors ${
                  index === selectedIndex ? 'bg-indigo-950/50 text-ghost-text' : 'text-ghost-text-dim hover:bg-slate-800/50'
                }`}
              >
                <span className={index === selectedIndex ? 'text-ghost-accent' : 'text-ghost-text-dim'}>{cmd.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate">{cmd.label}</div>
                  {cmd.description && <div className="text-2xs text-ghost-text-dim truncate">{cmd.description}</div>}
                </div>
                {cmd.shortcut && (
                  <kbd className="text-2xs px-1.5 py-0.5 rounded bg-ghost-border/50 text-ghost-text-dim shrink-0">
                    {cmd.shortcut}
                  </kbd>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
