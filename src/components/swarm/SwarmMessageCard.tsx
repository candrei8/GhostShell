import React, { useMemo } from 'react'
import type { SwarmMessage } from '../../lib/swarm-types'

// ─── Type Color Map ─────────────────────────────────────────

interface TypeMeta {
  label: string
  badgeBg: string
  badgeText: string
  barColor: string
}

const TYPE_MAP: Record<SwarmMessage['type'], TypeMeta> = {
  message: {
    label: 'MSG',
    badgeBg: 'bg-ghost-text-dim/10',
    badgeText: 'text-ghost-text-dim',
    barColor: 'bg-ghost-text-dim/40',
  },
  status: {
    label: 'STATUS',
    badgeBg: 'bg-sky-400/10',
    badgeText: 'text-sky-400',
    barColor: 'bg-sky-400',
  },
  escalation: {
    label: 'ESCALATION',
    badgeBg: 'bg-amber-400/10',
    badgeText: 'text-amber-400',
    barColor: 'bg-amber-400',
  },
  worker_done: {
    label: 'DONE',
    badgeBg: 'bg-emerald-400/10',
    badgeText: 'text-emerald-400',
    barColor: 'bg-emerald-400',
  },
  assignment: {
    label: 'ASSIGN',
    badgeBg: 'bg-blue-400/10',
    badgeText: 'text-blue-400',
    barColor: 'bg-blue-400',
  },
  review_request: {
    label: 'REVIEW REQ',
    badgeBg: 'bg-violet-400/10',
    badgeText: 'text-violet-400',
    barColor: 'bg-violet-400',
  },
  review_complete: {
    label: 'REVIEWED',
    badgeBg: 'bg-emerald-400/10',
    badgeText: 'text-emerald-400',
    barColor: 'bg-emerald-400',
  },
  review_feedback: {
    label: 'FEEDBACK',
    badgeBg: 'bg-rose-400/10',
    badgeText: 'text-rose-400',
    barColor: 'bg-rose-400',
  },
  heartbeat: {
    label: 'HB',
    badgeBg: 'bg-gray-400/10',
    badgeText: 'text-gray-400',
    barColor: 'bg-gray-400/40',
  },
  interview: {
    label: 'INTERVIEW',
    badgeBg: 'bg-sky-400/10',
    badgeText: 'text-sky-400',
    barColor: 'bg-sky-400',
  },
  interview_response: {
    label: 'IV REPLY',
    badgeBg: 'bg-emerald-400/10',
    badgeText: 'text-emerald-400',
    barColor: 'bg-emerald-400',
  },
}

// ─── Relative Time ──────────────────────────────────────────

function relativeTime(ts: number): string {
  const diff = Math.max(0, Math.floor((Date.now() - ts) / 1000))
  if (diff < 5) return 'just now'
  if (diff < 60) return `${diff}s ago`
  const mins = Math.floor(diff / 60)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

// ─── Component ──────────────────────────────────────────────

interface SwarmMessageCardProps {
  message: SwarmMessage
}

const SwarmMessageCard: React.FC<SwarmMessageCardProps> = ({ message }) => {
  const meta = TYPE_MAP[message.type] || TYPE_MAP.message
  const timeLabel = useMemo(() => relativeTime(message.timestamp), [message.timestamp])

  return (
    <div className="relative rounded-lg p-2 hover:bg-white/[0.02] transition-colors overflow-hidden">
      {/* Left colored bar */}
      <div className={`absolute left-0 top-0 w-0.5 h-full ${meta.barColor} rounded-full`} />

      <div className="pl-2 flex flex-col gap-1">
        {/* Top row: type badge + from/to + timestamp */}
        <div className="flex items-center gap-1.5">
          <span
            className={`px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase leading-none ${meta.badgeBg} ${meta.badgeText}`}
          >
            {meta.label}
          </span>
          <span className="text-[10px] font-medium text-ghost-text">{message.from}</span>
          <span className="text-[10px] text-ghost-text-dim">&rarr;</span>
          <span className="text-[10px] text-ghost-text-dim">{message.to}</span>
          <span className="ml-auto text-[10px] tabular-nums text-ghost-text-dim shrink-0">
            {timeLabel}
          </span>
        </div>

        {/* Body */}
        <p className="text-[10px] text-ghost-text-dim line-clamp-2 leading-relaxed">
          {message.body}
        </p>
      </div>
    </div>
  )
}

export default SwarmMessageCard
