// SwarmKnowledgeGraphView — MiroFish-inspired D3-less knowledge graph browser
// Force-directed visualization of the persistent KnowledgeGraph
// Node types colored: file=blue, module=green, task=amber, pattern=violet, finding=pink, decision=gray
// Click node → detail panel, edge labels, filter by type

import { useState, useEffect, useRef, useMemo, useCallback, useLayoutEffect } from 'react'
import { Filter, Eye, EyeOff, X } from 'lucide-react'
import type { KGNode, KGEdge, KnowledgeGraph } from '../../lib/swarm-types'

// ─── Types ──────────────────────────────────────────────────

interface SwarmKnowledgeGraphViewProps {
  graph: KnowledgeGraph | null
}

interface KGSimNode {
  id: string
  x: number
  y: number
  vx: number
  vy: number
  type: KGNode['type']
  label: string
  properties: Record<string, unknown>
  radius: number
}

// ─── Constants ──────────────────────────────────────────────

const NODE_TYPE_COLORS: Record<string, string> = {
  file:     '#38bdf8',
  module:   '#34d399',
  task:     '#f59e0b',
  pattern:  '#8b5cf6',
  finding:  '#ec4899',
  decision: '#64748b',
}

const NODE_TYPE_LABELS: Record<string, string> = {
  file: 'Archivo', module: 'Modulo', task: 'Tarea',
  pattern: 'Patron', finding: 'Hallazgo', decision: 'Decision',
}

const EDGE_TYPE_COLORS: Record<string, string> = {
  modified_by:     '#f59e0b',
  depends_on:      '#38bdf8',
  discovered_by:   '#ec4899',
  conflicted_with: '#ef4444',
  reviewed_by:     '#8b5cf6',
  co_modified:     '#64748b',
  task_in_module:  '#34d399',
}

const REPULSION = 1500
const ATTRACTION = 0.006
const DAMPING = 0.88
const CENTER_GRAVITY = 0.015

// ─── Component ──────────────────────────────────────────────

export function SwarmKnowledgeGraphView({ graph }: SwarmKnowledgeGraphViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [dims, setDims] = useState({ w: 800, h: 600 })
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const panStart = useRef({ x: 0, y: 0 })
  const nodesRef = useRef<KGSimNode[]>([])
  const frameRef = useRef<number>(0)
  const [, forceRender] = useState(0)
  const [selectedNode, setSelectedNode] = useState<KGSimNode | null>(null)
  const [showEdgeLabels, setShowEdgeLabels] = useState(false)
  const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(new Set())

  useLayoutEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      if (width > 0 && height > 0) setDims({ w: width, h: height })
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  // Filter nodes and edges by hidden types
  const filteredNodes = useMemo(() => {
    if (!graph) return []
    return graph.nodes.filter((n) => !hiddenTypes.has(n.type))
  }, [graph, hiddenTypes])

  const filteredEdges = useMemo(() => {
    if (!graph) return []
    const nodeIds = new Set(filteredNodes.map((n) => n.id))
    return graph.edges.filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to))
  }, [graph, filteredNodes])

  // Initialize sim nodes
  useEffect(() => {
    const cx = dims.w / 2
    const cy = dims.h / 2
    const existingMap = new Map(nodesRef.current.map((n) => [n.id, n]))

    nodesRef.current = filteredNodes.map((node, idx) => {
      const existing = existingMap.get(node.id)
      if (existing) {
        existing.type = node.type
        existing.properties = node.properties
        return existing
      }
      const angle = (idx / Math.max(filteredNodes.length, 1)) * Math.PI * 2
      const spread = Math.min(dims.w, dims.h) * 0.35
      const label = node.id.includes(':') ? node.id.split(':').pop()! : node.id
      return {
        id: node.id,
        x: cx + Math.cos(angle) * spread + (Math.random() - 0.5) * 30,
        y: cy + Math.sin(angle) * spread + (Math.random() - 0.5) * 30,
        vx: 0, vy: 0,
        type: node.type,
        label: label.length > 20 ? label.slice(0, 18) + '…' : label,
        properties: node.properties,
        radius: node.type === 'module' ? 12 : node.type === 'task' ? 10 : 8,
      }
    })
  }, [filteredNodes, dims])

  // Force simulation
  useEffect(() => {
    let running = true
    let tick = 0
    const simulate = () => {
      if (!running) return
      const nodes = nodesRef.current
      const cx = dims.w / 2, cy = dims.h / 2

      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i]
        a.vx += (cx - a.x) * CENTER_GRAVITY
        a.vy += (cy - a.y) * CENTER_GRAVITY
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j]
          let dx = a.x - b.x, dy = a.y - b.y
          let dist = Math.sqrt(dx * dx + dy * dy) || 1
          if (dist < 30) dist = 30
          const force = REPULSION / (dist * dist)
          const fx = (dx / dist) * force, fy = (dy / dist) * force
          a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy
        }
      }

      for (const edge of filteredEdges) {
        const a = nodes.find((n) => n.id === edge.from)
        const b = nodes.find((n) => n.id === edge.to)
        if (!a || !b) continue
        const dx = b.x - a.x, dy = b.y - a.y
        const force = ATTRACTION * Math.min(edge.weight, 3)
        a.vx += dx * force; a.vy += dy * force
        b.vx -= dx * force; b.vy -= dy * force
      }

      for (const node of nodes) {
        node.vx *= DAMPING; node.vy *= DAMPING
        node.x += node.vx; node.y += node.vy
        node.x = Math.max(20, Math.min(dims.w - 20, node.x))
        node.y = Math.max(20, Math.min(dims.h - 20, node.y))
      }

      tick++
      if (tick % 2 === 0) forceRender((c) => c + 1)
      frameRef.current = requestAnimationFrame(simulate)
    }
    frameRef.current = requestAnimationFrame(simulate)
    return () => { running = false; cancelAnimationFrame(frameRef.current) }
  }, [dims, filteredEdges])

  // Zoom/Pan
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    setZoom((z) => Math.max(0.2, Math.min(4, z * (e.deltaY > 0 ? 0.9 : 1.1))))
  }, [])

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if ((e.target as Element).closest('[data-kg-node]')) return
    setIsPanning(true)
    panStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y }
  }, [pan])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (isPanning) setPan({ x: e.clientX - panStart.current.x, y: e.clientY - panStart.current.y })
  }, [isPanning])

  const handlePointerUp = useCallback(() => setIsPanning(false), [])

  const toggleType = useCallback((type: string) => {
    setHiddenTypes((prev) => {
      const next = new Set(prev)
      if (next.has(type)) next.delete(type); else next.add(type)
      return next
    })
  }, [])

  const nodes = nodesRef.current
  const nodeMap = new Map(nodes.map((n) => [n.id, n]))

  if (!graph || graph.nodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2" style={{ background: 'rgba(0,0,0,0.15)' }}>
        <span className="text-[10px] text-white/15 font-mono">Knowledge Graph vacio</span>
        <span className="text-[8px] text-white/10 font-mono">Se construye automaticamente despues de completar swarms</span>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="relative w-full h-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.15)' }}>
      <svg
        width={dims.w} height={dims.h}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
      >
        <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
          {/* Edges */}
          {filteredEdges.map((edge, i) => {
            const a = nodeMap.get(edge.from), b = nodeMap.get(edge.to)
            if (!a || !b) return null
            const color = EDGE_TYPE_COLORS[edge.type] || '#475569'
            const opacity = 0.1 + Math.min(edge.weight / 10, 0.3)
            return (
              <g key={`e-${i}`}>
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  stroke={color} strokeWidth={1} strokeOpacity={opacity} />
                {showEdgeLabels && (
                  <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 3}
                    textAnchor="middle" fill={color} fillOpacity={0.4}
                    fontSize={6} fontFamily="monospace">
                    {edge.type.replace(/_/g, ' ')}
                  </text>
                )}
              </g>
            )
          })}

          {/* Nodes */}
          {nodes.map((node) => {
            const color = NODE_TYPE_COLORS[node.type] || '#64748b'
            const isSel = selectedNode?.id === node.id
            return (
              <g key={node.id} data-kg-node
                transform={`translate(${node.x},${node.y})`}
                style={{ cursor: 'pointer' }}
                onClick={(e) => { e.stopPropagation(); setSelectedNode(isSel ? null : node) }}
              >
                {isSel && <circle r={node.radius + 4} fill="none" stroke={color} strokeWidth={1.5} opacity={0.5} />}
                <circle r={node.radius} fill={`${color}20`} stroke={color} strokeWidth={1.5} />
                <text y={node.radius + 10} textAnchor="middle"
                  fill={isSel ? 'white' : 'rgba(255,255,255,0.35)'}
                  fontSize={7} fontFamily="monospace" fontWeight={isSel ? 700 : 400}>
                  {node.label}
                </text>
              </g>
            )
          })}
        </g>
      </svg>

      {/* Type filter toggle bar */}
      <div className="absolute top-2 left-2 flex items-center gap-1" style={{ fontSize: 7, fontFamily: 'monospace' }}>
        <Filter className="w-3 h-3 text-white/20" />
        {Object.entries(NODE_TYPE_COLORS).map(([type, color]) => (
          <button key={type}
            onClick={() => toggleType(type)}
            className="flex items-center gap-0.5 px-1.5 py-0.5 rounded transition-colors"
            style={{
              background: hiddenTypes.has(type) ? 'rgba(255,255,255,0.02)' : `${color}15`,
              color: hiddenTypes.has(type) ? 'rgba(255,255,255,0.15)' : color,
              border: `1px solid ${hiddenTypes.has(type) ? 'rgba(255,255,255,0.05)' : `${color}30`}`,
              cursor: 'pointer', textDecoration: hiddenTypes.has(type) ? 'line-through' : 'none',
            }}
          >
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: hiddenTypes.has(type) ? 'rgba(255,255,255,0.1)' : color, display: 'inline-block' }} />
            {NODE_TYPE_LABELS[type] || type}
          </button>
        ))}
        <button
          onClick={() => setShowEdgeLabels(!showEdgeLabels)}
          className="flex items-center gap-0.5 px-1.5 py-0.5 rounded transition-colors"
          style={{
            background: showEdgeLabels ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.02)',
            color: showEdgeLabels ? 'white' : 'rgba(255,255,255,0.2)',
            border: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer',
          }}
        >
          {showEdgeLabels ? <Eye className="w-2.5 h-2.5" /> : <EyeOff className="w-2.5 h-2.5" />}
          Edges
        </button>
      </div>

      {/* Stats */}
      <div className="absolute bottom-2 left-2 text-[8px] font-mono text-white/15">
        {filteredNodes.length} nodos · {filteredEdges.length} edges · {Math.round(zoom * 100)}%
      </div>

      {/* Selected node detail panel */}
      {selectedNode && (
        <div className="absolute top-2 right-2" style={{
          width: 220, background: 'rgba(8,8,8,0.95)', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 4, padding: 8, fontSize: 9, fontFamily: 'monospace',
        }}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: NODE_TYPE_COLORS[selectedNode.type], display: 'inline-block' }} />
              <span className="text-white font-bold">{NODE_TYPE_LABELS[selectedNode.type]}</span>
            </div>
            <button onClick={() => setSelectedNode(null)} style={{ cursor: 'pointer', color: 'rgba(255,255,255,0.3)' }}>
              <X className="w-3 h-3" />
            </button>
          </div>
          <div className="text-[10px] text-white/60 mb-2 break-all">{selectedNode.id}</div>
          {Object.entries(selectedNode.properties).length > 0 && (
            <div className="flex flex-col gap-0.5">
              {Object.entries(selectedNode.properties).slice(0, 8).map(([key, value]) => (
                <div key={key} className="flex gap-1">
                  <span className="text-white/25 shrink-0">{key}:</span>
                  <span className="text-white/40 truncate">{String(value)}</span>
                </div>
              ))}
            </div>
          )}
          {/* Connected edges */}
          <div className="mt-2 pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <span className="text-white/20 text-[8px]">Conexiones:</span>
            {filteredEdges.filter((e) => e.from === selectedNode!.id || e.to === selectedNode!.id).slice(0, 5).map((e, i) => {
              const other = e.from === selectedNode!.id ? e.to : e.from
              const otherLabel = other.includes(':') ? other.split(':').pop() : other
              return (
                <div key={i} className="text-[8px] text-white/30 truncate">
                  <span style={{ color: EDGE_TYPE_COLORS[e.type] || '#475569' }}>{e.type}</span>
                  {' → '}
                  <span className="text-white/40">{otherLabel}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
