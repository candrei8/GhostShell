import { useMemo } from 'react'
import { motion } from 'framer-motion'
import type { SwarmAgentState, SwarmAgentStatus, SwarmRosterAgent } from '../../lib/swarm-types'
import { getRoleDef } from '../../lib/swarm-types'

// ─── Status Config ───────────────────────────────────────────

interface StatusMeta {
  actionText: string
  color: string
}

const STATUS_MAP: Record<SwarmAgentStatus, StatusMeta> = {
  waiting: { actionText: 'Esperando...', color: '#94a3b8' }, // slate-400
  idle: { actionText: 'Inactivo', color: '#64748b' }, // slate-500
  planning: { actionText: 'Arquitectando...', color: '#fb923c' }, // orange-400
  building: { actionText: 'Filosofando...', color: '#f87171' }, // red-400
  review: { actionText: 'Levitando...', color: '#c084fc' }, // purple-400
  done: { actionText: 'Completado', color: '#34d399' }, // emerald-400
  error: { actionText: 'Error detectado', color: '#ef4444' }, // red-500
}

// ─── Agent Card (God's Eye Terminal View) ────────────────────

interface SwarmAgentCardProps {
  agent: SwarmAgentState
  rosterAgent: SwarmRosterAgent
  index: number
}

export function SwarmAgentCard({ agent, rosterAgent, index }: SwarmAgentCardProps) {
  const roleDef = useMemo(() => getRoleDef(rosterAgent.role), [rosterAgent.role])
  const statusMeta = STATUS_MAP[agent.status] || STATUS_MAP.idle

  const agentLabel = rosterAgent.customName || `${roleDef.label} ${index + 1}`
  const isWorking = agent.status === 'planning' || agent.status === 'building' || agent.status === 'review'

  // Dummy context metric for the visual
  const ctxPercent = Math.min(100, Math.max(0, Math.floor(((agent as unknown as { metrics?: { totalTokens?: number } }).metrics?.totalTokens || 0) / 128000 * 100)))

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col h-[320px] rounded-xl border border-white/5 bg-[#0a0f16] overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-white/[0.02] border-b border-white/5 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: roleDef.color }} />
          <span className="text-[11px] font-bold text-white uppercase tracking-wider truncate max-w-[100px]">
            {agentLabel}
          </span>
          <span className="text-[9px] text-white/30 font-mono tracking-widest uppercase">
             · {rosterAgent.cliProvider}
          </span>
        </div>

        <div className="flex items-center gap-2 text-[9px] font-mono font-bold tracking-widest uppercase text-white/40">
           <span>CTX</span>
           <div className="w-16 h-1 bg-white/10 rounded-full overflow-hidden flex">
              <div className="h-full bg-purple-500 transition-all duration-500" style={{ width: `${ctxPercent}%` }} />
           </div>
           <span>{ctxPercent}%</span>
           {isWorking && <span className="text-white/60 animate-pulse ml-1">Transmisión</span>}
        </div>
      </div>

      {/* Terminal Body */}
      <div className="flex-1 p-4 flex flex-col font-mono text-[13px] leading-relaxed relative">
        
        {/* Task Box */}
        <div className="flex mb-6">
           <div className="px-2 py-1 bg-white/10 text-white/90 font-bold max-w-full truncate">
              {'>'} {agent.currentTask || 'all'}
           </div>
        </div>

        {/* Status Action */}
        <div className="text-[15px] font-bold tracking-wide" style={{ color: statusMeta.color }}>
           * {statusMeta.actionText}
        </div>

        {/* Divider */}
        {isWorking && (
           <div className="w-full h-px bg-white/5 my-4" />
        )}

        {/* Progress Stream */}
        <div className="text-white/60 text-[12px] truncate">
           {'>'} {agent.progress || ''}
        </div>

        {/* Footer info (pinned to bottom) */}
        <div className="mt-auto pt-4 flex flex-col gap-1 text-[11px] text-white/40 font-bold">
           <span>esc para interrumpir</span>
           <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-white/30" />
              <span>alto · /esfuerzo</span>
           </div>
        </div>

      </div>
    </motion.div>
  )
}
