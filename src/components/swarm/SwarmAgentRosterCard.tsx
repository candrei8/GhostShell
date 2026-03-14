import React, { useMemo } from 'react'
import { motion } from 'framer-motion'
import { Users, Loader2 } from 'lucide-react'
import type { SwarmAgentStatus, SwarmRosterAgent } from '../../lib/swarm-types'
import { getRoleDef } from '../../lib/swarm-types'
import type { EnrichedSwarmAgent } from './SwarmCoordinationBoard'
import { RoleIcon } from './swarm-icons'

// ─── Status dot colors ──────────────────────────────────────

const STATUS_DOT_COLORS: Record<SwarmAgentStatus, string> = {
  waiting: 'bg-gray-400',
  planning: 'bg-amber-400',
  building: 'bg-blue-400',
  review: 'bg-violet-400',
  done: 'bg-emerald-400',
  error: 'bg-rose-400',
  idle: 'bg-gray-400',
}

const STATUS_TEXT_COLORS: Record<SwarmAgentStatus, string> = {
  waiting: 'text-gray-400',
  planning: 'text-amber-400',
  building: 'text-blue-400',
  review: 'text-violet-400',
  done: 'text-emerald-400',
  error: 'text-rose-400',
  idle: 'text-gray-400',
}

const STATUS_LABELS: Record<SwarmAgentStatus, string> = {
  waiting: 'WAITING',
  planning: 'PLANNING',
  building: 'BUILDING',
  review: 'REVIEW',
  done: 'DONE',
  error: 'ERROR',
  idle: 'IDLE',
}

// ─── Health dot colors ──────────────────────────────────────

const HEALTH_DOT_COLORS: Record<string, string> = {
  healthy: 'bg-emerald-400',
  stale: 'bg-amber-400',
  dead: 'bg-rose-400',
}

const HEALTH_LABELS: Record<string, string> = {
  healthy: 'HEALTHY',
  stale: 'STALE',
  dead: 'DEAD',
}

// ─── Props ──────────────────────────────────────────────────

interface SwarmAgentRosterCardProps {
  agent: EnrichedSwarmAgent
  rosterAgent: SwarmRosterAgent
  index: number
  health?: { lastSeen: number; status: 'healthy' | 'stale' | 'dead' }
  onClick?: () => void
}

// ─── Component ──────────────────────────────────────────────

export function SwarmAgentRosterCard({ agent, rosterAgent, index, health, onClick }: SwarmAgentRosterCardProps) {
  const roleDef = useMemo(() => getRoleDef(rosterAgent.role), [rosterAgent.role])
  const agentLabel = rosterAgent.customName || `${roleDef.label} ${index + 1}`

  const dotColor = STATUS_DOT_COLORS[agent.status] || STATUS_DOT_COLORS.idle
  const textColor = STATUS_TEXT_COLORS[agent.status] || STATUS_TEXT_COLORS.idle
  const statusLabel = STATUS_LABELS[agent.status] || 'IDLE'

  const isBuilding = agent.status === 'building'
  const isWaiting = agent.status === 'waiting'

  // Context gauge
  const hasContext = agent.contextMetrics && agent.contextMetrics.maxTokens > 0
  const contextPercent = hasContext
    ? Math.min(100, Math.round((agent.contextMetrics!.tokenEstimate / agent.contextMetrics!.maxTokens) * 100))
    : 0

  const contextBarColor =
    contextPercent >= 90
      ? 'bg-rose-400'
      : contextPercent >= 70
        ? 'bg-amber-400'
        : 'bg-sky-400'

  // Sub-agent count
  const subAgentCount = agent.subAgents?.length || 0

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.2, delay: index * 0.03 }}
      onClick={onClick}
      className={`rounded-lg border p-2.5 cursor-pointer hover:bg-white/[0.03] transition-colors ${
        isBuilding
          ? 'border-emerald-400/20 bg-white/[0.02]'
          : 'border-white/[0.06] bg-white/[0.02]'
      }`}
    >
      {/* Row 1: Role badge, name, status */}
      <div className="flex items-center gap-2">
        {/* Role Badge */}
        <div
          className="w-5 h-5 rounded-md flex items-center justify-center shrink-0"
          style={{ backgroundColor: `${roleDef.color}26` }}
        >
          <RoleIcon iconName={roleDef.icon} className="w-3 h-3" color={roleDef.color} />
        </div>

        {/* Agent Name */}
        <span className="flex-1 min-w-0 text-xs font-medium text-ghost-text truncate">
          {agentLabel}
        </span>

        {/* Sub-agent badge */}
        {subAgentCount > 0 && (
          <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-white/[0.06] shrink-0">
            <Users className="w-2.5 h-2.5 text-ghost-text-dim" />
            <span className="text-[9px] font-medium text-ghost-text-dim tabular-nums">
              {subAgentCount}
            </span>
          </div>
        )}

        {/* Loading spinner for waiting state */}
        {isWaiting && (
          <Loader2 className="w-3 h-3 text-gray-400 animate-spin shrink-0" />
        )}

        {/* Health indicator */}
        {health && health.status !== 'healthy' && (
          <div
            className={`w-1.5 h-1.5 rounded-full ${HEALTH_DOT_COLORS[health.status] || 'bg-gray-400'} shrink-0`}
            title={`${HEALTH_LABELS[health.status] || 'UNKNOWN'} — last seen ${new Date(health.lastSeen).toLocaleTimeString()}`}
          />
        )}

        {/* Status dot + label */}
        <div className="flex items-center gap-1.5 shrink-0">
          <div className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
          <span className={`text-[10px] font-medium uppercase ${textColor}`}>
            {statusLabel}
          </span>
        </div>
      </div>

      {/* Row 2: Current activity */}
      {agent.currentActivity && (
        <div className="mt-1 pl-7">
          <p className="text-[10px] text-ghost-text-dim truncate">
            {agent.currentActivity}
          </p>
        </div>
      )}

      {/* Row 3: Mini context gauge */}
      {hasContext && (
        <div className="mt-1.5 pl-7 flex items-center gap-2">
          <div
            className="flex-1 h-[4px] rounded-full bg-white/[0.06] overflow-hidden"
            title={`${contextPercent}% context used`}
          >
            <div
              className={`h-full rounded-full ${contextBarColor} transition-all duration-500`}
              style={{ width: `${contextPercent}%` }}
            />
          </div>
          <span className="text-[9px] text-ghost-text-dim tabular-nums shrink-0">
            {contextPercent}%
          </span>
        </div>
      )}
    </motion.div>
  )
}
