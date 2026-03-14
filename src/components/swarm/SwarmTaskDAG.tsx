import { useMemo } from 'react'
import type { SwarmTaskItem } from '../../lib/swarm-types'

// ─── Status Colors ──────────────────────────────────────────

const STATUS_FILLS: Record<string, string> = {
  open: '#6b7280',
  assigned: '#38bdf8',
  planning: '#fbbf24',
  building: '#3b82f6',
  review: '#8b5cf6',
  done: '#10b981',
}

const STATUS_STROKES: Record<string, string> = {
  open: '#4b5563',
  assigned: '#0ea5e9',
  planning: '#f59e0b',
  building: '#2563eb',
  review: '#7c3aed',
  done: '#059669',
}

// ─── Layout Constants ───────────────────────────────────────

const NODE_W = 120
const NODE_H = 32
const H_GAP = 40
const V_GAP = 20
const PAD = 16

// ─── Topological Sort into Layers ───────────────────────────

interface DAGNode {
  task: SwarmTaskItem
  layer: number
  col: number
}

function computeLayout(tasks: SwarmTaskItem[]): { nodes: DAGNode[]; width: number; height: number } {
  if (tasks.length === 0) return { nodes: [], width: 0, height: 0 }

  const taskMap = new Map<string, SwarmTaskItem>()
  for (const t of tasks) taskMap.set(t.id, t)

  // Compute layers via longest-path (topological)
  const layerOf = new Map<string, number>()

  function getLayer(id: string, visited: Set<string>): number {
    if (layerOf.has(id)) return layerOf.get(id)!
    if (visited.has(id)) return 0 // cycle guard
    visited.add(id)

    const task = taskMap.get(id)
    if (!task || task.dependsOn.length === 0) {
      layerOf.set(id, 0)
      return 0
    }

    let maxDep = 0
    for (const dep of task.dependsOn) {
      if (taskMap.has(dep)) {
        maxDep = Math.max(maxDep, getLayer(dep, visited) + 1)
      }
    }
    layerOf.set(id, maxDep)
    return maxDep
  }

  for (const t of tasks) getLayer(t.id, new Set())

  // Group by layer
  const layers = new Map<number, SwarmTaskItem[]>()
  for (const t of tasks) {
    const l = layerOf.get(t.id) ?? 0
    if (!layers.has(l)) layers.set(l, [])
    layers.get(l)!.push(t)
  }

  const maxLayer = Math.max(...layers.keys())
  const maxColCount = Math.max(...[...layers.values()].map((l) => l.length))

  const nodes: DAGNode[] = []
  for (const [layer, layerTasks] of layers) {
    layerTasks.forEach((task, col) => {
      nodes.push({ task, layer, col })
    })
  }

  const width = (maxLayer + 1) * (NODE_W + H_GAP) - H_GAP + PAD * 2
  const height = maxColCount * (NODE_H + V_GAP) - V_GAP + PAD * 2

  return { nodes, width, height }
}

function nodeX(layer: number): number {
  return PAD + layer * (NODE_W + H_GAP)
}

function nodeY(col: number): number {
  return PAD + col * (NODE_H + V_GAP)
}

// ─── Component ──────────────────────────────────────────────

interface SwarmTaskDAGProps {
  tasks: SwarmTaskItem[]
}

export function SwarmTaskDAG({ tasks }: SwarmTaskDAGProps) {
  const { nodes, width, height } = useMemo(() => computeLayout(tasks), [tasks])

  const nodePositions = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>()
    for (const n of nodes) {
      map.set(n.task.id, { x: nodeX(n.layer), y: nodeY(n.col) })
    }
    return map
  }, [nodes])

  if (tasks.length === 0) return null

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-1">
        <span className="text-[10px] font-semibold text-ghost-text-dim uppercase tracking-[0.15em]">
          Task Graph
        </span>
      </div>

      <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] overflow-x-auto sidebar-scroll p-1">
        <svg
          width={Math.max(width, 200)}
          height={Math.max(height, 60)}
          viewBox={`0 0 ${Math.max(width, 200)} ${Math.max(height, 60)}`}
          className="block"
        >
          {/* Edges */}
          {nodes.map((n) =>
            n.task.dependsOn.map((depId) => {
              const from = nodePositions.get(depId)
              const to = nodePositions.get(n.task.id)
              if (!from || !to) return null

              const x1 = from.x + NODE_W
              const y1 = from.y + NODE_H / 2
              const x2 = to.x
              const y2 = to.y + NODE_H / 2

              return (
                <line
                  key={`${depId}-${n.task.id}`}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="rgba(255,255,255,0.12)"
                  strokeWidth={1.5}
                  markerEnd="url(#arrowhead)"
                />
              )
            }),
          )}

          {/* Arrow marker */}
          <defs>
            <marker
              id="arrowhead"
              markerWidth="6"
              markerHeight="4"
              refX="6"
              refY="2"
              orient="auto"
            >
              <polygon points="0 0, 6 2, 0 4" fill="rgba(255,255,255,0.2)" />
            </marker>
          </defs>

          {/* Nodes */}
          {nodes.map((n) => {
            const x = nodeX(n.layer)
            const y = nodeY(n.col)
            const fill = STATUS_FILLS[n.task.status] || STATUS_FILLS.open
            const stroke = STATUS_STROKES[n.task.status] || STATUS_STROKES.open

            return (
              <g key={n.task.id}>
                <rect
                  x={x}
                  y={y}
                  width={NODE_W}
                  height={NODE_H}
                  rx={6}
                  fill={fill + '1a'}
                  stroke={stroke + '66'}
                  strokeWidth={1}
                />
                <text
                  x={x + 6}
                  y={y + 12}
                  fontSize="9"
                  fontFamily="monospace"
                  fill={fill}
                  fontWeight="600"
                >
                  {n.task.id}
                </text>
                <text
                  x={x + 6}
                  y={y + 24}
                  fontSize="8"
                  fontFamily="sans-serif"
                  fill="rgba(255,255,255,0.5)"
                >
                  {n.task.title.length > 16 ? n.task.title.slice(0, 15) + '\u2026' : n.task.title}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}
