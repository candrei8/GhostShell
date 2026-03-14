import { useMemo } from 'react'
import { motion } from 'framer-motion'
import type { SwarmAgentState, SwarmRosterAgent, SwarmAgentStatus, SwarmMessage } from '../../lib/swarm-types'
import { getRoleDef } from '../../lib/swarm-types'
import { ROLE_ICONS } from './swarm-icons'

// ─── Layout Constants ───────────────────────────────────────

const NODE_SIZE = 40
const RING_RADIUS = 105
const CENTER_X = 160
const CENTER_Y = 140
const SVG_WIDTH = 320
const SVG_HEIGHT = 290

// ─── Status Visuals ─────────────────────────────────────────

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

// ─── Types ──────────────────────────────────────────────────

interface TopoNode {
  x: number
  y: number
  agent: SwarmAgentState
  rosterAgent: SwarmRosterAgent
  isCenter: boolean
  label: string
}

interface MessageEdge {
  fromLabel: string
  toLabel: string
  count: number
}

// ─── Component ──────────────────────────────────────────────

interface SwarmTopologyProps {
  agents: SwarmAgentState[]
  roster: SwarmRosterAgent[]
  messages?: SwarmMessage[]
}

export function SwarmTopology({ agents, roster, messages = [] }: SwarmTopologyProps) {
  // Compute node positions
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

    const result: TopoNode[] = []
    const roleCounts: Record<string, number> = {}

    function makeLabel(r: SwarmRosterAgent): string {
      if (r.customName) return r.customName
      const def = getRoleDef(r.role)
      roleCounts[r.role] = (roleCounts[r.role] || 0) + 1
      return `${def.label} ${roleCounts[r.role]}`
    }

    // Place coordinators at center
    const coordCount = coordinators.length
    for (let ci = 0; ci < coordCount; ci++) {
      const offset = coordCount > 1 ? (ci - (coordCount - 1) / 2) * 26 : 0
      result.push({
        x: CENTER_X + offset, y: CENTER_Y,
        agent: coordinators[ci].agent, rosterAgent: coordinators[ci].rosterAgent,
        isCenter: true, label: makeLabel(coordinators[ci].rosterAgent),
      })
    }

    // Place workers in ring
    const count = workers.length
    for (let i = 0; i < count; i++) {
      const angle = (2 * Math.PI * i) / count - Math.PI / 2
      result.push({
        x: CENTER_X + RING_RADIUS * Math.cos(angle),
        y: CENTER_Y + RING_RADIUS * Math.sin(angle),
        agent: workers[i].agent, rosterAgent: workers[i].rosterAgent,
        isCenter: false, label: makeLabel(workers[i].rosterAgent),
      })
    }

    return result
  }, [agents, roster])

  // Compute message flow edges
  const messageEdges = useMemo<MessageEdge[]>(() => {
    if (messages.length === 0) return []
    const edgeMap = new Map<string, number>()
    for (const msg of messages) {
      const key = `${msg.from}→${msg.to}`
      edgeMap.set(key, (edgeMap.get(key) || 0) + 1)
    }
    return Array.from(edgeMap.entries()).map(([key, count]) => {
      const [fromLabel, toLabel] = key.split('→')
      return { fromLabel, toLabel, count }
    })
  }, [messages])

  const centers = nodes.filter((n) => n.isCenter)
  const ring = nodes.filter((n) => !n.isCenter)
  const nodeMap = new Map(nodes.map((n) => [n.label, n]))

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <div className="w-2 h-2 rounded-full bg-sky-400/60 animate-pulse" />
        <span className="text-[10px] font-semibold text-ghost-text-dim uppercase tracking-[0.15em]">
          Topology
        </span>
        <span className="ml-auto text-[10px] text-ghost-text-dim tabular-nums font-mono">
          {agents.length} agents
          {messageEdges.length > 0 && ` · ${messages.length} msg`}
        </span>
      </div>

      <svg viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`} className="w-full">
        <defs>
          {/* Animated dash for active message flow */}
          <style>{`
            @keyframes dash-flow {
              to { stroke-dashoffset: -16; }
            }
            .msg-flow {
              animation: dash-flow 1s linear infinite;
            }
          `}</style>
        </defs>

        {/* Layer 1: Structural lines (coordinator → workers) */}
        {centers.map((c, ci) =>
          ring.map((n, i) => (
            <motion.line
              key={`struct-${ci}-${i}`}
              x1={c.x} y1={c.y} x2={n.x} y2={n.y}
              stroke={statusColor(n.agent.status)}
              strokeWidth={0.8}
              strokeOpacity={0.12}
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.4, delay: i * 0.04 }}
            />
          )),
        )}

        {/* Layer 2: Peer mesh (ring connections) */}
        {ring.map((n, i) => {
          const next = ring[(i + 1) % ring.length]
          if (!next) return null
          return (
            <line
              key={`peer-${i}`}
              x1={n.x} y1={n.y} x2={next.x} y2={next.y}
              stroke="rgba(255,255,255,0.03)"
              strokeWidth={0.5}
            />
          )
        })}

        {/* Layer 3: Message flow lines (animated, colored by type) */}
        {messageEdges.map((edge, i) => {
          const fromNode = nodeMap.get(edge.fromLabel)
          const toNode = nodeMap.get(edge.toLabel)
          if (!fromNode || !toNode) return null

          // Thicker = more messages (1-3px range)
          const thickness = Math.min(3, 0.8 + edge.count * 0.4)
          const opacity = Math.min(0.6, 0.15 + edge.count * 0.08)

          return (
            <line
              key={`msg-${i}`}
              x1={fromNode.x} y1={fromNode.y}
              x2={toNode.x} y2={toNode.y}
              stroke="#38bdf8"
              strokeWidth={thickness}
              strokeOpacity={opacity}
              strokeDasharray="4 4"
              className="msg-flow"
            />
          )
        })}

        {/* Layer 4: Agent nodes */}
        {nodes.map((n, i) => {
          const roleDef = getRoleDef(n.rosterAgent.role)
          const Icon = ROLE_ICONS[roleDef.icon]
          const sc = statusColor(n.agent.status)
          const pulse = statusPulse(n.agent.status)
          const size = n.isCenter ? NODE_SIZE + 6 : NODE_SIZE
          const half = size / 2

          // Count messages sent by this agent
          const msgsSent = messages.filter((m) => m.from === n.label).length

          return (
            <motion.g
              key={n.agent.rosterId}
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.25, delay: i * 0.05 }}
            >
              {/* Pulse ring for active agents */}
              {pulse && (
                <circle cx={n.x} cy={n.y} r={half + 3} fill="none" stroke={sc} strokeWidth={1} opacity={0.15}>
                  <animate attributeName="r" from={half + 2} to={half + 10} dur="2s" repeatCount="indefinite" />
                  <animate attributeName="opacity" from="0.2" to="0" dur="2s" repeatCount="indefinite" />
                </circle>
              )}

              {/* Node background */}
              <circle
                cx={n.x} cy={n.y} r={half}
                fill="#0a0f1a"
                stroke={sc}
                strokeWidth={n.isCenter ? 2 : 1.5}
                strokeOpacity={0.6}
              />

              {/* Role icon */}
              <foreignObject x={n.x - 7} y={n.y - 7} width={14} height={14}>
                {Icon && (
                  <div style={{ color: roleDef.color }}>
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                )}
              </foreignObject>

              {/* Agent label below node */}
              <text
                x={n.x} y={n.y + half + 12}
                textAnchor="middle"
                fill="rgba(255,255,255,0.5)"
                fontSize={8}
                fontFamily="ui-monospace, monospace"
                fontWeight={600}
              >
                {n.label}
              </text>

              {/* Status dot (top-right) */}
              <circle
                cx={n.x + half - 3} cy={n.y - half + 3} r={3}
                fill={sc} stroke="#0a0f1a" strokeWidth={1.5}
              />

              {/* Message count badge (bottom-right, only if > 0) */}
              {msgsSent > 0 && (
                <g>
                  <circle
                    cx={n.x + half - 2} cy={n.y + half - 6} r={6}
                    fill="#38bdf8" fillOpacity={0.9}
                  />
                  <text
                    x={n.x + half - 2} y={n.y + half - 3}
                    textAnchor="middle"
                    fill="#000"
                    fontSize={7}
                    fontWeight={800}
                    fontFamily="ui-monospace, monospace"
                  >
                    {msgsSent > 9 ? '9+' : msgsSent}
                  </text>
                </g>
              )}
            </motion.g>
          )
        })}
      </svg>
    </div>
  )
}
