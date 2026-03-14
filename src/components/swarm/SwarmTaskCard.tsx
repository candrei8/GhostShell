import { useMemo } from 'react'
import { FileCode, GitBranch, CheckCircle2, XCircle, Clock } from 'lucide-react'
import type { SwarmTaskItem } from '../../lib/swarm-types'

// ─── Status Config ───────────────────────────────────────────

type TaskStatus = SwarmTaskItem['status']

interface StatusPillMeta {
  label: string
  bg: string
  text: string
}

const STATUS_PILLS: Record<TaskStatus, StatusPillMeta> = {
  open: { label: 'OPEN', bg: 'bg-white/[0.06]', text: 'text-ghost-text-dim' },
  assigned: { label: 'ASSIGNED', bg: 'bg-sky-400/10', text: 'text-sky-400' },
  planning: { label: 'PLANNING', bg: 'bg-amber-400/10', text: 'text-amber-400' },
  building: { label: 'BUILDING', bg: 'bg-blue-400/10', text: 'text-blue-400' },
  review: { label: 'REVIEW', bg: 'bg-violet-400/10', text: 'text-violet-400' },
  done: { label: 'DONE', bg: 'bg-emerald-400/10', text: 'text-emerald-400' },
}

// ─── Helpers ─────────────────────────────────────────────────

/** Truncate a file path to the last 2 segments */
function truncatePath(filepath: string): string {
  const segments = filepath.replace(/\\/g, '/').split('/')
  if (segments.length <= 2) return segments.join('/')
  return segments.slice(-2).join('/')
}

// ─── Task Card ───────────────────────────────────────────────

interface SwarmTaskCardProps {
  task: SwarmTaskItem
  allTasks: SwarmTaskItem[]
}

export function SwarmTaskCard({ task, allTasks }: SwarmTaskCardProps) {
  const pill = STATUS_PILLS[task.status] || STATUS_PILLS.open
  const isDone = task.status === 'done'

  const visibleFiles = useMemo(() => task.ownedFiles.slice(0, 3), [task.ownedFiles])
  const extraFileCount = Math.max(0, task.ownedFiles.length - 3)

  const depLabels = useMemo(() => {
    if (task.dependsOn.length === 0) return null
    return task.dependsOn
      .map((depId) => {
        const dep = allTasks.find((t) => t.id === depId)
        return dep ? dep.id : depId
      })
      .join(', ')
  }, [task.dependsOn, allTasks])

  return (
    <div
      className={`rounded-lg border border-white/[0.06] bg-white/[0.02] p-2 space-y-1.5 ${isDone ? 'opacity-60' : ''}`}
    >
      {/* Top row: ID badge + title + status pill */}
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="text-[10px] font-mono text-ghost-text-dim bg-white/[0.04] px-1 py-0.5 rounded shrink-0" title={task.id}>
          {task.id}
        </span>
        <span className="text-[11px] text-ghost-text truncate flex-1" title={task.title}>{task.title}</span>
        <span
          className={`px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase shrink-0 ${pill.bg} ${pill.text}`}
        >
          {pill.label}
        </span>
      </div>

      {/* Owned files chips */}
      {visibleFiles.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap">
          <FileCode className="w-3 h-3 text-ghost-text-dim shrink-0" />
          {visibleFiles.map((f) => (
            <span
              key={f}
              className="text-[9px] font-mono bg-white/[0.04] text-ghost-text-dim px-1.5 rounded truncate max-w-[120px]"
              title={f}
            >
              {truncatePath(f)}
            </span>
          ))}
          {extraFileCount > 0 && (
            <span className="text-[9px] font-mono text-ghost-text-dim px-1">
              +{extraFileCount} more
            </span>
          )}
        </div>
      )}

      {/* Dependencies */}
      {depLabels && (
        <div className="flex items-center gap-1">
          <GitBranch className="w-3 h-3 text-ghost-text-dim shrink-0" />
          <span className="text-[10px] text-ghost-text-dim truncate">
            depends on: {depLabels}
          </span>
        </div>
      )}

      {/* Owner + Review */}
      <div className="flex items-center gap-2">
        {task.owner && (
          <span className="text-[10px] text-ghost-text-dim truncate">
            {task.owner}
          </span>
        )}
        {task.reviewer && (
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-[9px] text-ghost-text-dim">review:</span>
            <span className="text-[10px] text-ghost-text-dim truncate max-w-[80px]">{task.reviewer}</span>
            {task.verdict === 'approved' || task.verdict === 'approved_with_notes' ? (
              <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
            ) : task.verdict === 'changes_requested' ? (
              <XCircle className="w-3 h-3 text-rose-400 shrink-0" />
            ) : task.status === 'review' ? (
              <Clock className="w-3 h-3 text-amber-400 shrink-0" />
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}
