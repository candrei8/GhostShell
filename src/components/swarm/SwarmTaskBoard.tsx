import { useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Circle, CheckCircle2, Loader2, AlertCircle, ListChecks } from 'lucide-react'
import type { SwarmTaskItem } from '../../lib/swarm-types'

// ─── Status Config ───────────────────────────────────────────

type TaskStatus = SwarmTaskItem['status']

interface StatusMeta {
  label: string
  color: string
  icon: React.FC<{ className?: string }>
  spin?: boolean
}

const TASK_STATUS: Record<TaskStatus, StatusMeta> = {
  open: { label: 'Open', color: 'text-ghost-text-dim/50', icon: Circle },
  assigned: { label: 'Assigned', color: 'text-blue-400/70', icon: Circle },
  planning: { label: 'Planning', color: 'text-blue-400', icon: Loader2, spin: true },
  building: { label: 'Building', color: 'text-amber-400', icon: Loader2, spin: true },
  review: { label: 'Review', color: 'text-purple-400', icon: AlertCircle },
  done: { label: 'Done', color: 'text-emerald-400', icon: CheckCircle2 },
}

// ─── Task Row ────────────────────────────────────────────────

function TaskRow({ task }: { task: SwarmTaskItem }) {
  const meta = TASK_STATUS[task.status] || TASK_STATUS.open
  const StatusIcon = meta.icon

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.02] transition-colors rounded-lg"
    >
      <StatusIcon className={`w-4 h-4 shrink-0 ${meta.color} ${meta.spin ? 'animate-spin' : ''}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-ghost-text truncate">{task.title}</p>
        {task.ownedFiles.length > 0 && (
          <p className="text-xs text-ghost-text-dim/40 truncate font-mono">
            {task.ownedFiles.join(', ')}
          </p>
        )}
      </div>
      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${meta.color} bg-white/[0.06]`}>
        {meta.label}
      </span>
    </motion.div>
  )
}

// ─── Task Board ──────────────────────────────────────────────

interface SwarmTaskBoardProps {
  tasks: SwarmTaskItem[]
}

export function SwarmTaskBoard({ tasks }: SwarmTaskBoardProps) {
  const { active, completed } = useMemo(() => {
    const active: SwarmTaskItem[] = []
    const completed: SwarmTaskItem[] = []
    for (const t of tasks) {
      if (t.status === 'done') completed.push(t)
      else active.push(t)
    }
    return { active, completed }
  }, [tasks])

  return (
    <div className="ghost-section-card rounded-xl flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.04]">
        <ListChecks className="w-4 h-4 text-ghost-text-dim/60" />
        <h3 className="text-xs font-semibold text-ghost-text uppercase tracking-[0.15em]">Tasks</h3>
        <span className="ml-auto text-xs text-ghost-text-dim/40 tabular-nums">
          {completed.length}/{tasks.length}
        </span>
      </div>

      {/* Progress Bar */}
      {tasks.length > 0 && (
        <div className="px-4 pt-3">
          <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-emerald-400/60"
              initial={{ width: 0 }}
              animate={{ width: `${(completed.length / tasks.length) * 100}%` }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
            />
          </div>
        </div>
      )}

      {/* Task List */}
      <div className="flex flex-col py-2 max-h-72 overflow-y-auto sidebar-scroll">
        {tasks.length === 0 ? (
          <p className="text-xs text-ghost-text-dim/40 text-center py-6">No tasks yet</p>
        ) : (
          <AnimatePresence mode="popLayout">
            {active.map((task) => (
              <TaskRow key={task.id} task={task} />
            ))}
            {completed.map((task) => (
              <TaskRow key={task.id} task={task} />
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  )
}
