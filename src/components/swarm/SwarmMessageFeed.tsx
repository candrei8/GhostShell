import React, { useRef, useEffect, useState } from 'react'
import { MessageSquare, ChevronDown } from 'lucide-react'
import type { SwarmMessage } from '../../lib/swarm-types'
import SwarmMessageCard from './SwarmMessageCard'

// ─── Component ──────────────────────────────────────────────

interface SwarmMessageFeedProps {
  messages: SwarmMessage[]
}

const SwarmMessageFeed: React.FC<SwarmMessageFeedProps> = ({ messages }) => {
  const [expanded, setExpanded] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (expanded && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages.length, expanded])

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
        aria-label="Toggle messages"
        className="w-full flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-white/[0.02] transition-colors"
      >
        <MessageSquare className="w-3.5 h-3.5 text-ghost-text-dim shrink-0" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-ghost-text-dim">
          Messages
        </span>
        {messages.length > 0 && (
          <span className="px-1.5 py-0.5 rounded-full text-[9px] font-semibold tabular-nums bg-white/[0.06] text-ghost-text-dim">
            {messages.length}
          </span>
        )}
        <ChevronDown
          className={`w-3 h-3 ml-auto text-ghost-text-dim transition-transform duration-200 ${
            expanded ? '' : '-rotate-90'
          }`}
        />
      </button>

      {/* Message list */}
      {expanded && (
        <div
          ref={scrollRef}
          className="max-h-48 overflow-y-auto sidebar-scroll px-2 pb-2 space-y-1"
        >
          {messages.length === 0 ? (
            <p className="text-[10px] text-ghost-text-dim text-center py-6">
              No messages yet
            </p>
          ) : (
            messages.map((msg) => (
              <SwarmMessageCard key={msg.id} message={msg} />
            ))
          )}
        </div>
      )}
    </div>
  )
}

export default SwarmMessageFeed
