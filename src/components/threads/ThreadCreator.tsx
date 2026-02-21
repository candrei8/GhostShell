import { useState } from 'react'
import { X } from 'lucide-react'
import { motion } from 'framer-motion'
import { useThreadStore } from '../../stores/threadStore'

interface ThreadCreatorProps {
  onClose: () => void
}

const threadIcons = ['💬', '🔧', '🎨', '🐛', '📋', '🚀', '⚡', '🔍', '📝', '🎯', '🧪', '🔒']

export function ThreadCreator({ onClose }: ThreadCreatorProps) {
  const [name, setName] = useState('')
  const [icon, setIcon] = useState('💬')
  const [description, setDescription] = useState('')
  const addThread = useThreadStore((s) => s.addThread)

  const handleCreate = () => {
    if (!name.trim()) return
    addThread(name.trim(), icon, description.trim())
    onClose()
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="w-[360px] bg-ghost-surface border border-ghost-border rounded-xl p-5 shadow-2xl"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-ghost-text">New Thread</h2>
          <button onClick={onClose} className="w-6 h-6 flex items-center justify-center rounded hover:bg-white/10">
            <X className="w-4 h-4 text-ghost-text-dim" />
          </button>
        </div>

        <div className="mb-3">
          <label className="text-2xs text-ghost-text-dim uppercase tracking-wider mb-1 block">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Bug Fixes"
            className="w-full h-9 px-3 bg-ghost-bg border border-ghost-border rounded-lg text-sm text-ghost-text placeholder:text-ghost-text-dim/50 focus:outline-none focus:border-ghost-accent transition-colors"
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          />
        </div>

        <div className="mb-3">
          <label className="text-2xs text-ghost-text-dim uppercase tracking-wider mb-1.5 block">Icon</label>
          <div className="flex flex-wrap gap-1">
            {threadIcons.map((ic) => (
              <button
                key={ic}
                onClick={() => setIcon(ic)}
                className={`w-8 h-8 rounded-md flex items-center justify-center text-sm transition-all ${
                  icon === ic ? 'bg-ghost-accent/20 ring-1 ring-ghost-accent' : 'hover:bg-white/10'
                }`}
              >
                {ic}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-4">
          <label className="text-2xs text-ghost-text-dim uppercase tracking-wider mb-1 block">Description</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional description"
            className="w-full h-9 px-3 bg-ghost-bg border border-ghost-border rounded-lg text-sm text-ghost-text placeholder:text-ghost-text-dim/50 focus:outline-none focus:border-ghost-accent transition-colors"
          />
        </div>

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-ghost-text-dim hover:text-ghost-text transition-colors rounded-lg hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!name.trim()}
            className="px-4 py-1.5 text-xs bg-ghost-accent text-white rounded-lg hover:bg-ghost-accent/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Create Thread
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
