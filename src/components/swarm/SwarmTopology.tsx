import { useMemo } from 'react'
import { motion } from 'framer-motion'
import type { SwarmAgentState, SwarmRosterAgent, SwarmAgentStatus } from '../../lib/swarm-types'
import { getRoleDef } from '../../lib/swarm-types'
import { ROLE_ICONS } from './swarm-icons'

// ─── Constants ───────────────────────────────────────────────

const NODE_SIZE = 44
const RING_RADIUS = 110
const CENTER_X = 200
const CENTER_Y = 180
const SVG_WIDTH = 400
const SVG_HEIGHT = 360

// ─── Status Color ────────────────────────────────────────────

function statusColor(status: SwarmAgentStatus): string {
  switch (status) {
    case 'building': return '#fbbf24'
    case 'planning': return '#60a5fa'
    case 'review': return '#a78bfa'
    case 'done': return '#34d399'
    case 'error': return '#fb7185'
    default: return '#4b5563'
  }
}

function statusPulse(status: SwarmAgentStatus): boolean {
  return status === 'building' || status === 'planning'
}

// ─── Topology Component ──────────────────────────────────────

interface SwarmTopologyProps {
  agents: SwarmAgentState[]
  roster: SwarmRosterAgent[]
}

export function SwarmTopology({ agents, roster }: SwarmTopologyProps) {
  // Compute positions in a ring, coordinator at center
  const nodes = useMemo(() => {
    const rosterMap = new Map(roster.map((r) => [r.id, r]))
    const coordinators: { agent: SwarmAgentState; rosterAgent: SwarmRosterAgent }[] = []
    const workers: { agent: SwarmAgentState; rosterAgent: SwarmRosterAgent }[] = []

    for (const a of agents) {
      const r = rosterMap.get(a.rosterId)
      if (!r) continue
      if (r.role === 'coordinator') coordinators.push({ agent: a, rosterAgent: r })
      else workers.push({ agent: a, rosterAgent: r })
    }

    interface TopoNode {
      x: number; y: number
      agent: SwarmAgentState; rosterAgent: SwarmRosterAgent
      isCenter: boolean; label: string
    }

    const result: TopoNode[] = []

    // Per-role counters for correct agent labels (e.g. "Builder 1", "Builder 2")
    const roleCounts: Record<string, number> = {}
    function makeLabel(r: SwarmRosterAgent): string {
      if (r.customName) return r.customName
      const def = getRoleDef(r.role)
      roleCounts[r.role] = (roleCounts[r.role] || 0) + 1
      return `${def.label} ${roleCounts[r.role]}`
    }

    // Place coordinators at center (offset if multiple)
    const coordCount = coordinators.length
    for (let ci = 0; ci < coordCount; ci++) {
      const offset = coordCount > 1 ? (ci - (coordCount - 1) / 2) * 28 : 0
      result.push({ x: CENTER_X + offset, y: CENTER_Y, agent: coordinators[ci].agent, rosterAgent: coordinators[ci].rosterAgent, isCenter: true, label: makeLabel(coordinators[ci].rosterAgent) })
    }

    // Place workers in a ring
    const count = workers.length
    for (let i = 0; i < count; i++) {
      const angle = (2 * Math.PI * i) / count - Math.PI / 2
      const x = CENTER_X + RING_RADIUS * Math.cos(angle)
      const y = CENTER_Y + RING_RADIUS * Math.sin(angle)
      result.push({ x, y, agent: workers[i].agent, rosterAgent: workers[i].rosterAgent, isCenter: false, label: makeLabel(workers[i].rosterAgent) })
    }

    return result
  }, [agents, roster])

  const centers = nodes.filter((n) => n.isCenter)
  const ring = nodes.filter((n) => !n.isCenter)

  return (
    <div className="ghost-section-card rounded-xl p-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <div className="w-2 h-2 rounded-full bg-emerald-400/60 animate-pulse" />
        <h3 className="text-xs font-semibold text-ghost-text uppercase tracking-[0.15em]">Topology</h3>
        <span className="ml-auto text-xs text-ghost-text-dim/40">{agents.length} agents</span>
      </div>

      <svg
        viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
        className="w-full"
        style={{ maxHeight: 320 }}
      >
        {/* Connection Lines from each center node to ring nodes */}
        {centers.map((c, ci) =>
          ring.map((n, i) => (
            <motion.line
              key={`line-${ci}-${i}`}
              x1={c.x}
              y1={c.y}
              x2={n.x}
              y2={n.y}
              stroke={statusColor(n.agent.status)}
              strokeWidth={1}
              strokeOpacity={0.2 / centers.length}
              strokeDasharray={statusPulse(n.agent.status) ? '4 4' : 'none'}
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.5, delay: i * 0.05 + ci * 0.02 }}
            />
          )),
        )}

        {/* Ring node connections (peer mesh - lighter) */}
        {ring.map((n, i) => {
          const next = ring[(i + 1) % ring.length]
          if (!next) return null
          return (
            <line
              key={`peer-${i}`}
              x1={n.x}
              y1={n.y}
              x2={next.x}
              y2={next.y}
              stroke="rgba(255,255,255,0.04)"
              strokeWidth={0.5}
            />
          )
        })}

        {/* Agent Nodes */}
        {nodes.map((n, i) => {
          const roleDef = getRoleDef(n.rosterAgent.role)
          const Icon = ROLE_ICONS[roleDef.icon]
          const sc = statusColor(n.agent.status)
          const pulse = statusPulse(n.agent.status)
          const size = n.isCenter ? NODE_SIZE + 8 : NODE_SIZE
          const halfSize = size / 2

          return (
            <motion.g
              key={n.agent.rosterId}
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, delay: i * 0.06 }}
            >
              {/* Pulse ring */}
              {pulse && (
                <circle
                  cx={n.x}
                  cy={n.y}
                  r={halfSize + 4}
                  fill="none"
                  stroke={sc}
                  strokeWidth={1}
                  opacity={0.15}
                >
                  <animate
                    attributeName="r"
                    from={halfSize + 2}
                    to={halfSize + 12}
                    dur="2s"
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="opacity"
                    from="0.2"
                    to="0"
                    dur="2s"
                    repeatCount="indefinite"
                  />
                </circle>
              )}

              {/* Node background */}
              <circle
                cx={n.x}
                cy={n.y}
                r={halfSize}
                fill="#0d1522"
                stroke={sc}
                strokeWidth={1.5}
                strokeOpacity={0.5}
              />

              {/* Role icon (foreignObject for Lucide) */}
              <foreignObject
                x={n.x - 8}
                y={n.y - 8}
                width={16}
                height={16}
              >
                {Icon && (
                  <div style={{ color: roleDef.color }}>
                    <Icon className="w-4 h-4" />
                  </div>
                )}
              </foreignObject>

              {/* Agent label below */}
              <text
                x={n.x}
                y={n.y + halfSize + 14}
                textAnchor="middle"
                fill="rgba(255,255,255,0.45)"
                fontSize={9}
                fontFamily="Manrope, sans-serif"
                fontWeight={500}
              >
                {n.label}
              </text>

              {/* Status dot */}
              <circle
                cx={n.x + halfSize - 4}
                cy={n.y - halfSize + 4}
                r={3.5}
                fill={sc}
                stroke="#0d1522"
                strokeWidth={1.5}
              />
            </motion.g>
          )
        })}
      </svg>
    </div>
  )
}
