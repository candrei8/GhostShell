import { useState, useEffect, useCallback, useMemo, useRef, type MouseEvent as ReactMouseEvent } from 'react'
import {
  LayoutGrid,
  Minus,
  Network,
  Plus,
  Settings as SettingsIcon,
  Square,
  X,
} from 'lucide-react'
import { useTerminalStore } from '../../stores/terminalStore'
import { useAgentStore } from '../../stores/agentStore'
import { ContextMenu } from '../common/ContextMenu'
import { openQuickLaunchSession } from '../../lib/sessionLaunch'
import { resolveProvider } from '../../lib/providers'
import { ProviderGlyph } from '../terminal/ProviderGlyph'

// ─── Types ───────────────────────────────────────────────

interface GlobalDockProps {
  onOpenSettings: (tab?: 'appearance' | 'providers' | 'terminal') => void
  onSpawnTerminal: () => void
}

const TAB_COLORS = [
  { label: 'Red', value: '#e05252' },
  { label: 'Orange', value: '#e08a3d' },
  { label: 'Yellow', value: '#d9c03a' },
  { label: 'Green', value: '#3dba5e' },
  { label: 'Cyan', value: '#30bfbf' },
  { label: 'Blue', value: '#3d8ae0' },
  { label: 'Indigo', value: '#5b5fd9' },
  { label: 'Violet', value: '#8b4fd9' },
  { label: 'Pink', value: '#d94fa8' },
]

/** "Agents (4)" → "Agents": the tab shows the pane count as its own badge. */
function getTabLabel(title: string, isGroup: boolean): string {
  return isGroup ? title.replace(/\s*\(\d+\)$/, '') || title : title
}

const Logo = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2L3 7V17L12 22L21 17V7L12 2Z" fill="#1A1B26" />
    <path d="M13 3L5 13H12L11 21L19 11H12L13 3Z" fill="#38bdf8" />
  </svg>
)

// ─── Unified Top Bar ─────────────────────────────────────

export function GlobalDock({
  onOpenSettings,
  onSpawnTerminal,
}: GlobalDockProps) {
  // ── Stores ──
  const sessions = useTerminalStore((s) => s.sessions)
  const activeWorkspaceId = useTerminalStore((s) => s.activeWorkspaceId)
  const activeSessionId = useTerminalStore((s) => s.activeSessionId)
  const tabsCollapsed = useTerminalStore((s) => s.tabsCollapsed)
  const groups = useTerminalStore((s) => s.groups)
  const setActiveWorkspace = useTerminalStore((s) => s.setActiveWorkspace)
  const closeWorkspace = useTerminalStore((s) => s.closeWorkspace)
  const getWorkspaces = useTerminalStore((s) => s.getWorkspaces)
  const updateWorkspace = useTerminalStore((s) => s.updateWorkspace)
  const agents = useAgentStore((s) => s.agents)

  // ── Local state ──
  const [isMaximized, setIsMaximized] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [contextMenu, setContextMenu] = useState<{ id: string; x: number; y: number } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const workspaces = useMemo(() => getWorkspaces(), [getWorkspaces, sessions, groups])

  const resolvedActiveWorkspaceId = useMemo(() => {
    if (activeWorkspaceId && workspaces.some((w) => w.id === activeWorkspaceId)) return activeWorkspaceId
    if (activeSessionId) {
      const ws = workspaces.find((w) => w.sessionIds.includes(activeSessionId))
      if (ws) return ws.id
    }
    return workspaces[0]?.id || null
  }, [activeWorkspaceId, activeSessionId, workspaces])

  const hasSessions = sessions.length > 0
  const showTabs = hasSessions && !tabsCollapsed

  // ── Effects ──
  useEffect(() => {
    let mounted = true
    const check = async () => {
      try {
        const maximized = await window.ghostshell.windowIsMaximized()
        if (mounted) setIsMaximized(maximized)
      } catch { /* */ }
    }
    check()
    const onResize = () => void check()
    window.addEventListener('resize', onResize)
    return () => { mounted = false; window.removeEventListener('resize', onResize) }
  }, [])

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editingId])

  // Keep active workspace in sync
  useEffect(() => {
    if (resolvedActiveWorkspaceId && resolvedActiveWorkspaceId !== activeWorkspaceId) {
      setActiveWorkspace(resolvedActiveWorkspaceId)
    }
  }, [resolvedActiveWorkspaceId, activeWorkspaceId, setActiveWorkspace])

  // ── Handlers ──
  const handleMaximize = useCallback(async () => {
    window.ghostshell.windowMaximize()
    setTimeout(async () => {
      try { setIsMaximized(await window.ghostshell.windowIsMaximized()) } catch { /* */ }
    }, 100)
  }, [])

  const handleDoubleClick = useCallback((e: ReactMouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('.titlebar-no-drag')) return
    void handleMaximize()
  }, [handleMaximize])

  // + opens the agent setup screen directly; Shift+click (or right-click)
  // opens a plain terminal.
  const handleNewTab = useCallback((e: ReactMouseEvent<HTMLButtonElement>) => {
    if (e.shiftKey) {
      onSpawnTerminal()
      return
    }
    openQuickLaunchSession()
  }, [onSpawnTerminal])

  const handleNewTabContext = useCallback((e: ReactMouseEvent<HTMLButtonElement>) => {
    e.preventDefault()
    onSpawnTerminal()
  }, [onSpawnTerminal])

  const handleSettingsAction = useCallback((e: ReactMouseEvent<HTMLButtonElement>) => {
    if (e.altKey) return onOpenSettings('providers')
    if (e.shiftKey) return onOpenSettings('terminal')
    onOpenSettings('appearance')
  }, [onOpenSettings])

  const handleSaveTitle = useCallback((id: string) => {
    if (editingTitle.trim()) updateWorkspace(id, { title: editingTitle.trim() })
    setEditingId(null)
  }, [editingTitle, updateWorkspace])

  const getContextMenuItems = () => {
    if (!contextMenu) return []
    const id = contextMenu.id
    const items = TAB_COLORS.map((c) => ({
      label: c.label,
      icon: <div className="w-3 h-3 rounded-full" style={{ backgroundColor: c.value }} />,
      onClick: () => updateWorkspace(id, { color: c.value }),
    }))
    items.push({
      label: 'Default',
      icon: <div className="w-3 h-3 rounded-full border border-white/20" />,
      onClick: () => updateWorkspace(id, { color: 'default' }),
    })
    items.push({
      label: 'Rename',
      icon: <div className="w-3 h-3" />,
      onClick: () => {
        const ws = workspaces.find((w) => w.id === id)
        if (ws) { setEditingTitle(ws.title); setEditingId(id) }
      },
    })
    return items
  }

  // ── Render ──
  return (
    <div
      onDoubleClick={handleDoubleClick}
      className="titlebar-drag relative z-20 flex h-[44px] w-full shrink-0 items-center overflow-hidden"
      style={{ background: 'var(--shell-bg)' }}
    >
      {contextMenu && (
        <ContextMenu
          items={getContextMenuItems()}
          position={{ x: contextMenu.x, y: contextMenu.y }}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* ── Left: Logo ──────────────────────────────── */}
      <div className="titlebar-no-drag flex h-full items-center pl-3 pr-2 shrink-0">
        <div className="flex items-center justify-center px-1">
          <Logo />
        </div>
      </div>

      {/* ── Center: Workspace tabs + New ─────────────── */}
      <div role="tablist" aria-label="Workspaces" className="flex h-full flex-1 items-center gap-1 overflow-x-auto no-scrollbar pl-1 pr-2">
        {showTabs && workspaces.map((ws) => {
          const isActive = ws.id === resolvedActiveWorkspaceId
          const firstSession = sessions.find((s) => s.id === ws.sessionIds[0])
          const agent = firstSession?.agentId ? agents.find((a) => a.id === firstSession.agentId) : undefined
          const provider = agent ? resolveProvider(agent) : firstSession?.detectedProvider
          const isSwarm = firstSession?.sessionType === 'ghostswarm' || ws.title.toLowerCase().includes('swarm')
          // Only a colour the user picked is shown, as a quiet label dot.
          const labelColor = ws.color && ws.color !== 'default' ? ws.color : undefined
          const isEditing = editingId === ws.id
          const count = ws.sessionIds.length

          return (
            <div
              key={ws.id}
              role="tab"
              aria-selected={isActive}
              data-active={isActive ? 'true' : undefined}
              title={ws.title}
              onClick={() => { if (!isEditing) setActiveWorkspace(ws.id) }}
              onDoubleClick={(e) => { e.stopPropagation(); setEditingTitle(ws.title); setEditingId(ws.id) }}
              onContextMenu={(e) => { e.preventDefault(); setContextMenu({ id: ws.id, x: e.clientX, y: e.clientY }) }}
              className="workspace-tab titlebar-no-drag group"
            >
              {labelColor && (
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: labelColor }} />
              )}
              <span className="workspace-tab-icon flex shrink-0 items-center justify-center">
                {isSwarm ? (
                  <Network className="h-3.5 w-3.5" />
                ) : count > 1 ? (
                  <LayoutGrid className="h-3.5 w-3.5" />
                ) : (
                  <ProviderGlyph provider={provider} size={14} />
                )}
              </span>
              {isEditing ? (
                <input
                  ref={inputRef}
                  value={editingTitle}
                  onChange={(e) => setEditingTitle(e.target.value)}
                  onBlur={() => handleSaveTitle(ws.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveTitle(ws.id)
                    if (e.key === 'Escape') setEditingId(null)
                  }}
                  className="h-6 min-w-0 flex-1 rounded-md border bg-transparent px-1.5 text-[12.5px] font-medium outline-none"
                  style={{ borderColor: 'var(--pane-focus)', color: 'var(--ghost-text)' }}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium tracking-[-0.005em]">
                  {getTabLabel(ws.title, ws.isGroup)}
                </span>
              )}
              {!isEditing && count > 1 && (
                <span className="workspace-tab-count">{count}</span>
              )}
              <button
                type="button"
                aria-label={`Close ${ws.title}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => { e.stopPropagation(); closeWorkspace(ws.id) }}
                className="workspace-tab-close"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )
        })}
        <button
          onClick={handleNewTab}
          onContextMenu={handleNewTabContext}
          title="New session (Shift+click for plain terminal)"
          aria-label="New session"
          className="workspace-tab-new titlebar-no-drag"
        >
          <Plus className="h-4 w-4" strokeWidth={2} />
        </button>
      </div>

      {/* ── Right: Settings + Window Controls ─────── */}
      <div className="titlebar-no-drag flex h-full items-center gap-1 px-2 shrink-0">
        {/* Settings */}
        <button
          onClick={handleSettingsAction}
          title="Settings"
          className="flex h-9 w-9 items-center justify-center rounded-lg transition-all text-white/35 hover:bg-white/[0.08] hover:text-white/70"
        >
          <SettingsIcon className="h-[18px] w-[18px]" />
        </button>

        <div className="mx-1.5 h-5 w-px bg-white/[0.06]" />

        {/* Window controls */}
        <button
          onClick={() => window.ghostshell.windowMinimize()}
          title="Minimize"
          className="flex h-9 w-9 items-center justify-center rounded-lg transition-all text-white/35 hover:bg-white/[0.08] hover:text-white/70"
        >
          <Minus className="h-[18px] w-[18px]" />
        </button>
        <button
          onClick={handleMaximize}
          title={isMaximized ? 'Restore' : 'Maximize'}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-white/35 transition-all hover:bg-white/[0.08] hover:text-white/70"
        >
          {isMaximized ? (
            <div className="relative h-3.5 w-3.5">
              <div className="absolute left-0 top-0 h-2.5 w-2.5 rounded-[2px] border-[1.5px] border-current opacity-60" />
              <div className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-[2px] border-[1.5px] border-current" />
            </div>
          ) : (
            <Square className="h-3.5 w-3.5" />
          )}
        </button>
        <button
          onClick={() => window.ghostshell.windowClose()}
          title="Close"
          className="flex h-9 w-9 items-center justify-center rounded-lg transition-all text-white/35 hover:bg-rose-500/20 hover:text-rose-400"
        >
          <X className="h-[18px] w-[18px]" />
        </button>
      </div>
    </div>
  )
}
