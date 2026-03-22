// SwarmRollbackPanel — Checkpoint timeline with rollback buttons (B10)

import { useState, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { History, RotateCcw, ChevronDown, ChevronRight, FileText, AlertTriangle, Check } from 'lucide-react'
import { useSwarmStore } from '../../stores/swarmStore'
import { rollbackToCheckpoint } from '../../lib/swarm-checkpoints'
import type { SwarmGitCheckpoint } from '../../lib/swarm-types'

interface SwarmRollbackPanelProps {
  swarmId: string
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function formatRelative(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  return `${Math.floor(diff / 3600)}h ago`
}

function labelToDisplay(label: string): { text: string; color: string } {
  if (label === 'swarm-launch') return { text: 'Swarm Launch', color: 'text-sky-400' }
  if (label.endsWith('-start')) return { text: label.replace(/-start$/, ' Start'), color: 'text-blue-400' }
  if (label.endsWith('-complete')) return { text: label.replace(/-complete$/, ' Done'), color: 'text-emerald-400' }
  if (label.endsWith('-review')) return { text: label.replace(/-review$/, ' Review'), color: 'text-violet-400' }
  return { text: label, color: 'text-ghost-text-dim' }
}

function CheckpointRow({
  checkpoint,
  directory,
  isFirst,
}: {
  checkpoint: SwarmGitCheckpoint
  directory: string
  isFirst: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [rolling, setRolling] = useState(false)
  const [result, setResult] = useState<'success' | 'error' | null>(null)

  const { text, color } = labelToDisplay(checkpoint.label)
  const filesCount = checkpoint.metadata?.filesModified?.length || 0

  const handleRollback = useCallback(async () => {
    if (!confirming) {
      setConfirming(true)
      // Auto-dismiss confirm after 5 seconds
      setTimeout(() => setConfirming(false), 5000)
      return
    }

    setRolling(true)
    setConfirming(false)
    try {
      const ok = await rollbackToCheckpoint(directory, checkpoint)
      setResult(ok ? 'success' : 'error')
    } catch {
      setResult('error')
    } finally {
      setRolling(false)
      setTimeout(() => setResult(null), 3000)
    }
  }, [confirming, directory, checkpoint])

  return (
    <div className="relative">
      {/* Timeline connector line */}
      {!isFirst && (
        <div className="absolute left-[9px] -top-2 w-px h-2 bg-white/[0.08]" />
      )}

      <div className="flex items-start gap-2 group">
        {/* Timeline dot */}
        <div
          className={`w-[18px] h-[18px] rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${
            isFirst
              ? 'border-sky-400 bg-sky-400/20'
              : 'border-white/20 bg-white/[0.04]'
          }`}
        >
          <div className={`w-1.5 h-1.5 rounded-full ${isFirst ? 'bg-sky-400' : 'bg-white/30'}`} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1 text-xs font-medium hover:text-ghost-text transition-colors"
            >
              {expanded ? (
                <ChevronDown className="w-3 h-3 text-ghost-text-dim/50" />
              ) : (
                <ChevronRight className="w-3 h-3 text-ghost-text-dim/50" />
              )}
              <span className={color}>{text}</span>
            </button>

            <span className="text-[10px] text-ghost-text-dim/40 font-mono tabular-nums">
              {formatTime(checkpoint.createdAt)}
            </span>

            <span className="text-[10px] text-ghost-text-dim/30">
              {formatRelative(checkpoint.createdAt)}
            </span>

            {filesCount > 0 && (
              <span className="text-[10px] text-ghost-text-dim/40 flex items-center gap-0.5">
                <FileText className="w-2.5 h-2.5" />
                {filesCount}
              </span>
            )}

            {/* Rollback button */}
            <div className="ml-auto flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
              {result === 'success' && (
                <span className="flex items-center gap-1 text-[10px] text-emerald-400">
                  <Check className="w-3 h-3" /> Restored
                </span>
              )}
              {result === 'error' && (
                <span className="flex items-center gap-1 text-[10px] text-rose-400">
                  <AlertTriangle className="w-3 h-3" /> Failed
                </span>
              )}
              {!result && (
                <button
                  onClick={handleRollback}
                  disabled={rolling}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider transition-colors ${
                    confirming
                      ? 'bg-amber-400/15 border border-amber-400/30 text-amber-400 hover:bg-amber-400/25'
                      : rolling
                        ? 'bg-white/[0.03] border border-white/[0.06] text-ghost-text-dim/40 cursor-wait'
                        : 'bg-white/[0.03] border border-white/[0.06] text-ghost-text-dim hover:text-sky-400 hover:border-sky-400/30'
                  }`}
                >
                  <RotateCcw className={`w-3 h-3 ${rolling ? 'animate-spin' : ''}`} />
                  {confirming ? 'Confirm?' : rolling ? 'Rolling back...' : 'Rollback'}
                </button>
              )}
            </div>
          </div>

          {/* Expanded details */}
          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="overflow-hidden"
              >
                <div className="mt-1.5 ml-4 space-y-1">
                  <div className="text-[10px] text-ghost-text-dim/50 font-mono">
                    ref: {checkpoint.gitRef.slice(0, 12)}
                    {checkpoint.isClean ? ' (clean)' : ' (dirty)'}
                  </div>

                  {checkpoint.metadata?.taskTitle && (
                    <div className="text-[10px] text-ghost-text-dim/60">
                      Task: {checkpoint.metadata.taskTitle}
                    </div>
                  )}

                  {checkpoint.metadata?.filesModified && checkpoint.metadata.filesModified.length > 0 && (
                    <div className="text-[10px] text-ghost-text-dim/40">
                      Files: {checkpoint.metadata.filesModified.slice(0, 5).map((f) => {
                        const name = f.includes('/') ? f.split('/').pop() : f
                        return name
                      }).join(', ')}
                      {checkpoint.metadata.filesModified.length > 5 && ` +${checkpoint.metadata.filesModified.length - 5} more`}
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Timeline connector line below */}
      <div className="absolute left-[9px] top-[18px] w-px h-full bg-white/[0.08]" />
    </div>
  )
}

export function SwarmRollbackPanel({ swarmId }: SwarmRollbackPanelProps) {
  const [collapsed, setCollapsed] = useState(true)
  const checkpoints = useSwarmStore((s) => s.gitCheckpoints)
  const activeSwarm = useSwarmStore((s) =>
    s.swarms.find((sw) => sw.id === swarmId),
  )

  const swarmCheckpoints = useMemo(
    () => checkpoints
      .filter((c) => c.swarmId === swarmId)
      .sort((a, b) => b.createdAt - a.createdAt),
    [checkpoints, swarmId],
  )

  const directory = activeSwarm?.config.directory || ''

  if (swarmCheckpoints.length === 0) return null

  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-white/[0.02] transition-colors"
      >
        <History className="w-3.5 h-3.5 text-sky-400" />
        <span className="text-xs font-semibold uppercase tracking-[0.1em] text-ghost-text-dim">
          Checkpoints
        </span>
        <span className="text-[10px] text-ghost-text-dim/40 font-mono ml-1">
          {swarmCheckpoints.length}
        </span>
        <ChevronDown
          className={`w-3 h-3 text-ghost-text-dim/30 ml-auto transition-transform ${collapsed ? '-rotate-90' : ''}`}
        />
      </button>

      {/* Content */}
      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 space-y-2 max-h-[300px] overflow-y-auto">
              {/* Current state indicator */}
              <div className="flex items-center gap-2 py-1">
                <div className="w-[18px] h-[18px] rounded-full border-2 border-emerald-400 bg-emerald-400/20 flex items-center justify-center flex-shrink-0">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                </div>
                <span className="text-xs font-medium text-emerald-400">Current State</span>
                <span className="text-[10px] text-ghost-text-dim/40">now</span>
              </div>

              {/* Checkpoint timeline */}
              {swarmCheckpoints.map((cp, idx) => (
                <CheckpointRow
                  key={cp.id}
                  checkpoint={cp}
                  directory={directory}
                  isFirst={idx === 0}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
