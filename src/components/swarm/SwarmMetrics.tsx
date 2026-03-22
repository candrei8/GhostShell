// SwarmMetrics — enhanced metrics dashboard for GhostSwarm (Tier 3.1)
// Shows: task progress, agent utilization, bottleneck detection, cost tracking

import React from 'react'
import {
  CheckCircle2,
  AlertTriangle,
  Clock,
  Users,
  Zap,
  BarChart3,
  Loader2,
} from 'lucide-react'
import { useSwarmStore } from '../../stores/swarmStore'

// ─── Types ───────────────────────────────────────────────────

interface AgentUtilization {
  total: number
  working: number
  idle: number
  dead: number
  utilPercent: number
}

// ─── Helpers ─────────────────────────────────────────────────

function computeAgentUtilization(swarmId: string): AgentUtilization {
  const health = useSwarmStore.getState().agentHealth[swarmId] || {}
  const values = Object.values(health)
  const total = values.length || 1
  const dead = values.filter(h => h.status === 'dead').length
  const stale = values.filter(h => h.status === 'stale').length
  const healthy = values.filter(h => h.status === 'healthy').length
  const working = healthy + stale // stale = alive but slow output
  const idle = total - working - dead

  return {
    total,
    working,
    idle: Math.max(0, idle),
    dead,
    utilPercent: total > 0 ? Math.round((working / total) * 100) : 0,
  }
}

function statusColor(percent: number): string {
  if (percent >= 70) return 'text-emerald-400'
  if (percent >= 40) return 'text-amber-400'
  return 'text-red-400'
}

function barColor(percent: number): string {
  if (percent >= 70) return 'bg-emerald-400'
  if (percent >= 40) return 'bg-amber-400'
  return 'bg-red-400'
}

// ─── Component ──────────────────────────────────────────────

interface SwarmMetricsProps {
  swarmId: string
}

const SwarmMetrics: React.FC<SwarmMetricsProps> = ({ swarmId }) => {
  const swarm = useSwarmStore(s => s.getSwarm(swarmId))
  // Subscribe to tick so metrics re-render on the centralized 1s interval
  useSwarmStore(s => s.tick)

  if (!swarm) return null

  const util = computeAgentUtilization(swarmId)
  const tasks = {
    total: swarm.tasks.length,
    open: swarm.tasks.filter(t => t.status === 'open').length,
    assigned: swarm.tasks.filter(t => t.status === 'assigned').length,
    planning: swarm.tasks.filter(t => t.status === 'planning').length,
    building: swarm.tasks.filter(t => t.status === 'building').length,
    review: swarm.tasks.filter(t => t.status === 'review').length,
    done: swarm.tasks.filter(t => t.status === 'done').length,
    progressPercent: swarm.tasks.length > 0
      ? Math.round((swarm.tasks.filter(t => t.status === 'done').length / swarm.tasks.length) * 100)
      : 0,
    blockedCount: swarm.tasks.filter(t => {
      if (!['assigned', 'building', 'planning', 'review'].includes(t.status)) return false
      const deps = t.dependsOn || []
      return deps.length > 0 && !deps.every(depId => {
        const dep = swarm.tasks.find(d => d.id === depId)
        return dep && dep.status === 'done'
      })
    }).length,
  }

  const hasBottleneck = tasks.blockedCount > 0 || util.dead > 0
  const elapsed = swarm.startedAt ? Date.now() - swarm.startedAt : 0
  const elapsedMin = Math.round(elapsed / 60_000)
  const tasksPerMin = elapsedMin > 0 && tasks.done > 0
    ? (tasks.done / elapsedMin).toFixed(1)
    : '—'

  return (
    <div className="border border-white/[0.06] rounded-lg bg-white/[0.02] p-3 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <BarChart3 className="w-3.5 h-3.5 text-ghost-accent" />
          <span className="text-xs font-medium text-ghost-text">Swarm Metrics</span>
        </div>
        <span className="text-[10px] text-ghost-text-dim tabular-nums">
          {elapsedMin}m elapsed
        </span>
      </div>

      {/* Task Progress Bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-ghost-text-dim">Task Progress</span>
          <span className={`text-[10px] font-mono tabular-nums font-medium ${statusColor(tasks.progressPercent)}`}>
            {tasks.done}/{tasks.total} ({tasks.progressPercent}%)
          </span>
        </div>
        <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${barColor(tasks.progressPercent)}`}
            style={{ width: `${Math.max(tasks.progressPercent, tasks.total > 0 ? 2 : 0)}%` }}
          />
        </div>
      </div>

      {/* Task Status Breakdown */}
      <div className="grid grid-cols-3 gap-2">
        <MetricPill icon={<Clock className="w-3 h-3" />} label="Open" value={tasks.open} color="text-ghost-text-dim" />
        <MetricPill icon={<Loader2 className="w-3 h-3 animate-spin" />} label="Building" value={tasks.building + tasks.planning} color="text-sky-400" />
        <MetricPill icon={<CheckCircle2 className="w-3 h-3" />} label="Done" value={tasks.done} color="text-emerald-400" />
      </div>

      {/* Agent Utilization */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <Users className="w-3 h-3 text-ghost-text-dim" />
            <span className="text-[10px] text-ghost-text-dim">Agent Utilization</span>
          </div>
          <span className={`text-[10px] font-mono tabular-nums font-medium ${statusColor(util.utilPercent)}`}>
            {util.working}/{util.total} active ({util.utilPercent}%)
          </span>
        </div>
        <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${barColor(util.utilPercent)}`}
            style={{ width: `${Math.max(util.utilPercent, util.total > 0 ? 2 : 0)}%` }}
          />
        </div>
      </div>

      {/* Velocity */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <Zap className="w-3 h-3 text-ghost-text-dim" />
          <span className="text-[10px] text-ghost-text-dim">Velocity</span>
        </div>
        <span className="text-[10px] font-mono tabular-nums text-ghost-text-dim">
          {tasksPerMin} tasks/min
        </span>
      </div>

      {/* Bottleneck Warnings */}
      {hasBottleneck && (
        <div className="border-t border-white/[0.06] pt-2 space-y-1">
          {tasks.blockedCount > 0 && (
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
              <span className="text-[10px] text-amber-400">
                {tasks.blockedCount} task{tasks.blockedCount > 1 ? 's' : ''} blocked by unresolved dependencies
              </span>
            </div>
          )}
          {util.dead > 0 && (
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="w-3 h-3 text-red-400 shrink-0" />
              <span className="text-[10px] text-red-400">
                {util.dead} agent{util.dead > 1 ? 's' : ''} dead — restart needed
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Sub-component ──────────────────────────────────────────

interface MetricPillProps {
  icon: React.ReactNode
  label: string
  value: number
  color: string
}

const MetricPill: React.FC<MetricPillProps> = ({ icon, label, value, color }) => (
  <div className="flex items-center gap-1 bg-white/[0.03] rounded px-2 py-1">
    <span className={color}>{icon}</span>
    <span className="text-[10px] text-ghost-text-dim">{label}</span>
    <span className={`text-[10px] font-mono tabular-nums font-medium ${color}`}>{value}</span>
  </div>
)

export default SwarmMetrics
