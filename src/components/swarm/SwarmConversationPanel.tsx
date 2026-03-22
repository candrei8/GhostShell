// SwarmConversationPanel — Agent-pair conversation viewer
// Shows all messages exchanged between two agents, sorted by time
// Rendered in the right panel when an edge is clicked in the graph

import { useRef, useEffect, useMemo } from 'react'
import { X, ArrowRight, ArrowLeft } from 'lucide-react'
import type { SwarmMessage } from '../../lib/swarm-types'

// ─── Types ──────────────────────────────────────────────────

interface AgentInfo {
  rosterId: string
  label: string
  role: string
  color: string
}

interface SwarmConversationPanelProps {
  agentA: AgentInfo
  agentB: AgentInfo
  messages: SwarmMessage[]
  onClose: () => void
}

const TYPE_META: Record<string, { label: string; color: string }> = {
  message:            { label: 'MSG',     color: '#94a3b8' },
  status:             { label: 'STATUS',  color: '#38bdf8' },
  escalation:         { label: 'ESCAL',   color: '#f59e0b' },
  assignment:         { label: 'ASSIGN',  color: '#3b82f6' },
  worker_done:        { label: 'DONE',    color: '#10b981' },
  review_request:     { label: 'REV-REQ', color: '#8b5cf6' },
  review_complete:    { label: 'REV-OK',  color: '#10b981' },
  review_feedback:    { label: 'REV-FB',  color: '#f43f5e' },
  heartbeat:          { label: 'HB',      color: '#475569' },
  interview:          { label: 'INTV',    color: '#38bdf8' },
  interview_response: { label: 'INTV-R',  color: '#10b981' },
}

// ─── Component ──────────────────────────────────────────────

export function SwarmConversationPanel({
  agentA, agentB, messages, onClose,
}: SwarmConversationPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  // Filter messages between the two agents (bidirectional)
  const conversation = useMemo(() => {
    return messages
      .filter((m) =>
        (m.from === agentA.label && m.to === agentB.label) ||
        (m.from === agentB.label && m.to === agentA.label),
      )
      .sort((a, b) => a.timestamp - b.timestamp)
  }, [messages, agentA.label, agentB.label])

  // Summary stats
  const stats = useMemo(() => {
    const aToB = conversation.filter((m) => m.from === agentA.label).length
    const bToA = conversation.length - aToB
    const types = new Set(conversation.map((m) => m.type))
    return { total: conversation.length, aToB, bToA, typeCount: types.size }
  }, [conversation, agentA.label])

  // Type breakdown for summary
  const typeBreakdown = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const msg of conversation) {
      counts[msg.type] = (counts[msg.type] || 0) + 1
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1])
  }, [conversation])

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [conversation.length])

  return (
    <div
      className="flex flex-col"
      style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', maxHeight: 420 }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2 shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            style={{
              width: 6, height: 6, borderRadius: '50%',
              background: agentA.color, flexShrink: 0,
            }}
          />
          <span className="text-[10px] font-bold text-white truncate">{agentA.label}</span>
          <span className="text-[10px] text-white/20">↔</span>
          <span
            style={{
              width: 6, height: 6, borderRadius: '50%',
              background: agentB.color, flexShrink: 0,
            }}
          />
          <span className="text-[10px] font-bold text-white truncate">{agentB.label}</span>
        </div>
        <button
          onClick={onClose}
          className="p-0.5 hover:bg-white/10 rounded transition-colors"
          style={{ cursor: 'pointer' }}
        >
          <X className="w-3 h-3 text-white/40" />
        </button>
      </div>

      {/* Summary bar */}
      <div
        className="flex items-center gap-3 px-3 py-1.5 shrink-0 flex-wrap"
        style={{
          background: 'rgba(255,255,255,0.02)',
          borderBottom: '1px solid rgba(255,255,255,0.04)',
        }}
      >
        <span className="text-[9px] font-mono text-white/40">{stats.total} msg</span>
        <span className="text-[9px] font-mono" style={{ color: agentA.color }}>
          {stats.aToB}→
        </span>
        <span className="text-[9px] font-mono" style={{ color: agentB.color }}>
          ←{stats.bToA}
        </span>
      </div>

      {/* Type breakdown mini-bar */}
      {typeBreakdown.length > 0 && (
        <div
          className="flex items-center gap-2 px-3 py-1 shrink-0 flex-wrap"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}
        >
          {typeBreakdown.slice(0, 5).map(([type, count]) => {
            const meta = TYPE_META[type] || TYPE_META.message
            return (
              <span
                key={type}
                className="text-[8px] font-mono px-1 py-px rounded"
                style={{ background: `${meta.color}12`, color: meta.color }}
              >
                {meta.label} {count}
              </span>
            )
          })}
        </div>
      )}

      {/* Messages list */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto custom-scrollbar min-h-0"
      >
        {conversation.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <span className="text-[10px] text-white/15 font-mono">Sin mensajes directos</span>
          </div>
        ) : (
          <div className="flex flex-col">
            {conversation.map((msg, i) => {
              const isFromA = msg.from === agentA.label
              const senderColor = isFromA ? agentA.color : agentB.color
              const meta = TYPE_META[msg.type] || TYPE_META.message
              const time = new Date(msg.timestamp).toLocaleTimeString('es-ES', {
                hour: '2-digit', minute: '2-digit', second: '2-digit',
              })

              return (
                <div
                  key={msg.id || i}
                  className="px-3 py-1.5 hover:bg-white/[0.02] transition-colors"
                  style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}
                >
                  {/* Direction + Type + Time */}
                  <div className="flex items-center gap-1.5 mb-0.5">
                    {isFromA ? (
                      <ArrowRight className="w-2.5 h-2.5 shrink-0" style={{ color: senderColor }} />
                    ) : (
                      <ArrowLeft className="w-2.5 h-2.5 shrink-0" style={{ color: senderColor }} />
                    )}
                    <span
                      className="text-[8px] font-mono font-bold uppercase px-1 py-px rounded shrink-0"
                      style={{
                        background: `${meta.color}15`,
                        color: meta.color,
                        letterSpacing: '0.05em',
                      }}
                    >
                      {meta.label}
                    </span>
                    <span className="text-[9px] font-mono truncate" style={{ color: senderColor }}>
                      {msg.from}
                    </span>
                    <span className="text-[8px] font-mono text-white/20 ml-auto shrink-0">
                      {time}
                    </span>
                  </div>
                  {/* Body */}
                  {msg.body && (
                    <div
                      className="text-[10px] text-white/50 font-mono leading-relaxed pl-4"
                      style={{ wordBreak: 'break-word' }}
                    >
                      {msg.body.length > 400 ? msg.body.slice(0, 400) + '...' : msg.body}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
