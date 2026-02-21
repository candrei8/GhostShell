import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import {
  Plus,
  Terminal as TerminalIcon,
  Zap,
  ChevronDown,
  ChevronRight,
  X,
  Copy,
  Maximize2,
  Minimize2,
  Radio,
  LayoutGrid,
  Layers,
  FolderOpen,
  SplitSquareHorizontal,
  Bot,
  MoreHorizontal,
  Search,
  SquareSlash,
  Download,
  Trash2,
} from 'lucide-react'
import { useTerminalStore } from '../../stores/terminalStore'
import { useAgentStore } from '../../stores/agentStore'
import { useWorkspaceStore } from '../../stores/workspaceStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useNotificationStore } from '../../stores/notificationStore'
import { useActivityStore } from '../../stores/activityStore'
import { useAgent } from '../../hooks/useAgent'
import { TerminalPane } from './TerminalPane'
import { QuickLaunch } from './QuickLaunch'
import { AgentAvatar } from '../agents/AgentAvatar'
import { ActivityIcon } from '../agents/ActivityIcon'
import { resolveProvider, getProviderLabel, getProviderColor } from '../../lib/providers'

interface TerminalContainerProps {
  showQuickLaunch: boolean
  onShowQuickLaunch: (show: boolean) => void
}

export function TerminalContainer({ showQuickLaunch, onShowQuickLaunch }: TerminalContainerProps) {
  const sessions = useTerminalStore((s) => s.sessions)
  const activeSessionId = useTerminalStore((s) => s.activeSessionId)
  const maximizedSessionId = useTerminalStore((s) => s.maximizedSessionId)
  const syncInputsMode = useTerminalStore((s) => s.syncInputsMode)
  const viewMode = useTerminalStore((s) => s.viewMode)
  const groups = useTerminalStore((s) => s.groups)
  const activeGroupId = useTerminalStore((s) => s.activeGroupId)
  const setActiveSession = useTerminalStore((s) => s.setActiveSession)
  const removeSession = useTerminalStore((s) => s.removeSession)
  const addSession = useTerminalStore((s) => s.addSession)
  const toggleMaximize = useTerminalStore((s) => s.toggleMaximize)
  const setSyncInputs = useTerminalStore((s) => s.setSyncInputs)
  const setViewMode = useTerminalStore((s) => s.setViewMode)
  const duplicateSession = useTerminalStore((s) => s.duplicateSession)
  const setActiveGroup = useTerminalStore((s) => s.setActiveGroup)
  const removeGroup = useTerminalStore((s) => s.removeGroup)
  const agents = useAgentStore((s) => s.agents)
  const defaultProvider = useSettingsStore((s) => s.defaultProvider)
  const { deleteAgent, cloneAgent } = useAgent()

  const addNotification = useNotificationStore((s) => s.addNotification)

  // Track which group tabs are expanded (showing individual sessions)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  // Split dialog state (for Ctrl+Shift+D when session has an agent)
  const [splitDialogSessionId, setSplitDialogSessionId] = useState<string | null>(null)
  // Header controls state
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const headerMenuRef = useRef<HTMLDivElement>(null)
  const headerMenuBtnRef = useRef<HTMLButtonElement>(null)

  const handleCloseSession = useCallback(
    (sessionId: string) => {
      const session = sessions.find((s) => s.id === sessionId)
      if (session?.agentId) {
        deleteAgent(session.agentId)
      }
      // Always remove session explicitly — deleteAgent handles the agent cleanup,
      // but we must guarantee session removal even if agent.terminalId was already cleared
      removeSession(sessionId)
    },
    [sessions, deleteAgent, removeSession],
  )

  const handleCloseGroup = useCallback(
    (groupId: string) => {
      const group = groups.find((g) => g.id === groupId)
      if (!group) return
      // Close all sessions in the group
      group.sessionIds.forEach((sid) => {
        const session = sessions.find((s) => s.id === sid)
        if (session?.agentId) {
          deleteAgent(session.agentId)
        }
        // Always remove session explicitly
        removeSession(sid)
      })
      removeGroup(groupId)
    },
    [groups, sessions, deleteAgent, removeSession, removeGroup],
  )

  // Compute which session IDs belong to any group
  const groupedSessionIds = useMemo(() => {
    const set = new Set<string>()
    groups.forEach((g) => g.sessionIds.forEach((sid) => set.add(sid)))
    return set
  }, [groups])

  // Sessions not in any group (shown as individual tabs)
  const ungroupedSessions = useMemo(
    () => sessions.filter((s) => !groupedSessionIds.has(s.id)),
    [sessions, groupedSessionIds],
  )

  // Visible sessions: if a group is active, show only its sessions; otherwise show active tab
  const visibleSessions = useMemo(() => {
    if (activeGroupId) {
      const group = groups.find((g) => g.id === activeGroupId)
      if (group) {
        return sessions.filter((s) => group.sessionIds.includes(s.id))
      }
    }
    return sessions
  }, [activeGroupId, groups, sessions])

  const currentPath = useWorkspaceStore((s) => s.currentPath)
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const [tabContextMenu, setTabContextMenu] = useState<{ sessionId: string; x: number; y: number } | null>(null)
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const addMenuRef = useRef<HTMLDivElement>(null)
  const addButtonRef = useRef<HTMLButtonElement>(null)
  const tabContextRef = useRef<HTMLDivElement>(null)
  const prevSessionCount = useRef(sessions.length)

  // Resizable pane state
  const [rowHeights, setRowHeights] = useState<number[]>([])
  const [colWidths, setColWidths] = useState<number[][]>([])
  const dragging = useRef<{ type: 'row' | 'col'; index: number; rowIndex?: number; startPos: number; startSizes: number[] } | null>(null)
  const containerGridRef = useRef<HTMLDivElement>(null)

  // Layout computed from visible sessions (not all sessions)
  const gridSessions = useMemo(() => {
    if (activeGroupId) return visibleSessions
    if (viewMode === 'grid') return sessions
    return sessions
  }, [activeGroupId, visibleSessions, viewMode, sessions])

  const layout = useMemo(() => {
    const count = gridSessions.length
    if (count === 0) return { rows: [] as number[] }
    if (count === 1) return { rows: [1] }
    if (count === 2) return { rows: [2] }
    if (count === 3) return { rows: [3] }
    if (count === 4) return { rows: [2, 2] }
    if (count === 5) return { rows: [3, 2] }
    if (count === 6) return { rows: [3, 3] }
    if (count === 7) return { rows: [4, 3] }
    if (count === 8) return { rows: [4, 4] }
    const perRow = Math.ceil(count / 3)
    const rows: number[] = []
    let remaining = count
    for (let i = 0; i < 3; i++) {
      const thisRow = Math.min(perRow, remaining)
      if (thisRow > 0) rows.push(thisRow)
      remaining -= thisRow
    }
    return { rows }
  }, [gridSessions.length])

  useEffect(() => {
    const rowCount = layout.rows.length
    setRowHeights(Array(rowCount).fill(100 / rowCount))
    setColWidths(layout.rows.map((cols) => Array(cols).fill(100 / cols)))
  }, [layout.rows.length, layout.rows.join(',')])

  // Mouse drag handlers for resizing
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const d = dragging.current
      if (!d || !containerGridRef.current) return
      e.preventDefault()

      const rect = containerGridRef.current.getBoundingClientRect()

      if (d.type === 'row') {
        const totalHeight = rect.height
        const delta = ((e.clientY - d.startPos) / totalHeight) * 100
        const newSizes = [...d.startSizes]
        const minPct = 15
        newSizes[d.index] = Math.max(minPct, d.startSizes[d.index] + delta)
        newSizes[d.index + 1] = Math.max(minPct, d.startSizes[d.index + 1] - delta)
        if (newSizes[d.index] >= minPct && newSizes[d.index + 1] >= minPct) {
          setRowHeights(newSizes)
        }
      } else if (d.type === 'col' && d.rowIndex !== undefined) {
        const totalWidth = rect.width
        const delta = ((e.clientX - d.startPos) / totalWidth) * 100
        const newSizes = [...d.startSizes]
        const minPct = 15
        newSizes[d.index] = Math.max(minPct, d.startSizes[d.index] + delta)
        newSizes[d.index + 1] = Math.max(minPct, d.startSizes[d.index + 1] - delta)
        if (newSizes[d.index] >= minPct && newSizes[d.index + 1] >= minPct) {
          setColWidths((prev) => {
            const next = [...prev]
            next[d.rowIndex!] = newSizes
            return next
          })
        }
      }
    }

    const handleMouseUp = () => {
      if (dragging.current) {
        dragging.current = null
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        window.dispatchEvent(new Event('ghostshell:refit'))
      }
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  const startRowResize = useCallback((index: number, e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = { type: 'row', index, startPos: e.clientY, startSizes: [...rowHeights] }
    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'
  }, [rowHeights])

  const startColResize = useCallback((rowIndex: number, colIndex: number, e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = { type: 'col', index: colIndex, rowIndex, startPos: e.clientX, startSizes: [...(colWidths[rowIndex] || [])] }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [colWidths])

  const resetSizes = useCallback(() => {
    const rowCount = layout.rows.length
    setRowHeights(Array(rowCount).fill(100 / rowCount))
    setColWidths(layout.rows.map((cols) => Array(cols).fill(100 / cols)))
    setTimeout(() => window.dispatchEvent(new Event('ghostshell:refit')), 50)
  }, [layout.rows])

  // Staggered refits on session count change (optimized timings)
  useEffect(() => {
    if (prevSessionCount.current === 0 && sessions.length > 0 && showQuickLaunch) {
      onShowQuickLaunch(false)
    }
    if (prevSessionCount.current !== sessions.length) {
      const t1 = setTimeout(() => window.dispatchEvent(new Event('ghostshell:refit')), 30)
      const t2 = setTimeout(() => window.dispatchEvent(new Event('ghostshell:refit')), 100)
      prevSessionCount.current = sessions.length
      return () => { clearTimeout(t1); clearTimeout(t2) }
    }
    prevSessionCount.current = sessions.length
  }, [sessions.length, showQuickLaunch, onShowQuickLaunch])

  // Refit on state changes
  useEffect(() => {
    const t = setTimeout(() => window.dispatchEvent(new Event('ghostshell:refit')), 50)
    return () => clearTimeout(t)
  }, [maximizedSessionId, activeSessionId, viewMode, activeGroupId, showQuickLaunch])

  // Close menus on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (addMenuOpen && addMenuRef.current && !addMenuRef.current.contains(e.target as Node) && addButtonRef.current && !addButtonRef.current.contains(e.target as Node)) {
        setAddMenuOpen(false)
      }
      if (tabContextMenu && tabContextRef.current && !tabContextRef.current.contains(e.target as Node)) {
        setTabContextMenu(null)
      }
    }
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setAddMenuOpen(false)
        setTabContextMenu(null)
        setRenamingTabId(null)
        setSplitDialogSessionId(null)
        setHeaderMenuOpen(false)
        // Dismiss QuickLaunch overlay with Escape
        if (showQuickLaunch && sessions.length > 0) {
          onShowQuickLaunch(false)
        }
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [addMenuOpen, tabContextMenu, showQuickLaunch, sessions.length, onShowQuickLaunch])

  // Listen for split-request event (Ctrl+Shift+D)
  useEffect(() => {
    const handleSplitRequest = () => {
      const sid = activeSessionId
      if (!sid) return
      const session = sessions.find((s) => s.id === sid)
      if (!session) return

      if (session.agentId) {
        // Session has an agent - show choice dialog
        setSplitDialogSessionId(sid)
      } else {
        // Plain terminal - just duplicate and switch to grid
        duplicateSession(sid)
      }
    }
    window.addEventListener('ghostshell:split-request', handleSplitRequest)
    return () => window.removeEventListener('ghostshell:split-request', handleSplitRequest)
  }, [activeSessionId, sessions, duplicateSession])

  const handleSplitWithAgent = () => {
    if (!splitDialogSessionId) return
    const session = sessions.find((s) => s.id === splitDialogSessionId)
    if (session?.agentId) {
      cloneAgent(session.agentId)
      setViewMode('grid')
    }
    setSplitDialogSessionId(null)
  }

  const handleSplitTerminalOnly = () => {
    if (!splitDialogSessionId) return
    duplicateSession(splitDialogSessionId)
    setSplitDialogSessionId(null)
  }

  const handleNewTerminal = () => {
    const id = `term-standalone-${Date.now()}`
    addSession({ id, title: 'Terminal', cwd: currentPath })
    setAddMenuOpen(false)
    onShowQuickLaunch(false)
  }

  const handleOpenQuickLaunch = () => {
    onShowQuickLaunch(true)
    setAddMenuOpen(false)
  }

  const handleQuickLaunchDone = () => {
    onShowQuickLaunch(false)
  }

  // Header menu handlers (for active session controls in tab bar)
  const handleClearTerminal = () => {
    if (activeSessionId) {
      window.ghostshell.ptyWrite(activeSessionId, 'clear\r')
    }
    setHeaderMenuOpen(false)
  }

  const handleSendCtrlC = () => {
    if (activeSessionId) {
      window.ghostshell.ptyWrite(activeSessionId, '\x03')
    }
    setHeaderMenuOpen(false)
  }

  const handleKillProcess = () => {
    if (activeSessionId) {
      window.ghostshell.ptyKill(activeSessionId)
    }
    setHeaderMenuOpen(false)
  }

  const handleCopySessionId = () => {
    if (activeSessionId) {
      navigator.clipboard.writeText(activeSessionId).catch(() => {})
    }
    setHeaderMenuOpen(false)
  }

  const handleExportOutput = () => {
    if (!activeSessionId) return
    const outputBuffer = (window as unknown as Record<string, unknown>)[`__ghostshell_output_${activeSessionId}`] as string | undefined
    if (outputBuffer) {
      navigator.clipboard.writeText(outputBuffer).then(
        () => addNotification('success', 'Output copied', 'Terminal output copied to clipboard'),
        () => addNotification('error', 'Copy failed', 'Could not copy to clipboard')
      )
    } else {
      addNotification('warning', 'No output captured yet')
    }
    setHeaderMenuOpen(false)
  }

  // Close header menu on outside click
  useEffect(() => {
    if (!headerMenuOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (headerMenuRef.current && !headerMenuRef.current.contains(e.target as Node) && headerMenuBtnRef.current && !headerMenuBtnRef.current.contains(e.target as Node)) {
        setHeaderMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [headerMenuOpen])

  // Listen for Ctrl+Shift+F globally to toggle search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'F') {
        e.preventDefault()
        setSearchOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const handleDuplicateTab = (sessionId: string) => {
    duplicateSession(sessionId)
    setTabContextMenu(null)
  }

  const handleRenameTab = (sessionId: string) => {
    const session = sessions.find((s) => s.id === sessionId)
    if (session) {
      setRenamingTabId(sessionId)
      setRenameValue(session.title)
    }
    setTabContextMenu(null)
  }

  const commitRename = () => {
    if (renamingTabId && renameValue.trim()) {
      useTerminalStore.getState().updateSession(renamingTabId, { title: renameValue.trim() })
    }
    setRenamingTabId(null)
    setRenameValue('')
  }

  const handleTabContextMenu = (e: React.MouseEvent, sessionId: string) => {
    e.preventDefault()
    setTabContextMenu({ sessionId, x: e.clientX, y: e.clientY })
  }

  const toggleGroupExpanded = (groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })
  }

  const isMaximized = maximizedSessionId !== null

  // Determine if we're in group grid mode
  const isGroupView = activeGroupId !== null
  const effectiveViewMode = isGroupView ? 'grid' : viewMode

  // Safe row/col sizes: rowHeights/colWidths are set via useEffect (async), so they can be
  // stale on the first render after session count changes. Fall back to equal distribution.
  const safeRowHeights = useMemo(() =>
    rowHeights.length === layout.rows.length
      ? rowHeights
      : Array(layout.rows.length).fill(100 / layout.rows.length) as number[],
    [rowHeights, layout.rows.length],
  )
  const safeColWidths = useMemo(() =>
    layout.rows.map((colCount, i) => {
      const stored = colWidths[i]
      return stored && stored.length === colCount
        ? stored
        : Array(colCount).fill(100 / colCount) as number[]
    }),
    [colWidths, layout.rows],
  )

  // Compute absolute positions for unified pane rendering (prevents terminal remounting on view switch)
  const panePositions = useMemo(() => {
    type Pos = { position: 'absolute'; top: number | string; left: number | string; width: string; height: string; visibility: 'visible' | 'hidden'; zIndex: number }
    const positions: Record<string, Pos> = {}
    const inGrid = effectiveViewMode === 'grid'

    if (!inGrid) {
      for (const s of sessions) {
        const active = s.id === activeSessionId
        positions[s.id] = {
          position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
          visibility: active ? 'visible' : 'hidden',
          zIndex: active ? 1 : 0,
        }
      }
      return positions
    }

    if (isMaximized && maximizedSessionId) {
      for (const s of sessions) {
        const isMax = s.id === maximizedSessionId
        positions[s.id] = {
          position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
          visibility: isMax ? 'visible' : 'hidden',
          zIndex: isMax ? 1 : 0,
        }
      }
      return positions
    }

    const gridList = gridSessions
    const gridIds = new Set(gridList.map((s) => s.id))
    for (const s of sessions) {
      if (!gridIds.has(s.id)) {
        positions[s.id] = {
          position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
          visibility: 'hidden', zIndex: 0,
        }
      }
    }

    let idx = 0
    for (let rowIndex = 0; rowIndex < layout.rows.length; rowIndex++) {
      const colCount = layout.rows[rowIndex]
      const rowPct = safeRowHeights[rowIndex]
      const rowCols = safeColWidths[rowIndex]
      let topPct = 0
      for (let r = 0; r < rowIndex; r++) topPct += safeRowHeights[r]
      for (let colIndex = 0; colIndex < colCount; colIndex++) {
        if (idx >= gridList.length) break
        const s = gridList[idx]
        let leftPct = 0
        for (let c = 0; c < colIndex; c++) leftPct += rowCols[c]
        positions[s.id] = {
          position: 'absolute',
          top: `${topPct}%`, left: `${leftPct}%`,
          width: `${rowCols[colIndex]}%`,
          height: `${rowPct}%`,
          visibility: 'visible',
          zIndex: s.id === activeSessionId ? 1 : 0,
        }
        idx++
      }
    }

    return positions
  }, [effectiveViewMode, sessions, gridSessions, activeSessionId, maximizedSessionId, isMaximized, layout, safeRowHeights, safeColWidths])

  const hasNoSessions = sessions.length === 0

  // Active session info for tab bar header controls
  const activeSession = activeSessionId ? sessions.find((s) => s.id === activeSessionId) : undefined
  const activeAgent = activeSession?.agentId ? agents.find((a) => a.id === activeSession.agentId) : undefined
  const activeAgentId = activeAgent?.id
  // Only extract the primitive values we actually render — avoids re-rendering the entire
  // TerminalContainer on every activity change (which happens many times per second)
  const activeActivityName = useActivityStore((s) => {
    if (!activeAgentId) return null
    const a = s.activities[activeAgentId]
    return a ? a.currentActivity : null
  })
  const activeActivityDetail = useActivityStore((s) => {
    if (!activeAgentId) return null
    const a = s.activities[activeAgentId]
    return a ? (a.currentDetail || null) : null
  })
  const showActivity = activeAgent && activeActivityName && activeActivityName !== 'idle'

  // Whether we're in multi-pane grid view (panes need labels)
  const isMultiPaneGrid = effectiveViewMode === 'grid' && gridSessions.length > 1 && !isMaximized

  // Render a single session tab
  const renderSessionTab = (session: typeof sessions[0], isNested = false) => {
    const agent = session.agentId ? agents.find((a) => a.id === session.agentId) : undefined
    const isActive = session.id === activeSessionId
    const isWorking = agent?.status === 'working'

    return (
      <div
        key={session.id}
        className={`group/tab flex items-center gap-1 h-full px-2 rounded text-xs whitespace-nowrap transition-colors cursor-pointer shrink-0 ${
          isNested ? 'ml-4 ' : ''
        }${
          isActive
            ? 'bg-ghost-surface text-ghost-text'
            : 'text-ghost-text-dim hover:bg-white/5 hover:text-ghost-text'
        }`}
        onClick={() => {
          if (activeGroupId) {
            const group = groups.find((g) => g.id === activeGroupId)
            if (!group || !group.sessionIds.includes(session.id)) {
              setActiveGroup(null)
            }
          }
          setActiveSession(session.id)
        }}
        onContextMenu={(e) => handleTabContextMenu(e, session.id)}
        onDoubleClick={() => handleRenameTab(session.id)}
      >
        {agent && (
          <div
            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
              isWorking ? 'bg-ghost-success'
              : agent.status === 'error' ? 'bg-ghost-error'
              : agent.status === 'offline' ? 'bg-gray-600'
              : 'bg-ghost-text-dim/40'
            }`}
          />
        )}
        {!agent && <TerminalIcon className="w-3 h-3 shrink-0" />}

        {renamingTabId === session.id ? (
          <input
            type="text"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename()
              if (e.key === 'Escape') setRenamingTabId(null)
            }}
            className="w-20 bg-transparent border-b border-ghost-accent text-xs text-ghost-text outline-none"
            autoFocus
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="truncate max-w-[160px]">{session.title}</span>
        )}

        <button
          onClick={(e) => {
            e.stopPropagation()
            handleCloseSession(session.id)
          }}
          className="w-5 h-5 flex items-center justify-center rounded opacity-0 group-hover/tab:opacity-100 hover:bg-white/10 transition-all shrink-0 ml-0.5"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Tab bar - hidden when no sessions */}
      {!hasNoSessions && <div className="h-8 flex items-center bg-ghost-sidebar/50 border-b border-ghost-border px-1 shrink-0">
        <div className="flex items-center gap-0.5 flex-1 overflow-x-auto min-w-0">
          {/* Group tabs */}
          {groups.map((group) => {
            const isActive = activeGroupId === group.id
            const isExpanded = expandedGroups.has(group.id)
            const livingSessionIds = group.sessionIds.filter((sid) => sessions.some((s) => s.id === sid))
            const workingCount = livingSessionIds.filter((sid) => {
              const session = sessions.find((s) => s.id === sid)
              if (!session?.agentId) return false
              const agent = agents.find((a) => a.id === session.agentId)
              return agent?.status === 'working'
            }).length

            if (livingSessionIds.length === 0) return null

            return (
              <div key={group.id} className="flex items-center shrink-0">
                <div
                  className={`group/tab flex items-center gap-1 h-full px-2 rounded text-xs whitespace-nowrap transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-ghost-accent/15 text-ghost-accent'
                      : 'text-ghost-text-dim hover:bg-white/5 hover:text-ghost-text'
                  }`}
                  onClick={() => {
                    if (isActive) {
                      // Clicking active group deselects it
                      setActiveGroup(null)
                    } else {
                      setActiveGroup(group.id)
                      // Set active session to first in group
                      if (livingSessionIds.length > 0) {
                        setActiveSession(livingSessionIds[0])
                      }
                    }
                  }}
                >
                  {/* Expand toggle */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleGroupExpanded(group.id)
                    }}
                    className="w-3 h-3 flex items-center justify-center shrink-0"
                  >
                    {isExpanded
                      ? <ChevronDown className="w-2.5 h-2.5" />
                      : <ChevronRight className="w-2.5 h-2.5" />
                    }
                  </button>

                  <FolderOpen className="w-3 h-3 shrink-0" />
                  <span className="truncate max-w-[160px]">{group.name}</span>
                  <span className={`text-xs px-1 py-px rounded ${
                    isActive ? 'bg-ghost-accent/20' : 'bg-ghost-border'
                  }`}>
                    {livingSessionIds.length}
                  </span>

                  {workingCount > 0 && (
                    <span className="w-1.5 h-1.5 rounded-full bg-ghost-success shrink-0" />
                  )}

                  {/* Close group */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleCloseGroup(group.id)
                    }}
                    className="w-5 h-5 flex items-center justify-center rounded opacity-0 group-hover/tab:opacity-100 hover:bg-white/10 transition-all shrink-0 ml-0.5"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>

                {/* Expanded: show individual sessions inside group */}
                {isExpanded && livingSessionIds.map((sid) => {
                  const session = sessions.find((s) => s.id === sid)
                  if (!session) return null
                  return renderSessionTab(session, true)
                })}
              </div>
            )
          })}

          {/* Ungrouped session tabs */}
          {ungroupedSessions.map((session) => renderSessionTab(session))}
        </div>

        {/* Active pane info */}
        {activeSession && (
          <div className="flex items-center gap-1.5 shrink-0 ml-1.5 border-l border-ghost-border/50 pl-2">
            {activeAgent && <AgentAvatar avatar={activeAgent.avatar} size="sm" />}
            <span className="text-xs font-medium text-ghost-text truncate max-w-[160px]">{activeSession.title}</span>
            {showActivity && activeActivityName ? (
              <ActivityIcon
                activity={activeActivityName}
                detail={activeActivityDetail || undefined}
                size="sm"
              />
            ) : (
              activeAgent && activeAgent.status === 'working' && (
                <span className="text-xs px-1 rounded bg-ghost-success/15 text-ghost-success">Working</span>
              )
            )}
          </div>
        )}

        {/* Tab bar actions */}
        <div className="flex items-center gap-0.5 shrink-0 ml-1">
          {/* Search button */}
          {activeSessionId && (
            <button
              onClick={() => setSearchOpen((prev) => !prev)}
              className={`w-6 h-6 flex items-center justify-center rounded transition-colors ${
                searchOpen ? 'bg-white/10 text-ghost-text' : 'text-ghost-text-dim hover:bg-white/5 hover:text-ghost-text'
              }`}
              title="Search (Ctrl+Shift+F)"
            >
              <Search className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Header menu */}
          {activeSessionId && (
            <div className="relative">
              <button
                ref={headerMenuBtnRef}
                onClick={() => setHeaderMenuOpen((prev) => !prev)}
                className={`w-6 h-6 flex items-center justify-center rounded transition-colors ${
                  headerMenuOpen ? 'bg-white/10 text-ghost-text' : 'text-ghost-text-dim hover:bg-white/5 hover:text-ghost-text'
                }`}
                title="Terminal actions"
              >
                <MoreHorizontal className="w-3.5 h-3.5" />
              </button>
              {headerMenuOpen && (
                <div ref={headerMenuRef} className="absolute top-full right-0 mt-1 w-52 py-1 bg-ghost-surface border border-ghost-border rounded-lg shadow-lg z-50">
                  <button onClick={handleSendCtrlC} className="w-full px-3 py-1.5 flex items-center gap-2 text-xs text-ghost-text-dim hover:bg-white/5 hover:text-ghost-text transition-colors">
                    <SquareSlash className="w-3.5 h-3.5" />
                    Send Ctrl+C
                  </button>
                  <button onClick={handleClearTerminal} className="w-full px-3 py-1.5 flex items-center gap-2 text-xs text-ghost-text-dim hover:bg-white/5 hover:text-ghost-text transition-colors">
                    <TerminalIcon className="w-3.5 h-3.5" />
                    Clear Terminal
                    <span className="ml-auto text-xs text-ghost-text-dim/50">Ctrl+K</span>
                  </button>
                  <button onClick={() => { setSearchOpen(true); setHeaderMenuOpen(false) }} className="w-full px-3 py-1.5 flex items-center gap-2 text-xs text-ghost-text-dim hover:bg-white/5 hover:text-ghost-text transition-colors">
                    <Search className="w-3.5 h-3.5" />
                    Search
                    <span className="ml-auto text-xs text-ghost-text-dim/50">Ctrl+Shift+F</span>
                  </button>
                  <button onClick={handleExportOutput} className="w-full px-3 py-1.5 flex items-center gap-2 text-xs text-ghost-text-dim hover:bg-white/5 hover:text-ghost-text transition-colors">
                    <Download className="w-3.5 h-3.5" />
                    Copy Output
                  </button>
                  <button onClick={() => { if (activeSessionId) { duplicateSession(activeSessionId); setHeaderMenuOpen(false) } }} className="w-full px-3 py-1.5 flex items-center gap-2 text-xs text-ghost-text-dim hover:bg-white/5 hover:text-ghost-text transition-colors">
                    <Copy className="w-3.5 h-3.5" />
                    Duplicate Pane
                    <span className="ml-auto text-xs text-ghost-text-dim/50">Ctrl+Shift+D</span>
                  </button>
                  <button onClick={() => { if (activeSessionId) { toggleMaximize(activeSessionId); setHeaderMenuOpen(false) } }} className="w-full px-3 py-1.5 flex items-center gap-2 text-xs text-ghost-text-dim hover:bg-white/5 hover:text-ghost-text transition-colors">
                    <Maximize2 className="w-3.5 h-3.5" />
                    Maximize Pane
                    <span className="ml-auto text-xs text-ghost-text-dim/50">Ctrl+Shift+Enter</span>
                  </button>
                  <button onClick={handleCopySessionId} className="w-full px-3 py-1.5 flex items-center gap-2 text-xs text-ghost-text-dim hover:bg-white/5 hover:text-ghost-text transition-colors">
                    <Copy className="w-3.5 h-3.5" />
                    Copy Session ID
                  </button>
                  <button onClick={handleKillProcess} className="w-full px-3 py-1.5 flex items-center gap-2 text-xs text-ghost-error hover:bg-ghost-error/10 border-t border-ghost-border mt-1 pt-2 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                    Kill Process
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="w-px h-4 bg-ghost-border/50 mx-0.5" />

          {/* View mode toggle */}
          {sessions.length > 1 && !isGroupView && (
            <button
              onClick={() => setViewMode(viewMode === 'tabs' ? 'grid' : 'tabs')}
              className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${
                viewMode === 'grid'
                  ? 'bg-ghost-accent/20 text-ghost-accent'
                  : 'text-ghost-text-dim hover:bg-white/5 hover:text-ghost-text'
              }`}
              title={viewMode === 'tabs' ? 'Switch to grid view' : 'Switch to tab view'}
            >
              {viewMode === 'tabs' ? <LayoutGrid className="w-4 h-4" /> : <Layers className="w-4 h-4" />}
            </button>
          )}

          {/* Sync inputs toggle */}
          <button
            onClick={() => setSyncInputs(syncInputsMode === 'off' ? 'all' : 'off')}
            className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${
              syncInputsMode !== 'off'
                ? 'bg-ghost-accent/20 text-ghost-accent'
                : 'text-ghost-text-dim hover:bg-white/5 hover:text-ghost-text'
            }`}
            title={syncInputsMode !== 'off' ? 'Sync inputs ON' : 'Synchronize inputs'}
          >
            <Radio className="w-4 h-4" />
          </button>

          {/* Maximize/restore */}
          {effectiveViewMode === 'grid' && gridSessions.length > 1 && activeSessionId && (
            <button
              onClick={() => toggleMaximize(activeSessionId)}
              className="w-7 h-7 flex items-center justify-center rounded text-ghost-text-dim hover:bg-white/5 hover:text-ghost-text transition-colors"
              title={isMaximized ? 'Restore all panes' : 'Maximize active pane'}
            >
              {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          )}

          {/* Add dropdown */}
          <div className="relative">
            <button
              ref={addButtonRef}
              onClick={() => setAddMenuOpen((prev) => !prev)}
              className={`flex items-center gap-0.5 h-6 px-1.5 rounded transition-colors ${
                addMenuOpen ? 'bg-white/10 text-ghost-text' : 'text-ghost-text-dim hover:bg-white/5 hover:text-ghost-text'
              }`}
              title="Add terminal"
            >
              <Plus className="w-3.5 h-3.5" />
              <ChevronDown className="w-2.5 h-2.5" />
            </button>

            {addMenuOpen && (
              <div ref={addMenuRef} className="absolute top-full right-0 mt-1 w-48 py-1 bg-ghost-surface border border-ghost-border rounded-lg shadow-lg z-50">
                <button onClick={handleNewTerminal} className="w-full px-3 py-1.5 flex items-center gap-2 text-xs text-ghost-text-dim hover:bg-white/5 hover:text-ghost-text transition-colors">
                  <TerminalIcon className="w-3.5 h-3.5" />
                  New Terminal
                  <span className="ml-auto text-xs text-ghost-text-dim/50">Ctrl+Shift+T</span>
                </button>
                <button onClick={handleOpenQuickLaunch} className="w-full px-3 py-1.5 flex items-center gap-2 text-xs text-ghost-text-dim hover:bg-white/5 hover:text-ghost-text transition-colors">
                  <Zap className="w-3.5 h-3.5" />
                  Quick Launch
                </button>
                {activeSessionId && (
                  <>
                    <div className="h-px bg-ghost-border my-1" />
                    <button
                      onClick={() => { handleDuplicateTab(activeSessionId); setAddMenuOpen(false) }}
                      className="w-full px-3 py-1.5 flex items-center gap-2 text-xs text-ghost-text-dim hover:bg-white/5 hover:text-ghost-text transition-colors"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      Duplicate Tab
                      <span className="ml-auto text-xs text-ghost-text-dim/50">Ctrl+Shift+D</span>
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>}

      {/* Pane area - unified rendering: all terminals always in stable flat structure */}
      <div ref={containerGridRef} className="flex-1 relative min-h-0 overflow-hidden">
        {sessions.map((session) => {
          const style = panePositions[session.id]
          if (!style) return null
          return (
            <div
              key={session.id}
              className="overflow-hidden"
              style={style}
              onMouseDownCapture={() => {
                if (session.id !== activeSessionId) {
                  setActiveSession(session.id)
                }
              }}
            >
              <TerminalPane
                session={session}
                isActive={session.id === activeSessionId}
                onClose={() => handleCloseSession(session.id)}
                onClick={() => setActiveSession(session.id)}
                showPaneLabel={isMultiPaneGrid}
                searchOpen={session.id === activeSessionId ? searchOpen : false}
                onSearchClose={() => setSearchOpen(false)}
              />
            </div>
          )
        })}

        {/* Grid resize dividers (absolute overlays) */}
        {effectiveViewMode === 'grid' && !isMaximized && gridSessions.length > 1 && (
          <>
            {layout.rows.length > 1 && layout.rows.slice(0, -1).map((_, i) => {
              let topPct = 0
              for (let r = 0; r <= i; r++) topPct += safeRowHeights[r]
              return (
                <div
                  key={`rdiv-${i}`}
                  className="absolute left-0 right-0 h-1 bg-ghost-border hover:bg-ghost-accent/50 cursor-row-resize transition-colors"
                  style={{ top: `calc(${topPct}% - 2px)`, zIndex: 10 }}
                  onMouseDown={(e) => startRowResize(i, e)}
                  onDoubleClick={() => resetSizes()}
                />
              )
            })}
            {layout.rows.map((colCount, rowIndex) => {
              if (colCount <= 1) return null
              let topPct = 0
              for (let r = 0; r < rowIndex; r++) topPct += safeRowHeights[r]
              const rowPct = safeRowHeights[rowIndex]
              const rowCols = safeColWidths[rowIndex]
              return Array.from({ length: colCount - 1 }, (_, colIndex) => {
                let leftPct = 0
                for (let c = 0; c <= colIndex; c++) leftPct += rowCols[c]
                return (
                  <div
                    key={`cdiv-${rowIndex}-${colIndex}`}
                    className="absolute w-1 bg-ghost-border hover:bg-ghost-accent/50 cursor-col-resize transition-colors"
                    style={{ top: `${topPct}%`, left: `calc(${leftPct}% - 2px)`, height: `${rowPct}%`, zIndex: 10 }}
                    onMouseDown={(e) => startColResize(rowIndex, colIndex, e)}
                    onDoubleClick={() => resetSizes()}
                  />
                )
              })
            })}
          </>
        )}

        {/* QuickLaunch overlay - rendered on top so terminals never unmount */}
        {showQuickLaunch && (
          <div className="absolute inset-0 z-30 flex flex-col bg-ghost-bg overflow-hidden">
            {!hasNoSessions && (
              <div className="h-9 flex items-center justify-between px-3 bg-ghost-sidebar/50 border-b border-ghost-border shrink-0">
                <span className="text-xs text-ghost-text-dim">
                  {sessions.length} terminal{sessions.length !== 1 ? 's' : ''} running
                </span>
                <button
                  onClick={() => onShowQuickLaunch(false)}
                  className="flex items-center gap-1.5 h-7 px-2.5 rounded bg-ghost-accent text-white text-xs font-medium hover:bg-ghost-accent/80 transition-colors"
                >
                  Back to terminals
                  <span className="text-xs text-white/50 ml-1">Esc</span>
                </button>
              </div>
            )}
            <div className="flex-1 overflow-auto">
              <QuickLaunch onLaunched={handleQuickLaunchDone} />
            </div>
          </div>
        )}

        {/* Empty state - when no sessions and QuickLaunch not open */}
        {hasNoSessions && !showQuickLaunch && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-ghost-bg">
            <div className="text-center space-y-4">
              <TerminalIcon className="w-10 h-10 text-ghost-text-dim/30 mx-auto" />
              <div>
                <h3 className="text-sm text-ghost-text-dim mb-1">No terminals open</h3>
                <p className="text-xs text-ghost-text-dim/60">Launch an agent or open a terminal to get started</p>
              </div>
              <div className="flex gap-2 justify-center">
                <button
                  onClick={() => onShowQuickLaunch(true)}
                  className="flex items-center gap-1.5 h-7 px-3 rounded bg-ghost-accent text-white text-xs font-medium hover:bg-ghost-accent/80 transition-colors"
                >
                  <Zap className="w-3.5 h-3.5" />
                  Quick Launch
                </button>
                <button
                  onClick={handleNewTerminal}
                  className="flex items-center gap-1.5 h-7 px-3 rounded bg-ghost-surface text-ghost-text text-xs hover:bg-white/10 transition-colors border border-ghost-border"
                >
                  <TerminalIcon className="w-3.5 h-3.5" />
                  New Terminal
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Tab context menu */}
      {tabContextMenu && (
        <div
          ref={tabContextRef}
          className="fixed z-50 w-44 py-1 bg-ghost-surface border border-ghost-border rounded-lg shadow-xl"
          style={{ left: tabContextMenu.x, top: tabContextMenu.y }}
        >
          <button
            onClick={() => handleRenameTab(tabContextMenu.sessionId)}
            className="w-full px-3 py-1.5 flex items-center gap-2 text-xs text-ghost-text hover:bg-white/5 transition-colors"
          >
            Rename Tab
          </button>
          <button
            onClick={() => handleDuplicateTab(tabContextMenu.sessionId)}
            className="w-full px-3 py-1.5 flex items-center gap-2 text-xs text-ghost-text hover:bg-white/5 transition-colors"
          >
            <Copy className="w-3 h-3" />
            Duplicate Tab
          </button>
          <button
            onClick={() => {
              toggleMaximize(tabContextMenu.sessionId)
              setTabContextMenu(null)
            }}
            className="w-full px-3 py-1.5 flex items-center gap-2 text-xs text-ghost-text hover:bg-white/5 transition-colors"
          >
            {maximizedSessionId === tabContextMenu.sessionId ? (
              <><Minimize2 className="w-3 h-3" /> Restore</>
            ) : (
              <><Maximize2 className="w-3 h-3" /> Maximize</>
            )}
          </button>
          <div className="h-px bg-ghost-border my-1" />
          <button
            onClick={() => {
              handleCloseSession(tabContextMenu.sessionId)
              setTabContextMenu(null)
            }}
            className="w-full px-3 py-1.5 flex items-center gap-2 text-xs text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <X className="w-3 h-3" />
            Close Tab
          </button>
        </div>
      )}

      {/* Sync inputs indicator */}
      {syncInputsMode !== 'off' && (
        <div className="h-6 flex items-center justify-center gap-2 bg-ghost-accent/10 border-t border-ghost-accent/20 shrink-0">
          <Radio className="w-3 h-3 text-ghost-accent" />
          <span className="text-xs text-ghost-accent">Synchronized inputs active - commands sent to all panes</span>
          <button
            onClick={() => setSyncInputs('off')}
            className="text-xs text-ghost-accent/60 hover:text-ghost-accent underline ml-2"
          >
            Disable
          </button>
        </div>
      )}

      {/* Split dialog - Ctrl+Shift+D on an agent session */}
      {splitDialogSessionId && (() => {
        const splitSession = sessions.find((s) => s.id === splitDialogSessionId)
        const splitAgent = splitSession?.agentId ? agents.find((a) => a.id === splitSession.agentId) : null
        const splitProvider = splitAgent ? resolveProvider(splitAgent) : defaultProvider
        const splitProviderLabel = getProviderLabel(splitProvider)
        const splitProviderColor = getProviderColor(splitProvider)
        return (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50"
            onClick={() => setSplitDialogSessionId(null)}
          >
            <div
              className="bg-ghost-surface border border-ghost-border rounded-xl shadow-lg p-5 w-72 animate-fade-in"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-2 mb-4">
                <SplitSquareHorizontal className="w-4 h-4 text-ghost-accent" />
                <h3 className="text-sm font-semibold text-ghost-text">Split Terminal</h3>
              </div>
              <div className="flex flex-col gap-2">
                <button
                  onClick={handleSplitWithAgent}
                  className="w-full h-10 px-3 rounded-lg text-white text-xs font-medium flex items-center gap-2 hover:opacity-80 transition-colors"
                  style={{ backgroundColor: splitProviderColor }}
                >
                  <Bot className="w-4 h-4" />
                  With {splitProviderLabel}
                  <span className="ml-auto text-white/50 text-xs">New agent, same config</span>
                </button>
                <button
                  onClick={handleSplitTerminalOnly}
                  className="w-full h-10 px-3 rounded-lg bg-ghost-bg border border-ghost-border text-ghost-text text-xs font-medium flex items-center gap-2 hover:bg-white/5 transition-colors"
                >
                  <TerminalIcon className="w-4 h-4" />
                  Terminal Only
                  <span className="ml-auto text-ghost-text-dim text-xs">Plain shell</span>
                </button>
              </div>
              <p className="text-xs text-ghost-text-dim/50 text-center mt-3">
                Ctrl+Shift+D &middot; Esc to cancel
              </p>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
