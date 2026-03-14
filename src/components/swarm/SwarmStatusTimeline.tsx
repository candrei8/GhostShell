import React, { useMemo } from 'react'
import { SwarmStatus, SwarmTaskItem } from '../../lib/swarm-types'

// ─── Types ───────────────────────────────────────────────────

interface SwarmStatusTimelineProps {
  status: SwarmStatus
  tasks: SwarmTaskItem[]
  startedAt?: number
}

type Phase = 'planning' | 'building' | 'review' | 'complete'

interface PhaseInfo {
  id: Phase
  label: string
}

const PHASES: PhaseInfo[] = [
  { id: 'planning', label: 'Planning' },
  { id: 'building', label: 'Building' },
  { id: 'review', label: 'Review' },
  { id: 'complete', label: 'Complete' },
]

// ─── Phase Detection ─────────────────────────────────────────

function detectPhase(status: SwarmStatus, tasks: SwarmTaskItem[]): Phase {
  // If swarm is completed, always show Complete
  if (status === 'completed') return 'complete'

  // If all tasks are done, show Complete
  if (tasks.length > 0 && tasks.every((t) => t.status === 'done')) return 'complete'

  // If any task is in review, show Review
  if (tasks.some((t) => t.status === 'review')) return 'review'

  // If any task is assigned, planning, or building, show Building
  if (tasks.some((t) => t.status === 'assigned' || t.status === 'planning' || t.status === 'building'))
    return 'building'

  // Default: Planning (no tasks, or all tasks are open)
  return 'planning'
}

// ─── Component ───────────────────────────────────────────────

const SwarmStatusTimeline: React.FC<SwarmStatusTimelineProps> = ({ status, tasks, startedAt }) => {
  const currentPhase = useMemo(() => detectPhase(status, tasks), [status, tasks])
  const currentIndex = PHASES.findIndex((p) => p.id === currentPhase)

  // Elapsed time since start
  const elapsed = useMemo(() => {
    if (!startedAt) return null
    const seconds = Math.floor((Date.now() - startedAt) / 1000)
    if (seconds < 60) return `${seconds}s`
    const minutes = Math.floor(seconds / 60)
    const secs = seconds % 60
    if (minutes < 60) return `${minutes}m ${secs}s`
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return `${hours}h ${mins}m`
  }, [startedAt])

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
      {/* Header row */}
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-[10px] font-medium uppercase tracking-wider text-ghost-text-dim">
          Progress
        </span>
        {elapsed && (
          <span className="text-[10px] tabular-nums text-ghost-text-dim">{elapsed}</span>
        )}
      </div>

      {/* Timeline */}
      <div className="relative flex items-start justify-between">
        {/* Connecting line (behind circles) */}
        <div className="absolute top-[5px] left-[5px] right-[5px] flex">
          {PHASES.slice(0, -1).map((phase, i) => {
            const isCompleted = i < currentIndex
            return (
              <div
                key={`line-${phase.id}`}
                className={`flex-1 h-px ${isCompleted ? 'bg-emerald-400' : 'bg-white/10'}`}
              />
            )
          })}
        </div>

        {/* Phase nodes */}
        {PHASES.map((phase, i) => {
          const isCompleted = i < currentIndex
          const isActive = i === currentIndex
          const isFuture = i > currentIndex

          return (
            <div key={phase.id} className="relative z-10 flex flex-col items-center" style={{ minWidth: 40 }}>
              {/* Circle */}
              <div className="relative flex items-center justify-center">
                {/* Pulse ring for active phase */}
                {isActive && (
                  <span className="absolute w-4 h-4 rounded-full animate-ping bg-sky-400 opacity-25" />
                )}
                <span
                  className={`relative block w-2.5 h-2.5 rounded-full ${
                    isCompleted
                      ? 'bg-emerald-400'
                      : isActive
                        ? 'bg-sky-400'
                        : 'bg-white/15'
                  }`}
                />
              </div>

              {/* Label */}
              <span
                className={`mt-1.5 text-[10px] font-medium leading-none select-none ${
                  isCompleted
                    ? 'text-emerald-400'
                    : isActive
                      ? 'text-sky-400'
                      : isFuture
                        ? 'text-white/30'
                        : 'text-white/50'
                }`}
              >
                {phase.label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default SwarmStatusTimeline
