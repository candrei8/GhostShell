import { motion } from 'framer-motion'
import { Type } from 'lucide-react'
import { useSwarmStore } from '../../stores/swarmStore'

export function SwarmNameStep() {
  const swarmName = useSwarmStore((s) => s.wizard.swarmName)
  const setSwarmName = useSwarmStore((s) => s.setSwarmName)
  const roster = useSwarmStore((s) => s.wizard.roster)

  const agentCount = roster.length
  const summary = agentCount > 0
    ? `${agentCount} agent${agentCount !== 1 ? 's' : ''} ready to deploy`
    : 'No agents configured'

  return (
    <motion.div
      className="flex flex-col items-center gap-8 py-8"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
    >
      {/* Icon */}
      <div className="w-16 h-16 rounded-2xl bg-white/[0.06] flex items-center justify-center">
        <Type className="w-7 h-7 text-ghost-text" />
      </div>

      {/* Title */}
      <div className="text-center">
        <h2 className="text-xl font-bold text-ghost-text">Name your swarm</h2>
        <p className="mt-2 text-sm text-ghost-text-dim/70 max-w-md">
          Give this swarm an identifier. Shown in tabs and logs.
        </p>
      </div>

      {/* Name Input */}
      <div className="w-full max-w-lg flex flex-col gap-3">
        <div className="ghost-section-card rounded-xl overflow-hidden">
          <input
            type="text"
            value={swarmName}
            onChange={(e) => setSwarmName(e.target.value)}
            placeholder="e.g. Auth Rewrite, Sprint 42, Bug Hunt..."
            maxLength={60}
            className="w-full h-14 px-5 bg-transparent text-lg text-ghost-text placeholder:text-ghost-text-dim/30 focus:outline-none"
            autoFocus
          />
        </div>

        <div className="flex items-center justify-between px-1">
          <p className="text-xs text-ghost-text-dim/50">
            {summary}
          </p>
          {swarmName.length > 0 && (
            <p className="text-xs text-ghost-text-dim/40 tabular-nums">
              {swarmName.length}/60
            </p>
          )}
        </div>
      </div>
    </motion.div>
  )
}
