import React, { useState } from 'react'
import { MessageSquare, Send, Trash2 } from 'lucide-react'
import type { SwarmMessage } from '../../lib/swarm-types'
import { useSwarmStore } from '../../stores/swarmStore'

interface SwarmOperatorInboxProps {
  messages: SwarmMessage[]
  swarmRoot?: string
}

export function SwarmOperatorInbox({ messages, swarmRoot }: SwarmOperatorInboxProps) {
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [replyBody, setReplyBody] = useState('')

  const handleReply = async (agentName: string) => {
    if (!replyBody.trim() || !swarmRoot) return

    const msgId = Date.now().toString() + '-' + Math.random().toString(36).slice(2, 8)
    const payload = JSON.stringify({
      id: msgId,
      from: '@operator',
      to: agentName,
      body: replyBody.trim(),
      type: 'message',
      timestamp: Math.floor(Date.now() / 1000).toString(),
    })

    try {
      await window.ghostshell.fsCreateDir(`${swarmRoot}/inbox/${agentName}`)
      await window.ghostshell.fsCreateFile(`${swarmRoot}/inbox/${agentName}/${msgId}.json`, payload)
      setReplyBody('')
      setReplyTo(null)
    } catch (err) {
      console.error('[OperatorInbox] Failed to send reply:', err)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-3 h-3 text-amber-400" />
          <span className="text-[10px] font-semibold text-ghost-text-dim uppercase tracking-[0.15em]">
            Operator Inbox
          </span>
          <span className="text-[9px] font-medium text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded-full tabular-nums">
            {messages.length}
          </span>
        </div>
        <button
          onClick={() => useSwarmStore.getState().clearOperatorMessages()}
          className="text-[9px] text-ghost-text-dim hover:text-rose-400 transition-colors"
          title="Clear all"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>

      <div className="space-y-1.5 max-h-[200px] overflow-y-auto sidebar-scroll">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className="rounded-lg border border-amber-400/10 bg-white/[0.02] p-2 space-y-1"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-medium text-amber-400">{msg.from}</span>
              <span className="text-[9px] text-ghost-text-dim">
                {msg.type !== 'message' ? msg.type : ''}
              </span>
            </div>
            <p className="text-[10px] text-ghost-text leading-relaxed whitespace-pre-wrap">
              {msg.body}
            </p>

            {replyTo === msg.from ? (
              <div className="flex gap-1 mt-1">
                <input
                  type="text"
                  value={replyBody}
                  onChange={(e) => setReplyBody(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleReply(msg.from)}
                  placeholder="Reply..."
                  className="flex-1 text-[10px] px-2 py-1 rounded bg-white/[0.04] border border-white/[0.08] text-ghost-text placeholder:text-ghost-text-dim outline-none focus:border-sky-400/30"
                  autoFocus
                />
                <button
                  onClick={() => handleReply(msg.from)}
                  className="px-2 py-1 rounded bg-sky-400/10 text-sky-400 hover:bg-sky-400/20 transition-colors"
                >
                  <Send className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setReplyTo(msg.from)}
                className="text-[9px] text-sky-400 hover:text-sky-300 transition-colors"
              >
                Reply
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
