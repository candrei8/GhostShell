// SwarmTaskPipeline — Multi-view task management
// Sub-View A: DAG View (task dependency graph with status, progress, critical path)
// Sub-View B: Contract Inspector (tasks × files matrix with overlap detection)

import { useState, useMemo, useCallback, useLayoutEffect, useRef } from 'react'
import {
  GitBranch, FileText, AlertTriangle, CheckCircle, Clock, ArrowRight,
} from 'lucide-react'
import type { SwarmTaskItem, SwarmRosterAgent, SimulationResult } from '../../lib/swarm-types'
import { getRoleDef } from '../../lib/swarm-types'
import { analyzeContracts, type ContractAnalysis, type FileOverlap } from '../../lib/swarm-contract-planner'

// ─── Types ──────────────────────────────────────────────────

interface SwarmTaskPipelineProps {
  tasks: SwarmTaskItem[]
  roster: SwarmRosterAgent[]
  simulation?: SimulationResult | null
}

type PipelineView = 'dag' | 'contracts'

const STATUS_COLORS: Record<string, string> = {
  open:     '#475569',
  assigned: '#64748b',
  planning: '#fb923c',
  building: '#38bdf8',
  review:   '#c084fc',
  done:     '#34d399',
}

const STATUS_LABELS: Record<string, string> = {
  open: 'Abierta', assigned: 'Asignada', planning: 'Plan',
  building: 'Build', review: 'Review', done: 'Done',
}

// ─── DAG Layout ─────────────────────────────────────────────

interface DagNode {
  task: SwarmTaskItem
  x: number
  y: number
  col: number
  row: number
  label: string
  ownerLabel: string
  isCritical: boolean
}

function layoutDAG(tasks: SwarmTaskItem[], criticalPath: string[], roster: SwarmRosterAgent[]): DagNode[] {
  if (tasks.length === 0) return []

  const rosterMap = new Map(roster.map((r) => [r.id, r]))
  const taskMap = new Map(tasks.map((t) => [t.id, t]))

  // Topological sort to assign columns (depth from root)
  const depth = new Map<string, number>()
  function getDepth(id: string): number {
    if (depth.has(id)) return depth.get(id)!
    const task = taskMap.get(id)
    if (!task || task.dependsOn.length === 0) {
      depth.set(id, 0)
      return 0
    }
    const maxParent = Math.max(...task.dependsOn.map((d) => taskMap.has(d) ? getDepth(d) + 1 : 0))
    depth.set(id, maxParent)
    return maxParent
  }
  for (const t of tasks) getDepth(t.id)

  // Group by column
  const columns = new Map<number, SwarmTaskItem[]>()
  for (const t of tasks) {
    const col = depth.get(t.id) || 0
    const arr = columns.get(col) || []
    arr.push(t)
    columns.set(col, arr)
  }

  const NODE_W = 160
  const NODE_H = 56
  const COL_GAP = 60
  const ROW_GAP = 20
  const criticalSet = new Set(criticalPath)

  const nodes: DagNode[] = []
  for (const [col, colTasks] of columns) {
    colTasks.forEach((task, row) => {
      const r = rosterMap.get(task.owner)
      const roleDef = r ? getRoleDef(r.role) : null
      const ownerLabel = r?.customName || (roleDef ? `${roleDef.label}` : '—')

      nodes.push({
        task,
        col,
        row,
        x: 20 + col * (NODE_W + COL_GAP),
        y: 20 + row * (NODE_H + ROW_GAP),
        label: task.title.length > 22 ? task.title.slice(0, 20) + '…' : task.title,
        ownerLabel,
        isCritical: criticalSet.has(task.id),
      })
    })
  }

  return nodes
}

// ─── Component ──────────────────────────────────────────────

export function SwarmTaskPipeline({ tasks, roster, simulation }: SwarmTaskPipelineProps) {
  const [view, setView] = useState<PipelineView>('dag')

  return (
    <div className="flex flex-col w-full h-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.15)' }}>
      {/* View toggle header */}
      <div className="flex items-center gap-1 px-3 py-1.5 shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <ViewTab active={view === 'dag'} onClick={() => setView('dag')} icon={GitBranch} label="DAG" />
        <ViewTab active={view === 'contracts'} onClick={() => setView('contracts')} icon={FileText} label="Contratos" />
        <div className="flex-1" />
        <span className="text-[8px] font-mono text-white/20">{tasks.length} tareas</span>
      </div>

      {/* View content */}
      <div className="flex-1 min-h-0 overflow-auto custom-scrollbar">
        {view === 'dag' ? (
          <DAGView tasks={tasks} roster={roster} simulation={simulation} />
        ) : (
          <ContractInspector tasks={tasks} roster={roster} />
        )}
      </div>
    </div>
  )
}

function ViewTab({ active, onClick, icon: Icon, label }: {
  active: boolean; onClick: () => void; icon: typeof GitBranch; label: string
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 px-2 py-1 rounded transition-colors"
      style={{
        fontSize: 9, fontFamily: 'monospace', fontWeight: 700, textTransform: 'uppercase',
        background: active ? 'rgba(255,255,255,0.06)' : 'transparent',
        color: active ? '#38bdf8' : 'rgba(255,255,255,0.3)',
        border: active ? '1px solid rgba(56,189,248,0.2)' : '1px solid transparent',
        cursor: 'pointer',
      }}
    >
      <Icon className="w-3 h-3" />
      {label}
    </button>
  )
}

// ─── DAG View ───────────────────────────────────────────────

function DAGView({ tasks, roster, simulation }: {
  tasks: SwarmTaskItem[]; roster: SwarmRosterAgent[]; simulation?: SimulationResult | null
}) {
  const criticalPath = simulation?.criticalPath || []
  const nodes = useMemo(() => layoutDAG(tasks, criticalPath, roster), [tasks, criticalPath, roster])
  const taskMap = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks])
  const nodeMap = useMemo(() => new Map(nodes.map((n) => [n.task.id, n])), [nodes])

  if (tasks.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-[10px] text-white/15 font-mono">Sin tareas</span>
      </div>
    )
  }

  // Compute SVG dimensions
  const maxX = Math.max(...nodes.map((n) => n.x)) + 180
  const maxY = Math.max(...nodes.map((n) => n.y)) + 76

  return (
    <svg width={Math.max(maxX, 400)} height={Math.max(maxY, 200)} style={{ minWidth: '100%' }}>
      {/* Dependency edges */}
      {nodes.map((node) =>
        node.task.dependsOn.map((depId) => {
          const parent = nodeMap.get(depId)
          if (!parent) return null
          const bothCritical = node.isCritical && parent.isCritical
          const x1 = parent.x + 160
          const y1 = parent.y + 28
          const x2 = node.x
          const y2 = node.y + 28

          // Curved connector
          const mx = (x1 + x2) / 2
          const pathD = `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`

          return (
            <g key={`${depId}-${node.task.id}`}>
              <path
                d={pathD}
                fill="none"
                stroke={bothCritical ? '#38bdf8' : 'rgba(255,255,255,0.1)'}
                strokeWidth={bothCritical ? 2 : 1}
                strokeDasharray={bothCritical ? 'none' : '4 3'}
              />
              {/* Arrow at end */}
              <polygon
                points={`${x2},${y2} ${x2 - 6},${y2 - 3} ${x2 - 6},${y2 + 3}`}
                fill={bothCritical ? '#38bdf8' : 'rgba(255,255,255,0.15)'}
              />
            </g>
          )
        }),
      )}

      {/* Task nodes */}
      {nodes.map((node) => {
        const color = STATUS_COLORS[node.task.status] || '#475569'
        const isBlocked = node.task.status === 'open' &&
          node.task.dependsOn.some((d) => {
            const dep = taskMap.get(d)
            return dep && dep.status !== 'done'
          })

        // Progress (time-based approximation)
        let progress = 0
        if (node.task.status === 'done') progress = 100
        else if (node.task.startedAt) {
          const elapsed = (Date.now() - node.task.startedAt) / 60000
          const simTask = simulation?.taskAssignments.find((t) => t.taskId === node.task.id)
          const predicted = simTask?.predictedDuration || 10
          progress = Math.min(95, Math.round((elapsed / predicted) * 100))
        }

        return (
          <g key={node.task.id} transform={`translate(${node.x},${node.y})`}>
            {/* Card background */}
            <rect
              width={160} height={56} rx={4}
              fill="rgba(255,255,255,0.02)"
              stroke={isBlocked ? '#ef4444' : node.isCritical ? '#38bdf8' : 'rgba(255,255,255,0.06)'}
              strokeWidth={node.isCritical ? 1.5 : 1}
              strokeDasharray={isBlocked ? '3 2' : 'none'}
            />

            {/* Status strip (left edge) */}
            <rect x={0} y={0} width={3} height={56} rx={1} fill={color} />

            {/* Title */}
            <text x={10} y={16} fill="white" fontSize={10} fontFamily="monospace" fontWeight={600}>
              {node.label}
            </text>

            {/* Owner + status */}
            <text x={10} y={28} fill="rgba(255,255,255,0.3)" fontSize={8} fontFamily="monospace">
              {node.ownerLabel}
            </text>
            <text x={100} y={28} fill={color} fontSize={8} fontFamily="monospace" fontWeight={700}
              textAnchor="start" style={{ textTransform: 'uppercase' } as React.CSSProperties}>
              {STATUS_LABELS[node.task.status] || node.task.status}
            </text>

            {/* Progress bar */}
            <rect x={10} y={36} width={140} height={3} rx={1} fill="rgba(255,255,255,0.06)" />
            {progress > 0 && (
              <rect x={10} y={36} width={Math.max(2, 140 * progress / 100)} height={3} rx={1} fill={color} />
            )}

            {/* Duration / blocked indicator */}
            {isBlocked ? (
              <text x={10} y={50} fill="#ef4444" fontSize={7} fontFamily="monospace" fontWeight={700}>
                BLOQUEADA
              </text>
            ) : node.task.startedAt ? (
              <text x={10} y={50} fill="rgba(255,255,255,0.2)" fontSize={7} fontFamily="monospace">
                {Math.round((Date.now() - node.task.startedAt) / 60000)}m
              </text>
            ) : null}

            {/* File count badge */}
            {node.task.ownedFiles.length > 0 && (
              <g transform={`translate(130,42)`}>
                <rect x={0} y={0} width={22} height={12} rx={2} fill="rgba(255,255,255,0.04)" />
                <text x={11} y={9} textAnchor="middle" fill="rgba(255,255,255,0.25)"
                  fontSize={7} fontFamily="monospace">
                  {node.task.ownedFiles.length}f
                </text>
              </g>
            )}

            {/* Critical path marker */}
            {node.isCritical && (
              <circle cx={152} cy={8} r={3} fill="#38bdf8" opacity={0.6} />
            )}
          </g>
        )
      })}

      {/* Legend */}
      <g transform={`translate(10,${maxY - 20})`}>
        {[
          { color: '#38bdf8', label: 'Critico' },
          { color: '#ef4444', label: 'Bloqueado' },
          { color: '#34d399', label: 'Done' },
        ].map(({ color, label }, i) => (
          <g key={label} transform={`translate(${i * 70},0)`}>
            <rect width={8} height={3} rx={1} fill={color} />
            <text x={12} y={4} fill="rgba(255,255,255,0.2)" fontSize={7} fontFamily="monospace">{label}</text>
          </g>
        ))}
      </g>
    </svg>
  )
}

// ─── Contract Inspector ─────────────────────────────────────

function ContractInspector({ tasks, roster }: {
  tasks: SwarmTaskItem[]; roster: SwarmRosterAgent[]
}) {
  const analysis = useMemo(() => analyzeContracts(tasks, roster), [tasks, roster])

  if (tasks.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-[10px] text-white/15 font-mono">Sin tareas para analizar</span>
      </div>
    )
  }

  return (
    <div style={{ padding: 8 }}>
      {/* Summary bar */}
      <div className="flex items-center gap-3 mb-3 px-2 py-2 rounded"
        style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
        <div className="flex items-center gap-1">
          <span className="text-[9px] font-mono text-white/30">{analysis.contracts.length} contratos</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[9px] font-mono text-white/30">{analysis.allFiles.length} archivos</span>
        </div>
        {analysis.criticalOverlaps > 0 && (
          <div className="flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" style={{ color: '#ef4444' }} />
            <span className="text-[9px] font-mono font-bold" style={{ color: '#ef4444' }}>
              {analysis.criticalOverlaps} conflictos criticos
            </span>
          </div>
        )}
        {analysis.warningOverlaps > 0 && (
          <div className="flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" style={{ color: '#f59e0b' }} />
            <span className="text-[9px] font-mono font-bold" style={{ color: '#f59e0b' }}>
              {analysis.warningOverlaps} advertencias
            </span>
          </div>
        )}
        {analysis.circularDeps.length > 0 && (
          <div className="flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" style={{ color: '#ef4444' }} />
            <span className="text-[9px] font-mono font-bold" style={{ color: '#ef4444' }}>
              {analysis.circularDeps.length} dep. circulares
            </span>
          </div>
        )}
        {analysis.criticalOverlaps === 0 && analysis.warningOverlaps === 0 && analysis.circularDeps.length === 0 && (
          <div className="flex items-center gap-1">
            <CheckCircle className="w-3 h-3" style={{ color: '#34d399' }} />
            <span className="text-[9px] font-mono" style={{ color: '#34d399' }}>Sin conflictos</span>
          </div>
        )}
      </div>

      {/* File overlaps (most important) */}
      {analysis.fileOverlaps.length > 0 && (
        <div className="mb-3">
          <div className="text-[8px] text-white/20 font-mono uppercase mb-1 px-1 tracking-wider">
            Solapamiento de Archivos
          </div>
          {analysis.fileOverlaps.map((overlap) => (
            <OverlapRow key={overlap.filePath} overlap={overlap} />
          ))}
        </div>
      )}

      {/* Task × File Matrix */}
      <div className="mb-3">
        <div className="text-[8px] text-white/20 font-mono uppercase mb-1 px-1 tracking-wider">
          Matriz Tarea × Archivo
        </div>
        <div className="overflow-x-auto">
          <table style={{ borderCollapse: 'collapse', fontSize: 8, fontFamily: 'monospace' }}>
            <thead>
              <tr>
                <th style={{ padding: '3px 6px', textAlign: 'left', color: 'rgba(255,255,255,0.3)', fontWeight: 700 }}>
                  Tarea
                </th>
                {analysis.allFiles.map((f) => (
                  <th key={f} style={{
                    padding: '3px 4px', textAlign: 'center', color: 'rgba(255,255,255,0.2)',
                    maxWidth: 60, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    writingMode: 'vertical-lr', height: 60,
                  }}>
                    {f.split('/').pop()}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {analysis.contracts.map((contract) => (
                <tr key={contract.taskId}>
                  <td style={{
                    padding: '3px 6px', color: 'rgba(255,255,255,0.5)', whiteSpace: 'nowrap',
                    maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis',
                    borderBottom: '1px solid rgba(255,255,255,0.03)',
                  }}>
                    {contract.taskTitle.length > 18 ? contract.taskTitle.slice(0, 16) + '…' : contract.taskTitle}
                  </td>
                  {analysis.allFiles.map((f) => {
                    const isOutput = contract.outputFiles.includes(f)
                    const isInput = contract.inputFiles.includes(f)
                    const isShared = contract.sharedFiles.includes(f)

                    let bg = 'transparent'
                    let symbol = ''
                    if (isOutput && isShared) {
                      bg = 'rgba(239,68,68,0.15)' // red = write + shared
                      symbol = 'W!'
                    } else if (isOutput) {
                      bg = 'rgba(245,158,11,0.12)' // amber = write
                      symbol = 'W'
                    } else if (isInput) {
                      bg = 'rgba(56,189,248,0.08)' // blue = read
                      symbol = 'R'
                    }

                    return (
                      <td key={f} style={{
                        padding: '3px 4px', textAlign: 'center',
                        background: bg,
                        color: isOutput && isShared ? '#ef4444' : isOutput ? '#f59e0b' : isInput ? '#38bdf8' : 'transparent',
                        fontWeight: 700,
                        borderBottom: '1px solid rgba(255,255,255,0.03)',
                        borderRight: '1px solid rgba(255,255,255,0.02)',
                      }}>
                        {symbol}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Per-task contracts */}
      <div>
        <div className="text-[8px] text-white/20 font-mono uppercase mb-1 px-1 tracking-wider">
          Contratos por Tarea
        </div>
        {analysis.contracts.map((contract) => (
          <div key={contract.taskId}
            className="mb-1 px-2 py-1.5 rounded"
            style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.03)' }}>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[9px] font-mono font-bold text-white/60">{contract.taskTitle}</span>
              <span className="text-[8px] font-mono text-white/20">→ {contract.ownerLabel}</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {contract.outputFiles.map((f) => (
                <span key={f} className="text-[7px] font-mono px-1 py-px rounded"
                  style={{
                    background: contract.sharedFiles.includes(f) ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.08)',
                    color: contract.sharedFiles.includes(f) ? '#ef4444' : '#f59e0b',
                  }}>
                  W {f.split('/').pop()}
                </span>
              ))}
              {contract.inputFiles.map((f) => (
                <span key={`in-${f}`} className="text-[7px] font-mono px-1 py-px rounded"
                  style={{ background: 'rgba(56,189,248,0.06)', color: '#38bdf8' }}>
                  R {f.split('/').pop()}
                </span>
              ))}
            </div>
            {contract.dependsOn.length > 0 && (
              <div className="flex items-center gap-1 mt-1">
                <ArrowRight className="w-2 h-2 text-white/15" />
                <span className="text-[7px] font-mono text-white/15">
                  depende de: {contract.dependsOn.join(', ')}
                </span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function OverlapRow({ overlap }: { overlap: FileOverlap }) {
  const color = overlap.severity === 'critical' ? '#ef4444' : overlap.severity === 'warning' ? '#f59e0b' : '#34d399'
  return (
    <div className="flex items-center gap-2 px-2 py-1 rounded mb-0.5"
      style={{ background: `${color}08`, borderLeft: `2px solid ${color}` }}>
      <FileText className="w-3 h-3 shrink-0" style={{ color }} />
      <div className="flex-1 min-w-0">
        <span className="text-[9px] font-mono text-white/50 block truncate">{overlap.filePath}</span>
        <span className="text-[8px] font-mono text-white/25">
          {overlap.tasks.map((t) => `${t.taskTitle} (${t.operation})`).join(' · ')}
        </span>
      </div>
      <span className="text-[8px] font-mono font-bold uppercase shrink-0" style={{ color }}>
        {overlap.severity}
      </span>
    </div>
  )
}
