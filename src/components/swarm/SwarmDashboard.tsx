import { useMemo, useCallback, useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Play, Pause, Square, Clock, Users } from 'lucide-react'
import { useSwarmStore } from '../../stores/swarmStore'
import type { SwarmStatus, SwarmAgentRole } from '../../lib/swarm-types'
import { getRoleDef, SWARM_ROLES } from '../../lib/swarm-types'
import { RoleIcon } from './swarm-icons'
import { SwarmAgentCard } from './SwarmAgentCard'
import { SwarmTaskBoard } from './SwarmTaskBoard'
import { SwarmMessageLog } from './SwarmMessageLog'
import { SwarmTopology } from './SwarmTopology'
import SwarmMetrics from './SwarmMetrics'

// ─── Status Badge ────────────────────────────────────────────

const STATUS_STYLES: Record<SwarmStatus, { label: string; color: string; bg: string }> = {
  configuring: { label: 'Configuring', color: 'text-ghost-text-dim', bg: 'bg-ghost-text-dim/10' },
  launching: { label: 'Launching', color: 'text-blue-400', bg: 'bg-blue-400/10' },
  running: { label: 'Running', color: 'text-emerald-400', bg: 'bg-emerald-400/10' },
  paused: { label: 'Paused', color: 'text-amber-400', bg: 'bg-amber-400/10' },
  completed: { label: 'Completed', color: 'text-emerald-400', bg: 'bg-emerald-400/10' },
  error: { label: 'Error', color: 'text-rose-400', bg: 'bg-rose-400/10' },
}

function StatusBadge({ status }: { status: SwarmStatus }) {
  const meta = STATUS_STYLES[status] || STATUS_STYLES.configuring
  return (
    <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${meta.color} ${meta.bg}`}>
      {(status === 'running' || status === 'launching') && (
        <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
      )}
      {meta.label}
    </span>
  )
}

// ─── Elapsed Time (ticks every second) ───────────────────────

function ElapsedTime({ startedAt }: { startedAt?: number }) {
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    if (!startedAt) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [startedAt])

  if (!startedAt) return null
  const elapsed = Math.floor((now - startedAt) / 1000)
  const mins = Math.floor(elapsed / 60)
  const secs = elapsed % 60
  return (
    <span className="flex items-center gap-1 text-xs text-ghost-text-dim/50 tabular-nums">
      <Clock className="w-3 h-3" />
      {mins > 0 ? `${mins}m ${secs}s` : `${secs}s`}
    </span>
  )
}

// ─── Dashboard ───────────────────────────────────────────────

export function SwarmDashboard() {
  const activeSwarmId = useSwarmStore((s) => s.activeSwarmId)
  const activeSwarm = useSwarmStore((s) =>
    s.activeSwarmId ? s.swarms.find((sw) => sw.id === s.activeSwarmId) : undefined,
  )
  const pauseSwarm = useSwarmStore((s) => s.pauseSwarm)
  const resumeSwarm = useSwarmStore((s) => s.resumeSwarm)
  const completeSwarm = useSwarmStore((s) => s.completeSwarm)

  const rosterMap = useMemo(() => {
    if (!activeSwarm) return new Map()
    return new Map(activeSwarm.config.roster.map((r) => [r.id, r]))
  }, [activeSwarm])

  // Group agents by role for structured display
  const roleGroups = useMemo(() => {
    if (!activeSwarm) return []
    const groups = new Map<SwarmAgentRole, { agent: typeof activeSwarm.agents[0]; rosterAgent: typeof activeSwarm.config.roster[0]; index: number }[]>()
    const roleOrder: SwarmAgentRole[] = ['coordinator', 'scout', 'builder', 'reviewer', 'custom']

    activeSwarm.agents.forEach((agent, i) => {
      const rosterAgent = rosterMap.get(agent.rosterId)
      if (!rosterAgent) return
      const role = rosterAgent.role
      if (!groups.has(role)) groups.set(role, [])
      groups.get(role)!.push({ agent, rosterAgent, index: i })
    })

    return roleOrder
      .filter(role => groups.has(role))
      .map(role => ({ role, agents: groups.get(role)! }))
  }, [activeSwarm, rosterMap])

  const handlePause = useCallback(() => {
    if (activeSwarm) pauseSwarm(activeSwarm.id)
  }, [activeSwarm, pauseSwarm])

  const handleResume = useCallback(() => {
    if (activeSwarm) resumeSwarm(activeSwarm.id)
  }, [activeSwarm, resumeSwarm])

  const handleStop = useCallback(() => {
    if (activeSwarm) completeSwarm(activeSwarm.id)
  }, [activeSwarm, completeSwarm])

  if (!activeSwarm) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20">
        <Users className="w-10 h-10 text-ghost-text-dim/20" />
        <p className="text-sm text-ghost-text-dim/50">No active swarm</p>
      </div>
    )
  }

  const isRunning = activeSwarm.status === 'running' || activeSwarm.status === 'launching'
  const isPaused = activeSwarm.status === 'paused'

  return (
    <motion.div
      className="flex flex-col gap-4"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-1">
        <div>
          <h2 className="text-sm font-semibold text-ghost-text uppercase tracking-[0.15em]">
            {activeSwarm.config.name}
          </h2>
          <p className="text-xs text-ghost-text-dim/50 mt-0.5 max-w-md truncate">
            {activeSwarm.config.mission}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <ElapsedTime startedAt={activeSwarm.startedAt} />
          <StatusBadge status={activeSwarm.status} />
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2">
        {isRunning && (
          <button
            onClick={handlePause}
            className="h-8 px-3 rounded-lg border border-white/10 bg-white/[0.02] text-xs font-semibold uppercase tracking-[0.1em] text-ghost-text-dim hover:text-ghost-text hover:border-amber-400/30 hover:bg-amber-400/8 transition-colors flex items-center gap-1.5"
          >
            <Pause className="w-3.5 h-3.5" />
            Pause
          </button>
        )}
        {isPaused && (
          <button
            onClick={handleResume}
            className="h-8 px-3 rounded-lg border border-emerald-400/25 bg-emerald-400/8 text-xs font-semibold uppercase tracking-[0.1em] text-emerald-400 hover:bg-emerald-400/15 transition-colors flex items-center gap-1.5"
          >
            <Play className="w-3.5 h-3.5" />
            Resume
          </button>
        )}
        {(isRunning || isPaused) && (
          <button
            onClick={handleStop}
            className="h-8 px-3 rounded-lg border border-white/10 bg-white/[0.02] text-xs font-semibold uppercase tracking-[0.1em] text-ghost-text-dim hover:text-rose-400 hover:border-rose-400/30 hover:bg-rose-400/8 transition-colors flex items-center gap-1.5"
          >
            <Square className="w-3.5 h-3.5" />
            Stop
          </button>
        )}
        <span className="ml-auto text-xs text-ghost-text-dim/40">
          {activeSwarm.agents.length} agent{activeSwarm.agents.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Metrics Dashboard (Tier 3.1) */}
      {(isRunning || isPaused) && activeSwarmId && (
        <SwarmMetrics swarmId={activeSwarmId} />
      )}

      {/* Topology Visualization */}
      <SwarmTopology
        agents={activeSwarm.agents}
        roster={activeSwarm.config.roster}
      />

      {/* Role Composition Bar */}
      <div className="flex items-center gap-2 px-1">
        {SWARM_ROLES.filter(r => roleGroups.some(g => g.role === r.id)).map(r => {
          const group = roleGroups.find(g => g.role === r.id)
          if (!group) return null
          const activeCount = group.agents.filter(
            a => a.agent.status === 'building' || a.agent.status === 'planning' || a.agent.status === 'review'
          ).length
          return (
            <div key={r.id} className="flex items-center gap-1.5 px-2 py-1 rounded border border-white/[0.06] bg-white/[0.02]">
              <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: r.color }} />
              <span className="text-[10px] font-mono text-white/50 uppercase tracking-widest">{group.agents.length} {r.label}{group.agents.length !== 1 ? 's' : ''}</span>
              {activeCount > 0 && (
                <span className="text-[9px] font-bold font-mono px-1 py-0.5 rounded bg-white/[0.06]" style={{ color: r.color }}>
                  {activeCount} active
                </span>
              )}
            </div>
          )
        })}
      </div>

      {/* Agent Cards — Grouped by Role */}
      {roleGroups.map(({ role, agents: groupAgents }) => {
        const roleDef = getRoleDef(role)
        return (
          <div key={role}>
            <div className="flex items-center gap-2 mb-2 px-1">
              <RoleIcon iconName={roleDef.icon} className="w-3.5 h-3.5" color={roleDef.color} />
              <h3 className="text-xs font-semibold uppercase tracking-[0.15em]" style={{ color: roleDef.color + 'aa' }}>
                {roleDef.label}{groupAgents.length > 1 ? 's' : ''}
              </h3>
              <span className="text-[10px] text-ghost-text-dim/40 font-mono">
                {roleDef.description}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-2">
              <AnimatePresence>
                {groupAgents.map(({ agent, rosterAgent, index }) => (
                  <SwarmAgentCard
                    key={agent.rosterId}
                    agent={agent}
                    rosterAgent={rosterAgent}
                    index={index}
                  />
                ))}
              </AnimatePresence>
            </div>
          </div>
        )
      })}

      {/* Task Board */}
      <SwarmTaskBoard tasks={activeSwarm.tasks} roster={activeSwarm.config.roster} />

      {/* Message Log */}
      <SwarmMessageLog messages={activeSwarm.messages} roster={activeSwarm.config.roster} />
    </motion.div>
  )
}
