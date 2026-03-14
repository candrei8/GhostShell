import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Target, ChevronDown } from 'lucide-react'
import { SwarmRosterAgent, SWARM_ROLES, getRoleDef, SwarmAgentRole } from '../../lib/swarm-types'

interface SwarmMissionCardProps {
  mission: string
  roster: SwarmRosterAgent[]
}

export default function SwarmMissionCard({ mission, roster }: SwarmMissionCardProps) {
  const [isExpanded, setIsExpanded] = useState(true)

  const rosterSummary = useMemo(() => {
    const counts = new Map<SwarmAgentRole, number>()
    for (const agent of roster) {
      counts.set(agent.role, (counts.get(agent.role) || 0) + 1)
    }
    // Return in the order defined by SWARM_ROLES, skip roles with 0 count
    return SWARM_ROLES
      .filter((r) => (counts.get(r.id) || 0) > 0)
      .map((r) => ({
        role: r,
        count: counts.get(r.id)!,
      }))
  }, [roster])

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setIsExpanded((prev) => !prev)}
        aria-expanded={isExpanded}
        aria-label="Toggle mission details"
        className="flex items-center justify-between w-full px-3 py-2 cursor-pointer hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-1.5">
          <Target size={13} className="text-ghost-accent" />
          <span className="text-[11px] font-medium text-ghost-text tracking-wide">Mission</span>
        </div>
        <motion.div
          animate={{ rotate: isExpanded ? 0 : -90 }}
          transition={{ duration: 0.15 }}
        >
          <ChevronDown size={13} className="text-ghost-text-dim" />
        </motion.div>
      </button>

      {/* Collapsible body */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            {/* Mission text */}
            <p className="px-3 pb-2 text-[11px] text-ghost-text-dim leading-relaxed whitespace-pre-wrap">
              {mission || 'No mission defined'}
            </p>

            {/* Roster composition */}
            {rosterSummary.length > 0 && (
              <div className="px-3 pb-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                {rosterSummary.map(({ role, count }) => (
                  <div key={role.id} className="flex items-center gap-1">
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ backgroundColor: role.color }}
                    />
                    <span className="text-[11px] text-ghost-text-dim">
                      {count} {count === 1 ? role.label : role.label + 's'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
