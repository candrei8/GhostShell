import { useMemo, useState } from 'react'
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion'
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
const SVG_H = 360
const NODE_R = 24
const OPERATOR_Y = 32
const COORD_Y = 120
const WORKER_Y = 240

// ─── Status Visuals ─────────────────────────────────────────
const STATUS_COLOR: Record<SwarmAgentStatus, string> = {
  waiting: '#4b5563', // gray
  planning: '#38bdf8', // sky
  building: '#f59e0b', // amber
  review: '#a855f7', // purple
  done: '#10b981', // emerald
  error: '#f43f5e', // rose
  idle: '#4b5563',
}

const HEALTH_COLOR: Record<string, string> = {
  healthy: '#10b981',
  stale: '#f59e0b',
  dead: '#f43f5e',
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
  // Parallax Setup
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const mouseXSpring = useSpring(x, { stiffness: 150, damping: 15 })
  const mouseYSpring = useSpring(y, { stiffness: 150, damping: 15 })
  const rotateX = useTransform(mouseYSpring, [-0.5, 0.5], ["12deg", "-12deg"])
  const rotateY = useTransform(mouseXSpring, [-0.5, 0.5], ["-12deg", "12deg"])

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect()
    x.set((e.clientX - rect.left) / rect.width - 0.5)
    y.set((e.clientY - rect.top) / rect.height - 0.5)
  }
  const handleMouseLeave = () => { x.set(0); y.set(0) }

  const { operatorNode, coordinators, workers, edges, svgW, centerX } = useMemo(() => {
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
      // Calculate active interactions
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

    // Dynamic Sizing to avoid overlap
    const neededWorkerWidth = Math.max(workerList.length * 90 + 60, 400)
    const neededCoordWidth = Math.max(coords.length * 120 + 60, 400)
    const computedSvgW = Math.max(neededWorkerWidth, neededCoordWidth)
    const computedCenterX = computedSvgW / 2

    // Position coordinators
    const coordSpacing = Math.min(130, (computedSvgW - 60) / Math.max(coords.length, 1))
    const coordStartX = computedCenterX - ((coords.length - 1) * coordSpacing) / 2
    coords.forEach((c, i) => {
      c.x = coordStartX + i * coordSpacing
      c.y = COORD_Y
    })

    // Position workers by role groups
    const roleOrder = ['scout', 'builder', 'reviewer', 'custom']
    workerList.sort((a, b) => roleOrder.indexOf(a.role) - roleOrder.indexOf(b.role))

    const workerSpacing = Math.min(100, (computedSvgW - 60) / Math.max(workerList.length, 1))
    const workerStartX = computedCenterX - ((workerList.length - 1) * workerSpacing) / 2
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
    const opNode = { x: computedCenterX, y: OPERATOR_Y, msgCount: opMsgs }

    return {
      operatorNode: opNode,
      coordinators: coords,
      workers: workerList,
      edges: edgeList,
      svgW: computedSvgW,
      centerX: computedCenterX
    }
  }, [agents, roster, messages, tasks, agentHealth])

  const allNodes = [...coordinators, ...workers]

  return (
    <div className="w-full overflow-x-auto no-scrollbar py-6">
      <div
        className="mx-auto flex justify-center items-center"
        style={{ perspective: 1800, minWidth: svgW }}
      >
        <motion.div
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
          className="relative rounded-2xl cursor-pointer w-full max-w-5xl"
        >
          {/* Glass Background (Pushed backward) */}
          <div
            className="absolute inset-0 bg-white/[0.03] backdrop-blur-sm border border-white/10 rounded-2xl"
            style={{ transform: "translateZ(-30px)" }}
          />

          {/* Content Wrapper */}
          <div className="relative p-6 w-full h-full pointer-events-none" style={{ transformStyle: "preserve-3d" }}>

            {/* Header (Floating above) */}
            <div className="flex items-center gap-2 mb-4" style={{ transform: "translateZ(40px)" }}>
              <div className="w-2.5 h-2.5 rounded-sm bg-[#38bdf8] animate-pulse" />
              <span className="text-[10px] font-semibold text-ghost-text-dim uppercase tracking-[0.15em]">
                Red de Delegación
              </span>
              <span className="ml-auto text-[10px] text-ghost-text-dim tabular-nums font-mono">
                {agents.length} agentes
                {messages.length > 0 && ` · ${messages.length} msg`}
              </span>
            </div>

            <svg viewBox={`0 0 ${svgW} ${SVG_H}`} className="w-full h-auto overflow-visible" style={{ transformStyle: "preserve-3d" }}>
              <defs>
                <style>{`
                  @keyframes dash-flow {
                    to { stroke-dashoffset: -20; }
                  }
                  .edge-active {
                    animation: dash-flow 1s linear infinite;
                  }
                `}</style>
                <marker id="dt-arrow" markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto">
                  <polygon points="0 0, 6 2, 0 4" fill="rgba(255,255,255,0.2)" />
                </marker>
                <marker id="dt-arrow-active" markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto">
                  <polygon points="0 0, 6 2, 0 4" fill="#38bdf8" />
                </marker>
              </defs>

              {/* ── Tiers / Background Geometry (Pushed very back) ── */}
              <g style={{ transform: "translateZ(-15px)" }}>
                <text x={8} y={OPERATOR_Y + 4} fontSize={8} fill="rgba(255,255,255,0.15)" fontWeight={800} fontFamily="ui-monospace, monospace">
                  OPERADOR
                </text>
                <text x={8} y={COORD_Y + 4} fontSize={8} fill="rgba(255,255,255,0.15)" fontWeight={800} fontFamily="ui-monospace, monospace">
                  COORD
                </text>
                <text x={8} y={WORKER_Y + 4} fontSize={8} fill="rgba(255,255,255,0.15)" fontWeight={800} fontFamily="ui-monospace, monospace">
                  TRABAJADORES
                </text>

                <line x1={0} y1={65} x2={svgW} y2={65} stroke="rgba(255,255,255,0.05)" strokeWidth={1} />
                <line x1={0} y1={175} x2={svgW} y2={175} stroke="rgba(255,255,255,0.05)" strokeWidth={1} />
              </g>

              {/* ── Edges / Links (Mid Layer) ── */}
              <g style={{ transform: "translateZ(10px)" }}>
                {/* Operator → Coordinator edges */}
                {coordinators.map((c, i) => (
                  <motion.line
                    key={`op-coord-${i}`}
                    x1={operatorNode.x} y1={operatorNode.y + 12}
                    x2={c.x} y2={c.y - NODE_R - 4}
                    stroke="rgba(255,255,255,0.15)"
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.5, delay: 0.1 }}
                  />
                ))}

                {/* Coordinator → Worker edges */}
                {edges.map((e, i) => {
                  const sc = e.isActive ? '#38bdf8' : 'rgba(255,255,255,0.15)'
                  const thickness = e.msgCount > 0
                    ? Math.min(3.5, 1.2 + e.msgCount * 0.4)
                    : 1.2
                  const opacity = e.isActive ? 0.7 : 0.4

                  return (
                    <g key={`edge-${i}`}>
                      <motion.line
                        x1={e.from.x} y1={e.from.y + NODE_R + 4}
                        x2={e.to.x} y2={e.to.y - NODE_R - 4}
                        stroke={sc}
                        strokeWidth={thickness}
                        strokeOpacity={opacity}
                        strokeDasharray={e.isActive ? '6 6' : 'none'}
                        className={e.isActive ? 'edge-active' : ''}
                        markerEnd={e.isActive ? "url(#dt-arrow-active)" : "url(#dt-arrow)"}
                        initial={{ pathLength: 0 }}
                        animate={{ pathLength: 1 }}
                        transition={{ duration: 0.4, delay: 0.2 + i * 0.03 }}
                      />
                      {/* Message count on edge */}
                      {e.msgCount > 0 && (
                        <foreignObject
                          x={(e.from.x + e.to.x) / 2 - 10}
                          y={(e.from.y + NODE_R + e.to.y - NODE_R) / 2 - 8}
                          width={20}
                          height={16}
                        >
                          <div className="flex items-center justify-center w-full h-full bg-black/60 rounded-sm border border-white/10 text-[9px] text-white font-mono">
                            {e.msgCount}
                          </div>
                        </foreignObject>
                      )}
                    </g>
                  )
                })}
              </g>

              {/* ── Nodes (Popping out) ── */}
              <g style={{ transform: "translateZ(60px)" }}>

                {/* Operator node */}
                <motion.g
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.4, type: "spring" }}
                >
                  <circle
                    cx={operatorNode.x} cy={operatorNode.y}
                    r={18}
                    fill="#0D0F15"
                    stroke="#f59e0b"
                    strokeWidth={2.5}
                  />
                  <text
                    x={operatorNode.x} y={operatorNode.y + 5}
                    textAnchor="middle"
                    fontSize={14}
                    fill="#f59e0b"
                  >
                    👑
                  </text>
                  {operatorNode.msgCount > 0 && (
                    <g>
                      <circle cx={operatorNode.x + 14} cy={operatorNode.y - 10} r={7} fill="#f59e0b" />
                      <text x={operatorNode.x + 14} y={operatorNode.y - 7} textAnchor="middle" fontSize={8} fill="#000" fontWeight={800}>
                        {operatorNode.msgCount > 9 ? '9+' : operatorNode.msgCount}
                      </text>
                    </g>
                  )}
                </motion.g>

                {/* Agent nodes */}
                {allNodes.map((n, i) => {
                  const roleDef = getRoleDef(n.roster.role)
                  const Icon = ROLE_ICONS[roleDef.icon]
                  const sc = STATUS_COLOR[n.agent.status]
                  const active = isActive(n.agent.status)
                  const isCoord = n.role === 'coordinator'
                  const r = isCoord ? NODE_R + 4 : NODE_R

                  return (
                    <motion.g
                      key={n.agent.rosterId}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.35, delay: 0.15 + i * 0.05, type: 'spring' }}
                    >
                      {/* Active pulse indicator (solid border, no glow/scale) */}
                      {active && (
                        <motion.circle
                          cx={n.x} cy={n.y} r={r + 6} fill="none" stroke={sc} strokeWidth={2}
                          animate={{ opacity: [0.3, 0.7, 0.3] }}
                          transition={{ duration: 2, repeat: Infinity }}
                        />
                      )}

                      {/* Node circle */}
                      <circle
                        cx={n.x} cy={n.y} r={r}
                        fill="#0D0F15"
                        stroke={active ? '#38bdf8' : sc}
                        strokeWidth={active ? 3 : 2}
                      />

                      {/* Role icon */}
                      <foreignObject x={n.x - 10} y={n.y - 10} width={20} height={20}>
                        {Icon && (
                          <div style={{ color: active ? '#ffffff' : roleDef.color, display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
                            <Icon className="w-4 h-4" />
                          </div>
                        )}
                      </foreignObject>

                      {/* Label below */}
                      <text
                        x={n.x} y={n.y + r + 14}
                        textAnchor="middle"
                        fill="rgba(255, 255, 255, 0.85)"
                        fontSize={9}
                        fontFamily="ui-monospace, monospace"
                        fontWeight={700}
                        style={{ filter: "drop-shadow(0px 1px 2px rgba(0,0,0,0.8))" }}
                      >
                        {n.label}
                      </text>

                      {/* Status dot (top-right) */}
                      <circle
                        cx={n.x + r - 4} cy={n.y - r + 4}
                        r={4.5}
                        fill={sc}
                        stroke="#0D0F15"
                        strokeWidth={2}
                      />

                      {/* Health dot (top-left) */}
                      {n.health && n.health !== 'healthy' && (
                        <circle
                          cx={n.x - r + 4} cy={n.y - r + 4}
                          r={4.5}
                          fill={HEALTH_COLOR[n.health] || '#4b5563'}
                          stroke="#0D0F15"
                          strokeWidth={2}
                        />
                      )}

                      {/* Task count badge */}
                      {n.taskCount > 0 && (
                        <g>
                          <circle cx={n.x + r} cy={n.y + r - 5} r={7} fill="#38bdf8" />
                          <text x={n.x + r} y={n.y + r - 2} textAnchor="middle" fill="#000" fontSize={8} fontWeight={800} fontFamily="ui-monospace, monospace">
                            {n.taskCount > 9 ? '9+' : n.taskCount}
                          </text>
                        </g>
                      )}

                      {/* Msg count badge */}
                      {n.msgsSent > 0 && (
                        <g>
                          <circle cx={n.x - r} cy={n.y + r - 5} r={6} fill="#ffffff" />
                          <text x={n.x - r} y={n.y + r - 2} textAnchor="middle" fill="#000" fontSize={7} fontWeight={800} fontFamily="ui-monospace, monospace">
                            {n.msgsSent > 9 ? '9+' : n.msgsSent}
                          </text>
                        </g>
                      )}
                    </motion.g>
                  )
                })}

                {/* ── Task flowing labels (workers) ── */}
                {workers.map((w) => {
                  const currentTask = tasks.find((t) => t.owner === w.label && t.status !== 'done')
                  if (!currentTask) return null
                  return (
                    <foreignObject key={`task-${w.agent.rosterId}`} x={w.x - 45} y={w.y + NODE_R + 22} width={90} height={20}>
                      <div className="flex items-center justify-center w-full h-full bg-[#38bdf8]/10 border border-[#38bdf8]/30 rounded-[4px] px-1 overflow-hidden">
                        <span className="text-[8px] text-[#38bdf8] font-mono whitespace-nowrap truncate font-semibold">
                          {currentTask.id}: {currentTask.title}
                        </span>
                      </div>
                    </foreignObject>
                  )
                })}
              </g>

              {/* ── Legend (bottom) Pushed Back ── */}
              <g style={{ transform: "translateZ(0px)" }}>
                <g transform={`translate(${centerX - 160}, ${SVG_H - 24})`}>
                  {/* Status legend */}
                  {[
                    { label: 'ESPERA', color: '#4b5563' },
                    { label: 'PLAN', color: '#60a5fa' },
                    { label: 'CONST', color: '#fbbf24' },
                    { label: 'REV', color: '#a78bfa' },
                    { label: 'LISTO', color: '#34d399' },
                    { label: 'ERR', color: '#fb7185' },
                  ].map((item, i) => (
                    <g key={item.label} transform={`translate(${i * 45}, 0)`}>
                      <circle cx={4} cy={4} r={4} fill={item.color} />
                      <text x={12} y={7} fontSize={8} fill="rgba(255,255,255,0.4)" fontFamily="ui-monospace, monospace" fontWeight="bold">
                        {item.label}
                      </text>
                    </g>
                  ))}

                  <g transform="translate(0, 18)">
                    <circle cx={4} cy={4} r={3} fill="#38bdf8" fillOpacity={0.85} />
                    <text x={10} y={7} fontSize={6} fill="rgba(255,255,255,0.25)" fontFamily="ui-monospace, monospace">
                      Tareas
                    </text>
                    <circle cx={55} cy={4} r={3} fill="#ffffff" />
                    <text x={63} y={7} fontSize={6} fill="rgba(255,255,255,0.25)" fontFamily="ui-monospace, monospace">
                      Msgs
                    </text>
                    <circle cx={92} cy={4} r={3} fill="#fbbf24" />
                    <text x={98} y={7} fontSize={6} fill="rgba(255,255,255,0.25)" fontFamily="ui-monospace, monospace">
                      Lento
                    </text>
                    <circle cx={130} cy={4} r={3} fill="#fb7185" />
                    <text x={136} y={7} fontSize={6} fill="rgba(255,255,255,0.25)" fontFamily="ui-monospace, monospace">
                      Muerto
                    </text>
                  </g>
                </g>
              </g>

            </svg>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
