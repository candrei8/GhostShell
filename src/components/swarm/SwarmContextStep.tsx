import { useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { BookOpen, Plus, X, FileIcon } from 'lucide-react'
import { useSwarmStore } from '../../stores/swarmStore'
import { resolveDroppedFilePathFromBridge } from '../../lib/fileDrop'
import type { SwarmContextFile } from '../../lib/swarm-types'

// ─── File Size Formatter ─────────────────────────────────────

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ─── File Row ────────────────────────────────────────────────

function ContextFileRow({
  file,
  onRemove,
}: {
  file: SwarmContextFile
  onRemove: () => void
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 8 }}
      className="ghost-section-card rounded-xl flex items-center gap-3 px-4 py-3 group"
    >
      <div className="w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center shrink-0">
        <FileIcon className="w-4 h-4 text-ghost-text-dim" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-ghost-text truncate">{file.name}</p>
        <p className="text-xs text-ghost-text-dim/50 truncate font-mono">{file.path}</p>
      </div>
      <span className="text-xs text-ghost-text-dim/40 tabular-nums shrink-0">
        {formatSize(file.size)}
      </span>
      <button
        onClick={onRemove}
        className="w-6 h-6 rounded-md flex items-center justify-center text-ghost-text-dim/30 hover:text-ghost-error hover:bg-ghost-error/10 transition-colors opacity-0 group-hover:opacity-100"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </motion.div>
  )
}

// ─── Main Step ───────────────────────────────────────────────

export function SwarmContextStep() {
  const contextFiles = useSwarmStore((s) => s.wizard.contextFiles)
  const addContextFile = useSwarmStore((s) => s.addContextFile)
  const removeContextFile = useSwarmStore((s) => s.removeContextFile)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const createContextFile = useCallback(
    (file: File): SwarmContextFile => ({
      id: `ctx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: file.name,
      path: resolveDroppedFilePathFromBridge(file) ?? file.name,
      size: file.size,
    }),
    [],
  )

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      if (!files) return

      for (const f of Array.from(files)) {
        addContextFile(createContextFile(f))
      }

      // Reset input so same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = ''
    },
    [addContextFile, createContextFile],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      const files = e.dataTransfer?.files
      if (!files) return

      for (const f of Array.from(files)) {
        addContextFile(createContextFile(f))
      }
    },
    [addContextFile, createContextFile],
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
  }, [])

  return (
    <motion.div
      className="flex flex-col items-center gap-8 py-8"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
    >
      {/* Icon */}
      <div className="w-16 h-16 rounded-2xl bg-white/[0.06] flex items-center justify-center">
        <BookOpen className="w-7 h-7 text-ghost-text" />
      </div>

      {/* Title */}
      <div className="text-center">
        <h2 className="text-xl font-bold text-ghost-text">Supporting context</h2>
        <p className="mt-2 text-sm text-ghost-text-dim/70 max-w-md">
          Attach files, screenshots, or docs that agents should reference. This step is optional.
        </p>
      </div>

      {/* Drop Zone */}
      <div
        className="w-full max-w-lg ghost-section-card rounded-xl p-6 flex flex-col items-center gap-3 cursor-pointer hover:bg-white/[0.02] transition-colors border-dashed"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onClick={() => fileInputRef.current?.click()}
      >
        <div className="w-10 h-10 rounded-xl bg-white/[0.04] flex items-center justify-center">
          <Plus className="w-5 h-5 text-ghost-text-dim/60" />
        </div>
        <p className="text-sm text-ghost-text-dim/60">
          Drop files here or click to browse
        </p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileSelect}
        />
      </div>

      {/* File List */}
      {contextFiles.length > 0 && (
        <div className="w-full max-w-lg flex flex-col gap-2">
          <AnimatePresence mode="popLayout">
            {contextFiles.map((file) => (
              <ContextFileRow
                key={file.id}
                file={file}
                onRemove={() => removeContextFile(file.id)}
              />
            ))}
          </AnimatePresence>
          <p className="text-xs text-ghost-text-dim/40 px-1 mt-1">
            {contextFiles.length} file{contextFiles.length !== 1 ? 's' : ''} attached — shared with all agents as reference.
          </p>
        </div>
      )}
    </motion.div>
  )
}
