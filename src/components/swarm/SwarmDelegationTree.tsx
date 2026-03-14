import { useMemo } from 'react'
import { motion } from 'framer-motion'
import type {
  SwarmAgentState,
  SwarmRosterAgent,
  SwarmAgentStatus,
  SwarmMessage,
  SwarmTaskItem,
} from '../../lib/swarm-types'
import { getRoleDef } from '../../lib/swarm-types'
import { ROLE_ICONS } from './swarm-icons'

// ─── Layout Constants ───────────────────────────────────────

const SVG_W = 340
const SVG_H = 340
const NODE_R = 22
const OPERATOR_Y = 28
const COORD_Y = 100
const WORKER_Y = 210
const CENTER_X = SVG_W / 2

// ─── Status Visuals ─────────────────────────────────────────

const STATUS_COLOR: Record<SwarmAgentStatus, string> = {
  waiting: '#4b5563',
  planning: '#60a5fa',
  building: '#fbbf24',
  review: '#a78bfa',
  done: '#34d399',
  error: '#fb7185',
  idle: '#4b5563',
}

const HEALTH_COLOR: Record<string, string> = {
  healthy: '#34d399',
  stale: '#fbbf24',
  dead: '#fb7185',
}

function isActive(s: SwarmAgentStatus): boolean {
  return s === 'building' || s === 'planning' || s === 'review'
}

// ─── Types ──────────────────────────────────────────────────

interface TreeNode {
  x: number
  y: number
  agent: SwarmAgentState
  roster: SwarmRosterAgent
  label: string
  role: string
  taskCount: number
  health?: 'healthy' | 'stale' | 'dead'
  msgsSent: number
  msgsRecv: number
}

// ─── Component ──────────────────────────────────────────────

interface SwarmDelegationTreeProps {
  agents: SwarmAgentState[]
  roster: SwarmRosterAgent[]
  messages?: SwarmMessage[]
  tasks?: SwarmTaskItem[]
  agentHealth?: Record<string, { lastSeen: number; status: 'healthy' | 'stale' | 'dead' }>
}

export function SwarmDelegationTree({
  agents,
  roster,
  messages = [],
  tasks = [],
  agentHealth,
}: SwarmDelegationTreeProps) {
  const { operatorNode, coordinators, workers, edges } = useMemo(() => {
    const rosterMap = new Map(roster.map((r) => [r.id, r]))
    const coords: TreeNode[] = []
    const workerList: TreeNode[] = []
    const roleCounts: Record<string, number> = {}

    function makeLabel(r: SwarmRosterAgent): string {
      if (r.customName) return r.customName
      const def = getRoleDef(r.role)
      roleCounts[r.role] = (roleCounts[r.role] || 0) + 1
      return `${def.label} ${roleCounts[r.role]}`
    }

    // Separate coordinators from workers
    for (const a of agents) {
      const r = rosterMap.get(a.rosterId)
      if (!r) continue
      const label = makeLabel(r)
      const taskCount = tasks.filter((t) => t.owner === label).length
      const msgsSent = messages.filter((m) => m.from === label).length
      const msgsRecv = messages.filter((m) => m.to === label || m.to === '@all').length
      const health = agentHealth?.[label]?.status

      const node: TreeNode = {
        x: 0, y: 0, agent: a, roster: r, label,
        role: r.role, taskCount, health, msgsSent, msgsRecv,
      }

      if (r.role === 'coordinator') coords.push(node)
      else workerList.push(node)
    }

    // Position coordinators
    const coordSpacing = Math.min(90, SVG_W / (coords.length + 1))
    const coordStartX = CENTER_X - ((coords.length - 1) * coordSpacing) / 2
    coords.forEach((c, i) => {
      c.x = coordStartX + i * coordSpacing
      c.y = COORD_Y
    })

    // Position workers by role groups: scouts → builders → reviewers → custom
    const roleOrder = ['scout', 'builder', 'reviewer', 'custom']
    workerList.sort((a, b) => roleOrder.indexOf(a.role) - roleOrder.indexOf(b.role))

    const workerSpacing = Math.min(72, (SVG_W - 40) / Math.max(workerList.length, 1))
    const workerStartX = CENTER_X - ((workerList.length - 1) * workerSpacing) / 2
    workerList.forEach((w, i) => {
      w.x = workerStartX + i * workerSpacing
      w.y = WORKER_Y
    })

    // Build edges
    const edgeList: Array<{ from: TreeNode; to: TreeNode; msgCount: number; isActive: boolean }> = []
    for (const coord of coords) {
      for (const worker of workerList) {
        const msgCount = messages.filter(
          (m) =>
            (m.from === coord.label && m.to === worker.label) ||
            (m.from === worker.label && m.to === coord.label),
        ).length
        edgeList.push({
          from: coord,
          to: worker,
          msgCount,
          isActive: isActive(worker.agent.status),
        })
      }
    }

    // Operator virtual node
    const opMsgs = messages.filter((m) => m.to === '@operator').length
    const opNode = { x: CENTER_X, y: OPERATOR_Y, msgCount: opMsgs }

    return { operatorNode: opNode, coordinators: coords, workers: workerList, edges: edgeList }
  }, [agents, roster, messages, tasks, agentHealth])

  const allNodes = [...coordinators, ...workers]

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <div className="w-2 h-2 rounded-full bg-sky-400/60 animate-pulse" />
        <span className="text-[10px] font-semibold text-ghost-text-dim uppercase tracking-[0.15em]">
          Delegation Tree
        </span>
        <span className="ml-auto text-[10px] text-ghost-text-dim tabular-nums font-mono">
          {agents.length} agents
          {messages.length > 0 && ` · ${messages.length} msg`}
        </span>
      </div>

      <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} className="w-full">
        <defs>
          <style>{`
            @keyframes dash-flow {
              to { stroke-dashoffset: -16; }
            }
            .edge-active {
              animation: dash-flow 1s linear infinite;
            }
          `}</style>
          <marker id="dt-arrow" markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto">
            <polygon points="0 0, 6 2, 0 4" fill="rgba(255,255,255,0.15)" />
          </marker>
        </defs>

        {/* ── Layer 0: Tier labels ── */}
        <text x={8} y={OPERATOR_Y + 4} fontSize={7} fill="rgba(255,255,255,0.12)" fontWeight={700} fontFamily="ui-monospace, monospace">
          OPERATOR
        </text>
        <text x={8} y={COORD_Y + 4} fontSize={7} fill="rgba(255,255,255,0.12)" fontWeight={700} fontFamily="ui-monospace, monospace">
          COORD
        </text>
        <text x={8} y={WORKER_Y + 4} fontSize={7} fill="rgba(255,255,255,0.12)" fontWeight={700} fontFamily="ui-monospace, monospace">
          WORKERS
        </text>

        {/* Tier separator lines */}
        <line x1={0} y1={58} x2={SVG_W} y2={58} stroke="rgba(255,255,255,0.04)" strokeWidth={0.5} />
        <line x1={0} y1={155} x2={SVG_W} y2={155} stroke="rgba(255,255,255,0.04)" strokeWidth={0.5} />

        {/* ── Layer 1: Operator → Coordinator edges ── */}
        {coordinators.map((c, i) => (
          <motion.line
            key={`op-coord-${i}`}
            x1={operatorNode.x} y1={operatorNode.y + 10}
            x2={c.x} y2={c.y - NODE_R}
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={1}
            strokeDasharray="3 3"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          />
        ))}

        {/* ── Layer 2: Coordinator → Worker edges ── */}
        {edges.map((e, i) => {
          const sc = STATUS_COLOR[e.to.agent.status]
          const thickness = e.msgCount > 0
            ? Math.min(2.5, 0.8 + e.msgCount * 0.3)
            : 0.6
          const opacity = e.isActive ? 0.35 : 0.08

          return (
            <g key={`edge-${i}`}>
              <motion.line
                x1={e.from.x} y1={e.from.y + NODE_R}
                x2={e.to.x} y2={e.to.y - NODE_R}
                stroke={e.isActive ? sc : 'rgba(255,255,255,0.1)'}
                strokeWidth={thickness}
                strokeOpacity={opacity}
                strokeDasharray={e.isActive ? '4 4' : 'none'}
                className={e.isActive ? 'edge-active' : ''}
                markerEnd="url(#dt-arrow)"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.4, delay: 0.2 + i * 0.03 }}
              />
              {/* Message count on edge */}
              {e.msgCount > 0 && (
                <text
                  x={(e.from.x + e.to.x) / 2 + 6}
                  y={(e.from.y + NODE_R + e.to.y - NODE_R) / 2}
                  fontSize={7}
                  fill="rgba(255,255,255,0.2)"
                  fontFamily="ui-monospace, monospace"
                >
                  {e.msgCount}
                </text>
              )}
            </g>
          )
        })}

        {/* ── Layer 3: Operator node (crown) ── */}
        <motion.g
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <circle
            cx={operatorNode.x} cy={operatorNode.y}
            r={12}
            fill="#0a0f1a"
            stroke="#f59e0b"
            strokeWidth={1.5}
            strokeOpacity={0.5}
          />
          <text
            x={operatorNode.x} y={operatorNode.y + 3}
            textAnchor="middle"
            fontSize={10}
            fill="#f59e0b"
          >
            &#x1F451;
          </text>
          {operatorNode.msgCount > 0 && (
            <g>
              <circle cx={operatorNode.x + 10} cy={operatorNode.y - 6} r={5} fill="#f59e0b" fillOpacity={0.9} />
              <text x={operatorNode.x + 10} y={operatorNode.y - 3} textAnchor="middle" fontSize={6} fill="#000" fontWeight={800}>
                {operatorNode.msgCount > 9 ? '9+' : operatorNode.msgCount}
              </text>
            </g>
          )}
        </motion.g>

        {/* ── Layer 4: Agent nodes ── */}
        {allNodes.map((n, i) => {
          const roleDef = getRoleDef(n.roster.role)
          const Icon = ROLE_ICONS[roleDef.icon]
          const sc = STATUS_COLOR[n.agent.status]
          const active = isActive(n.agent.status)
          const isCoord = n.role === 'coordinator'
          const r = isCoord ? NODE_R + 2 : NODE_R

          return (
            <motion.g
              key={n.agent.rosterId}
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.25, delay: 0.15 + i * 0.05 }}
            >
              {/* Active pulse ring */}
              {active && (
                <circle cx={n.x} cy={n.y} r={r + 3} fill="none" stroke={sc} strokeWidth={1} opacity={0.12}>
                  <animate attributeName="r" from={r + 2} to={r + 12} dur="2s" repeatCount="indefinite" />
                  <animate attributeName="opacity" from="0.15" to="0" dur="2s" repeatCount="indefinite" />
                </circle>
              )}

              {/* Node circle */}
              <circle
                cx={n.x} cy={n.y} r={r}
                fill="#0a0f1a"
                stroke={sc}
                strokeWidth={isCoord ? 2 : 1.5}
                strokeOpacity={active ? 0.8 : 0.4}
              />

              {/* Role icon */}
              <foreignObject x={n.x - 7} y={n.y - 7} width={14} height={14}>
                {Icon && (
                  <div style={{ color: roleDef.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                )}
              </foreignObject>

              {/* Label below */}
              <text
                x={n.x} y={n.y + r + 11}
                textAnchor="middle"
                fill="rgba(255,255,255,0.45)"
                fontSize={7.5}
                fontFamily="ui-monospace, monospace"
                fontWeight={600}
              >
                {n.label}
              </text>

              {/* Status dot (top-right) */}
              <circle
                cx={n.x + r - 3} cy={n.y - r + 3}
                r={3.5}
                fill={sc}
                stroke="#0a0f1a"
                strokeWidth={1.5}
              />

              {/* Health dot (top-left) — only show if not healthy */}
              {n.health && n.health !== 'healthy' && (
                <circle
                  cx={n.x - r + 3} cy={n.y - r + 3}
                  r={3}
                  fill={HEALTH_COLOR[n.health] || '#4b5563'}
                  stroke="#0a0f1a"
                  strokeWidth={1.5}
                >
                  {n.health === 'dead' && (
                    <animate attributeName="opacity" values="1;0.3;1" dur="1s" repeatCount="indefinite" />
                  )}
                </circle>
              )}

              {/* Task count badge (bottom-right) */}
              {n.taskCount > 0 && (
                <g>
                  <circle
                    cx={n.x + r - 2} cy={n.y + r - 6}
                    r={6}
                    fill="#38bdf8" fillOpacity={0.85}
                  />
                  <text
                    x={n.x + r - 2} y={n.y + r - 3}
                    textAnchor="middle"
                    fill="#000"
                    fontSize={7}
                    fontWeight={800}
                    fontFamily="ui-monospace, monospace"
                  >
                    {n.taskCount > 9 ? '9+' : n.taskCount}
                  </text>
                </g>
              )}

              {/* Message badge (bottom-left, messages sent) */}
              {n.msgsSent > 0 && (
                <g>
                  <circle
                    cx={n.x - r + 3} cy={n.y + r - 6}
                    r={5}
                    fill="rgba(255,255,255,0.12)"
                  />
                  <text
                    x={n.x - r + 3} y={n.y + r - 3}
                    textAnchor="middle"
                    fill="rgba(255,255,255,0.4)"
                    fontSize={6}
                    fontWeight={700}
                    fontFamily="ui-monospace, monospace"
                  >
                    {n.msgsSent > 9 ? '9+' : n.msgsSent}
                  </text>
                </g>
              )}
            </motion.g>
          )
        })}

        {/* ── Layer 5: Task flow labels under workers ── */}
        {workers.map((w) => {
          const currentTask = tasks.find((t) => t.owner === w.label && t.status !== 'done')
          if (!currentTask) return null
          return (
            <text
              key={`task-${w.agent.rosterId}`}
              x={w.x}
              y={w.y + NODE_R + 22}
              textAnchor="middle"
              fill="rgba(255,255,255,0.2)"
              fontSize={6.5}
              fontFamily="ui-monospace, monospace"
            >
              {currentTask.id}: {currentTask.title.length > 14 ? currentTask.title.slice(0, 13) + '\u2026' : currentTask.title}
            </text>
          )
        })}

        {/* ── Legend (bottom) ── */}
        <g transform={`translate(${SVG_W / 2 - 120}, ${SVG_H - 38})`}>
          {/* Status legend */}
          {[
            { label: 'WAIT', color: '#4b5563' },
            { label: 'PLAN', color: '#60a5fa' },
            { label: 'BUILD', color: '#fbbf24' },
            { label: 'REVIEW', color: '#a78bfa' },
            { label: 'DONE', color: '#34d399' },
            { label: 'ERR', color: '#fb7185' },
          ].map((item, i) => (
            <g key={item.label} transform={`translate(${i * 40}, 0)`}>
              <circle cx={4} cy={4} r={3} fill={item.color} />
              <text x={10} y={7} fontSize={6} fill="rgba(255,255,255,0.3)" fontFamily="ui-monospace, monospace">
                {item.label}
              </text>
            </g>
          ))}

          {/* Badges legend */}
          <g transform="translate(0, 14)">
            <circle cx={4} cy={4} r={3} fill="#38bdf8" fillOpacity={0.85} />
            <text x={10} y={7} fontSize={6} fill="rgba(255,255,255,0.25)" fontFamily="ui-monospace, monospace">
              Tasks
            </text>
            <circle cx={50} cy={4} r={3} fill="rgba(255,255,255,0.12)" />
            <text x={56} y={7} fontSize={6} fill="rgba(255,255,255,0.25)" fontFamily="ui-monospace, monospace">
              Msgs
            </text>
            <circle cx={92} cy={4} r={3} fill="#fbbf24" />
            <text x={98} y={7} fontSize={6} fill="rgba(255,255,255,0.25)" fontFamily="ui-monospace, monospace">
              Stale
            </text>
            <circle cx={130} cy={4} r={3} fill="#fb7185" />
            <text x={136} y={7} fontSize={6} fill="rgba(255,255,255,0.25)" fontFamily="ui-monospace, monospace">
              Dead
            </text>
          </g>
        </g>
      </svg>
    </div>
  )
}
