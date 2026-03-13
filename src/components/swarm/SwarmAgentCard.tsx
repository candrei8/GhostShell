import { useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  Eye,
  Wifi,
  WifiOff,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Clock,
} from 'lucide-react'
import type { SwarmAgentState, SwarmAgentStatus, SwarmRosterAgent } from '../../lib/swarm-types'
import { getRoleDef } from '../../lib/swarm-types'
import { RoleIcon } from './swarm-icons'

// ─── Status Config ───────────────────────────────────────────

interface StatusMeta {
  label: string
  color: string
  bgColor: string
  icon: React.FC<{ className?: string }>
  pulse?: boolean
}

const STATUS_MAP: Record<SwarmAgentStatus, StatusMeta> = {
  waiting: { label: 'Waiting', color: 'text-ghost-text-dim/60', bgColor: 'bg-ghost-text-dim/10', icon: Clock },
  idle: { label: 'Idle', color: 'text-ghost-text-dim/60', bgColor: 'bg-ghost-text-dim/10', icon: WifiOff },
  planning: { label: 'Planning', color: 'text-blue-400', bgColor: 'bg-blue-400/10', icon: Loader2, pulse: true },
  building: { label: 'Building', color: 'text-amber-400', bgColor: 'bg-amber-400/10', icon: Loader2, pulse: true },
  review: { label: 'Review', color: 'text-purple-400', bgColor: 'bg-purple-400/10', icon: Eye },
  done: { label: 'Done', color: 'text-emerald-400', bgColor: 'bg-emerald-400/10', icon: CheckCircle2 },
  error: { label: 'Error', color: 'text-rose-400', bgColor: 'bg-rose-400/10', icon: AlertCircle },
}

// ─── Agent Card ──────────────────────────────────────────────

interface SwarmAgentCardProps {
  agent: SwarmAgentState
  rosterAgent: SwarmRosterAgent
  index: number
}

export function SwarmAgentCard({ agent, rosterAgent, index }: SwarmAgentCardProps) {
  const roleDef = useMemo(() => getRoleDef(rosterAgent.role), [rosterAgent.role])
  const statusMeta = STATUS_MAP[agent.status] || STATUS_MAP.idle
  const StatusIcon = statusMeta.icon

  const agentLabel = rosterAgent.customName || `${roleDef.label} ${index + 1}`

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="ghost-section-card rounded-xl p-4 flex flex-col gap-3 group"
    >
      {/* Header */}
      <div className="flex items-center gap-3">
        {/* Avatar */}
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
          style={{ backgroundColor: `${roleDef.color}18` }}
        >
          <RoleIcon iconName={roleDef.icon} className="w-4 h-4" color={roleDef.color} />
        </div>

        {/* Name & Role */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-ghost-text truncate">{agentLabel}</p>
          <p className="text-xs text-ghost-text-dim/50 capitalize">{roleDef.label}</p>
        </div>

        {/* Status Badge */}
        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${statusMeta.color} ${statusMeta.bgColor}`}>
          <StatusIcon className={`w-3 h-3 ${statusMeta.pulse ? 'animate-spin' : ''}`} />
          {statusMeta.label}
        </div>
      </div>

      {/* Current Task */}
      {agent.currentTask && (
        <div className="px-1">
          <p className="text-xs text-ghost-text-dim/70 truncate">
            <span className="text-ghost-text-dim/40 mr-1">Task:</span>
            {agent.currentTask}
          </p>
        </div>
      )}

      {/* Progress */}
      {agent.progress && (
        <div className="px-1">
          <p className="text-xs text-ghost-text-dim/50 truncate">{agent.progress}</p>
        </div>
      )}

      {/* Footer Stats */}
      <div className="flex items-center gap-4 pt-1 border-t border-white/[0.04]">
        <span className="text-xs text-ghost-text-dim/40 tabular-nums">
          {agent.filesOwned.length} file{agent.filesOwned.length !== 1 ? 's' : ''}
        </span>
        <span className="text-xs text-ghost-text-dim/40 tabular-nums">
          {agent.messagesCount} msg{agent.messagesCount !== 1 ? 's' : ''}
        </span>
        {/* Connection indicator */}
        <div className="ml-auto">
          {agent.agentId ? (
            <Wifi className="w-3 h-3 text-emerald-400/50" />
          ) : (
            <WifiOff className="w-3 h-3 text-ghost-text-dim/20" />
          )}
        </div>
      </div>
    </motion.div>
  )
}
