// SwarmExecutionTimeline — Gantt-style horizontal timeline
// Shows per-agent activity lanes with status-colored segments, task labels,
// NOW marker, message markers, conflict markers, zoom/pan, prediction overlay

import { useState, useRef, useMemo, useCallback, useLayoutEffect } from 'react'
import type {
  SwarmAgentState, SwarmRosterAgent, SwarmMessage, SwarmTaskItem,
  SwarmFileConflict, SimulationResult, SwarmAgentRole,
} from '../../lib/swarm-types'
import { getRoleDef } from '../../lib/swarm-types'

// ─── Types ──────────────────────────────────────────────────

interface AgentDisplay {
  agent: SwarmAgentState
  rosterAgent: SwarmRosterAgent
}

interface SwarmExecutionTimelineProps {
  agents: AgentDisplay[]
  messages: SwarmMessage[]
  tasks: SwarmTaskItem[]
  conflicts: SwarmFileConflict[]
  simulation?: SimulationResult | null
  startedAt?: number
  selectedAgentId: string | null
  onSelectAgent: (rosterId: string | null) => void
}

// Per-agent lane segment
interface TimelineSegment {
  status: string
  start: number   // minutes from swarm start
  end: number     // minutes from swarm start
  taskLabel?: string
}

// ─── Constants ──────────────────────────────────────────────

const LANE_HEIGHT = 28
const LABEL_WIDTH = 110
const HEADER_HEIGHT = 24
const MIN_ZOOM = 0.5
const MAX_ZOOM = 8

const STATUS_COLORS: Record<string, string> = {
  waiting:  '#334155',
  idle:     '#1e293b',
  planning: '#fb923c',
  building: '#38bdf8',
  review:   '#c084fc',
  done:     '#34d399',
  error:    '#ef4444',
}

const STATUS_LABELS: Record<string, string> = {
  waiting: 'Espera', idle: 'Idle', planning: 'Plan',
  building: 'Build', review: 'Review', done: 'Done', error: 'Error',
}

// ─── Helpers ────────────────────────────────────────────────

function formatTime(minutes: number): string {
  if (minutes < 1) return `${Math.round(minutes * 60)}s`
  if (minutes < 60) return `${Math.round(minutes)}m`
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return `${h}h${m > 0 ? `${m}m` : ''}`
}

// Build segments from activity data (approximated from current status + tasks)
function buildSegments(
  agent: SwarmAgentState,
  tasks: SwarmTaskItem[],
  swarmStartMs: number,
  nowMs: number,
): TimelineSegment[] {
  const segments: TimelineSegment[] = []
  const agentTasks = tasks.filter((t) => t.owner === agent.rosterId)
    .sort((a, b) => (a.startedAt || Infinity) - (b.startedAt || Infinity))

  if (agentTasks.length === 0) {
    // Single segment for current status
    const elapsed = (nowMs - swarmStartMs) / 60000
    segments.push({ status: agent.status, start: 0, end: elapsed })
    return segments
  }

  let cursor = 0
  for (const task of agentTasks) {
    const taskStart = task.startedAt ? (task.startedAt - swarmStartMs) / 60000 : cursor
    const taskEnd = task.completedAt
      ? (task.completedAt - swarmStartMs) / 60000
      : (nowMs - swarmStartMs) / 60000

    // Idle gap before this task
    if (taskStart > cursor + 0.1) {
      segments.push({ status: 'idle', start: cursor, end: taskStart })
    }

    // Task segment
    const status = task.status === 'done' ? 'done'
      : task.status === 'review' ? 'review'
      : task.status === 'building' ? 'building'
      : task.status === 'planning' ? 'planning'
      : 'waiting'
    segments.push({
      status,
      start: Math.max(taskStart, 0),
      end: taskEnd,
      taskLabel: task.title,
    })
    cursor = taskEnd
  }

  // Trailing segment for current status
  const nowMin = (nowMs - swarmStartMs) / 60000
  if (cursor < nowMin - 0.1) {
    segments.push({ status: agent.status, start: cursor, end: nowMin })
  }

  return segments
}

// ─── Component ──────────────────────────────────────────────

export function SwarmExecutionTimeline({
  agents, messages, tasks, conflicts, simulation, startedAt,
  selectedAgentId, onSelectAgent,
}: SwarmExecutionTimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [dims, setDims] = useState({ w: 800, h: 400 })
  const [zoom, setZoom] = useState(1)
  const [panX, setPanX] = useState(0)
  const [isPanning, setIsPanning] = useState(false)
  const panStartRef = useRef({ x: 0, panX: 0 })
  const [hoveredSegment, setHoveredSegment] = useState<{ agentIdx: number; seg: TimelineSegment } | null>(null)

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

  const swarmStartMs = startedAt || Date.now()
  const nowMs = Date.now()
  const elapsedMin = (nowMs - swarmStartMs) / 60000

  // Total timeline range (at least 5 minutes, or predicted, or elapsed + buffer)
  const totalMinutes = Math.max(
    5,
    simulation?.predictedDuration || 0,
    elapsedMin + 2,
  )

  // Build agent labels
  const agentLabels = useMemo(() =>
    agents.map(({ rosterAgent }, idx) => {
      const roleDef = getRoleDef(rosterAgent.role)
      return rosterAgent.customName || `${roleDef.label} ${idx + 1}`
    }), [agents])

  // Build segments per agent
  const allSegments = useMemo(() =>
    agents.map(({ agent }) =>
      buildSegments(agent, tasks, swarmStartMs, nowMs),
    ), [agents, tasks, swarmStartMs, nowMs])

  // Message markers: messages between agents mapped to timeline
  const messageMarkers = useMemo(() => {
    const markers: Array<{ time: number; fromIdx: number; toIdx: number; type: string }> = []
    const labelToIdx = new Map(agentLabels.map((l, i) => [l, i]))
    for (const msg of messages) {
      if (!msg.from || !msg.to || msg.to === '@all' || msg.to === '@operator') continue
      const fi = labelToIdx.get(msg.from)
      const ti = labelToIdx.get(msg.to)
      if (fi === undefined || ti === undefined) continue
      markers.push({
        time: (msg.timestamp - swarmStartMs) / 60000,
        fromIdx: fi, toIdx: ti, type: msg.type,
      })
    }
    return markers
  }, [messages, agentLabels, swarmStartMs])

  // Conflict markers on timeline
  const conflictMarkers = useMemo(() =>
    conflicts
      .filter((c) => c.status === 'active')
      .map((c) => ({
        time: (c.detectedAt - swarmStartMs) / 60000,
        severity: c.severity,
        file: c.filePath,
      })), [conflicts, swarmStartMs])

  // Timeline pixel math
  const timelineWidth = dims.w - LABEL_WIDTH
  const pixelsPerMinute = (timelineWidth * zoom) / totalMinutes
  const contentHeight = agents.length * LANE_HEIGHT

  // Time markers
  const timeMarkers = useMemo(() => {
    const step = totalMinutes <= 10 ? 1
      : totalMinutes <= 30 ? 5
      : totalMinutes <= 120 ? 10
      : 30
    const markers: number[] = []
    for (let t = 0; t <= totalMinutes; t += step) markers.push(t)
    return markers
  }, [totalMinutes])

  // Zoom handler
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.85 : 1.15
    setZoom((z) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z * delta)))
  }, [])

  // Pan handlers
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    setIsPanning(true)
    panStartRef.current = { x: e.clientX, panX }
  }, [panX])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isPanning) return
    setPanX(panStartRef.current.panX + (e.clientX - panStartRef.current.x))
  }, [isPanning])

  const handlePointerUp = useCallback(() => {
    setIsPanning(false)
  }, [])

  // ─── Render ──────────────────────────────────────────────

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden select-none"
      style={{ background: 'rgba(0,0,0,0.2)' }}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      <svg width={dims.w} height={Math.max(dims.h, HEADER_HEIGHT + contentHeight + 8)}>
        {/* ─── Time header ─────────────────────────────── */}
        <g transform={`translate(${LABEL_WIDTH},0)`}>
          <rect x={0} y={0} width={timelineWidth} height={HEADER_HEIGHT}
            fill="rgba(255,255,255,0.02)" />
          <g transform={`translate(${panX},0)`}>
            {timeMarkers.map((t) => {
              const x = t * pixelsPerMinute
              if (x + panX < -20 || x + panX > timelineWidth + 20) return null
              return (
                <g key={t}>
                  <line x1={x} y1={HEADER_HEIGHT - 4} x2={x} y2={HEADER_HEIGHT}
                    stroke="rgba(255,255,255,0.15)" strokeWidth={1} />
                  <text x={x} y={HEADER_HEIGHT - 7}
                    textAnchor="middle" fill="rgba(255,255,255,0.25)"
                    fontSize={8} fontFamily="monospace">
                    {formatTime(t)}
                  </text>
                </g>
              )
            })}
          </g>
        </g>

        {/* ─── Agent lanes ─────────────────────────────── */}
        {agents.map(({ agent, rosterAgent }, idx) => {
          const y = HEADER_HEIGHT + idx * LANE_HEIGHT
          const roleDef = getRoleDef(rosterAgent.role)
          const label = agentLabels[idx]
          const isSelected = selectedAgentId === agent.rosterId
          const segments = allSegments[idx]

          return (
            <g key={agent.rosterId}>
              {/* Lane background */}
              <rect x={0} y={y} width={dims.w} height={LANE_HEIGHT}
                fill={isSelected ? 'rgba(56,189,248,0.04)' : idx % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent'}
                style={{ cursor: 'pointer' }}
                onClick={() => onSelectAgent(isSelected ? null : agent.rosterId)}
              />

              {/* Agent label (left column) */}
              <g transform={`translate(4,${y})`}>
                <circle cx={8} cy={LANE_HEIGHT / 2} r={3} fill={roleDef.color} />
                <text x={16} y={LANE_HEIGHT / 2 + 1}
                  dominantBaseline="middle"
                  fill={isSelected ? 'white' : 'rgba(255,255,255,0.5)'}
                  fontSize={9} fontFamily="monospace" fontWeight={isSelected ? 700 : 400}>
                  {label.length > 13 ? label.slice(0, 12) + '…' : label}
                </text>
              </g>

              {/* Segments (clipped to timeline area) */}
              <g transform={`translate(${LABEL_WIDTH + panX},${y})`}
                clipPath={`url(#timeline-clip-${idx})`}>
                {segments.map((seg, si) => {
                  const sx = seg.start * pixelsPerMinute
                  const sw = Math.max(2, (seg.end - seg.start) * pixelsPerMinute)
                  const isHov = hoveredSegment?.agentIdx === idx && hoveredSegment?.seg === seg

                  return (
                    <g key={si}
                      onPointerEnter={() => setHoveredSegment({ agentIdx: idx, seg })}
                      onPointerLeave={() => setHoveredSegment(null)}>
                      <rect
                        x={sx} y={2}
                        width={sw} height={LANE_HEIGHT - 4}
                        rx={2}
                        fill={STATUS_COLORS[seg.status] || '#1e293b'}
                        fillOpacity={isHov ? 0.95 : 0.7}
                        stroke={isHov ? 'rgba(255,255,255,0.2)' : 'none'}
                        strokeWidth={1}
                      />
                      {/* Task label inside segment (if wide enough) */}
                      {sw > 40 && seg.taskLabel && (
                        <text
                          x={sx + 4} y={LANE_HEIGHT / 2 + 1}
                          dominantBaseline="middle"
                          fill="rgba(255,255,255,0.6)"
                          fontSize={8} fontFamily="monospace"
                          clipPath={`inset(0 ${Math.max(0, sw - 8)}px 0 0)`}
                        >
                          {seg.taskLabel.length > sw / 5 ? seg.taskLabel.slice(0, Math.floor(sw / 5)) + '…' : seg.taskLabel}
                        </text>
                      )}
                    </g>
                  )
                })}
              </g>

              {/* Clip path for this lane's timeline area */}
              <defs>
                <clipPath id={`timeline-clip-${idx}`}>
                  <rect x={-panX} y={0} width={timelineWidth} height={LANE_HEIGHT} />
                </clipPath>
              </defs>
            </g>
          )
        })}

        {/* ─── Message markers (diamonds) ──────────────── */}
        <g transform={`translate(${LABEL_WIDTH + panX},0)`}>
          {messageMarkers.slice(-100).map((m, i) => {
            const x = m.time * pixelsPerMinute
            if (x + panX < -10 || x + panX > timelineWidth + 10) return null
            const y = HEADER_HEIGHT + ((m.fromIdx + m.toIdx) / 2) * LANE_HEIGHT + LANE_HEIGHT / 2
            return (
              <g key={i} transform={`translate(${x},${y})`} opacity={0.4}>
                <rect x={-2.5} y={-2.5} width={5} height={5}
                  fill="#38bdf8" transform="rotate(45)" />
              </g>
            )
          })}
        </g>

        {/* ─── Conflict markers (triangles) ────────────── */}
        <g transform={`translate(${LABEL_WIDTH + panX},0)`}>
          {conflictMarkers.map((c, i) => {
            const x = c.time * pixelsPerMinute
            if (x + panX < -10 || x + panX > timelineWidth + 10) return null
            return (
              <g key={i} transform={`translate(${x},${HEADER_HEIGHT - 2})`}>
                <polygon points="0,-5 3,1 -3,1"
                  fill={c.severity === 'critical' ? '#ef4444' : '#f59e0b'}
                  opacity={0.7} />
              </g>
            )
          })}
        </g>

        {/* ─── NOW marker ──────────────────────────────── */}
        <g transform={`translate(${LABEL_WIDTH + panX + elapsedMin * pixelsPerMinute},0)`}>
          <line x1={0} y1={0} x2={0} y2={HEADER_HEIGHT + contentHeight}
            stroke="#38bdf8" strokeWidth={1.5} strokeOpacity={0.6} />
          <rect x={-12} y={0} width={24} height={12} rx={2}
            fill="#38bdf8" fillOpacity={0.15} stroke="#38bdf8" strokeWidth={0.5} strokeOpacity={0.4} />
          <text x={0} y={9} textAnchor="middle" fill="#38bdf8"
            fontSize={7} fontFamily="monospace" fontWeight={700}>
            NOW
          </text>
          <circle cx={0} cy={0} r={2} fill="#38bdf8">
            <animate attributeName="opacity" values="1;0.3;1" dur="2s" repeatCount="indefinite" />
          </circle>
        </g>

        {/* ─── Prediction overlay (dashed) ─────────────── */}
        {simulation && simulation.timeline.length > 0 && (
          <g transform={`translate(${LABEL_WIDTH + panX},0)`} opacity={0.25}>
            {simulation.timeline.map((slot, i) => {
              const agentIdx = agents.findIndex((d) => d.agent.rosterId === slot.agentRosterId)
              if (agentIdx === -1) return null
              const y = HEADER_HEIGHT + agentIdx * LANE_HEIGHT
              const sx = slot.start * pixelsPerMinute
              const sw = Math.max(2, (slot.end - slot.start) * pixelsPerMinute)
              return (
                <rect key={i}
                  x={sx} y={y + 1} width={sw} height={LANE_HEIGHT - 2}
                  rx={2} fill="none"
                  stroke="rgba(255,255,255,0.3)" strokeWidth={1}
                  strokeDasharray="4 3"
                />
              )
            })}
          </g>
        )}
      </svg>

      {/* Hovered segment tooltip */}
      {hoveredSegment && (
        <div
          className="absolute pointer-events-none"
          style={{
            left: LABEL_WIDTH + panX + hoveredSegment.seg.start * pixelsPerMinute + 8,
            top: HEADER_HEIGHT + hoveredSegment.agentIdx * LANE_HEIGHT - 28,
            background: 'rgba(8,8,8,0.95)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 3,
            padding: '3px 6px',
            fontSize: 9,
            fontFamily: 'monospace',
            color: 'white',
            whiteSpace: 'nowrap',
            zIndex: 10,
          }}
        >
          <span style={{ color: STATUS_COLORS[hoveredSegment.seg.status], fontWeight: 700, textTransform: 'uppercase' }}>
            {STATUS_LABELS[hoveredSegment.seg.status] || hoveredSegment.seg.status}
          </span>
          {hoveredSegment.seg.taskLabel && (
            <span style={{ color: 'rgba(255,255,255,0.5)', marginLeft: 6 }}>
              {hoveredSegment.seg.taskLabel}
            </span>
          )}
          <span style={{ color: 'rgba(255,255,255,0.3)', marginLeft: 6 }}>
            {formatTime(hoveredSegment.seg.end - hoveredSegment.seg.start)}
          </span>
        </div>
      )}

      {/* Legend */}
      <div
        className="absolute bottom-2 right-3 flex items-center gap-2"
        style={{ fontSize: 7, fontFamily: 'monospace', pointerEvents: 'none' }}
      >
        {(['planning', 'building', 'review', 'done', 'error'] as const).map((s) => (
          <div key={s} className="flex items-center gap-1">
            <span style={{ width: 8, height: 3, background: STATUS_COLORS[s], borderRadius: 1, display: 'inline-block' }} />
            <span style={{ color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase' }}>{STATUS_LABELS[s]}</span>
          </div>
        ))}
        <div className="flex items-center gap-1">
          <span style={{ width: 5, height: 5, background: '#38bdf8', transform: 'rotate(45deg)', display: 'inline-block' }} />
          <span style={{ color: 'rgba(255,255,255,0.2)' }}>Msg</span>
        </div>
        <div className="flex items-center gap-1">
          <span style={{ width: 0, height: 0, borderLeft: '3px solid transparent', borderRight: '3px solid transparent', borderBottom: '5px solid #f59e0b', display: 'inline-block' }} />
          <span style={{ color: 'rgba(255,255,255,0.2)' }}>Conflict</span>
        </div>
      </div>

      {/* Zoom indicator */}
      <div className="absolute bottom-2 left-3" style={{ fontSize: 8, fontFamily: 'monospace', color: 'rgba(255,255,255,0.15)' }}>
        {Math.round(zoom * 100)}%
      </div>
    </div>
  )
}
