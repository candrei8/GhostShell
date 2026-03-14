import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ListChecks, ChevronDown } from 'lucide-react'
import type { SwarmTaskItem } from '../../lib/swarm-types'
import { SwarmTaskCard } from './SwarmTaskCard'

// ─── Props ───────────────────────────────────────────────────

interface SwarmTaskQueueProps {
  tasks: SwarmTaskItem[]
}

// ─── Task Queue ──────────────────────────────────────────────

export default function SwarmTaskQueue({ tasks }: SwarmTaskQueueProps) {
  const { active, queued, completed } = useMemo(() => {
    const active: SwarmTaskItem[] = []
    const queued: SwarmTaskItem[] = []
    const completed: SwarmTaskItem[] = []

    for (const t of tasks) {
      switch (t.status) {
        case 'assigned':
        case 'planning':
        case 'building':
        case 'review':
          active.push(t)
          break
        case 'open':
          queued.push(t)
          break
        case 'done':
          completed.push(t)
          break
      }
    }

    return { active, queued, completed }
  }, [tasks])

  const [completedOpen, setCompletedOpen] = useState(() => completed.length <= 3)

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <ListChecks className="w-4 h-4 text-ghost-text-dim" />
        <h3 className="text-xs font-semibold text-ghost-text uppercase tracking-[0.15em]">
          Tasks
        </h3>
        <span className="text-[10px] font-mono bg-white/[0.06] text-ghost-text-dim px-1.5 py-0.5 rounded">
          {tasks.length}
        </span>
      </div>

      {/* Empty state */}
      {tasks.length === 0 && (
        <p className="text-xs text-ghost-text-dim text-center py-6">(no tasks yet)</p>
      )}

      {/* Active section */}
      {active.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold text-ghost-text-dim uppercase tracking-wider px-0.5">
            Active
          </span>
          <div className="space-y-1.5">
            <AnimatePresence mode="popLayout">
              {active.map((task) => (
                <motion.div
                  key={task.id}
                  layout
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                >
                  <SwarmTaskCard task={task} allTasks={tasks} />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* Queued section */}
      {queued.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold text-ghost-text-dim uppercase tracking-wider px-0.5">
            Queued
          </span>
          <div className="space-y-1.5">
            <AnimatePresence mode="popLayout">
              {queued.map((task) => (
                <motion.div
                  key={task.id}
                  layout
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                >
                  <SwarmTaskCard task={task} allTasks={tasks} />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* Completed section (collapsible) */}
      {completed.length > 0 && (
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={() => setCompletedOpen((v) => !v)}
            className="flex items-center gap-1 text-[10px] font-semibold text-ghost-text-dim uppercase tracking-wider px-0.5 hover:text-ghost-text-dim/60 transition-colors"
          >
            <ChevronDown
              className={`w-3 h-3 transition-transform duration-200 ${completedOpen ? '' : '-rotate-90'}`}
            />
            Completed
            <span className="text-[10px] font-mono text-ghost-text-dim ml-1">
              {completed.length}
            </span>
          </button>
          <AnimatePresence>
            {completedOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: 'easeInOut' }}
                className="overflow-hidden"
              >
                <div className="space-y-1.5">
                  {completed.map((task) => (
                    <motion.div
                      key={task.id}
                      layout
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                    >
                      <SwarmTaskCard task={task} allTasks={tasks} />
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}
