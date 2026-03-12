import { useCallback } from 'react'
import { motion } from 'framer-motion'
import { FolderOpen, FolderSearch } from 'lucide-react'
import { useSwarmStore } from '../../stores/swarmStore'

export function SwarmDirectoryStep() {
  const directory = useSwarmStore((s) => s.wizard.directory)
  const setDirectory = useSwarmStore((s) => s.setDirectory)

  const handleBrowse = useCallback(async () => {
    try {
      const api = window.ghostshell
      if (api?.selectDirectory) {
        const selected = await api.selectDirectory()
        if (selected) setDirectory(selected)
      }
    } catch {
      // Dialog cancelled or unavailable
    }
  }, [setDirectory])

  return (
    <motion.div
      className="flex flex-col items-center gap-8 py-8"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
    >
      {/* Icon */}
      <div className="w-16 h-16 rounded-2xl bg-white/[0.06] flex items-center justify-center">
        <FolderOpen className="w-7 h-7 text-ghost-text" />
      </div>

      {/* Title */}
      <div className="text-center">
        <h2 className="text-xl font-bold text-ghost-text">Working directory</h2>
        <p className="mt-2 text-sm text-ghost-text-dim/70 max-w-md">
          Choose the project folder for this swarm. All agents will operate within this directory.
        </p>
      </div>

      {/* Directory Input */}
      <div className="w-full max-w-lg flex flex-col gap-3">
        <div className="ghost-section-card rounded-xl overflow-hidden">
          <div className="flex items-center">
            <input
              type="text"
              value={directory}
              onChange={(e) => setDirectory(e.target.value)}
              placeholder="/path/to/your/project"
              className="flex-1 h-12 px-4 bg-transparent text-sm text-ghost-text font-mono placeholder:text-ghost-text-dim/40 focus:outline-none"
            />
            <button
              onClick={handleBrowse}
              className="h-12 px-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-ghost-text-dim hover:text-ghost-text border-l border-white/8 hover:bg-white/[0.04] transition-colors"
            >
              <FolderSearch className="w-4 h-4" />
              Browse
            </button>
          </div>
        </div>

        {directory && (
          <motion.p
            className="text-xs text-ghost-text-dim/50 px-1"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            Agents will read and write files relative to this path.
          </motion.p>
        )}
      </div>
    </motion.div>
  )
}
