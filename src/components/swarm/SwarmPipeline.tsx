// SwarmPipeline — visual 6-stage progress bar for GhostSwarm lifecycle
// Stages: MAP → PLAN → LAUNCH → MONITOR → REPORT → ARCHIVE

import { motion } from 'framer-motion'
import {
  Network,
  ListTodo,
  Rocket,
  Activity,
  FileText,
  Archive,
  Check,
} from 'lucide-react'
import type { Swarm } from '../../lib/swarm-types'
import type { SwarmPipelineStage } from '../../lib/swarm-types'
import { SWARM_PIPELINE_STAGES } from '../../lib/swarm-types'
import type { LucideIcon } from 'lucide-react'

// ─── Stage Metadata ─────────────────────────────────────────

interface StageMeta {
  id: SwarmPipelineStage
  label: string
  Icon: LucideIcon
}

const STAGE_META: StageMeta[] = [
  { id: 'map', label: 'MAP', Icon: Network },
  { id: 'plan', label: 'PLAN', Icon: ListTodo },
  { id: 'launch', label: 'LAUNCH', Icon: Rocket },
  { id: 'monitor', label: 'MONITOR', Icon: Activity },
  { id: 'report', label: 'REPORT', Icon: FileText },
  { id: 'archive', label: 'ARCHIVE', Icon: Archive },
]

// ─── Derive Pipeline State from Swarm ───────────────────────

export function deriveStage(swarm: Swarm): SwarmPipelineStage {
  if (swarm.status === 'configuring') return 'plan'
  if (swarm.status === 'launching') return 'launch'
  if (swarm.status === 'running') return 'monitor'
  if (swarm.status === 'paused') return 'monitor'
  if (swarm.status === 'completed') return 'archive'
  if (swarm.status === 'error') return 'monitor'
  return 'monitor'
}

export function getCompletedStages(swarm: Swarm): SwarmPipelineStage[] {
  const current = deriveStage(swarm)
  const completed: SwarmPipelineStage[] = []

  // 'map' is completed once we've moved past configuring (analysis ran during launch)
  if (current !== 'plan') completed.push('map')

  // 'plan' is completed once past configuring and map
  if (current !== 'plan' && current !== 'map') completed.push('plan')

  // 'launch' is completed if swarm is running or later
  if (['monitor', 'report', 'archive'].includes(current)) completed.push('launch')

  // 'monitor' is completed if swarm reached report or archive
  if (['report', 'archive'].includes(current)) completed.push('monitor')

  // 'report' is completed if swarm reached archive
  if (current === 'archive') completed.push('report')

  return completed
}

// ─── Colors ─────────────────────────────────────────────────

const COLOR_ACTIVE = '#38bdf8'     // sky-400
const COLOR_COMPLETED = '#10b981'  // emerald-500
const COLOR_FUTURE = 'rgba(255, 255, 255, 0.10)'
const COLOR_FUTURE_ICON = 'rgba(255, 255, 255, 0.20)'

// ─── Component ──────────────────────────────────────────────

interface SwarmPipelineProps {
  currentStage: SwarmPipelineStage
  completedStages: SwarmPipelineStage[]
  onStageClick?: (stage: SwarmPipelineStage) => void
}

export function SwarmPipeline({ currentStage, completedStages, onStageClick }: SwarmPipelineProps) {
  const currentIdx = SWARM_PIPELINE_STAGES.indexOf(currentStage)

  return (
    <div className="border border-white/[0.06] rounded-lg bg-white/[0.02] px-4 py-2">
      <div className="flex items-center justify-between relative">
        {STAGE_META.map((stage, i) => {
          const isCompleted = completedStages.includes(stage.id)
          const isActive = stage.id === currentStage
          const isFuture = !isCompleted && !isActive

          // Determine colors
          let nodeBg: string
          let nodeBorder: string
          let iconColor: string
          let labelColor: string

          if (isCompleted) {
            nodeBg = COLOR_COMPLETED
            nodeBorder = COLOR_COMPLETED
            iconColor = '#ffffff'
            labelColor = COLOR_COMPLETED
          } else if (isActive) {
            nodeBg = COLOR_ACTIVE
            nodeBorder = COLOR_ACTIVE
            iconColor = '#ffffff'
            labelColor = COLOR_ACTIVE
          } else {
            nodeBg = 'rgba(255, 255, 255, 0.06)'
            nodeBorder = 'rgba(255, 255, 255, 0.10)'
            iconColor = COLOR_FUTURE_ICON
            labelColor = 'rgba(255, 255, 255, 0.20)'
          }

          // Clickable if completed (for review)
          const clickable = isCompleted && !!onStageClick

          // Connecting line (not before first node)
          let lineColor: string | undefined
          if (i > 0) {
            const prevCompleted = completedStages.includes(SWARM_PIPELINE_STAGES[i - 1])
            const prevActive = SWARM_PIPELINE_STAGES[i - 1] === currentStage
            if (isCompleted) {
              lineColor = COLOR_COMPLETED
            } else if (isActive && (prevCompleted || prevActive)) {
              lineColor = COLOR_ACTIVE
            } else {
              lineColor = COLOR_FUTURE
            }
          }

          return (
            <div
              key={stage.id}
              className="flex items-center"
              style={{ flex: i === STAGE_META.length - 1 ? '0 0 auto' : '1 1 0' }}
            >
              {/* Node + label column */}
              <div className="flex flex-col items-center relative z-10">
                <motion.button
                  type="button"
                  disabled={!clickable}
                  onClick={clickable ? () => onStageClick!(stage.id) : undefined}
                  className={`
                    flex items-center justify-center rounded-full shrink-0
                    w-7 h-7 sm:w-7 sm:h-7
                    ${clickable ? 'cursor-pointer' : 'cursor-default'}
                  `}
                  style={{
                    backgroundColor: nodeBg,
                    border: `2px solid ${nodeBorder}`,
                  }}
                  initial={false}
                  animate={{
                    backgroundColor: nodeBg,
                    borderColor: nodeBorder,
                  }}
                  transition={{ duration: 0.3 }}
                  title={`${stage.label}${isCompleted ? ' (completed)' : isActive ? ' (active)' : ''}`}
                >
                  {isCompleted ? (
                    <Check className="w-3 h-3" style={{ color: iconColor }} />
                  ) : (
                    <stage.Icon className="w-3 h-3" style={{ color: iconColor }} />
                  )}
                </motion.button>
                {/* Label — hidden on very narrow screens */}
                <span
                  className="hidden sm:block text-[10px] font-mono uppercase tracking-widest mt-1 select-none"
                  style={{ color: labelColor }}
                >
                  {stage.label}
                </span>
              </div>

              {/* Connecting line to next node */}
              {i < STAGE_META.length - 1 && (
                <div
                  className="flex-1 h-[2px] mx-1"
                  style={{ backgroundColor: lineColor || COLOR_FUTURE }}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
