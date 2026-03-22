// SwarmTaskKanban — Visual task board with 4 columns
// OPEN | BUILDING | REVIEW | DONE

import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ListTodo, ChevronDown, ChevronRight,
  FileText, Link2, User, CheckCircle2, XCircle,
} from 'lucide-react'
import type { SwarmTaskItem, SwarmRosterAgent } from '../../lib/swarm-types'
import { getRoleDef } from '../../lib/swarm-types'

interface SwarmTaskKanbanProps {
  tasks: SwarmTaskItem[]
  roster: SwarmRosterAgent[]
}

type TaskStatus = SwarmTaskItem['status']

const COLUMNS: { id: string; label: string; statuses: TaskStatus[]; color: string }[] = [
  { id: 'open',     label: 'OPEN',     statuses: ['open', 'assigned', 'planning'], color: '#94a3b8' },
  { id: 'building', label: 'BUILDING', statuses: ['building'],                     color: '#38bdf8' },
  { id: 'review',   label: 'REVIEW',   statuses: ['review'],                       color: '#c084fc' },
  { id: 'done',     label: 'DONE',     statuses: ['done'],                         color: '#34d399' },
]

export function SwarmTaskKanban({ tasks, roster }: SwarmTaskKanbanProps) {
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null)

  // Group tasks by column
  const columns = useMemo(() => {
    return COLUMNS.map((col) => ({
      ...col,
      tasks: tasks.filter((t) => col.statuses.includes(t.status)),
    }))
  }, [tasks])

  if (tasks.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-2">
          <ListTodo className="w-5 h-5" style={{ color: 'rgba(255,255,255,0.1)' }} />
          <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'rgba(255,255,255,0.15)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            No tasks assigned yet
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full" style={{ background: 'rgba(0,0,0,0.1)' }}>
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 shrink-0"
        style={{ height: 32, borderBottom: '1px solid rgba(255,255,255,0.04)' }}
      >
        <ListTodo className="w-3 h-3" style={{ color: '#38bdf8' }} />
        <span style={{ fontSize: 9, fontFamily: 'monospace', fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
          TASKS
        </span>
        <span style={{ fontSize: 9, fontFamily: 'monospace', color: 'rgba(255,255,255,0.15)', fontVariantNumeric: 'tabular-nums' }}>
          {tasks.length}
        </span>
      </div>

      {/* Kanban columns */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {columns.map((col) => (
          <div
            key={col.id}
            className="flex flex-col flex-1 min-w-0"
            style={{ borderRight: '1px solid rgba(255,255,255,0.03)' }}
          >
            {/* Column header */}
            <div
              className="flex items-center justify-between px-2 py-1.5 shrink-0"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}
            >
              <div className="flex items-center gap-1.5">
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: col.color, flexShrink: 0 }} />
                <span style={{ fontSize: 9, fontFamily: 'monospace', fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  {col.label}
                </span>
              </div>
              <span style={{ fontSize: 9, fontFamily: 'monospace', color: col.color, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                {col.tasks.length}
              </span>
            </div>

            {/* Task cards */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-1 flex flex-col gap-1">
              <AnimatePresence mode="popLayout">
                {col.tasks.map((task) => (
                  <motion.div
                    key={task.id}
                    layoutId={task.id}
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.2 }}
                  >
                    <TaskCard
                      task={task}
                      roster={roster}
                      color={col.color}
                      expanded={expandedTaskId === task.id}
                      onToggle={() => setExpandedTaskId(expandedTaskId === task.id ? null : task.id)}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Task Card ──────────────────────────────────────────────

function TaskCard({ task, roster, color, expanded, onToggle }: {
  task: SwarmTaskItem; roster: SwarmRosterAgent[]; color: string; expanded: boolean; onToggle: () => void
}) {
  const owner = roster.find(r => r.id === task.owner)
  const ownerDef = owner ? getRoleDef(owner.role) : null
  const reviewer = roster.find(r => r.id === task.reviewer)
  const hasDeps = task.dependsOn && task.dependsOn.length > 0

  return (
    <div
      className="rounded cursor-pointer hover:bg-white/[0.03] transition-colors"
      style={{
        padding: '6px 8px',
        border: '1px solid rgba(255,255,255,0.04)',
        background: task.status === 'done' ? 'rgba(255,255,255,0.01)' : 'rgba(255,255,255,0.02)',
        opacity: task.status === 'done' ? 0.6 : 1,
      }}
      onClick={onToggle}
    >
      {/* Title */}
      <div className="flex items-start gap-1.5">
        <span style={{
          fontSize: 10,
          color: task.status === 'done' ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.6)',
          fontFamily: 'monospace',
          lineHeight: '1.3',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          display: '-webkit-box',
          WebkitLineClamp: expanded ? 10 : 2,
          WebkitBoxOrient: 'vertical' as const,
          flex: 1,
          textDecoration: task.status === 'done' ? 'line-through' : 'none',
        }}>
          {task.description || task.title || task.id}
        </span>
      </div>

      {/* Footer: owner + deps */}
      <div className="flex items-center gap-1.5 mt-1">
        {ownerDef && (
          <div className="flex items-center gap-0.5">
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: ownerDef.color }} />
            <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.25)', fontFamily: 'monospace', textTransform: 'uppercase' }}>
              {owner?.customName || ownerDef.label}
            </span>
          </div>
        )}

        {hasDeps && (
          <Link2 className="w-2.5 h-2.5" style={{ color: 'rgba(255,255,255,0.15)' }} />
        )}

        {task.verdict && (
          <div className="ml-auto">
            {task.verdict === 'approved' ? (
              <CheckCircle2 className="w-3 h-3" style={{ color: '#34d399' }} />
            ) : (
              <XCircle className="w-3 h-3" style={{ color: '#f87171' }} />
            )}
          </div>
        )}
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="mt-2 pt-1.5 flex flex-col gap-1" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
          <span style={{ fontSize: 8, fontFamily: 'monospace', color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase' }}>
            ID: {task.id}
          </span>

          {task.ownedFiles && task.ownedFiles.length > 0 && (
            <div className="flex flex-col gap-0.5">
              {task.ownedFiles.slice(0, 3).map((f, i) => (
                <div key={i} className="flex items-center gap-1">
                  <FileText className="w-2.5 h-2.5" style={{ color: 'rgba(255,255,255,0.15)' }} />
                  <span style={{ fontSize: 8, fontFamily: 'monospace', color: 'rgba(255,255,255,0.25)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {f}
                  </span>
                </div>
              ))}
              {task.ownedFiles.length > 3 && (
                <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.15)', fontFamily: 'monospace' }}>
                  +{task.ownedFiles.length - 3} more
                </span>
              )}
            </div>
          )}

          {reviewer && (
            <div className="flex items-center gap-1">
              <User className="w-2.5 h-2.5" style={{ color: 'rgba(255,255,255,0.15)' }} />
              <span style={{ fontSize: 8, fontFamily: 'monospace', color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase' }}>
                Reviewer: {reviewer.customName || getRoleDef(reviewer.role).label}
              </span>
            </div>
          )}

          {task.acceptanceCriteria && (
            <p style={{ fontSize: 8, fontFamily: 'monospace', color: 'rgba(255,255,255,0.2)', lineHeight: '1.3', marginTop: 2 }}>
              {task.acceptanceCriteria}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
