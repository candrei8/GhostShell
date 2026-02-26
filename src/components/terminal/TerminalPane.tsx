import { useRef, useState, useCallback, useEffect } from 'react'
import { X, Terminal as TerminalIcon } from 'lucide-react'
import { useTerminal } from '../../hooks/useTerminal'
import { usePty } from '../../hooks/usePty'
import { TerminalSearch } from './TerminalSearch'
import { useAgentStore } from '../../stores/agentStore'
import { useActivityStore } from '../../stores/activityStore'
import { AgentAvatar } from '../agents/AgentAvatar'
import { ActivityIcon } from '../agents/ActivityIcon'
import { TerminalSession } from '../../lib/types'

interface TerminalPaneProps {
  session: TerminalSession
  isActive?: boolean
  onClose?: () => void
  onClick?: () => void
  showPaneLabel?: boolean
  searchOpen?: boolean
  onSearchClose?: () => void
}

export function TerminalPane({ session, isActive, onClose, onClick, showPaneLabel, searchOpen: externalSearchOpen, onSearchClose }: TerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const agent = useAgentStore((s) =>
    session.agentId ? s.agents.find((a) => a.id === session.agentId) : undefined,
  )
  const agentId = agent?.id
  // Only extract primitives to avoid re-rendering the entire pane on every activity change
  const activityName = useActivityStore((s) => {
    if (!agentId) return null
    const a = s.activities[agentId]
    return a ? a.currentActivity : null
  })
  const activityDetail = useActivityStore((s) => {
    if (!agentId) return null
    const a = s.activities[agentId]
    return a ? (a.currentDetail || null) : null
  })
  const { terminal, searchNext, searchPrev, clearSearch } = useTerminal(containerRef, isActive)
  const [localSearchOpen, setLocalSearchOpen] = useState(false)
  const [labelHovered, setLabelHovered] = useState(false)

  const searchOpen = externalSearchOpen !== undefined ? externalSearchOpen : localSearchOpen

  usePty({
    sessionId: session.id,
    terminal,
    cwd: session.cwd,
    shell: session.shell,
    agentId: session.agentId,
    autoLaunch: !!session.agentId && !session.skipAutoLaunch,
  })

  const handleToggleSearch = useCallback(() => {
    if (externalSearchOpen !== undefined) return
    setLocalSearchOpen((prev) => !prev)
  }, [externalSearchOpen])

  const handleSearchClose = useCallback(() => {
    if (onSearchClose) {
      onSearchClose()
    } else {
      setLocalSearchOpen(false)
    }
  }, [onSearchClose])

  // Listen for Ctrl+Shift+F on this pane
  useEffect(() => {
    if (!isActive) return
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'F') {
        e.preventDefault()
        handleToggleSearch()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isActive, handleToggleSearch])

  return (
    <div
      data-terminal-pane
      className={`relative flex flex-col h-full overflow-hidden ${
        isActive !== undefined
          ? isActive
            ? 'ring-1 ring-ghost-accent/50 ring-inset'
            : ''
          : ''
      }`}
      onClick={onClick}
    >
      {/* Pane label for grid view identification */}
      {showPaneLabel && (
        <div
          className={`h-8 flex items-center gap-1.5 px-2 border-b shrink-0 transition-colors ${
            isActive ? 'bg-ghost-surface border-ghost-accent/30' : 'bg-ghost-surface/50 border-ghost-border'
          }`}
          onMouseEnter={() => setLabelHovered(true)}
          onMouseLeave={() => setLabelHovered(false)}
        >
          {/* Active indicator */}
          {isActive && (
            <div className="w-1.5 h-1.5 rounded-full bg-ghost-accent shrink-0" />
          )}

          {/* Agent avatar or terminal icon */}
          {agent ? (
            <AgentAvatar avatar={agent.avatar} size="sm" className="!w-5 !h-5" />
          ) : (
            <TerminalIcon className="w-3.5 h-3.5 text-ghost-text-dim shrink-0" />
          )}

          {/* Title */}
          <span className="text-sm font-medium text-ghost-text truncate flex-1 min-w-0">{session.title}</span>

          {/* Status: activity or working badge */}
          {agent && activityName && activityName !== 'idle' ? (
            <ActivityIcon activity={activityName} detail={activityDetail || undefined} size="sm" />
          ) : agent?.status === 'working' ? (
            <span className="text-[10px] px-1 rounded-lg bg-ghost-success/15 text-ghost-success shrink-0">Working</span>
          ) : agent?.status === 'error' ? (
            <span className="text-[10px] px-1 rounded-lg bg-ghost-error/15 text-ghost-error shrink-0">Error</span>
          ) : null}

          {/* Provider badge for Gemini */}
          {agent?.provider === 'gemini' && (
            <span className="text-[10px] font-bold text-blue-400 shrink-0">G</span>
          )}

          {/* Close button on hover */}
          {onClose && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onClose()
              }}
              className={`w-5 h-5 flex items-center justify-center rounded hover:bg-slate-800 transition-all shrink-0 ${
                labelHovered ? 'opacity-100 text-ghost-text-dim' : 'opacity-0'
              }`}
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      )}
      <TerminalSearch
        isOpen={searchOpen}
        onClose={handleSearchClose}
        onSearchNext={searchNext}
        onSearchPrev={searchPrev}
        onClear={clearSearch}
      />
      <div ref={containerRef} className="flex-1 min-h-0 overflow-hidden" />
    </div>
  )
}
