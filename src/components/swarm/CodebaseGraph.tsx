// CodebaseGraph — Interactive force-directed codebase knowledge graph (B9)
//
// Reads `{swarmRoot}/knowledge/codebase-map.json` and renders an interactive
// SVG visualization with force simulation. No D3 dependency — pure SVG + math.
// Inspired by MiroFish GraphPanel but adapted for dark Glass UI.

import { useState, useEffect, useMemo, useCallback, useRef, useLayoutEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Network, ChevronDown, X, FileCode, ArrowRight, Tag } from 'lucide-react'
import { useSwarmStore } from '../../stores/swarmStore'
import type { SwarmAgentRole } from '../../lib/swarm-types'
import { getRoleDef } from '../../lib/swarm-types'

// ─── Types ──────────────────────────────────────────────────

interface CodebaseNode {
  path: string
  type: string
  language?: string
  imports: string[]
  importedBy: string[]
  linesOfCode: number
  lastModified: number
  gitHotness: number
  complexity: string
}

interface CodebaseEdge {
  from: string
  to: string
  type: string
}

interface CodebaseModule {
  name: string
  directory: string
  files: string[]
}

interface CodebaseMap {
  version: number
  projectName: string
  nodes: CodebaseNode[]
  edges: CodebaseEdge[]
  modules: CodebaseModule[]
  summary: {
    totalFiles: number
    totalLines: number
    languages: Record<string, number>
    hotspots: string[]
  }
}

// ─── Force Simulation ───────────────────────────────────────

interface SimNode {
  id: string
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  moduleIdx: number
  language?: string
  loc: number
  hotness: number
  imports: string[]
  importedBy: string[]
  complexity: string
  type: string
  /** Pinned x (for drag) */
  fx?: number | null
  /** Pinned y (for drag) */
  fy?: number | null
}

interface SimEdge {
  source: string
  target: string
  type: string
  /** Curvature offset for multi-edges between same node pair */
  curvature: number
  /** Index within edge pair group */
  pairIndex: number
  /** Total edges between this pair */
  pairTotal: number
}

/** Module palette — 8 solid colors (no gradients). */
const MODULE_COLORS = [
  '#38bdf8', // sky-400
  '#a78bfa', // violet-400
  '#34d399', // emerald-400
  '#fb923c', // orange-400
  '#f472b6', // pink-400
  '#60a5fa', // blue-400
  '#fbbf24', // amber-400
  '#c084fc', // purple-400
]

function getModuleColor(idx: number): string {
  return MODULE_COLORS[idx % MODULE_COLORS.length]
}

/** Truncate file path to just filename, then cap at maxLen chars */
function truncateLabel(path: string, maxLen = 14): string {
  const name = path.split('/').pop() || path
  return name.length > maxLen ? name.substring(0, maxLen - 1) + '\u2026' : name
}

/**
 * Continuous force-directed layout simulation.
 * Runs on requestAnimationFrame, returns a stop function.
 */
function createForceSimulation(
  nodes: SimNode[],
  edges: SimEdge[],
  width: number,
  height: number,
  onTick: (nodes: SimNode[]) => void,
): { stop: () => void; reheat: (alpha?: number) => void; nodes: SimNode[] } {
  const result = nodes.map((n) => ({ ...n }))
  const nodeMap = new Map<string, number>()
  result.forEach((n, i) => nodeMap.set(n.id, i))

  // Initialize positions in module clusters
  const moduleGroups = new Map<number, number[]>()
  result.forEach((n, i) => {
    if (!moduleGroups.has(n.moduleIdx)) moduleGroups.set(n.moduleIdx, [])
    moduleGroups.get(n.moduleIdx)!.push(i)
  })

  // Place module clusters in a circular arrangement
  const moduleCount = moduleGroups.size
  const cx = width / 2
  const cy = height / 2
  const orbitRadius = Math.min(width, height) * 0.32

  let mIdx = 0
  for (const [, nodeIndices] of moduleGroups) {
    const angle = (2 * Math.PI * mIdx) / Math.max(moduleCount, 1)
    const groupCx = cx + Math.cos(angle) * orbitRadius
    const groupCy = cy + Math.sin(angle) * orbitRadius

    for (let j = 0; j < nodeIndices.length; j++) {
      const idx = nodeIndices[j]
      const spread = Math.min(60, 15 + nodeIndices.length * 3)
      result[idx].x = groupCx + (Math.random() - 0.5) * spread * 2
      result[idx].y = groupCy + (Math.random() - 0.5) * spread * 2
    }
    mIdx++
  }

  // Simulation parameters (tuned closer to D3 defaults)
  const repulsionStrength = 1200
  const springStrength = 0.04
  const springRestLength = 80
  const gravityStrength = 0.012
  const collisionRadius = 8 // extra collision padding beyond node radius
  const damping = 0.82
  const minAlpha = 0.001

  let alpha = 1.0
  let alphaTarget = 0
  const alphaDecay = 0.015
  let running = true
  let animId = 0

  function tick() {
    if (!running) return

    alpha += (alphaTarget - alpha) * alphaDecay
    if (alpha < minAlpha && alphaTarget === 0) {
      alpha = 0
      // Don't stop loop — just idle. reheat() can restart.
      animId = requestAnimationFrame(tick)
      return
    }

    const cooling = alpha

    // Repulsion (charge force) — O(n^2) but capped at 200 nodes
    for (let i = 0; i < result.length; i++) {
      if (result[i].fx != null) continue // skip pinned nodes for repulsion calc on self
      for (let j = i + 1; j < result.length; j++) {
        const dx = result[j].x - result[i].x
        const dy = result[j].y - result[i].y
        const distSq = dx * dx + dy * dy
        const dist = Math.max(Math.sqrt(distSq), 1)
        const force = (repulsionStrength * cooling) / (distSq + 100) // softened denominator
        const fx = (dx / dist) * force
        const fy = (dy / dist) * force

        if (result[i].fx == null) { result[i].vx -= fx; result[i].vy -= fy }
        if (result[j].fx == null) { result[j].vx += fx; result[j].vy += fy }
      }
    }

    // Spring force (connected nodes attract)
    for (const edge of edges) {
      const si = nodeMap.get(edge.source)
      const ti = nodeMap.get(edge.target)
      if (si === undefined || ti === undefined) continue

      const dx = result[ti].x - result[si].x
      const dy = result[ti].y - result[si].y
      const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1)
      // Dynamic rest length: more edges between pair = more spacing
      const restLen = springRestLength + (edge.pairTotal - 1) * 30
      const displacement = dist - restLen
      const force = springStrength * displacement * cooling

      const fx = (dx / dist) * force
      const fy = (dy / dist) * force

      if (result[si].fx == null) { result[si].vx += fx; result[si].vy += fy }
      if (result[ti].fx == null) { result[ti].vx -= fx; result[ti].vy -= fy }
    }

    // Gravity (pull toward center)
    for (const node of result) {
      if (node.fx != null) continue
      const dx = cx - node.x
      const dy = cy - node.y
      node.vx += dx * gravityStrength * cooling
      node.vy += dy * gravityStrength * cooling
    }

    // Collision detection (prevent overlap)
    for (let i = 0; i < result.length; i++) {
      for (let j = i + 1; j < result.length; j++) {
        const dx = result[j].x - result[i].x
        const dy = result[j].y - result[i].y
        const dist = Math.sqrt(dx * dx + dy * dy)
        const minDist = result[i].radius + result[j].radius + collisionRadius
        if (dist < minDist && dist > 0) {
          const overlap = (minDist - dist) / 2
          const nx = dx / dist
          const ny = dy / dist
          if (result[i].fx == null) { result[i].x -= nx * overlap; result[i].y -= ny * overlap }
          if (result[j].fx == null) { result[j].x += nx * overlap; result[j].y += ny * overlap }
        }
      }
    }

    // Apply velocities with damping
    for (const node of result) {
      if (node.fx != null) {
        node.x = node.fx
        node.y = node.fy!
        node.vx = 0
        node.vy = 0
        continue
      }

      node.vx *= damping
      node.vy *= damping
      node.x += node.vx
      node.y += node.vy

      // Boundary constraints with padding
      const pad = node.radius + 10
      node.x = Math.max(pad, Math.min(width - pad, node.x))
      node.y = Math.max(pad, Math.min(height - pad, node.y))
    }

    onTick(result)
    animId = requestAnimationFrame(tick)
  }

  // Start
  animId = requestAnimationFrame(tick)

  return {
    stop: () => {
      running = false
      cancelAnimationFrame(animId)
    },
    reheat: (a = 0.3) => {
      alphaTarget = 0
      alpha = Math.max(alpha, a)
    },
    nodes: result,
  }
}

// ─── Edge Path Utilities ────────────────────────────────────

/** Get SVG path for an edge (straight or curved) */
function getEdgePath(
  sx: number, sy: number, tx: number, ty: number, curvature: number,
): string {
  if (curvature === 0) {
    return `M${sx},${sy} L${tx},${ty}`
  }
  // Quadratic bezier curve
  const dx = tx - sx
  const dy = ty - sy
  const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1)
  const baseOffset = Math.max(30, dist * 0.3)
  const offsetX = (-dy / dist) * curvature * baseOffset
  const offsetY = (dx / dist) * curvature * baseOffset
  const cpx = (sx + tx) / 2 + offsetX
  const cpy = (sy + ty) / 2 + offsetY
  return `M${sx},${sy} Q${cpx},${cpy} ${tx},${ty}`
}

/** Get midpoint of an edge path (for label positioning) */
function getEdgeMidpoint(
  sx: number, sy: number, tx: number, ty: number, curvature: number,
): { x: number; y: number } {
  if (curvature === 0) {
    return { x: (sx + tx) / 2, y: (sy + ty) / 2 }
  }
  const dx = tx - sx
  const dy = ty - sy
  const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1)
  const baseOffset = Math.max(30, dist * 0.3)
  const offsetX = (-dy / dist) * curvature * baseOffset
  const offsetY = (dx / dist) * curvature * baseOffset
  const cpx = (sx + tx) / 2 + offsetX
  const cpy = (sy + ty) / 2 + offsetY
  // Bezier t=0.5: B = 0.25*P0 + 0.5*CP + 0.25*P2
  return {
    x: 0.25 * sx + 0.5 * cpx + 0.25 * tx,
    y: 0.25 * sy + 0.5 * cpy + 0.25 * ty,
  }
}

// ─── Component ──────────────────────────────────────────────

interface CodebaseGraphProps {
  swarmId: string
  /** When true, the graph renders fully expanded without the collapsible wrapper/header. */
  expanded?: boolean
}

interface DetailPanel {
  node: SimNode
  x: number
  y: number
}

export function CodebaseGraph({ swarmId, expanded = false }: CodebaseGraphProps) {
  const [collapsed, setCollapsed] = useState(!expanded)
  // Keep collapsed in sync with expanded prop
  useEffect(() => {
    if (expanded) setCollapsed(false)
  }, [expanded])
  const [codebaseMap, setCodebaseMap] = useState<CodebaseMap | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)
  const [hoveredEdge, setHoveredEdge] = useState<number | null>(null)
  const [selectedNode, setSelectedNode] = useState<DetailPanel | null>(null)
  const [showEdgeLabels, setShowEdgeLabels] = useState(false)
  const [, forceUpdate] = useState(0) // trigger re-render on simulation tick

  // Zoom/pan via SVG transform (like D3 zoom)
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 })
  const [panStart, setPanStart] = useState<{ mx: number; my: number; tx: number; ty: number } | null>(null)
  const [dragNode, setDragNode] = useState<{ idx: number; startX: number; startY: number; isDragging: boolean } | null>(null)

  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [svgSize, setSvgSize] = useState({ w: 800, h: 400 })
  const simRef = useRef<ReturnType<typeof createForceSimulation> | null>(null)

  const activeSwarm = useSwarmStore((s) =>
    s.swarms.find((sw) => sw.id === swarmId),
  )
  const activityFeed = useSwarmStore((s) => s.activityFeed)

  // ─── Responsive SVG size ────────────────────────────────
  useLayoutEffect(() => {
    if (!containerRef.current || collapsed) return
    const obs = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        if (width > 0 && height > 0) {
          setSvgSize({ w: Math.round(width), h: Math.max(300, Math.round(height)) })
        }
      }
    })
    obs.observe(containerRef.current)
    return () => obs.disconnect()
  }, [collapsed])

  // ─── Load codebase map ──────────────────────────────────
  useEffect(() => {
    if (collapsed || !activeSwarm?.swarmRoot) return

    let cancelled = false
    setLoading(true)
    setError(null)

    const loadMap = async () => {
      try {
        const path = `${activeSwarm.swarmRoot}/knowledge/codebase-map.json`
        const result = await window.ghostshell.fsReadFile(path)
        if (cancelled) return

        if (!result.success || !result.content) {
          setError('Codebase map not available')
          setLoading(false)
          return
        }

        const parsed = JSON.parse(result.content) as CodebaseMap
        setCodebaseMap(parsed)
      } catch {
        if (!cancelled) setError('Failed to load codebase map')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadMap()
    return () => { cancelled = true }
  }, [collapsed, activeSwarm?.swarmRoot])

  // ─── Compute agent file activity overlay ────────────────
  const agentFileActivity = useMemo(() => {
    const map = new Map<string, { agentLabel: string; role: SwarmAgentRole }>()
    const swarmEvents = activityFeed.filter((e) => e.swarmId === swarmId)

    for (const event of swarmEvents) {
      if (event.type === 'file_write' || event.type === 'file_edit') {
        const filePath = event.detail
        if (filePath) {
          map.set(filePath, { agentLabel: event.agentLabel, role: event.agentRole })
        }
      }
    }
    return map
  }, [activityFeed, swarmId])

  // ─── Process edges with curvature for multi-edges ───────
  const processedData = useMemo(() => {
    if (!codebaseMap) return { simNodes: [] as SimNode[], simEdges: [] as SimEdge[], moduleMap: new Map<string, number>() }

    const { nodes, edges, modules } = codebaseMap

    // Build module index map
    const modMap = new Map<string, number>()
    modules.forEach((m, i) => {
      for (const f of m.files) {
        modMap.set(f, i)
      }
    })

    // Limit to 200 most-connected nodes
    let filteredNodes = nodes
    if (nodes.length > 200) {
      const scored = nodes.map((n) => ({
        node: n,
        score: n.imports.length + n.importedBy.length + n.gitHotness,
      }))
      scored.sort((a, b) => b.score - a.score)
      filteredNodes = scored.slice(0, 200).map((s) => s.node)
    }

    const nodeSet = new Set(filteredNodes.map((n) => n.path))

    // Filter edges to only include visible nodes
    const rawEdges = edges.filter((e) => nodeSet.has(e.from) && nodeSet.has(e.to))

    // Count edges per pair for curvature calculation
    const pairCount = new Map<string, number>()
    const pairIndex = new Map<string, number>()
    for (const e of rawEdges) {
      const key = [e.from, e.to].sort().join('\0')
      pairCount.set(key, (pairCount.get(key) || 0) + 1)
    }

    const simEdges: SimEdge[] = rawEdges.map((e) => {
      const key = [e.from, e.to].sort().join('\0')
      const total = pairCount.get(key) || 1
      const idx = pairIndex.get(key) || 0
      pairIndex.set(key, idx + 1)

      let curvature = 0
      if (total > 1) {
        const range = Math.min(1.2, 0.6 + total * 0.15)
        curvature = ((idx / (total - 1)) - 0.5) * range * 2
        // Flip if reversed direction
        if (e.from > e.to) curvature = -curvature
      }

      return {
        source: e.from,
        target: e.to,
        type: e.type,
        curvature,
        pairIndex: idx,
        pairTotal: total,
      }
    })

    // Build sim nodes
    const sNodes: SimNode[] = filteredNodes.map((n) => ({
      id: n.path,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      radius: Math.max(5, Math.min(18, Math.sqrt(n.linesOfCode / 8))),
      moduleIdx: modMap.get(n.path) ?? 0,
      language: n.language,
      loc: n.linesOfCode,
      hotness: n.gitHotness,
      imports: n.imports.filter((i) => nodeSet.has(i)),
      importedBy: n.importedBy.filter((i) => nodeSet.has(i)),
      complexity: n.complexity,
      type: n.type,
    }))

    return { simNodes: sNodes, simEdges, moduleMap: modMap }
  }, [codebaseMap])

  // ─── Run continuous force simulation ────────────────────
  useEffect(() => {
    if (processedData.simNodes.length === 0 || collapsed) return

    // Stop previous simulation
    simRef.current?.stop()

    const sim = createForceSimulation(
      processedData.simNodes,
      processedData.simEdges,
      svgSize.w,
      svgSize.h,
      () => {
        // Trigger re-render on each tick (throttled by rAF)
        forceUpdate((c) => c + 1)
      },
    )
    simRef.current = sim

    return () => sim.stop()
  }, [processedData, svgSize.w, svgSize.h, collapsed])

  // Live node positions from the simulation
  const liveNodes = simRef.current?.nodes ?? []
  const liveEdges = processedData.simEdges

  // ─── Node position map for edge rendering ───────────────
  const nodePositions = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>()
    for (const n of liveNodes) {
      map.set(n.id, { x: n.x, y: n.y })
    }
    return map
  }, [liveNodes, liveNodes.length > 0 ? liveNodes[0].x : 0]) // re-derive on tick

  // ─── Compute highlighted set when hovering ──────────────
  const highlightSet = useMemo(() => {
    if (!hoveredNode) return new Set<string>()
    const set = new Set<string>([hoveredNode])
    const node = liveNodes.find((n) => n.id === hoveredNode)
    if (node) {
      for (const imp of node.imports) set.add(imp)
      for (const imp of node.importedBy) set.add(imp)
    }
    return set
  }, [hoveredNode, liveNodes])

  // ─── Module legend data ─────────────────────────────────
  const moduleLegend = useMemo(() => {
    if (!codebaseMap) return []
    return codebaseMap.modules.slice(0, 8).map((m, i) => ({
      name: m.name,
      color: getModuleColor(i),
      count: m.files.length,
    }))
  }, [codebaseMap])

  // ─── Zoom handler (mouse wheel) ─────────────────────────
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const svg = svgRef.current
    if (!svg) return

    const rect = svg.getBoundingClientRect()
    // Mouse position relative to SVG
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top

    const zoomFactor = e.deltaY > 0 ? 0.92 : 1.08
    setTransform((prev) => {
      const newK = Math.max(0.15, Math.min(5, prev.k * zoomFactor))
      // Zoom toward mouse position
      const newX = mx - (mx - prev.x) * (newK / prev.k)
      const newY = my - (my - prev.y) * (newK / prev.k)
      return { x: newX, y: newY, k: newK }
    })
  }, [])

  // ─── Pan handlers (background drag) ─────────────────────
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    const tag = (e.target as Element).tagName.toLowerCase()
    // Only pan if clicking on SVG background, the background rect, or the main g
    if (tag === 'svg' || (e.target as Element).getAttribute('data-bg') === 'true') {
      setPanStart({ mx: e.clientX, my: e.clientY, tx: transform.x, ty: transform.y })
      e.preventDefault()
    }
  }, [transform])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    // Node drag takes priority
    if (dragNode) {
      const svg = svgRef.current
      if (!svg) return
      const rect = svg.getBoundingClientRect()
      // Convert screen coords to graph space
      const gx = (e.clientX - rect.left - transform.x) / transform.k
      const gy = (e.clientY - rect.top - transform.y) / transform.k

      const dx = Math.abs(e.clientX - dragNode.startX)
      const dy = Math.abs(e.clientY - dragNode.startY)
      if (!dragNode.isDragging && (dx + dy) > 4) {
        setDragNode((prev) => prev ? { ...prev, isDragging: true } : null)
        simRef.current?.reheat(0.3)
      }

      if (dragNode.isDragging || (dx + dy) > 4) {
        const node = liveNodes[dragNode.idx]
        if (node) {
          node.fx = gx
          node.fy = gy
        }
      }
      return
    }

    // Pan
    if (!panStart) return
    setTransform({
      x: panStart.tx + (e.clientX - panStart.mx),
      y: panStart.ty + (e.clientY - panStart.my),
      k: transform.k,
    })
  }, [panStart, dragNode, transform, liveNodes])

  const handleMouseUp = useCallback(() => {
    if (dragNode) {
      const node = liveNodes[dragNode.idx]
      if (node) {
        node.fx = null
        node.fy = null
      }
      // If it was just a click (no drag), handle as node click
      if (!dragNode.isDragging) {
        const node = liveNodes[dragNode.idx]
        if (node) {
          if (selectedNode?.node.id === node.id) {
            setSelectedNode(null)
          } else {
            setSelectedNode({ node, x: node.x, y: node.y })
          }
        }
      }
      setDragNode(null)
      return
    }
    setPanStart(null)
  }, [dragNode, liveNodes, selectedNode])

  // ─── Node drag start ────────────────────────────────────
  const handleNodeMouseDown = useCallback((idx: number, e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    setDragNode({ idx, startX: e.clientX, startY: e.clientY, isDragging: false })
  }, [])

  // ─── Click on node (fallback for non-drag clicks) ──────
  // Handled in handleMouseUp when dragNode.isDragging is false

  // ─── Close detail panel on background click ─────────────
  const handleBackgroundClick = useCallback(() => {
    setSelectedNode(null)
    setHoveredEdge(null)
  }, [])

  // ─── Reset zoom ─────────────────────────────────────────
  const handleResetZoom = useCallback(() => {
    setTransform({ x: 0, y: 0, k: 1 })
  }, [])

  if (!activeSwarm) return null

  // ─── Shared inner content (graph SVG + overlays) ──────
  const renderGraphContent = () => (
    <>
      {loading && (
        <div className="flex items-center justify-center py-8" style={{ flex: 1 }}>
          <span className="text-xs text-ghost-text-dim/40 animate-pulse">Analyzing codebase...</span>
        </div>
      )}

      {error && (
        <div className="flex items-center justify-center py-8" style={{ flex: 1 }}>
          <span className="text-xs text-ghost-text-dim/40">{error}</span>
        </div>
      )}

      {!loading && !error && liveNodes.length === 0 && !codebaseMap && (
        <div className="flex items-center justify-center py-8" style={{ flex: 1 }}>
          <span className="text-xs text-ghost-text-dim/40">No codebase data</span>
        </div>
      )}

      {!loading && !error && liveNodes.length > 0 && (
        <div className="relative" ref={containerRef} style={expanded ? { position: 'absolute', inset: 0 } : { minHeight: 400 }}>
                {/* Toolbar overlay */}
                <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5">
                  {/* Edge labels toggle */}
                  <button
                    onClick={() => setShowEdgeLabels((v) => !v)}
                    className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono transition-colors border ${
                      showEdgeLabels
                        ? 'bg-sky-400/15 border-sky-400/30 text-sky-400'
                        : 'bg-white/[0.04] border-white/[0.06] text-ghost-text-dim/50 hover:text-ghost-text-dim'
                    }`}
                    title="Toggle edge labels"
                  >
                    <Tag className="w-2.5 h-2.5" />
                    Labels
                  </button>
                  {/* Reset zoom */}
                  <button
                    onClick={handleResetZoom}
                    className="px-2 py-1 rounded text-[10px] font-mono bg-white/[0.04] border border-white/[0.06] text-ghost-text-dim/50 hover:text-ghost-text-dim transition-colors"
                    title="Reset zoom"
                  >
                    1:1
                  </button>
                  {/* Zoom level indicator */}
                  <span className="text-[9px] font-mono text-ghost-text-dim/30 ml-1">
                    {Math.round(transform.k * 100)}%
                  </span>
                </div>

                {/* SVG Graph */}
                <svg
                  ref={svgRef}
                  width={svgSize.w}
                  height={svgSize.h}
                  viewBox={`0 0 ${svgSize.w} ${svgSize.h}`}
                  className="w-full cursor-grab active:cursor-grabbing select-none"
                  style={{ height: svgSize.h }}
                  onWheel={handleWheel}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                  onClick={handleBackgroundClick}
                >
                  {/* Defs — arrowhead marker */}
                  <defs>
                    <marker
                      id="arrowhead"
                      viewBox="0 0 10 7"
                      refX="10"
                      refY="3.5"
                      markerWidth="6"
                      markerHeight="5"
                      orient="auto-start-reverse"
                    >
                      <polygon
                        points="0 0, 10 3.5, 0 7"
                        fill="rgba(255,255,255,0.15)"
                      />
                    </marker>
                    <marker
                      id="arrowhead-hl"
                      viewBox="0 0 10 7"
                      refX="10"
                      refY="3.5"
                      markerWidth="6"
                      markerHeight="5"
                      orient="auto-start-reverse"
                    >
                      <polygon
                        points="0 0, 10 3.5, 0 7"
                        fill="#38bdf8"
                      />
                    </marker>
                  </defs>

                  {/* Background hit area */}
                  <rect
                    x={0} y={0}
                    width={svgSize.w}
                    height={svgSize.h}
                    fill="transparent"
                    data-bg="true"
                  />

                  {/* Transform group (zoom + pan) */}
                  <g transform={`translate(${transform.x}, ${transform.y}) scale(${transform.k})`}>
                    {/* Edges */}
                    <g>
                      {liveEdges.map((edge, i) => {
                        const from = nodePositions.get(edge.source)
                        const to = nodePositions.get(edge.target)
                        if (!from || !to) return null

                        const isNodeHighlighted = hoveredNode && (
                          highlightSet.has(edge.source) && highlightSet.has(edge.target)
                        )
                        const isEdgeHovered = hoveredEdge === i
                        const highlighted = isNodeHighlighted || isEdgeHovered

                        const path = getEdgePath(from.x, from.y, to.x, to.y, edge.curvature)

                        return (
                          <g key={i}>
                            {/* Wider invisible hit area for hover */}
                            <path
                              d={path}
                              stroke="transparent"
                              strokeWidth={12}
                              fill="none"
                              style={{ cursor: 'pointer' }}
                              onMouseEnter={() => setHoveredEdge(i)}
                              onMouseLeave={() => setHoveredEdge(null)}
                            />
                            {/* Visible edge */}
                            <path
                              d={path}
                              stroke={highlighted ? '#38bdf8' : 'rgba(255,255,255,0.08)'}
                              strokeWidth={highlighted ? 1.8 : 0.7}
                              fill="none"
                              markerEnd={highlighted ? 'url(#arrowhead-hl)' : 'url(#arrowhead)'}
                              style={{ transition: 'stroke 0.15s, stroke-width 0.15s', pointerEvents: 'none' }}
                            />
                            {/* Edge label */}
                            {showEdgeLabels && (() => {
                              const mid = getEdgeMidpoint(from.x, from.y, to.x, to.y, edge.curvature)
                              const label = edge.type || 'import'
                              const truncated = label.length > 10 ? label.substring(0, 9) + '\u2026' : label
                              return (
                                <g style={{ pointerEvents: 'none' }}>
                                  <rect
                                    x={mid.x - truncated.length * 2.2 - 3}
                                    y={mid.y - 5}
                                    width={truncated.length * 4.4 + 6}
                                    height={10}
                                    rx={2}
                                    fill="rgba(15,10,25,0.85)"
                                    stroke="rgba(255,255,255,0.06)"
                                    strokeWidth={0.5}
                                  />
                                  <text
                                    x={mid.x}
                                    y={mid.y + 3}
                                    textAnchor="middle"
                                    fill={highlighted ? '#38bdf8' : 'rgba(255,255,255,0.35)'}
                                    fontSize={7}
                                    fontFamily="monospace"
                                  >
                                    {truncated}
                                  </text>
                                </g>
                              )
                            })()}
                          </g>
                        )
                      })}
                    </g>

                    {/* Nodes */}
                    <g>
                      {liveNodes.map((node, idx) => {
                        const isHovered = hoveredNode === node.id
                        const isHighlighted = highlightSet.has(node.id)
                        const isSelected = selectedNode?.node.id === node.id
                        const dimmed = hoveredNode && !isHighlighted
                        const moduleColor = getModuleColor(node.moduleIdx)
                        const isDragTarget = dragNode?.idx === idx && dragNode.isDragging

                        // Check for agent activity overlay
                        const activity = agentFileActivity.get(node.id)
                        const activityRing = activity ? getRoleDef(activity.role).color : null

                        return (
                          <g
                            key={node.id}
                            onMouseEnter={() => { if (!dragNode?.isDragging) setHoveredNode(node.id) }}
                            onMouseLeave={() => { if (!dragNode?.isDragging) setHoveredNode(null) }}
                            onMouseDown={(e) => handleNodeMouseDown(idx, e)}
                            style={{ cursor: isDragTarget ? 'grabbing' : 'pointer' }}
                          >
                            {/* Agent activity ring */}
                            {activityRing && (
                              <circle
                                cx={node.x}
                                cy={node.y}
                                r={node.radius + 5}
                                fill="none"
                                stroke={activityRing}
                                strokeWidth={2}
                                opacity={dimmed ? 0.2 : 0.8}
                                strokeDasharray="4 2"
                              />
                            )}

                            {/* Selection ring */}
                            {isSelected && (
                              <circle
                                cx={node.x}
                                cy={node.y}
                                r={node.radius + 4}
                                fill="none"
                                stroke="#38bdf8"
                                strokeWidth={2.5}
                              />
                            )}

                            {/* Hover highlight ring */}
                            {(isHovered || (isHighlighted && hoveredNode)) && !isSelected && (
                              <circle
                                cx={node.x}
                                cy={node.y}
                                r={node.radius + 3}
                                fill="none"
                                stroke="#38bdf8"
                                strokeWidth={1.5}
                                opacity={isHovered ? 1 : 0.5}
                              />
                            )}

                            {/* Node outer stroke (like MiroFish white ring, but subtle for dark UI) */}
                            <circle
                              cx={node.x}
                              cy={node.y}
                              r={node.radius + 1}
                              fill="none"
                              stroke={isSelected ? '#38bdf8' : 'rgba(255,255,255,0.12)'}
                              strokeWidth={isHovered ? 2 : 1.5}
                              opacity={dimmed ? 0.1 : 1}
                            />

                            {/* Main circle */}
                            <circle
                              cx={node.x}
                              cy={node.y}
                              r={node.radius}
                              fill={moduleColor}
                              opacity={dimmed ? 0.12 : 0.75}
                            />

                            {/* Hotness indicator (inner dot for hot files) */}
                            {node.hotness > 60 && (
                              <circle
                                cx={node.x}
                                cy={node.y}
                                r={Math.max(2, node.radius * 0.3)}
                                fill="#fff"
                                opacity={dimmed ? 0.05 : 0.5}
                              />
                            )}

                            {/* Complexity indicator (outline dash for high complexity) */}
                            {node.complexity === 'high' && !dimmed && (
                              <circle
                                cx={node.x}
                                cy={node.y}
                                r={node.radius + 1}
                                fill="none"
                                stroke="#f87171"
                                strokeWidth={1}
                                strokeDasharray="2 2"
                                opacity={0.6}
                              />
                            )}

                            {/* Permanent label (truncated filename) */}
                            <text
                              x={node.x + node.radius + 4}
                              y={node.y + 3}
                              fill={isHovered || isSelected ? '#e2e8f0' : 'rgba(255,255,255,0.4)'}
                              fontSize={isHovered ? 9 : 8}
                              fontFamily="monospace"
                              fontWeight={isHovered || isSelected ? 600 : 400}
                              style={{
                                pointerEvents: 'none',
                                transition: 'fill 0.15s, font-size 0.1s',
                                opacity: dimmed ? 0.15 : 1,
                              }}
                            >
                              {truncateLabel(node.id, isHovered ? 24 : 14)}
                            </text>
                          </g>
                        )
                      })}
                    </g>
                  </g>
                </svg>

                {/* Module Legend (bottom-left overlay) */}
                {moduleLegend.length > 0 && (
                  <div className="absolute bottom-2 left-2 z-10 rounded-md border border-white/[0.06] bg-[#110b1a]/90 backdrop-blur-sm px-2.5 py-1.5">
                    <div className="text-[8px] uppercase tracking-wider text-ghost-text-dim/40 font-semibold mb-1">
                      Modules
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                      {moduleLegend.map((m) => (
                        <div key={m.name} className="flex items-center gap-1">
                          <div
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ backgroundColor: m.color }}
                          />
                          <span className="text-[9px] text-ghost-text-dim/50 font-mono truncate max-w-[80px]">
                            {m.name}
                          </span>
                          <span className="text-[8px] text-ghost-text-dim/25 font-mono">
                            {m.count}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Summary stats (bottom-right) */}
                {codebaseMap && (
                  <div className="absolute bottom-2 right-2 z-10 flex items-center gap-3 px-2.5 py-1 rounded-md border border-white/[0.06] bg-[#110b1a]/90 backdrop-blur-sm">
                    <span className="text-[9px] font-mono text-ghost-text-dim/40">
                      {liveNodes.length} nodes
                    </span>
                    <span className="text-[9px] font-mono text-ghost-text-dim/40">
                      {liveEdges.length} edges
                    </span>
                    <span className="text-[9px] font-mono text-ghost-text-dim/40">
                      {codebaseMap.summary.totalLines.toLocaleString()} LOC
                    </span>
                  </div>
                )}

                {/* Detail Panel (right side overlay) */}
                <AnimatePresence>
                  {selectedNode && (
                    <motion.div
                      initial={{ opacity: 0, x: 8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 8 }}
                      transition={{ duration: 0.15 }}
                      className="absolute top-2 right-2 w-60 rounded-lg border border-white/[0.08] bg-[#1a1025]/95 backdrop-blur-md p-3 z-20 max-h-[380px] overflow-y-auto"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {/* Header */}
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <FileCode className="w-3.5 h-3.5 text-sky-400 flex-shrink-0" />
                          <span className="text-xs font-mono text-ghost-text truncate font-semibold">
                            {selectedNode.node.id.split('/').pop()}
                          </span>
                        </div>
                        <button
                          onClick={() => setSelectedNode(null)}
                          className="text-ghost-text-dim/40 hover:text-ghost-text transition-colors ml-2 flex-shrink-0"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Full path */}
                      <div className="text-[10px] text-ghost-text-dim/40 font-mono mb-2.5 truncate">
                        {selectedNode.node.id}
                      </div>

                      {/* Module badge */}
                      <div className="flex items-center gap-1.5 mb-2.5">
                        <div
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: getModuleColor(selectedNode.node.moduleIdx) }}
                        />
                        <span className="text-[10px] font-mono text-ghost-text-dim/60">
                          {codebaseMap?.modules[selectedNode.node.moduleIdx]?.name || 'Unknown'}
                        </span>
                      </div>

                      {/* Stats grid */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-ghost-text-dim/50">LOC</span>
                          <span className="text-[10px] text-ghost-text font-mono">
                            {selectedNode.node.loc.toLocaleString()}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-ghost-text-dim/50">Language</span>
                          <span className="text-[10px] text-ghost-text font-mono">
                            {selectedNode.node.language || 'Unknown'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-ghost-text-dim/50">Complexity</span>
                          <span className={`text-[10px] font-mono ${
                            selectedNode.node.complexity === 'high' ? 'text-rose-400'
                              : selectedNode.node.complexity === 'medium' ? 'text-amber-400'
                                : 'text-emerald-400'
                          }`}>
                            {selectedNode.node.complexity}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-ghost-text-dim/50">Hotness</span>
                          <div className="flex items-center gap-1">
                            <div className="w-12 h-1.5 rounded-full bg-white/[0.06]">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${selectedNode.node.hotness}%`,
                                  backgroundColor: selectedNode.node.hotness > 70
                                    ? '#f87171'
                                    : selectedNode.node.hotness > 40
                                      ? '#fbbf24'
                                      : '#38bdf8',
                                }}
                              />
                            </div>
                            <span className="text-[10px] text-ghost-text-dim/50 font-mono w-6 text-right">
                              {selectedNode.node.hotness}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-ghost-text-dim/50">Type</span>
                          <span className="text-[10px] text-ghost-text-dim font-mono">
                            {selectedNode.node.type}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-ghost-text-dim/50">Connections</span>
                          <span className="text-[10px] text-ghost-text font-mono">
                            {selectedNode.node.imports.length + selectedNode.node.importedBy.length}
                          </span>
                        </div>
                      </div>

                      {/* Imports */}
                      {selectedNode.node.imports.length > 0 && (
                        <div className="mt-2.5 pt-2 border-t border-white/[0.06]">
                          <div className="flex items-center gap-1 mb-1">
                            <ArrowRight className="w-2.5 h-2.5 text-sky-400/60" />
                            <span className="text-[9px] text-ghost-text-dim/50 uppercase tracking-wider">
                              Imports ({selectedNode.node.imports.length})
                            </span>
                          </div>
                          <div className="space-y-0.5 max-h-[60px] overflow-y-auto">
                            {selectedNode.node.imports.slice(0, 8).map((imp) => (
                              <div key={imp} className="text-[9px] text-ghost-text-dim/40 font-mono truncate">
                                {imp.split('/').pop()}
                              </div>
                            ))}
                            {selectedNode.node.imports.length > 8 && (
                              <div className="text-[9px] text-ghost-text-dim/30">
                                +{selectedNode.node.imports.length - 8} more
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Imported By */}
                      {selectedNode.node.importedBy.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-white/[0.06]">
                          <div className="flex items-center gap-1 mb-1">
                            <ArrowRight className="w-2.5 h-2.5 text-violet-400/60 rotate-180" />
                            <span className="text-[9px] text-ghost-text-dim/50 uppercase tracking-wider">
                              Imported By ({selectedNode.node.importedBy.length})
                            </span>
                          </div>
                          <div className="space-y-0.5 max-h-[60px] overflow-y-auto">
                            {selectedNode.node.importedBy.slice(0, 8).map((imp) => (
                              <div key={imp} className="text-[9px] text-ghost-text-dim/40 font-mono truncate">
                                {imp.split('/').pop()}
                              </div>
                            ))}
                            {selectedNode.node.importedBy.length > 8 && (
                              <div className="text-[9px] text-ghost-text-dim/30">
                                +{selectedNode.node.importedBy.length - 8} more
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Agent activity */}
                      {agentFileActivity.has(selectedNode.node.id) && (
                        <div className="mt-2 pt-2 border-t border-white/[0.06]">
                          <span className="text-[9px] uppercase tracking-wider text-ghost-text-dim/50">
                            Touched by:
                          </span>
                          <span className="text-[10px] font-medium ml-1" style={{
                            color: getRoleDef(agentFileActivity.get(selectedNode.node.id)!.role).color,
                          }}>
                            {agentFileActivity.get(selectedNode.node.id)!.agentLabel}
                          </span>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {!loading && !error && liveNodes.length === 0 && codebaseMap && (
              <div className="flex items-center justify-center py-8" style={{ flex: 1 }}>
                <span className="text-xs text-ghost-text-dim/40">No files to visualize</span>
              </div>
            )}
    </>
  )

  // ─── Expanded mode: fill parent, no wrapper chrome ────
  if (expanded) {
    return (
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}>
        {renderGraphContent()}
      </div>
    )
  }

  // ─── Collapsible mode (default) ───────────────────────
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-white/[0.02] transition-colors"
      >
        <Network className="w-3.5 h-3.5 text-sky-400" />
        <span className="text-xs font-semibold uppercase tracking-[0.1em] text-ghost-text-dim">
          Codebase Map
        </span>
        {codebaseMap && (
          <span className="text-[10px] text-ghost-text-dim/40 font-mono ml-1">
            {codebaseMap.summary.totalFiles} files
          </span>
        )}
        <ChevronDown
          className={`w-3 h-3 text-ghost-text-dim/30 ml-auto transition-transform ${collapsed ? '-rotate-90' : ''}`}
        />
      </button>

      {/* Content */}
      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            {renderGraphContent()}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
