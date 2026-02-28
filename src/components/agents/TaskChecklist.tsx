import { useMemo } from 'react'
import { TaskItem } from '../../lib/types'
import { formatDuration } from '../../lib/formatUtils'

interface TaskChecklistProps {
  tasks: TaskItem[]
  now: number
}

export function TaskChecklist({ tasks, now }: TaskChecklistProps) {
  const sorted = useMemo(() => {
    const inProgress = tasks.filter((t) => t.status === 'in_progress')
    const pending = tasks.filter((t) => t.status === 'pending')
    const completed = tasks.filter((t) => t.status === 'completed')
    return [...inProgress, ...pending, ...completed]
  }, [tasks])

  if (sorted.length === 0) return null

  return (
    <div className="flex flex-col gap-0.5">
      {sorted.map((task) => (
        <TaskRow key={task.id} task={task} now={now} />
      ))}
    </div>
  )
}

function TaskRow({ task, now }: { task: TaskItem; now: number }) {
  const isActiveForm = task.status === 'in_progress' && task.activeForm
  const isInProgress = task.status === 'in_progress' && !task.activeForm
  const isPending = task.status === 'pending'
  const isCompleted = task.status === 'completed'

  if (isActiveForm) {
    return (
      <div className="task-active-glow pl-2.5 py-1 rounded-r-md">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-emerald-400 text-[11px] shrink-0 select-none">{'\u2726'}</span>
          <span className="text-[11px] text-emerald-300 truncate flex-1">
            {task.activeForm}
          </span>
          <span className="text-[10px] font-mono tabular-nums text-emerald-400/60 shrink-0">
            ({formatDuration(task.createdAt, now)})
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-start gap-1.5 pl-2.5 py-0.5 min-w-0">
      {isInProgress && (
        <span className="text-orange-400 text-[11px] shrink-0 mt-px select-none">{'\u25A0'}</span>
      )}
      {isPending && (
        <span className="text-ghost-text-dim/40 text-[11px] shrink-0 mt-px select-none">{'\u25A1'}</span>
      )}
      {isCompleted && (
        <span className="text-green-500 text-[11px] shrink-0 mt-px select-none">{'\u2713'}</span>
      )}
      <span
        className={`text-[11px] leading-snug truncate ${
          isCompleted
            ? 'text-ghost-text-dim/30 line-through'
            : isInProgress
            ? 'text-orange-300/80'
            : 'text-ghost-text-dim/60'
        }`}
      >
        {task.subject}
      </span>
    </div>
  )
}
