// SwarmSystemLog — Bottom monospace terminal-style activity log
// Shows file ops, commands, searches, errors (NOT messages — those go in LiveTimeline)

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import {
  Terminal, ChevronDown, ChevronUp, FileText, Command,
  Search, AlertTriangle, Wrench, Eye,
} from 'lucide-react'
import { useSwarmStore } from '../../stores/swarmStore'
import { useTerminalStore } from '../../stores/terminalStore'
import type { SwarmActivityEvent, SwarmAgentRole } from '../../lib/swarm-types'
import { getRoleDef } from '../../lib/swarm-types'

interface SwarmSystemLogProps {
  swarmId: string
  collapsed: boolean
  onToggleCollapse: () => void
}

// Event types that belong in the system log (NOT messages)
const LOG_EVENT_TYPES = new Set([
  'file_read', 'file_write', 'file_edit',
  'command_run', 'search', 'tool_call',
  'error', 'thinking',
  'task_created', 'task_status_change',
  'subagent_spawn', 'subagent_complete',
  'review_submit',
])

const EVENT_ICONS: Record<string, typeof Terminal> = {
  file_read: Eye,
  file_write: FileText,
  file_edit: FileText,
  command_run: Command,
  search: Search,
  tool_call: Wrench,
  error: AlertTriangle,
  thinking: Terminal,
  task_created: Terminal,
  task_status_change: Terminal,
  subagent_spawn: Terminal,
  subagent_complete: Terminal,
  review_submit: Terminal,
}

const EVENT_COLORS: Record<string, string> = {
  file_read: 'rgba(255,255,255,0.3)',
  file_write: '#38bdf8',
  file_edit: '#38bdf8',
  command_run: '#fb923c',
  search: '#a78bfa',
  tool_call: '#fbbf24',
  error: '#ef4444',
  thinking: 'rgba(255,255,255,0.2)',
  task_created: '#34d399',
  task_status_change: '#34d399',
  subagent_spawn: '#c084fc',
  subagent_complete: '#c084fc',
  review_submit: '#a78bfa',
}

export function SwarmSystemLog({ swarmId, collapsed, onToggleCollapse }: SwarmSystemLogProps) {
  const activityFeed = useSwarmStore((s) => s.activityFeed)
  const setSwarmViewMode = useSwarmStore((s) => s.setSwarmViewMode)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)

  // Filter to log-worthy events only
  const logEvents = useMemo(() => {
    return activityFeed
      .filter((e) => LOG_EVENT_TYPES.has(e.type))
      .slice(-200) // Keep last 200 for performance
  }, [activityFeed])

  // Auto-scroll
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [logEvents.length, autoScroll])

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
    setAutoScroll(scrollHeight - scrollTop - clientHeight < 24)
  }, [])

  const handleEventClick = useCallback((event: SwarmActivityEvent) => {
    // Try to jump to the agent's terminal
    if (event.metadata?.terminalId) {
      setSwarmViewMode('terminals')
      useTerminalStore.getState().setActiveSession(event.metadata.terminalId as string)
    }
  }, [setSwarmViewMode])

  return (
    <div
      className="shrink-0 flex flex-col"
      style={{
        height: collapsed ? 28 : 120,
        borderTop: '1px solid rgba(255,255,255,0.06)',
        background: 'rgba(0,0,0,0.4)',
        transition: 'height 0.2s ease',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 shrink-0 cursor-pointer select-none"
        style={{ height: 28 }}
        onClick={onToggleCollapse}
      >
        <div className="flex items-center gap-2">
          <Terminal className="w-3 h-3" style={{ color: 'rgba(255,255,255,0.3)' }} />
          <span style={{ fontSize: 9, fontFamily: 'monospace', fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
            SYSTEM LOG
          </span>
          <span style={{ fontSize: 9, fontFamily: 'monospace', color: 'rgba(255,255,255,0.15)', fontVariantNumeric: 'tabular-nums' }}>
            {logEvents.length}
          </span>
        </div>
        {collapsed ? (
          <ChevronUp className="w-3 h-3" style={{ color: 'rgba(255,255,255,0.2)' }} />
        ) : (
          <ChevronDown className="w-3 h-3" style={{ color: 'rgba(255,255,255,0.2)' }} />
        )}
      </div>

      {/* Log entries */}
      {!collapsed && (
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto custom-scrollbar"
          style={{ fontFamily: 'monospace', fontSize: 11 }}
        >
          {logEvents.map((event, i) => (
            <LogEntry key={`${event.timestamp}-${i}`} event={event} onClick={handleEventClick} />
          ))}

          {logEvents.length === 0 && (
            <div className="flex items-center justify-center h-full">
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.15)', fontFamily: 'monospace' }}>
                Waiting for agent activity...
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Log Entry Row ───────────────────────────────────────────

function LogEntry({ event, onClick }: { event: SwarmActivityEvent; onClick: (e: SwarmActivityEvent) => void }) {
  const time = new Date(event.timestamp).toLocaleTimeString([], {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })

  const roleDef = event.agentRole ? getRoleDef(event.agentRole as SwarmAgentRole) : null
  const Icon = EVENT_ICONS[event.type] || Terminal
  const color = EVENT_COLORS[event.type] || 'rgba(255,255,255,0.3)'

  return (
    <div
      className="flex items-baseline gap-2 px-3 hover:bg-white/[0.02] cursor-pointer transition-colors"
      style={{ padding: '2px 12px', lineHeight: '18px' }}
      onClick={() => onClick(event)}
    >
      {/* Timestamp */}
      <span style={{ color: 'rgba(255,255,255,0.15)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', flexShrink: 0, width: 64 }}>
        {time}
      </span>

      {/* Role dot */}
      {roleDef && (
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: roleDef.color, flexShrink: 0, marginTop: 1, display: 'inline-block' }} />
      )}

      {/* Agent name */}
      <span style={{
        color: 'rgba(255,255,255,0.4)',
        fontWeight: 600,
        textTransform: 'uppercase',
        fontSize: 9,
        letterSpacing: '0.05em',
        whiteSpace: 'nowrap',
        flexShrink: 0,
        width: 80,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}>
        {event.agentLabel || '—'}
      </span>

      {/* Event type icon */}
      <Icon className="w-3 h-3 shrink-0" style={{ color, marginTop: 1 }} />

      {/* Detail */}
      <span style={{
        color: event.type === 'error' ? '#ef4444' : 'rgba(255,255,255,0.45)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        flex: 1,
      }}>
        {event.detail}
      </span>
    </div>
  )
}
