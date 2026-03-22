// SwarmLiveTimeline — THE HERO: Real-time chronological agent communication feed
// Shows messages with avatars, action badges, expandable content, thread grouping

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowDown, Filter, MessageSquare, AlertTriangle,
  CheckCircle2, FileText, ClipboardList, Eye, Send,
  Star, ChevronDown, ChevronRight,
} from 'lucide-react'
import type { SwarmMessage, SwarmAgentRole } from '../../lib/swarm-types'
import { getRoleDef, SWARM_ROLES } from '../../lib/swarm-types'
import { RoleIcon } from './swarm-icons'

interface SwarmLiveTimelineProps {
  messages: SwarmMessage[]
  roster: { id: string; role: SwarmAgentRole; customName?: string }[]
  onSelectAgent: (label: string) => void
}

// ─── Message type styling ───────────────────────────────────

const TYPE_META: Record<string, { color: string; label: string }> = {
  message:           { color: 'rgba(255,255,255,0.4)', label: 'MSG' },
  status:            { color: '#38bdf8',   label: 'STATUS' },
  escalation:        { color: '#fb923c',   label: 'ESCALATION' },
  worker_done:       { color: '#34d399',   label: 'DONE' },
  assignment:        { color: '#60a5fa',   label: 'ASSIGN' },
  review_request:    { color: '#a78bfa',   label: 'REVIEW' },
  review_complete:   { color: '#34d399',   label: 'REVIEWED' },
  review_feedback:   { color: '#f87171',   label: 'FEEDBACK' },
  heartbeat:         { color: 'rgba(255,255,255,0.15)', label: 'HEARTBEAT' },
  interview:         { color: '#38bdf8',   label: 'INTERVIEW' },
  interview_response:{ color: '#34d399',   label: 'RESPONSE' },
  directive:         { color: '#fbbf24',   label: 'DIRECTIVE' },
}

// ─── Main Component ─────────────────────────────────────────

export function SwarmLiveTimeline({ messages, roster, onSelectAgent }: SwarmLiveTimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)
  const [showFilters, setShowFilters] = useState(false)
  const [hideHeartbeats, setHideHeartbeats] = useState(true)
  const [expandedMsgId, setExpandedMsgId] = useState<string | null>(null)

  // Build agent label → role lookup
  const agentRoleMap = useMemo(() => {
    const map = new Map<string, SwarmAgentRole>()
    roster.forEach((r) => {
      const roleDef = getRoleDef(r.role)
      const label = r.customName || `${roleDef.label} ${roster.filter(x => x.role === r.role).indexOf(r) + 1}`
      map.set(label, r.role)
    })
    return map
  }, [roster])

  // Filter messages
  const filteredMessages = useMemo(() => {
    let msgs = [...messages]
    if (hideHeartbeats) {
      msgs = msgs.filter((m) => m.type !== 'heartbeat')
    }
    return msgs.sort((a, b) => a.timestamp - b.timestamp)
  }, [messages, hideHeartbeats])

  // Split into static (all but last 3) and animated (last 3) for perf
  const staticMessages = useMemo(() => filteredMessages.slice(0, -3), [filteredMessages])
  const animatedMessages = useMemo(() => filteredMessages.slice(-3), [filteredMessages])

  // Auto-scroll
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [filteredMessages.length, autoScroll])

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
    setAutoScroll(scrollHeight - scrollTop - clientHeight < 30)
  }, [])

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
      setAutoScroll(true)
    }
  }, [])

  return (
    <div className="flex flex-col h-full" style={{ background: 'rgba(0,0,0,0.2)' }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 shrink-0 select-none"
        style={{ height: 32, borderBottom: '1px solid rgba(255,255,255,0.04)' }}
      >
        <div className="flex items-center gap-2">
          <MessageSquare className="w-3 h-3" style={{ color: '#38bdf8' }} />
          <span style={{ fontSize: 9, fontFamily: 'monospace', fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
            LIVE FEED
          </span>
          <span style={{ fontSize: 9, fontFamily: 'monospace', color: 'rgba(255,255,255,0.15)', fontVariantNumeric: 'tabular-nums' }}>
            {filteredMessages.length}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {!autoScroll && (
            <button
              onClick={scrollToBottom}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-sky-500/20 transition-colors"
              style={{ background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.2)', color: '#38bdf8', fontSize: 9, fontFamily: 'monospace', fontWeight: 700, cursor: 'pointer' }}
            >
              <ArrowDown className="w-2.5 h-2.5" /> LATEST
            </button>
          )}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center px-1.5 py-0.5 rounded transition-colors"
            style={{
              background: showFilters ? 'rgba(255,255,255,0.08)' : 'transparent',
              color: showFilters ? 'white' : 'rgba(255,255,255,0.3)',
              border: 'none', cursor: 'pointer',
            }}
          >
            <Filter className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Filter bar */}
      {showFilters && (
        <div className="flex items-center gap-2 px-3 py-1.5 shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
          <label className="flex items-center gap-1 cursor-pointer" style={{ fontSize: 9, fontFamily: 'monospace', color: 'rgba(255,255,255,0.3)' }}>
            <input
              type="checkbox"
              checked={hideHeartbeats}
              onChange={(e) => setHideHeartbeats(e.target.checked)}
              className="w-3 h-3"
            />
            HIDE HEARTBEATS
          </label>
        </div>
      )}

      {/* Message feed */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto custom-scrollbar"
      >
        {/* Static messages (no animation) */}
        {staticMessages.map((msg) => (
          <TimelineEntry
            key={msg.id || `${msg.timestamp}-${msg.from}`}
            message={msg}
            agentRoleMap={agentRoleMap}
            expanded={expandedMsgId === msg.id}
            onToggle={() => setExpandedMsgId(expandedMsgId === msg.id ? null : msg.id)}
            onSelectAgent={onSelectAgent}
          />
        ))}

        {/* Animated messages (last 3) */}
        <AnimatePresence initial={false}>
          {animatedMessages.map((msg) => (
            <motion.div
              key={msg.id || `${msg.timestamp}-${msg.from}-anim`}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.15 }}
            >
              <TimelineEntry
                message={msg}
                agentRoleMap={agentRoleMap}
                expanded={expandedMsgId === msg.id}
                onToggle={() => setExpandedMsgId(expandedMsgId === msg.id ? null : msg.id)}
                onSelectAgent={onSelectAgent}
              />
            </motion.div>
          ))}
        </AnimatePresence>

        {filteredMessages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <MessageSquare className="w-5 h-5" style={{ color: 'rgba(255,255,255,0.1)' }} />
            <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'rgba(255,255,255,0.15)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Waiting for agent communications...
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Timeline Entry ─────────────────────────────────────────

function TimelineEntry({ message, agentRoleMap, expanded, onToggle, onSelectAgent }: {
  message: SwarmMessage
  agentRoleMap: Map<string, SwarmAgentRole>
  expanded: boolean
  onToggle: () => void
  onSelectAgent: (label: string) => void
}) {
  const typeMeta = TYPE_META[message.type] || TYPE_META.message
  const fromRole = agentRoleMap.get(message.from || '')
  const fromRoleDef = fromRole ? getRoleDef(fromRole) : null
  const isUrgent = message.priority === 'urgent'
  const time = new Date(message.timestamp).toLocaleTimeString([], {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })

  const bodyTruncated = message.body.length > 120 && !expanded
  const displayBody = bodyTruncated ? message.body.slice(0, 120) + '...' : message.body

  return (
    <div
      className="flex gap-2 px-3 py-1.5 hover:bg-white/[0.02] transition-colors cursor-pointer"
      style={{
        borderBottom: '1px solid rgba(255,255,255,0.02)',
        borderLeft: isUrgent ? '2px solid #fb923c' : '2px solid transparent',
      }}
      onClick={onToggle}
    >
      {/* Avatar */}
      <div
        className="flex items-center justify-center shrink-0 mt-0.5"
        style={{
          width: 24,
          height: 24,
          borderRadius: '50%',
          background: fromRoleDef ? `${fromRoleDef.color}15` : 'rgba(255,255,255,0.04)',
          border: `1.5px solid ${fromRoleDef ? `${fromRoleDef.color}40` : 'rgba(255,255,255,0.08)'}`,
        }}
      >
        {fromRoleDef ? (
          <RoleIcon iconName={fromRoleDef.icon} className="w-3 h-3" color={fromRoleDef.color} />
        ) : (
          <span style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.4)' }}>
            {(message.from || '?')[0].toUpperCase()}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Header row */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* From */}
          <span
            className="cursor-pointer hover:underline"
            style={{ fontSize: 11, fontWeight: 600, color: fromRoleDef?.color || 'rgba(255,255,255,0.6)' }}
            onClick={(e) => { e.stopPropagation(); if (message.from) onSelectAgent(message.from) }}
          >
            {message.from || 'System'}
          </span>

          {/* Arrow + To */}
          {message.to && (
            <>
              <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.15)' }}>→</span>
              <span
                className="cursor-pointer hover:underline"
                style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}
                onClick={(e) => { e.stopPropagation(); if (message.to) onSelectAgent(message.to) }}
              >
                {message.to}
              </span>
            </>
          )}

          {/* Type badge */}
          <span
            style={{
              fontSize: 8,
              fontFamily: 'monospace',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              padding: '1px 5px',
              borderRadius: 2,
              background: `${typeMeta.color}15`,
              color: typeMeta.color,
            }}
          >
            {typeMeta.label}
          </span>

          {/* Urgent badge */}
          {isUrgent && (
            <span style={{ fontSize: 8, fontFamily: 'monospace', fontWeight: 700, color: '#fb923c', textTransform: 'uppercase' }}>
              URGENT
            </span>
          )}

          {/* Timestamp */}
          <span className="ml-auto" style={{ fontSize: 9, fontFamily: 'monospace', color: 'rgba(255,255,255,0.15)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
            {time}
          </span>
        </div>

        {/* Body */}
        <div style={{
          fontSize: 11,
          color: 'rgba(255,255,255,0.5)',
          lineHeight: '1.4',
          marginTop: 2,
          wordBreak: 'break-word',
          ...(expanded ? {} : { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' }),
        }}>
          {displayBody}
        </div>

        {/* Expanded metadata */}
        {expanded && (
          <div className="flex items-center gap-3 mt-1.5" style={{ fontSize: 9, fontFamily: 'monospace', color: 'rgba(255,255,255,0.2)' }}>
            {message.threadId && <span>Thread: {message.threadId.slice(0, 8)}</span>}
            {message.replyTo && <span>Reply to: {message.replyTo.slice(0, 8)}</span>}
          </div>
        )}
      </div>
    </div>
  )
}
