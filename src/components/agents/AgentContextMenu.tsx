import { useState, useEffect, useRef } from 'react'
import { Pencil, Trash2, GitBranch, Check, Copy } from 'lucide-react'
import { Agent } from '../../lib/types'
import { useAgent } from '../../hooks/useAgent'
import { useAgentStore } from '../../stores/agentStore'
import { useThreadStore } from '../../stores/threadStore'

interface AgentContextMenuProps {
  agent: Agent
  onClose: () => void
}

export function AgentContextMenu({ agent, onClose }: AgentContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)
  const { deleteAgent, moveAgentToThread, cloneAgent } = useAgent()
  const updateAgent = useAgentStore((s) => s.updateAgent)
  const threads = useThreadStore((s) => s.threads)
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(agent.name)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  useEffect(() => {
    if (isRenaming && renameInputRef.current) {
      renameInputRef.current.focus()
      renameInputRef.current.select()
    }
  }, [isRenaming])

  const commitRename = () => {
    const trimmed = renameValue.trim()
    if (trimmed && trimmed !== agent.name) {
      updateAgent(agent.id, { name: trimmed })
    }
    setIsRenaming(false)
    onClose()
  }

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      commitRename()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setIsRenaming(false)
      setRenameValue(agent.name)
    }
  }

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full mt-1 w-44 bg-ghost-surface border border-ghost-border rounded-lg shadow-xl z-50 py-1 overflow-hidden"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Rename */}
      {isRenaming ? (
        <div className="flex items-center gap-1 px-2 py-1">
          <input
            ref={renameInputRef}
            type="text"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={handleRenameKeyDown}
            onBlur={commitRename}
            className="flex-1 h-6 px-1.5 bg-ghost-bg border border-ghost-accent rounded text-xs text-ghost-text focus:outline-none min-w-0"
            maxLength={40}
          />
          <button
            onMouseDown={(e) => {
              e.preventDefault()
              commitRename()
            }}
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-ghost-accent/20 text-ghost-accent shrink-0"
          >
            <Check className="w-3 h-3" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setIsRenaming(true)}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-ghost-text hover:bg-slate-800/50 transition-colors"
        >
          <Pencil className="w-3 h-3 text-ghost-text-dim" />
          Rename
        </button>
      )}

      {/* Clone */}
      <button
        onClick={() => {
          cloneAgent(agent.id)
          onClose()
        }}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-ghost-text hover:bg-slate-800/50 transition-colors"
      >
        <Copy className="w-3 h-3 text-ghost-text-dim" />
        Clone Agent
      </button>

      {/* Move to Thread */}
      {threads.length > 0 && (
        <div className="border-t border-ghost-border my-1" />
      )}
      {agent.threadId && (
        <button
          onClick={() => {
            moveAgentToThread(agent.id, agent.threadId, undefined)
            onClose()
          }}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-ghost-text-dim hover:bg-slate-800/50 transition-colors"
        >
          <GitBranch className="w-3 h-3 text-ghost-text-dim" />
          Remove from thread
        </button>
      )}
      {threads.map((thread) => (
        <button
          key={thread.id}
          onClick={() => {
            moveAgentToThread(agent.id, agent.threadId, thread.id)
            onClose()
          }}
          className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-slate-800/50 transition-colors ${
            thread.id === agent.threadId ? 'text-ghost-accent' : 'text-ghost-text'
          }`}
        >
          <GitBranch className="w-3 h-3 text-ghost-text-dim" />
          Move to {thread.name}
        </button>
      ))}

      {/* Delete */}
      <div className="border-t border-ghost-border my-1" />
      <button
        onClick={() => {
          deleteAgent(agent.id)
          onClose()
        }}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 transition-colors"
      >
        <Trash2 className="w-3 h-3" />
        Delete Agent
      </button>
    </div>
  )
}
