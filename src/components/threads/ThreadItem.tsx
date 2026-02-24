import { useState } from 'react'
import { ChevronRight, ChevronDown, Trash2, RotateCw, Square, Send, MoreHorizontal } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Thread } from '../../lib/types'
import { useThreadStore } from '../../stores/threadStore'
import { useAgentStore } from '../../stores/agentStore'
import { useAgent } from '../../hooks/useAgent'
import { AgentCard } from '../agents/AgentCard'

interface ThreadItemProps {
  thread: Thread
}

export function ThreadItem({ thread }: ThreadItemProps) {
  const toggleExpanded = useThreadStore((s) => s.toggleExpanded)
  const removeThread = useThreadStore((s) => s.removeThread)
  const agents = useAgentStore((s) => s.agents)
  const { restartAgent, stopAgent, sendToAgent } = useAgent()
  const [showActions, setShowActions] = useState(false)
  const [promptText, setPromptText] = useState('')
  const [showPrompt, setShowPrompt] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const threadAgents = agents.filter((a) => a.threadId === thread.id)
  const workingCount = threadAgents.filter((a) => a.status === 'working').length
  const offlineCount = threadAgents.filter((a) => a.status === 'offline' || !a.terminalId).length

  const handleRestartAll = () => {
    threadAgents.forEach((a) => {
      if (a.status === 'offline' || !a.terminalId) {
        restartAgent(a.id)
      }
    })
    setShowActions(false)
  }

  const handleStopAll = () => {
    threadAgents.forEach((a) => {
      if (a.terminalId) {
        stopAgent(a.id)
      }
    })
    setShowActions(false)
  }

  const handleSendToAll = (e: React.FormEvent) => {
    e.preventDefault()
    if (promptText.trim()) {
      threadAgents.forEach((a) => {
        if (a.terminalId) {
          sendToAgent(a.id, promptText.trim() + '\r')
        }
      })
      setPromptText('')
      setShowPrompt(false)
    }
  }

  const handleDelete = () => {
    if (!confirmDelete) {
      setConfirmDelete(true)
      setTimeout(() => setConfirmDelete(false), 3000)
      return
    }
    removeThread(thread.id)
  }

  return (
    <div className="group/thread">
      <div
        onClick={() => toggleExpanded(thread.id)}
        className="flex items-center gap-1.5 px-2 py-1.5 rounded-md hover:bg-slate-800/50 cursor-pointer transition-colors"
      >
        {thread.isExpanded ? (
          <ChevronDown className="w-3 h-3 text-ghost-text-dim shrink-0" />
        ) : (
          <ChevronRight className="w-3 h-3 text-ghost-text-dim shrink-0" />
        )}
        <span className="text-xs">{thread.icon}</span>
        <span className="text-xs text-ghost-text truncate flex-1">{thread.name}</span>

        {/* Status badges */}
        <div className="flex items-center gap-1">
          {workingCount > 0 && (
            <span className="text-2xs px-1 rounded bg-ghost-success/15 text-ghost-success">{workingCount}</span>
          )}
          <span className="text-2xs text-ghost-text-dim">{threadAgents.length}</span>
        </div>

        {/* Thread actions */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover/thread:opacity-100 transition-opacity">
          <button
            onClick={(e) => {
              e.stopPropagation()
              setShowActions(!showActions)
            }}
            className="w-5 h-5 flex items-center justify-center rounded hover:bg-slate-800 transition-colors"
          >
            <MoreHorizontal className="w-3 h-3 text-ghost-text-dim" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              handleDelete()
            }}
            className={`w-5 h-5 flex items-center justify-center rounded transition-colors ${
              confirmDelete ? 'bg-red-500/20 text-red-400' : 'hover:bg-red-500/20 text-ghost-text-dim'
            }`}
            title={confirmDelete ? 'Click again to confirm' : 'Delete Thread'}
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Thread action buttons */}
      {showActions && threadAgents.length > 0 && (
        <div className="flex items-center gap-1 px-4 py-1">
          <button
            onClick={() => setShowPrompt(!showPrompt)}
            className="flex items-center gap-1 px-2 py-0.5 text-2xs rounded bg-ghost-surface border border-ghost-border text-ghost-text-dim hover:text-ghost-text hover:border-ghost-accent/50 transition-colors"
            title="Send to all agents"
          >
            <Send className="w-2.5 h-2.5" />
            Send All
          </button>
          {offlineCount > 0 && (
            <button
              onClick={handleRestartAll}
              className="flex items-center gap-1 px-2 py-0.5 text-2xs rounded bg-indigo-950/50 text-ghost-accent hover:bg-ghost-accent/20 transition-colors"
              title="Restart offline agents"
            >
              <RotateCw className="w-2.5 h-2.5" />
              Restart ({offlineCount})
            </button>
          )}
          {threadAgents.length - offlineCount > 0 && (
            <button
              onClick={handleStopAll}
              className="flex items-center gap-1 px-2 py-0.5 text-2xs rounded bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 transition-colors"
              title="Stop all agents"
            >
              <Square className="w-2.5 h-2.5" />
              Stop All
            </button>
          )}
        </div>
      )}

      {/* Broadcast prompt */}
      {showPrompt && (
        <form onSubmit={handleSendToAll} className="flex items-center gap-1 px-4 py-1">
          <input
            type="text"
            value={promptText}
            onChange={(e) => setPromptText(e.target.value)}
            placeholder="Send to all agents..."
            className="flex-1 h-6 px-2 bg-ghost-bg border border-ghost-border rounded text-2xs text-ghost-text focus:outline-none focus:border-ghost-accent"
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Escape') setShowPrompt(false) }}
          />
          <button
            type="submit"
            className="h-6 px-2 text-2xs bg-indigo-950/50 text-ghost-accent rounded hover:bg-ghost-accent/20 transition-colors"
          >
            Broadcast
          </button>
        </form>
      )}

      <AnimatePresence>
        {thread.isExpanded && threadAgents.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="ml-4 overflow-hidden"
          >
            {threadAgents.map((agent) => (
              <AgentCard key={agent.id} agent={agent} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {thread.isExpanded && threadAgents.length === 0 && (
        <div className="ml-6 py-2">
          <p className="text-2xs text-ghost-text-dim/50">No agents in this thread</p>
        </div>
      )}
    </div>
  )
}
