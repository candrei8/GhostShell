// SwarmTimeTravelScrubber — Horizontal scrubber for navigating through execution snapshots
// Shows snapshot markers on a timeline, hover to preview state, click to inspect

import { useState, useMemo, useCallback, useRef, useLayoutEffect } from 'react'
import { Clock, Play, Pause, SkipForward, SkipBack } from 'lucide-react'
import {
  getSnapshots, getSnapshotAt, computeSnapshotDiff,
  type SwarmSnapshot, type SnapshotDiff,
} from '../../lib/swarm-time-travel'

// ─── Types ──────────────────────────────────────────────────

interface SwarmTimeTravelScrubberProps {
  swarmStartedAt?: number
}

const TRIGGER_COLORS: Record<string, string> = {
  interval:     '#475569',
  task_change:  '#38bdf8',
  conflict:     '#ef4444',
  error:        '#ef4444',
  manual:       '#f59e0b',
}

// ─── Component ──────────────────────────────────────────────

export function SwarmTimeTravelScrubber({ swarmStartedAt }: SwarmTimeTravelScrubberProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(600)
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)

  const snapshots = getSnapshots()
  const startMs = swarmStartedAt || (snapshots[0]?.timestamp || Date.now())
  const endMs = snapshots.length > 0 ? snapshots[snapshots.length - 1].timestamp : Date.now()
  const rangeMs = Math.max(endMs - startMs, 60000) // at least 1 minute range

  useLayoutEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0) setWidth(entry.contentRect.width)
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  const selectedSnapshot = selectedIdx !== null ? getSnapshotAt(selectedIdx) : null
  const hoveredSnapshot = hoveredIdx !== null ? getSnapshotAt(hoveredIdx) : null

  // Diff between selected and previous
  const diff = useMemo<SnapshotDiff | null>(() => {
    if (selectedIdx === null || selectedIdx === 0) return null
    const before = getSnapshotAt(selectedIdx - 1)
    const after = getSnapshotAt(selectedIdx)
    if (!before || !after) return null
    return computeSnapshotDiff(before, after)
  }, [selectedIdx])

  const handlePrev = useCallback(() => {
    if (selectedIdx === null) setSelectedIdx(snapshots.length - 1)
    else if (selectedIdx > 0) setSelectedIdx(selectedIdx - 1)
  }, [selectedIdx, snapshots.length])

  const handleNext = useCallback(() => {
    if (selectedIdx === null) setSelectedIdx(0)
    else if (selectedIdx < snapshots.length - 1) setSelectedIdx(selectedIdx + 1)
  }, [selectedIdx, snapshots.length])

  if (snapshots.length === 0) {
    return (
      <div className="flex items-center justify-center gap-2 px-3 py-2"
        style={{ background: 'rgba(0,0,0,0.2)', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
        <Clock className="w-3 h-3 text-white/15" />
        <span className="text-[9px] font-mono text-white/15">Sin snapshots (el time-travel se activa durante la ejecucion)</span>
      </div>
    )
  }

  const PADDING = 40 // px padding on each side
  const trackWidth = width - PADDING * 2

  return (
    <div style={{ background: 'rgba(0,0,0,0.2)', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
      {/* Controls + Scrubber */}
      <div ref={containerRef} className="flex items-center gap-2 px-3 py-1.5">
        {/* Prev/Next buttons */}
        <button onClick={handlePrev} className="p-0.5 hover:bg-white/5 rounded transition-colors"
          style={{ color: 'rgba(255,255,255,0.3)', cursor: 'pointer' }}>
          <SkipBack className="w-3 h-3" />
        </button>
        <button onClick={handleNext} className="p-0.5 hover:bg-white/5 rounded transition-colors"
          style={{ color: 'rgba(255,255,255,0.3)', cursor: 'pointer' }}>
          <SkipForward className="w-3 h-3" />
        </button>

        {/* Timeline track */}
        <div className="flex-1 relative" style={{ height: 20 }}>
          {/* Track line */}
          <div className="absolute" style={{ left: 0, right: 0, top: 9, height: 2, background: 'rgba(255,255,255,0.06)', borderRadius: 1 }} />

          {/* Snapshot markers */}
          {snapshots.map((snap, i) => {
            const x = ((snap.timestamp - startMs) / rangeMs) * trackWidth
            const isSelected = selectedIdx === i
            const isHovered = hoveredIdx === i
            const color = TRIGGER_COLORS[snap.trigger] || '#475569'

            return (
              <div
                key={snap.id}
                className="absolute"
                style={{
                  left: x,
                  top: isSelected ? 3 : isHovered ? 5 : 6,
                  width: isSelected ? 8 : 4,
                  height: isSelected ? 14 : isHovered ? 10 : 8,
                  background: color,
                  borderRadius: 1,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  transform: 'translateX(-50%)',
                  border: isSelected ? '1px solid rgba(255,255,255,0.3)' : 'none',
                }}
                onClick={() => setSelectedIdx(isSelected ? null : i)}
                onPointerEnter={() => setHoveredIdx(i)}
                onPointerLeave={() => setHoveredIdx(null)}
              />
            )
          })}
        </div>

        {/* Info */}
        <span className="text-[8px] font-mono text-white/15 shrink-0">
          {snapshots.length} snaps
        </span>
      </div>

      {/* Hover preview */}
      {hoveredSnapshot && hoveredIdx !== selectedIdx && (
        <div className="px-4 py-1" style={{ borderTop: '1px solid rgba(255,255,255,0.03)' }}>
          <SnapshotPreview snapshot={hoveredSnapshot} startMs={startMs} />
        </div>
      )}

      {/* Selected snapshot detail + diff */}
      {selectedSnapshot && (
        <div className="px-4 py-2" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
          <SnapshotPreview snapshot={selectedSnapshot} startMs={startMs} />
          {diff && (
            <div className="mt-1 flex items-center gap-3 flex-wrap">
              {diff.completedTasks.length > 0 && (
                <span className="text-[8px] font-mono" style={{ color: '#34d399' }}>
                  +{diff.completedTasks.length} tareas completadas
                </span>
              )}
              {diff.addedTasks.length > 0 && (
                <span className="text-[8px] font-mono" style={{ color: '#38bdf8' }}>
                  +{diff.addedTasks.length} tareas nuevas
                </span>
              )}
              {diff.statusChanges.length > 0 && (
                <span className="text-[8px] font-mono text-white/25">
                  {diff.statusChanges.length} cambios de estado
                </span>
              )}
              {diff.newMessages > 0 && (
                <span className="text-[8px] font-mono text-white/20">
                  +{diff.newMessages} msgs
                </span>
              )}
              {diff.newConflicts > 0 && (
                <span className="text-[8px] font-mono" style={{ color: '#ef4444' }}>
                  +{diff.newConflicts} conflictos
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SnapshotPreview({ snapshot, startMs }: { snapshot: SwarmSnapshot; startMs: number }) {
  const elapsed = Math.round((snapshot.timestamp - startMs) / 60000)
  const triggerColor = TRIGGER_COLORS[snapshot.trigger] || '#475569'

  return (
    <div className="flex items-center gap-3">
      <span className="text-[8px] font-mono px-1 py-px rounded"
        style={{ background: `${triggerColor}15`, color: triggerColor, fontWeight: 700, textTransform: 'uppercase' }}>
        {snapshot.trigger}
      </span>
      <span className="text-[8px] font-mono text-white/30">+{elapsed}m</span>
      <span className="text-[8px] font-mono text-white/20">
        {snapshot.metadata.activeAgents} activos · {snapshot.metadata.completedTasks} done · {snapshot.metadata.totalTokens > 0 ? `${Math.round(snapshot.metadata.totalTokens / 1000)}k tok` : ''}
      </span>
      {snapshot.conflictCount > 0 && (
        <span className="text-[8px] font-mono" style={{ color: '#ef4444' }}>
          {snapshot.conflictCount} conflictos
        </span>
      )}
    </div>
  )
}
