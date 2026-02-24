import { useState } from 'react'
import { Plus, MessageSquare } from 'lucide-react'
import { useThreadStore } from '../../stores/threadStore'
import { ThreadItem } from './ThreadItem'
import { ThreadCreator } from './ThreadCreator'

export function ThreadList() {
  const threads = useThreadStore((s) => s.threads)
  const [showCreator, setShowCreator] = useState(false)

  return (
    <div className="flex flex-col p-3 overflow-y-auto flex-1">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <MessageSquare className="w-3.5 h-3.5 text-ghost-text-dim" />
          <span className="text-2xs font-semibold text-ghost-text-dim uppercase tracking-wider">Threads</span>
          <span className="text-2xs text-ghost-text-dim">({threads.length})</span>
        </div>
        <button
          onClick={() => setShowCreator(true)}
          className="w-5 h-5 flex items-center justify-center rounded hover:bg-slate-800 text-ghost-text-dim hover:text-ghost-accent transition-colors"
          title="New Thread"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex flex-col gap-0.5">
        {threads.map((thread) => (
          <ThreadItem key={thread.id} thread={thread} />
        ))}
      </div>

      {threads.length === 0 && (
        <p className="text-2xs text-ghost-text-dim/50 text-center mt-2">No threads yet</p>
      )}

      {showCreator && <ThreadCreator onClose={() => setShowCreator(false)} />}
    </div>
  )
}
