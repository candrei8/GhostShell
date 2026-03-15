import { useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Circle, CheckCircle2, Loader2, AlertCircle, ListChecks, ArrowRight, GitBranch } from 'lucide-react'
import type { SwarmTaskItem, SwarmRosterAgent } from '../../lib/swarm-types'
import { getRoleDef, SWARM_ROLES } from '../../lib/swarm-types'

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

// ─── Owner Role Helper ───────────────────────────────────────

function ownerRoleColor(ownerName: string, roster?: SwarmRosterAgent[]): { color: string; roleLabel: string } {
  if (!roster || !ownerName) return { color: '#6b7280', roleLabel: '' }
  // Match owner name to roster. Owner is formatted as "Role N" or custom name.
  const roleDefs = SWARM_ROLES
  for (const def of roleDefs) {
    if (ownerName.toLowerCase().startsWith(def.label.toLowerCase())) {
      return { color: def.color, roleLabel: def.label }
    }
  }
  // Check custom names
  for (const agent of roster) {
    if (agent.customName === ownerName) {
      const def = getRoleDef(agent.role)
      return { color: def.color, roleLabel: def.label }
    }
  }
  return { color: '#6b7280', roleLabel: '' }
}

// ─── Task Row ────────────────────────────────────────────────

function TaskRow({ task, roster }: { task: SwarmTaskItem; roster?: SwarmRosterAgent[] }) {
  const meta = TASK_STATUS[task.status] || TASK_STATUS.open
  const StatusIcon = meta.icon
  const ownerInfo = ownerRoleColor(task.owner, roster)

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      className="flex items-start gap-3 px-4 py-2.5 hover:bg-white/[0.02] transition-colors rounded-lg"
    >
      <StatusIcon className={`w-4 h-4 shrink-0 mt-0.5 ${meta.color} ${meta.spin ? 'animate-spin' : ''}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <p className="text-sm text-ghost-text truncate">{task.title}</p>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${meta.color} bg-white/[0.06] shrink-0`}>
            {meta.label}
          </span>
        </div>
        {/* Owner with role color */}
        <div className="flex items-center gap-2 flex-wrap">
          {task.owner && (
            <div className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: ownerInfo.color }} />
              <span className="text-[10px] font-mono text-white/50">{task.owner}</span>
            </div>
          )}
          {/* Reviewer assignment */}
          {task.reviewer && (
            <>
              <ArrowRight className="w-2.5 h-2.5 text-white/20" />
              <span className="text-[10px] font-mono text-purple-400/60">{task.reviewer}</span>
            </>
          )}
          {/* Dependencies */}
          {task.dependsOn.length > 0 && (
            <div className="flex items-center gap-1 ml-1">
              <GitBranch className="w-2.5 h-2.5 text-white/20" />
              <span className="text-[10px] font-mono text-white/25">
                depends: {task.dependsOn.join(', ')}
              </span>
            </div>
          )}
        </div>
        {task.ownedFiles.length > 0 && (
          <p className="text-[10px] text-ghost-text-dim/30 truncate font-mono mt-0.5">
            {task.ownedFiles.join(', ')}
          </p>
        )}
      </div>
    </motion.div>
  )
}

// ─── Task Board ──────────────────────────────────────────────

interface SwarmTaskBoardProps {
  tasks: SwarmTaskItem[]
  roster?: SwarmRosterAgent[]
}

export function SwarmTaskBoard({ tasks, roster }: SwarmTaskBoardProps) {
  const { active, completed, ownerSummary } = useMemo(() => {
    const active: SwarmTaskItem[] = []
    const completed: SwarmTaskItem[] = []
    const owners = new Map<string, number>()
    for (const t of tasks) {
      if (t.status === 'done') completed.push(t)
      else active.push(t)
      if (t.owner) owners.set(t.owner, (owners.get(t.owner) || 0) + 1)
    }
    // Build owner summary with role colors
    const ownerSummary = Array.from(owners.entries()).map(([name, count]) => ({
      name,
      count,
      ...ownerRoleColor(name, roster),
    }))
    return { active, completed, ownerSummary }
  }, [tasks, roster])

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

      {/* Owner summary strip */}
      {ownerSummary.length > 0 && (
        <div className="flex items-center gap-2 px-4 pt-2 flex-wrap">
          {ownerSummary.map(({ name, count, color }) => (
            <div key={name} className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
              <span className="text-[10px] font-mono text-white/35">{name}: {count}</span>
            </div>
          ))}
        </div>
      )}

      {/* Task List */}
      <div className="flex flex-col py-2 max-h-72 overflow-y-auto sidebar-scroll">
        {tasks.length === 0 ? (
          <p className="text-xs text-ghost-text-dim/40 text-center py-6">No tasks yet</p>
        ) : (
          <AnimatePresence mode="popLayout">
            {active.map((task) => (
              <TaskRow key={task.id} task={task} roster={roster} />
            ))}
            {completed.map((task) => (
              <TaskRow key={task.id} task={task} roster={roster} />
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  )
}
