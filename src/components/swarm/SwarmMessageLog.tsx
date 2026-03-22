import { useRef, useEffect, useMemo, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MessageSquare, ArrowRight, AlertTriangle, CheckCircle2, Radio, FileCheck, ClipboardCheck, MessageCircle, Heart } from 'lucide-react'
import type { SwarmMessage, SwarmRosterAgent } from '../../lib/swarm-types'
import { SWARM_ROLES, getRoleDef } from '../../lib/swarm-types'

// ─── Message Type Colors ─────────────────────────────────────

interface TypeMeta {
  color: string
  icon: React.FC<{ className?: string }>
}

const MSG_TYPE_MAP: Record<SwarmMessage['type'], TypeMeta> = {
  message: { color: 'text-ghost-text-dim/60', icon: MessageSquare },
  status: { color: 'text-blue-400/70', icon: Radio },
  escalation: { color: 'text-amber-400', icon: AlertTriangle },
  worker_done: { color: 'text-emerald-400', icon: CheckCircle2 },
  assignment: { color: 'text-blue-400', icon: FileCheck },
  review_request: { color: 'text-violet-400', icon: ClipboardCheck },
  review_complete: { color: 'text-emerald-400', icon: CheckCircle2 },
  review_feedback: { color: 'text-rose-400', icon: MessageCircle },
  heartbeat: { color: 'text-gray-400/40', icon: Heart },
  interview: { color: 'text-sky-400', icon: MessageCircle },
  interview_response: { color: 'text-emerald-400', icon: MessageCircle },
}

// ─── Format Timestamp ────────────────────────────────────────

function formatTime(ts: number): string {
  const d = new Date(ts)
  const h = d.getHours().toString().padStart(2, '0')
  const m = d.getMinutes().toString().padStart(2, '0')
  const s = d.getSeconds().toString().padStart(2, '0')
  return `${h}:${m}:${s}`
}

// ─── Role Color Resolver ─────────────────────────────────────

function agentNameToRoleColor(name: string, roster?: SwarmRosterAgent[]): string {
  if (name === '@all') return '#38bdf8'
  if (name === '@operator') return '#f59e0b'
  for (const def of SWARM_ROLES) {
    if (name.toLowerCase().startsWith(def.label.toLowerCase())) return def.color
  }
  if (roster) {
    for (const agent of roster) {
      if (agent.customName === name) return getRoleDef(agent.role).color
    }
  }
  return '#6b7280'
}

// ─── Message Row ─────────────────────────────────────────────

function MessageRow({ message, roster }: { message: SwarmMessage; roster?: SwarmRosterAgent[] }) {
  const meta = MSG_TYPE_MAP[message.type] || MSG_TYPE_MAP.message
  const TypeIcon = meta.icon
  const fromColor = agentNameToRoleColor(message.from, roster)
  const toColor = agentNameToRoleColor(message.to, roster)

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-start gap-2.5 px-4 py-2 hover:bg-white/[0.015] transition-colors"
    >
      <TypeIcon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${meta.color}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <div className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: fromColor }} />
            <span className="text-xs font-medium" style={{ color: fromColor + 'cc' }}>{message.from}</span>
          </div>
          <ArrowRight className="w-3 h-3 text-ghost-text-dim/30" />
          <div className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: toColor }} />
            <span className="text-xs" style={{ color: toColor + '99' }}>{message.to}</span>
          </div>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/[0.04] text-ghost-text-dim/40 font-mono uppercase tracking-wider shrink-0">
            {message.type.replace('_', ' ')}
          </span>
          <span className="text-xs text-ghost-text-dim/30 tabular-nums ml-auto shrink-0">
            {formatTime(message.timestamp)}
          </span>
        </div>
        <p className="text-xs text-ghost-text-dim/70 mt-0.5 break-words leading-relaxed">
          {message.body}
        </p>
      </div>
    </motion.div>
  )
}

// ─── Message Log ─────────────────────────────────────────────

interface SwarmMessageLogProps {
  messages: SwarmMessage[]
  roster?: SwarmRosterAgent[]
}

export function SwarmMessageLog({ messages, roster }: SwarmMessageLogProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [roleFilter, setRoleFilter] = useState<string | null>(null)

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages.length])

  // Compute communication summary (who sends to whom)
  const { filteredMessages, flowSummary } = useMemo(() => {
    const flows = new Map<string, number>()
    for (const m of messages) {
      const key = `${m.from} → ${m.to}`
      flows.set(key, (flows.get(key) || 0) + 1)
    }
    const flowSummary = Array.from(flows.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([key, count]) => ({ key, count }))

    // Apply role filter
    let filtered = messages
    if (roleFilter) {
      filtered = messages.filter(m => {
        const fromMatch = m.from.toLowerCase().startsWith(roleFilter.toLowerCase())
        const toMatch = m.to.toLowerCase().startsWith(roleFilter.toLowerCase())
        return fromMatch || toMatch
      })
    }
    return { filteredMessages: filtered, flowSummary }
  }, [messages, roleFilter])

  const toggleFilter = useCallback((role: string) => {
    setRoleFilter(prev => prev === role ? null : role)
  }, [])

  return (
    <div className="ghost-section-card rounded-xl flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.04]">
        <MessageSquare className="w-4 h-4 text-ghost-text-dim/60" />
        <h3 className="text-xs font-semibold text-ghost-text uppercase tracking-[0.15em]">Messages</h3>
        <span className="ml-auto text-xs text-ghost-text-dim/40 tabular-nums">
          {filteredMessages.length}{roleFilter ? `/${messages.length}` : ''}
        </span>
      </div>

      {/* Role filter strip */}
      {messages.length > 0 && (
        <div className="flex items-center gap-1.5 px-4 py-2 border-b border-white/[0.03]">
          <span className="text-[9px] text-white/25 font-mono uppercase tracking-widest mr-1">Filter:</span>
          {SWARM_ROLES.slice(0, 4).map(r => {
            const isActive = roleFilter === r.label
            return (
              <button
                key={r.id}
                onClick={() => toggleFilter(r.label)}
                className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono uppercase tracking-wider transition-colors ${
                  isActive
                    ? 'bg-white/[0.08] border border-white/10'
                    : 'text-white/25 hover:text-white/50 border border-transparent'
                }`}
                style={isActive ? { color: r.color } : undefined}
              >
                <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: r.color, opacity: isActive ? 1 : 0.4 }} />
                {r.label}
              </button>
            )
          })}
          {roleFilter && (
            <button
              onClick={() => setRoleFilter(null)}
              className="text-[9px] font-mono text-white/30 hover:text-white/60 ml-1"
            >
              clear
            </button>
          )}
        </div>
      )}

      {/* Top communication flows */}
      {flowSummary.length > 0 && !roleFilter && (
        <div className="flex items-center gap-2 px-4 py-1.5 flex-wrap">
          {flowSummary.map(({ key, count }) => (
            <span key={key} className="text-[9px] font-mono text-white/20">
              {key} ({count})
            </span>
          ))}
        </div>
      )}

      {/* Message List */}
      <div
        ref={scrollRef}
        className="flex flex-col py-1 max-h-64 overflow-y-auto sidebar-scroll"
      >
        {filteredMessages.length === 0 ? (
          <p className="text-xs text-ghost-text-dim/40 text-center py-6">
            {roleFilter ? 'No messages for this role' : 'No messages yet'}
          </p>
        ) : (
          <AnimatePresence>
            {filteredMessages.map((msg) => (
              <MessageRow key={msg.id} message={msg} roster={roster} />
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  )
}
