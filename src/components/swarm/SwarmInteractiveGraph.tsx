// SwarmInteractiveGraph — Force-directed agent graph with interconnectivity
// Directional message flows: type-colored edges, animated particles, click-to-view conversations
// Pattern from CodebaseGraph.tsx (no D3 dependency)

import { useState, useEffect, useRef, useMemo, useCallback, useLayoutEffect } from 'react'
import type { SwarmAgentState, SwarmRosterAgent, SwarmMessage, SwarmAgentRole } from '../../lib/swarm-types'
import { getRoleDef } from '../../lib/swarm-types'
import { RoleIcon } from './swarm-icons'

// ─── Types ──────────────────────────────────────────────────

interface AgentDisplay {
  agent: SwarmAgentState
  rosterAgent: SwarmRosterAgent
}

interface SimNode {
  id: string
  x: number
  y: number
  vx: number
  vy: number
  role: SwarmAgentRole
  label: string
  status: string
  radius: number
  fixed?: boolean
}

interface SimEdge {
  from: string
  to: string
  weight: number
}

interface DirectionalFlow {
  from: string
  to: string
  count: number
  types: Record<string, number>
  dominantType: string
}

export interface SelectedEdge {
  a: string
  b: string
}

interface SwarmInteractiveGraphProps {
  agents: AgentDisplay[]
  messages: SwarmMessage[]
  selectedAgentId: string | null
  selectedEdge: SelectedEdge | null
  onSelectAgent: (rosterId: string | null) => void
  onSelectEdge: (edge: SelectedEdge | null) => void
  onDoubleClickAgent: (terminalId: string) => void
}

// ─── Constants ──────────────────────────────────────────────

const MESSAGE_TYPE_COLORS: Record<string, string> = {
  assignment:         '#3b82f6',
  review_request:     '#8b5cf6',
  review_complete:    '#8b5cf6',
  review_feedback:    '#f43f5e',
  escalation:         '#f59e0b',
  worker_done:        '#10b981',
  status:             '#64748b',
  heartbeat:          '#475569',
  message:            '#94a3b8',
  interview:          '#38bdf8',
  interview_response: '#38bdf8',
}

const EDGE_TYPE_LABELS: Record<string, string> = {
  assignment:         'Asignacion',
  review_request:     'Rev. Solicitada',
  review_complete:    'Rev. Completa',
  review_feedback:    'Rev. Feedback',
  escalation:         'Escalamiento',
  worker_done:        'Tarea Completa',
  status:             'Estado',
  heartbeat:          'Heartbeat',
  message:            'Mensaje',
  interview:          'Entrevista',
  interview_response: 'Resp. Entrevista',
}

const REPULSION = 2000
const ATTRACTION = 0.008
const DAMPING = 0.85
const CENTER_GRAVITY = 0.01
const MIN_DIST = 60

// ─── Helpers ────────────────────────────────────────────────

function getEdgeColor(type: string): string {
  return MESSAGE_TYPE_COLORS[type] || '#94a3b8'
}

function getStatusColor(status: string): string {
  const map: Record<string, string> = {
    waiting: '#64748b', idle: '#64748b', planning: '#fb923c',
    building: '#38bdf8', review: '#c084fc', done: '#34d399', error: '#ef4444',
  }
  return map[status] || '#64748b'
}

function curvedEdgePath(
  x1: number, y1: number, r1: number,
  x2: number, y2: number, r2: number,
  offset: number,
): string {
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.sqrt(dx * dx + dy * dy) || 1
  const startPad = r1 + 3
  const endPad = r2 + 8
  if (len < startPad + endPad) return `M${x1},${y1} L${x2},${y2}`
  const sx = x1 + (dx / len) * startPad
  const sy = y1 + (dy / len) * startPad
  const ex = x1 + (dx / len) * (len - endPad)
  const ey = y1 + (dy / len) * (len - endPad)
  if (Math.abs(offset) < 0.1) return `M${sx},${sy} L${ex},${ey}`
  const mx = (sx + ex) / 2
  const my = (sy + ey) / 2
  const nx = (-dy / len) * offset
  const ny = (dx / len) * offset
  return `M${sx},${sy} Q${mx + nx},${my + ny} ${ex},${ey}`
}

function curveMidpoint(
  x1: number, y1: number,
  x2: number, y2: number,
  offset: number,
): { x: number; y: number } {
  const mx = (x1 + x2) / 2
  const my = (y1 + y2) / 2
  if (Math.abs(offset) < 0.1) return { x: mx, y: my }
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.sqrt(dx * dx + dy * dy) || 1
  return { x: mx + (-dy / len) * offset * 0.5, y: my + (dx / len) * offset * 0.5 }
}

// ─── Component ──────────────────────────────────────────────

export function SwarmInteractiveGraph({
  agents, messages, selectedAgentId, selectedEdge,
  onSelectAgent, onSelectEdge, onDoubleClickAgent,
}: SwarmInteractiveGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [dims, setDims] = useState({ w: 800, h: 600 })
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)
  const [hoveredEdge, setHoveredEdge] = useState<DirectionalFlow | null>(null)
  const [draggingNode, setDraggingNode] = useState<string | null>(null)
  const nodesRef = useRef<SimNode[]>([])
  const frameRef = useRef<number>(0)
  const clickStartRef = useRef({ x: 0, y: 0 })
  const [, forceRender] = useState(0)

  // Observe container size
  useLayoutEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      if (width > 0 && height > 0) setDims({ w: width, h: height })
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  // ─── Agent label maps ────────────────────────────────────

  const { labelToRoster, rosterToLabel } = useMemo(() => {
    const l2r = new Map<string, string>()
    const r2l = new Map<string, string>()
    agents.forEach(({ agent, rosterAgent }, idx) => {
      const roleDef = getRoleDef(rosterAgent.role)
      const label = rosterAgent.customName || `${roleDef.label} ${idx + 1}`
      l2r.set(label, agent.rosterId)
      r2l.set(agent.rosterId, label)
    })
    return { labelToRoster: l2r, rosterToLabel: r2l }
  }, [agents])

  // ─── Undirected edges (for force simulation attraction) ──

  const edges = useMemo(() => {
    const edgeMap = new Map<string, SimEdge>()
    messages.forEach((msg) => {
      if (!msg.from || !msg.to || msg.to === '@all' || msg.to === '@operator') return
      const fromId = labelToRoster.get(msg.from)
      const toId = labelToRoster.get(msg.to)
      if (!fromId || !toId || fromId === toId) return
      const key = [fromId, toId].sort().join('::')
      const existing = edgeMap.get(key)
      if (existing) { existing.weight++ }
      else { edgeMap.set(key, { from: fromId, to: toId, weight: 1 }) }
    })
    return Array.from(edgeMap.values())
  }, [messages, labelToRoster])

  // ─── Directional flows (for rendering) ───────────────────

  const flows = useMemo(() => {
    const flowMap = new Map<string, DirectionalFlow>()
    messages.forEach((msg) => {
      if (!msg.from || !msg.to || msg.to === '@all' || msg.to === '@operator') return
      const fromId = labelToRoster.get(msg.from)
      const toId = labelToRoster.get(msg.to)
      if (!fromId || !toId || fromId === toId) return
      const key = `${fromId}→${toId}`
      let flow = flowMap.get(key)
      if (!flow) {
        flow = { from: fromId, to: toId, count: 0, types: {}, dominantType: 'message' }
        flowMap.set(key, flow)
      }
      flow.count++
      flow.types[msg.type] = (flow.types[msg.type] || 0) + 1
    })
    const all = Array.from(flowMap.values())
    for (const f of all) {
      let mc = 0
      for (const [t, c] of Object.entries(f.types)) {
        if (c > mc) { mc = c; f.dominantType = t }
      }
    }
    return all
  }, [messages, labelToRoster])

  const maxFlowCount = useMemo(() => Math.max(1, ...flows.map((f) => f.count)), [flows])

  // ─── Initialize / update nodes ───────────────────────────

  useEffect(() => {
    const existingMap = new Map(nodesRef.current.map((n) => [n.id, n]))
    const cx = dims.w / 2
    const cy = dims.h / 2

    nodesRef.current = agents.map(({ agent, rosterAgent }, idx) => {
      const roleDef = getRoleDef(rosterAgent.role)
      const label = rosterAgent.customName || `${roleDef.label} ${idx + 1}`
      const existing = existingMap.get(agent.rosterId)
      const isActive = ['planning', 'building', 'review'].includes(agent.status)

      if (existing) {
        existing.role = rosterAgent.role
        existing.label = label
        existing.status = agent.status
        existing.radius = isActive ? 22 : 18
        return existing
      }

      const angle = (idx / Math.max(agents.length, 1)) * Math.PI * 2
      const spread = Math.min(dims.w, dims.h) * 0.3
      return {
        id: agent.rosterId,
        x: cx + Math.cos(angle) * spread + (Math.random() - 0.5) * 20,
        y: cy + Math.sin(angle) * spread + (Math.random() - 0.5) * 20,
        vx: 0, vy: 0,
        role: rosterAgent.role,
        label,
        status: agent.status,
        radius: isActive ? 22 : 18,
      }
    })
  }, [agents, dims])

  // ─── Force simulation loop ───────────────────────────────

  useEffect(() => {
    let running = true
    let tickCount = 0

    const tick = () => {
      if (!running) return
      const nodes = nodesRef.current
      const cx = dims.w / 2
      const cy = dims.h / 2

      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i]
        if (a.id === draggingNode) continue

        a.vx += (cx - a.x) * CENTER_GRAVITY
        a.vy += (cy - a.y) * CENTER_GRAVITY

        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j]
          let dx = a.x - b.x
          let dy = a.y - b.y
          let dist = Math.sqrt(dx * dx + dy * dy) || 1
          if (dist < MIN_DIST) dist = MIN_DIST

          const force = REPULSION / (dist * dist)
          const fx = (dx / dist) * force
          const fy = (dy / dist) * force

          a.vx += fx
          a.vy += fy
          if (b.id !== draggingNode) {
            b.vx -= fx
            b.vy -= fy
          }
        }
      }

      for (const edge of edges) {
        const a = nodes.find((n) => n.id === edge.from)
        const b = nodes.find((n) => n.id === edge.to)
        if (!a || !b) continue

        const dx = b.x - a.x
        const dy = b.y - a.y
        const force = ATTRACTION * Math.min(edge.weight, 5)

        if (a.id !== draggingNode) {
          a.vx += dx * force
          a.vy += dy * force
        }
        if (b.id !== draggingNode) {
          b.vx -= dx * force
          b.vy -= dy * force
        }
      }

      for (const node of nodes) {
        if (node.id === draggingNode) continue
        node.vx *= DAMPING
        node.vy *= DAMPING
        node.x += node.vx
        node.y += node.vy
        node.x = Math.max(node.radius, Math.min(dims.w - node.radius, node.x))
        node.y = Math.max(node.radius, Math.min(dims.h - node.radius, node.y))
      }

      tickCount++
      if (tickCount % 2 === 0) forceRender((c) => c + 1)

      frameRef.current = requestAnimationFrame(tick)
    }

    frameRef.current = requestAnimationFrame(tick)
    return () => { running = false; cancelAnimationFrame(frameRef.current) }
  }, [dims, edges, draggingNode])

  // ─── Zoom / Pan ──────────────────────────────────────────

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    setZoom((z) => Math.max(0.3, Math.min(3, z * delta)))
  }, [])

  const [isPanning, setIsPanning] = useState(false)
  const panStart = useRef({ x: 0, y: 0 })

  const handleBgPointerDown = useCallback((e: React.PointerEvent) => {
    clickStartRef.current = { x: e.clientX, y: e.clientY }
    if ((e.target as HTMLElement).closest('[data-agent-node]')) return
    if ((e.target as HTMLElement).closest('[data-edge-hit]')) return
    setIsPanning(true)
    panStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y }
  }, [pan])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (draggingNode) {
      const node = nodesRef.current.find((n) => n.id === draggingNode)
      if (node && svgRef.current) {
        const rect = svgRef.current.getBoundingClientRect()
        node.x = (e.clientX - rect.left - pan.x) / zoom
        node.y = (e.clientY - rect.top - pan.y) / zoom
        node.vx = 0
        node.vy = 0
      }
    } else if (isPanning) {
      setPan({
        x: e.clientX - panStart.current.x,
        y: e.clientY - panStart.current.y,
      })
    }
  }, [draggingNode, isPanning, zoom, pan])

  const handlePointerUp = useCallback(() => {
    setIsPanning(false)
    setDraggingNode(null)
  }, [])

  // ─── Background click (deselect all) ─────────────────────

  const handleBgClick = useCallback((e: React.MouseEvent) => {
    const dx = e.clientX - clickStartRef.current.x
    const dy = e.clientY - clickStartRef.current.y
    if (Math.abs(dx) + Math.abs(dy) > 5) return
    if ((e.target as Element).closest('[data-agent-node]')) return
    if ((e.target as Element).closest('[data-edge-hit]')) return
    onSelectAgent(null)
    onSelectEdge(null)
  }, [onSelectAgent, onSelectEdge])

  // ─── Render ──────────────────────────────────────────────

  const nodes = nodesRef.current
  const nodeMap = new Map(nodes.map((n) => [n.id, n]))
  const hasSelection = !!(selectedAgentId || selectedEdge)

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden"
      style={{ background: 'rgba(0,0,0,0.15)' }}
    >
      <svg
        ref={svgRef}
        width={dims.w}
        height={dims.h}
        onWheel={handleWheel}
        onPointerDown={handleBgPointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onClick={handleBgClick}
        style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
      >
        {/* Arrow marker defs — one per message type color */}
        <defs>
          {Object.entries(MESSAGE_TYPE_COLORS).map(([type, color]) => (
            <marker
              key={type}
              id={`flow-arrow-${type}`}
              viewBox="0 0 8 6"
              refX="7"
              refY="3"
              markerWidth="7"
              markerHeight="5"
              orient="auto"
            >
              <path d="M0,0.5 L7,3 L0,5.5" fill={color} fillOpacity={0.8} />
            </marker>
          ))}
        </defs>

        <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
          {/* ─── Directional flow edges ──────────────────── */}
          {flows.map((flow) => {
            const fn = nodeMap.get(flow.from)
            const tn = nodeMap.get(flow.to)
            if (!fn || !tn) return null

            const hasReverse = flows.some((f) => f.from === flow.to && f.to === flow.from)
            const offset = hasReverse ? 14 : 0
            const pathD = curvedEdgePath(fn.x, fn.y, fn.radius, tn.x, tn.y, tn.radius, offset)
            const color = getEdgeColor(flow.dominantType)
            const baseWidth = 1 + (flow.count / maxFlowCount) * 2.5

            const isEdgeSel = selectedEdge && (
              (selectedEdge.a === flow.from && selectedEdge.b === flow.to) ||
              (selectedEdge.a === flow.to && selectedEdge.b === flow.from)
            )
            const isAgentRel = selectedAgentId === flow.from || selectedAgentId === flow.to
            const isHov = hoveredEdge === flow

            let opacity: number
            if (isEdgeSel) opacity = 0.9
            else if (isHov) opacity = 0.7
            else if (isAgentRel) opacity = 0.5
            else if (hasSelection) opacity = 0.06
            else opacity = 0.15 + (flow.count / maxFlowCount) * 0.25

            const width = isEdgeSel ? baseWidth + 0.5 : baseWidth
            const dashLen = 3 + flow.count * 0.3
            const gapLen = 4
            const animDur = Math.max(0.4, 2 - (flow.count / maxFlowCount) * 1.2)

            return (
              <g key={`flow-${flow.from}→${flow.to}`}>
                {/* Invisible hit area */}
                <path
                  data-edge-hit
                  d={pathD}
                  stroke="transparent"
                  strokeWidth={14}
                  fill="none"
                  style={{ cursor: 'pointer' }}
                  onClick={(e) => {
                    e.stopPropagation()
                    onSelectEdge(isEdgeSel ? null : { a: flow.from, b: flow.to })
                  }}
                  onPointerEnter={() => setHoveredEdge(flow)}
                  onPointerLeave={() => setHoveredEdge(null)}
                />
                {/* Visible animated edge */}
                <path
                  d={pathD}
                  fill="none"
                  stroke={color}
                  strokeWidth={width}
                  strokeOpacity={opacity}
                  strokeDasharray={`${dashLen} ${gapLen}`}
                  strokeLinecap="round"
                  markerEnd={`url(#flow-arrow-${flow.dominantType})`}
                  pointerEvents="none"
                >
                  <animate
                    attributeName="stroke-dashoffset"
                    from="0"
                    to={`-${dashLen + gapLen}`}
                    dur={`${animDur}s`}
                    repeatCount="indefinite"
                  />
                </path>
                {/* Count badge on selected/hovered edge */}
                {(isEdgeSel || isHov) && (() => {
                  const mid = curveMidpoint(fn.x, fn.y, tn.x, tn.y, offset)
                  return (
                    <g transform={`translate(${mid.x},${mid.y})`}>
                      <circle r={9} fill="rgba(0,0,0,0.85)" stroke={color} strokeWidth={1} />
                      <text
                        textAnchor="middle"
                        dominantBaseline="central"
                        fill="white"
                        fontSize={8}
                        fontFamily="monospace"
                        fontWeight={700}
                      >
                        {flow.count}
                      </text>
                    </g>
                  )
                })()}
              </g>
            )
          })}

          {/* ─── Nodes ──────────────────────────────────── */}
          {nodes.map((node) => {
            const roleDef = getRoleDef(node.role)
            const isSelected = selectedAgentId === node.id
            const isEdgeNode = selectedEdge && (selectedEdge.a === node.id || selectedEdge.b === node.id)
            const isHovered = hoveredNode === node.id
            const isActive = ['planning', 'building', 'review'].includes(node.status)
            const statusColor = getStatusColor(node.status)
            const agent = agents.find((d) => d.agent.rosterId === node.id)

            // Dim nodes not involved in selection
            const dimmed = hasSelection && !isSelected && !isEdgeNode &&
              !flows.some((f) =>
                (selectedAgentId === f.from || selectedAgentId === f.to) &&
                (f.from === node.id || f.to === node.id),
              )

            return (
              <g
                key={node.id}
                data-agent-node
                transform={`translate(${node.x},${node.y})`}
                style={{ cursor: 'pointer', opacity: dimmed ? 0.3 : 1 }}
                onPointerDown={(e) => {
                  e.stopPropagation()
                  setDraggingNode(node.id)
                }}
                onClick={(e) => {
                  e.stopPropagation()
                  onSelectAgent(isSelected ? null : node.id)
                }}
                onDoubleClick={() => {
                  if (agent?.agent.terminalId) onDoubleClickAgent(agent.agent.terminalId)
                }}
                onPointerEnter={() => setHoveredNode(node.id)}
                onPointerLeave={() => setHoveredNode(null)}
              >
                {/* Active pulse ring */}
                {isActive && (
                  <circle
                    r={node.radius + 6}
                    fill="none"
                    stroke={statusColor}
                    strokeWidth={1.5}
                    opacity={0.3}
                  >
                    <animate
                      attributeName="r"
                      values={`${node.radius + 4};${node.radius + 10};${node.radius + 4}`}
                      dur="2s" repeatCount="indefinite"
                    />
                    <animate
                      attributeName="opacity"
                      values="0.3;0.05;0.3"
                      dur="2s" repeatCount="indefinite"
                    />
                  </circle>
                )}

                {/* Selection / edge-highlight ring */}
                {(isSelected || isEdgeNode) && (
                  <circle
                    r={node.radius + 4}
                    fill="none"
                    stroke="#38bdf8"
                    strokeWidth={2}
                    opacity={isSelected ? 0.6 : 0.3}
                  />
                )}

                {/* Main circle */}
                <circle
                  r={node.radius}
                  fill={isSelected ? 'rgba(56,189,248,0.12)' : isHovered ? 'rgba(255,255,255,0.06)' : 'rgba(10,15,26,0.8)'}
                  stroke={isSelected ? '#38bdf8' : `${roleDef.color}60`}
                  strokeWidth={isSelected ? 2 : 1.5}
                />

                {/* Role icon */}
                <foreignObject x={-8} y={-8} width={16} height={16}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16 }}>
                    <RoleIcon iconName={roleDef.icon} className="w-3.5 h-3.5" color={isSelected ? '#38bdf8' : roleDef.color} />
                  </div>
                </foreignObject>

                {/* Status dot */}
                <circle
                  cx={node.radius * 0.7}
                  cy={-node.radius * 0.7}
                  r={4}
                  fill={statusColor}
                  stroke="#0a0a0a"
                  strokeWidth={1.5}
                />

                {/* Message count badge (bottom-left) */}
                {(() => {
                  const msgCount = flows.reduce((sum, f) =>
                    f.from === node.id || f.to === node.id ? sum + f.count : sum, 0)
                  if (msgCount === 0) return null
                  return (
                    <g transform={`translate(${-node.radius * 0.6},${node.radius * 0.5})`}>
                      <circle r={6} fill="rgba(0,0,0,0.8)" stroke="rgba(255,255,255,0.15)" strokeWidth={0.5} />
                      <text
                        textAnchor="middle"
                        dominantBaseline="central"
                        fill="rgba(255,255,255,0.5)"
                        fontSize={7}
                        fontFamily="monospace"
                        fontWeight={600}
                      >
                        {msgCount > 99 ? '99+' : msgCount}
                      </text>
                    </g>
                  )
                })()}

                {/* Label */}
                <text
                  y={node.radius + 12}
                  textAnchor="middle"
                  fill={isSelected || isEdgeNode ? 'white' : 'rgba(255,255,255,0.45)'}
                  fontSize={9}
                  fontFamily="monospace"
                  fontWeight={isSelected ? 700 : 400}
                >
                  {node.label}
                </text>

                {/* Hover tooltip */}
                {isHovered && !draggingNode && (
                  <foreignObject x={node.radius + 8} y={-24} width={180} height={60}>
                    <div style={{
                      background: 'rgba(10,10,10,0.95)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 4,
                      padding: '4px 8px',
                      fontSize: 10,
                      fontFamily: 'monospace',
                      color: 'white',
                      whiteSpace: 'nowrap',
                    }}>
                      <div style={{ fontWeight: 700 }}>{node.label}</div>
                      <div style={{ color: statusColor, fontSize: 9, textTransform: 'uppercase' }}>{node.status}</div>
                      <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 8, marginTop: 1 }}>
                        {flows.filter((f) => f.from === node.id).length} salientes · {flows.filter((f) => f.to === node.id).length} entrantes
                      </div>
                    </div>
                  </foreignObject>
                )}
              </g>
            )
          })}
        </g>

        {/* Edge hover tooltip (outside transform for consistent size) */}
        {hoveredEdge && !draggingNode && (() => {
          const fn = nodeMap.get(hoveredEdge.from)
          const tn = nodeMap.get(hoveredEdge.to)
          if (!fn || !tn) return null
          const hasReverse = flows.some((f) => f.from === hoveredEdge.to && f.to === hoveredEdge.from)
          const mid = curveMidpoint(fn.x, fn.y, tn.x, tn.y, hasReverse ? 14 : 0)
          const sx = mid.x * zoom + pan.x + 14
          const sy = mid.y * zoom + pan.y - 20
          const fromLabel = rosterToLabel.get(hoveredEdge.from) || '?'
          const toLabel = rosterToLabel.get(hoveredEdge.to) || '?'
          const typeEntries = Object.entries(hoveredEdge.types).sort((a, b) => b[1] - a[1])
          const h = 28 + typeEntries.length * 15

          return (
            <foreignObject x={sx} y={sy} width={180} height={h + 4} pointerEvents="none">
              <div style={{
                background: 'rgba(8,8,8,0.95)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 4,
                padding: '5px 8px',
                fontSize: 9,
                fontFamily: 'monospace',
                color: 'white',
              }}>
                <div style={{ fontWeight: 700, marginBottom: 4, whiteSpace: 'nowrap' }}>
                  {fromLabel} → {toLabel}{' '}
                  <span style={{ color: 'rgba(255,255,255,0.3)' }}>({hoveredEdge.count})</span>
                </div>
                {typeEntries.map(([type, count]) => (
                  <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 4, lineHeight: '15px' }}>
                    <span style={{ width: 5, height: 5, borderRadius: 1, background: getEdgeColor(type), flexShrink: 0 }} />
                    <span style={{ color: 'rgba(255,255,255,0.5)', flex: 1 }}>
                      {EDGE_TYPE_LABELS[type] || type}
                    </span>
                    <span style={{ fontWeight: 700, color: getEdgeColor(type) }}>{count}</span>
                  </div>
                ))}
              </div>
            </foreignObject>
          )
        })()}
      </svg>

      {/* Zoom indicator */}
      <div
        className="absolute bottom-3 left-3"
        style={{ fontSize: 9, fontFamily: 'monospace', color: 'rgba(255,255,255,0.2)', fontVariantNumeric: 'tabular-nums' }}
      >
        {Math.round(zoom * 100)}%
      </div>

      {/* Edge type legend */}
      <div
        className="absolute bottom-3 right-3 flex items-center gap-2.5"
        style={{ fontSize: 8, fontFamily: 'monospace', pointerEvents: 'none' }}
      >
        {[
          { type: 'assignment', label: 'Asign' },
          { type: 'escalation', label: 'Escal' },
          { type: 'review_request', label: 'Review' },
          { type: 'worker_done', label: 'Done' },
          { type: 'status', label: 'Status' },
          { type: 'message', label: 'Msg' },
        ].map(({ type, label }) => (
          <div key={type} className="flex items-center gap-1">
            <span style={{
              width: 10, height: 2,
              background: MESSAGE_TYPE_COLORS[type],
              borderRadius: 1, display: 'inline-block',
            }} />
            <span style={{ color: 'rgba(255,255,255,0.2)' }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
