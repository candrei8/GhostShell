import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  FileText, Code2, Terminal as TerminalIcon, Search, AlertCircle,
  Brain, MessageSquare, GitBranch, CheckCircle, Zap, Filter, X,
  ChevronDown,
} from 'lucide-react'
import { useSwarmStore } from '../../stores/swarmStore'
import { useTerminalStore } from '../../stores/terminalStore'
import type { SwarmActivityEvent, SwarmActivityEventType, SwarmAgentRole } from '../../lib/swarm-types'
import { getRoleDef } from '../../lib/swarm-types'

// ─── Event type config ────────────────────────────────────────

interface EventTypeMeta {
  icon: React.ComponentType<{ className?: string }>
  label: string
  color: string
}

const EVENT_TYPE_META: Record<SwarmActivityEventType, EventTypeMeta> = {
  file_read:          { icon: FileText,      label: 'File Read',       color: 'text-white/40' },
  file_write:         { icon: Code2,         label: 'File Write',      color: 'text-sky-400' },
  file_edit:          { icon: Code2,         label: 'File Edit',       color: 'text-amber-400' },
  command_run:        { icon: TerminalIcon,  label: 'Command',         color: 'text-emerald-400' },
  search:             { icon: Search,        label: 'Search',          color: 'text-blue-400' },
  error:              { icon: AlertCircle,   label: 'Error',           color: 'text-rose-400' },
  thinking:           { icon: Brain,         label: 'Thinking',        color: 'text-white/30' },
  tool_call:          { icon: Zap,           label: 'Tool Call',       color: 'text-violet-400' },
  message_sent:       { icon: MessageSquare, label: 'Msg Sent',        color: 'text-sky-400' },
  message_received:   { icon: MessageSquare, label: 'Msg Received',    color: 'text-emerald-400' },
  task_created:       { icon: GitBranch,     label: 'Task Created',    color: 'text-amber-400' },
  task_status_change: { icon: GitBranch,     label: 'Task Update',     color: 'text-blue-400' },
  subagent_spawn:     { icon: CheckCircle,   label: 'Subagent Spawn',  color: 'text-violet-400' },
  subagent_complete:  { icon: CheckCircle,   label: 'Subagent Done',   color: 'text-emerald-400' },
  review_submit:      { icon: CheckCircle,   label: 'Review',          color: 'text-purple-400' },
}

// ─── Helpers ──────────────────────────────────────────────────

function formatTime(ts: number): string {
  const d = new Date(ts)
  const h = d.getHours().toString().padStart(2, '0')
  const m = d.getMinutes().toString().padStart(2, '0')
  const s = d.getSeconds().toString().padStart(2, '0')
  return `${h}:${m}:${s}`
}

function truncateDetail(detail: string, max = 60): string {
  if (!detail) return ''
  // If it's a file path, show just the filename with parent
  if (detail.includes('/') || detail.includes('\\')) {
    const parts = detail.replace(/\\/g, '/').split('/')
    if (parts.length > 2) {
      return `.../${parts.slice(-2).join('/')}`
    }
  }
  if (detail.length <= max) return detail
  return detail.slice(0, max - 3) + '...'
}

// ─── Filter types ─────────────────────────────────────────────

const ROLE_FILTERS: SwarmAgentRole[] = ['coordinator', 'builder', 'scout', 'reviewer', 'analyst', 'custom']

const EVENT_TYPE_GROUPS: { label: string; types: SwarmActivityEventType[] }[] = [
  { label: 'Files',     types: ['file_read', 'file_write', 'file_edit'] },
  { label: 'Commands',  types: ['command_run', 'tool_call'] },
  { label: 'Search',    types: ['search'] },
  { label: 'Tasks',     types: ['task_created', 'task_status_change'] },
  { label: 'Subagents', types: ['subagent_spawn', 'subagent_complete'] },
  { label: 'Messages',  types: ['message_sent', 'message_received'] },
  { label: 'Other',     types: ['thinking', 'error', 'review_submit'] },
]

// ─── Event Row ────────────────────────────────────────────────

/** Static event row — no animation, used for all but the last few events */
const StaticEventRow = React.memo(function StaticEventRow({
  event,
  onJumpToAgent,
}: {
  event: SwarmActivityEvent
  onJumpToAgent: (event: SwarmActivityEvent) => void
}) {
  const meta = EVENT_TYPE_META[event.type]
  const roleDef = getRoleDef(event.agentRole)
  const Icon = meta.icon

  return (
    <button
      onClick={() => onJumpToAgent(event)}
      className="w-full flex items-center gap-2 px-2 py-1 rounded hover:bg-white/[0.04] transition-colors text-left group cursor-pointer"
      title={`${event.agentLabel} — ${meta.label}: ${event.detail || '(no detail)'}\nClick to jump to agent terminal`}
    >
      <span className="text-[10px] font-mono text-white/25 tabular-nums shrink-0 w-[52px]">
        {formatTime(event.timestamp)}
      </span>
      <span
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{ backgroundColor: roleDef.color }}
      />
      <span
        className="text-[10px] font-semibold shrink-0 w-[72px] truncate"
        style={{ color: roleDef.color }}
      >
        {event.agentLabel}
      </span>
      <Icon className={`w-3 h-3 shrink-0 ${meta.color}`} />
      <span className="text-[10px] text-white/50 truncate min-w-0 flex-1 group-hover:text-white/70 transition-colors">
        {truncateDetail(event.detail) || meta.label}
      </span>
    </button>
  )
})

/** Animated event row — entrance animation, only used for the last few events */
function AnimatedEventRow({
  event,
  onJumpToAgent,
}: {
  event: SwarmActivityEvent
  onJumpToAgent: (event: SwarmActivityEvent) => void
}) {
  const meta = EVENT_TYPE_META[event.type]
  const roleDef = getRoleDef(event.agentRole)
  const Icon = meta.icon

  return (
    <motion.button
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.15 }}
      onClick={() => onJumpToAgent(event)}
      className="w-full flex items-center gap-2 px-2 py-1 rounded hover:bg-white/[0.04] transition-colors text-left group cursor-pointer"
      title={`${event.agentLabel} — ${meta.label}: ${event.detail || '(no detail)'}\nClick to jump to agent terminal`}
    >
      <span className="text-[10px] font-mono text-white/25 tabular-nums shrink-0 w-[52px]">
        {formatTime(event.timestamp)}
      </span>
      <span
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{ backgroundColor: roleDef.color }}
      />
      <span
        className="text-[10px] font-semibold shrink-0 w-[72px] truncate"
        style={{ color: roleDef.color }}
      >
        {event.agentLabel}
      </span>
      <Icon className={`w-3 h-3 shrink-0 ${meta.color}`} />
      <span className="text-[10px] text-white/50 truncate min-w-0 flex-1 group-hover:text-white/70 transition-colors">
        {truncateDetail(event.detail) || meta.label}
      </span>
    </motion.button>
  )
}

/** Number of most-recent events that get entrance animation */
const ANIMATED_TAIL = 3

// ─── Summary Stats ────────────────────────────────────────────

function FeedStats({ events }: { events: SwarmActivityEvent[] }) {
  const stats = useMemo(() => {
    let filesEdited = 0
    let commandsRun = 0
    let searches = 0
    let errors = 0

    for (const e of events) {
      if (e.type === 'file_write' || e.type === 'file_edit') filesEdited++
      else if (e.type === 'command_run') commandsRun++
      else if (e.type === 'search') searches++
      else if (e.type === 'error') errors++
    }
    return { filesEdited, commandsRun, searches, errors }
  }, [events])

  return (
    <div className="flex items-center gap-3 px-2 py-1.5 border-t border-white/[0.06]">
      <StatPill label="files" count={stats.filesEdited} color="text-sky-400" />
      <StatPill label="cmds" count={stats.commandsRun} color="text-emerald-400" />
      <StatPill label="search" count={stats.searches} color="text-blue-400" />
      {stats.errors > 0 && <StatPill label="errors" count={stats.errors} color="text-rose-400" />}
    </div>
  )
}

function StatPill({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={`text-[10px] font-bold tabular-nums ${color}`}>{count}</span>
      <span className="text-[9px] text-white/30 uppercase tracking-wider">{label}</span>
    </span>
  )
}

// ─── Main Component ───────────────────────────────────────────

interface SwarmActivityFeedProps {
  swarmId: string
}

export function SwarmActivityFeed({ swarmId }: SwarmActivityFeedProps) {
  const activityFeed = useSwarmStore((s) => s.activityFeed)
  const swarms = useSwarmStore((s) => s.swarms)
  const setActiveSession = useTerminalStore((s) => s.setActiveSession)

  const [showFilters, setShowFilters] = useState(false)
  const [enabledRoles, setEnabledRoles] = useState<Set<SwarmAgentRole>>(new Set(ROLE_FILTERS))
  const [excludedTypes, setExcludedTypes] = useState<Set<SwarmActivityEventType>>(new Set(['thinking']))
  const [autoScroll, setAutoScroll] = useState(true)

  const scrollRef = useRef<HTMLDivElement>(null)
  const prevCountRef = useRef(0)

  // Filter events for this swarm
  const swarmEvents = useMemo(
    () => activityFeed.filter((e) => e.swarmId === swarmId),
    [activityFeed, swarmId],
  )

  // Apply role + type filters
  const filteredEvents = useMemo(
    () =>
      swarmEvents.filter(
        (e) => enabledRoles.has(e.agentRole) && !excludedTypes.has(e.type),
      ),
    [swarmEvents, enabledRoles, excludedTypes],
  )

  // Auto-scroll to bottom when new events arrive
  useEffect(() => {
    if (autoScroll && scrollRef.current && filteredEvents.length > prevCountRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
    prevCountRef.current = filteredEvents.length
  }, [filteredEvents.length, autoScroll])

  // Detect if user scrolled away from bottom
  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
    const atBottom = scrollHeight - scrollTop - clientHeight < 24
    setAutoScroll(atBottom)
  }, [])

  // Jump to agent terminal
  const handleJumpToAgent = useCallback(
    (event: SwarmActivityEvent) => {
      const swarm = swarms.find((s) => s.id === event.swarmId)
      if (!swarm) return
      const agentState = swarm.agents.find((a) => {
        const rosterAgent = swarm.config.roster.find((r) => r.id === a.rosterId)
        if (!rosterAgent) return false
        const sameRole = swarm.config.roster.filter((r) => r.role === rosterAgent.role)
        const roleIdx = sameRole.indexOf(rosterAgent)
        const label =
          rosterAgent.customName ||
          `${rosterAgent.role.charAt(0).toUpperCase() + rosterAgent.role.slice(1)} ${roleIdx + 1}`
        return label === event.agentLabel
      })
      if (agentState?.terminalId) {
        setActiveSession(agentState.terminalId)
      }
    },
    [swarms, setActiveSession],
  )

  // Toggle role filter
  const toggleRole = useCallback((role: SwarmAgentRole) => {
    setEnabledRoles((prev) => {
      const next = new Set(prev)
      if (next.has(role)) next.delete(role)
      else next.add(role)
      return next
    })
  }, [])

  // Toggle event type group
  const toggleTypeGroup = useCallback((types: SwarmActivityEventType[]) => {
    setExcludedTypes((prev) => {
      const next = new Set(prev)
      const allExcluded = types.every((t) => next.has(t))
      if (allExcluded) {
        types.forEach((t) => next.delete(t))
      } else {
        types.forEach((t) => next.add(t))
      }
      return next
    })
  }, [])

  return (
    <div className="bg-white/[0.03] backdrop-blur-md border border-white/[0.06] rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/[0.06]">
        <Zap className="w-3.5 h-3.5 text-sky-400" />
        <h3 className="text-xs font-semibold text-ghost-text uppercase tracking-[0.12em]">
          Activity Feed
        </h3>
        <span className="text-[10px] text-white/30 font-mono tabular-nums">
          {filteredEvents.length}
          {filteredEvents.length !== swarmEvents.length && (
            <span className="text-white/20">/{swarmEvents.length}</span>
          )}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          {!autoScroll && (
            <button
              onClick={() => {
                setAutoScroll(true)
                if (scrollRef.current) {
                  scrollRef.current.scrollTop = scrollRef.current.scrollHeight
                }
              }}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] text-sky-400 bg-sky-400/10 hover:bg-sky-400/20 transition-colors"
            >
              <ChevronDown className="w-2.5 h-2.5" />
              Latest
            </button>
          )}
          <button
            onClick={() => setShowFilters((p) => !p)}
            className={`p-1 rounded transition-colors ${
              showFilters
                ? 'bg-sky-400/15 text-sky-400'
                : 'text-white/30 hover:text-white/60 hover:bg-white/[0.04]'
            }`}
            title="Toggle filters"
          >
            {showFilters ? <X className="w-3.5 h-3.5" /> : <Filter className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden border-b border-white/[0.06]"
          >
            <div className="px-3 py-2 flex flex-col gap-2">
              {/* Role filters */}
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] text-white/30 uppercase tracking-wider w-10 shrink-0">Roles</span>
                <div className="flex flex-wrap gap-1">
                  {ROLE_FILTERS.map((role) => {
                    const def = getRoleDef(role)
                    const active = enabledRoles.has(role)
                    return (
                      <button
                        key={role}
                        onClick={() => toggleRole(role)}
                        className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium transition-colors border ${
                          active
                            ? 'border-white/10 bg-white/[0.06]'
                            : 'border-transparent bg-white/[0.02] opacity-40'
                        }`}
                        style={{ color: active ? def.color : undefined }}
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ backgroundColor: def.color, opacity: active ? 1 : 0.3 }}
                        />
                        {def.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Event type filters */}
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] text-white/30 uppercase tracking-wider w-10 shrink-0">Types</span>
                <div className="flex flex-wrap gap-1">
                  {EVENT_TYPE_GROUPS.map((group) => {
                    const allExcluded = group.types.every((t) => excludedTypes.has(t))
                    return (
                      <button
                        key={group.label}
                        onClick={() => toggleTypeGroup(group.types)}
                        className={`px-1.5 py-0.5 rounded text-[9px] font-medium transition-colors border ${
                          !allExcluded
                            ? 'border-white/10 bg-white/[0.06] text-white/60'
                            : 'border-transparent bg-white/[0.02] text-white/20'
                        }`}
                      >
                        {group.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Event List */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="overflow-y-auto max-h-[400px] min-h-[120px]"
      >
        {filteredEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 gap-2">
            <Zap className="w-5 h-5 text-white/10" />
            <p className="text-[10px] text-white/25">
              {swarmEvents.length === 0
                ? 'No activity yet — waiting for agents...'
                : 'All events filtered out'}
            </p>
          </div>
        ) : (
          <div className="py-1">
            {/* Static rows for all but the last few — no animation overhead */}
            {filteredEvents.length > ANIMATED_TAIL &&
              filteredEvents.slice(0, -ANIMATED_TAIL).map((event) => (
                <StaticEventRow
                  key={event.id}
                  event={event}
                  onJumpToAgent={handleJumpToAgent}
                />
              ))}
            {/* Animated entrance for the last few events only */}
            <AnimatePresence initial={false}>
              {filteredEvents.slice(-ANIMATED_TAIL).map((event) => (
                <AnimatedEventRow
                  key={event.id}
                  event={event}
                  onJumpToAgent={handleJumpToAgent}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Summary Stats */}
      {swarmEvents.length > 0 && <FeedStats events={swarmEvents} />}
    </div>
  )
}

export default SwarmActivityFeed
