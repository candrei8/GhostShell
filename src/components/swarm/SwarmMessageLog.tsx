import { useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MessageSquare, ArrowRight, AlertTriangle, CheckCircle2, Radio } from 'lucide-react'
import type { SwarmMessage } from '../../lib/swarm-types'

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
}

// ─── Format Timestamp ────────────────────────────────────────

function formatTime(ts: number): string {
  const d = new Date(ts)
  const h = d.getHours().toString().padStart(2, '0')
  const m = d.getMinutes().toString().padStart(2, '0')
  const s = d.getSeconds().toString().padStart(2, '0')
  return `${h}:${m}:${s}`
}

// ─── Message Row ─────────────────────────────────────────────

function MessageRow({ message }: { message: SwarmMessage }) {
  const meta = MSG_TYPE_MAP[message.type] || MSG_TYPE_MAP.message
  const TypeIcon = meta.icon

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-start gap-2.5 px-4 py-2 hover:bg-white/[0.015] transition-colors"
    >
      <TypeIcon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${meta.color}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-medium text-ghost-text">{message.from}</span>
          <ArrowRight className="w-3 h-3 text-ghost-text-dim/30" />
          <span className="text-xs text-ghost-text-dim/60">{message.to}</span>
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
}

export function SwarmMessageLog({ messages }: SwarmMessageLogProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages.length])

  return (
    <div className="ghost-section-card rounded-xl flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.04]">
        <MessageSquare className="w-4 h-4 text-ghost-text-dim/60" />
        <h3 className="text-xs font-semibold text-ghost-text uppercase tracking-[0.15em]">Messages</h3>
        <span className="ml-auto text-xs text-ghost-text-dim/40 tabular-nums">
          {messages.length}
        </span>
      </div>

      {/* Message List */}
      <div
        ref={scrollRef}
        className="flex flex-col py-1 max-h-64 overflow-y-auto sidebar-scroll"
      >
        {messages.length === 0 ? (
          <p className="text-xs text-ghost-text-dim/40 text-center py-6">No messages yet</p>
        ) : (
          <AnimatePresence>
            {messages.map((msg) => (
              <MessageRow key={msg.id} message={msg} />
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  )
}
