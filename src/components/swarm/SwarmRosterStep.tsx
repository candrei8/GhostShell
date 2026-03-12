import { useCallback, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Minus, Plus, Users } from 'lucide-react'
import { useSwarmStore } from '../../stores/swarmStore'
import {
  SWARM_ROLES,
  type SwarmAgentRole,
} from '../../lib/swarm-types'
import { RoleIcon } from './swarm-icons'

// Only the 4 real roles — no "custom"
const ROLES = SWARM_ROLES.filter((r) => r.id !== 'custom')

export function SwarmRosterStep() {
  const roster = useSwarmStore((s) => s.wizard.roster)
  const addRosterAgent = useSwarmStore((s) => s.addRosterAgent)
  const removeRosterAgent = useSwarmStore((s) => s.removeRosterAgent)

  const counts = useMemo(() => {
    const map: Record<string, number> = {}
    for (const role of ROLES) map[role.id] = 0
    for (const agent of roster) map[agent.role] = (map[agent.role] || 0) + 1
    return map
  }, [roster])

  const handleAdd = useCallback(
    (role: SwarmAgentRole) => {
      addRosterAgent(role, 'claude')
    },
    [addRosterAgent],
  )

  const handleRemove = useCallback(
    (role: SwarmAgentRole) => {
      // Remove the last agent with this role
      const last = [...roster].reverse().find((a) => a.role === role)
      if (last) removeRosterAgent(last.id)
    },
    [roster, removeRosterAgent],
  )

  return (
    <div className="flex flex-col items-center gap-8 px-6 py-8">
      {/* Icon */}
      <div className="w-16 h-16 rounded-2xl bg-white/[0.06] flex items-center justify-center">
        <Users className="w-7 h-7 text-ghost-text" />
      </div>

      {/* Title */}
      <div className="text-center">
        <h2 className="text-xl font-bold text-ghost-text">Build your team</h2>
        <p className="mt-2 text-sm text-ghost-text-dim/70 max-w-md">
          Add agents by role. Each role has a specialized behavior in the swarm.
        </p>
      </div>

      {/* Role Cards */}
      <div className="w-full max-w-lg grid grid-cols-2 gap-3">
        {ROLES.map((role) => {
          const count = counts[role.id] || 0
          return (
            <motion.div
              key={role.id}
              layout
              className="rounded-xl p-4 flex flex-col gap-3"
              style={{ backgroundColor: role.color }}
            >
              {/* Role header */}
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-black/20 flex items-center justify-center">
                  <RoleIcon iconName={role.icon} className="w-4 h-4 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white">{role.label}</p>
                  <p className="text-[11px] text-white/60 leading-tight">{role.description}</p>
                </div>
              </div>

              {/* Counter */}
              <div className="flex items-center justify-between">
                <button
                  onClick={() => handleRemove(role.id)}
                  disabled={count === 0}
                  className="w-8 h-8 rounded-lg bg-black/20 flex items-center justify-center text-white hover:bg-black/30 transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
                >
                  <Minus className="w-4 h-4" />
                </button>

                <span className="text-2xl font-bold text-white tabular-nums min-w-[2ch] text-center">
                  {count}
                </span>

                <button
                  onClick={() => handleAdd(role.id)}
                  className="w-8 h-8 rounded-lg bg-black/20 flex items-center justify-center text-white hover:bg-black/30 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          )
        })}
      </div>

      {/* Total */}
      {roster.length > 0 && (
        <p className="text-sm text-ghost-text-dim">
          <span className="font-bold text-ghost-text">{roster.length}</span> agent{roster.length !== 1 ? 's' : ''} total
        </p>
      )}
    </div>
  )
}
