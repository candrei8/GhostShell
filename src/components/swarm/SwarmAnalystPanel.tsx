import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { LineChart, AlertTriangle, AlertCircle, TrendingUp, TrendingDown, Minus, Clock } from 'lucide-react'
import type { SwarmAnalystReport } from '../../lib/swarm-types'
import { useSwarmStore } from '../../stores/swarmStore'

// ─── Types ──────────────────────────────────────────────────

interface SwarmAnalystPanelProps {
  swarmId: string
}

// ─── Progress Bar Segment ───────────────────────────────────

function ProgressSegment({
  value,
  total,
  color,
  label,
}: {
  value: number
  total: number
  color: string
  label: string
}) {
  const pct = total > 0 ? (value / total) * 100 : 0
  if (pct === 0) return null

  return (
    <div
      className="h-full relative group"
      style={{ width: `${pct}%`, backgroundColor: color }}
    >
      <div className="absolute -top-7 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded text-[9px] font-mono bg-ghost-surface border border-white/10 text-ghost-text-dim opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
        {label}: {value}
      </div>
    </div>
  )
}

// ─── Velocity Badge ─────────────────────────────────────────

function VelocityBadge({ trend }: { trend: SwarmAnalystReport['velocityTrend'] }) {
  const config = {
    improving: { icon: TrendingUp, color: 'text-emerald-400', bg: 'bg-emerald-400/10', label: 'Improving' },
    stable: { icon: Minus, color: 'text-amber-400', bg: 'bg-amber-400/10', label: 'Stable' },
    declining: { icon: TrendingDown, color: 'text-rose-400', bg: 'bg-rose-400/10', label: 'Declining' },
  }[trend]

  const Icon = config.icon

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${config.color} ${config.bg}`}>
      <Icon className="w-3 h-3" />
      {config.label}
    </span>
  )
}

// ─── Bottleneck Item ────────────────────────────────────────

function BottleneckItem({
  bottleneck,
}: {
  bottleneck: SwarmAnalystReport['bottlenecks'][number]
}) {
  const isCritical = bottleneck.severity === 'critical'
  const Icon = isCritical ? AlertCircle : AlertTriangle
  const colorClass = isCritical ? 'text-rose-400' : 'text-amber-400'
  const borderClass = isCritical ? 'border-rose-400/20' : 'border-amber-400/20'
  const bgClass = isCritical ? 'bg-rose-400/5' : 'bg-amber-400/5'

  return (
    <div className={`flex items-start gap-2 px-2.5 py-2 rounded-lg border ${borderClass} ${bgClass}`}>
      <Icon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${colorClass}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold text-ghost-text uppercase tracking-wider">
            {bottleneck.agentLabel}
          </span>
          <span className={`text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded ${isCritical ? 'bg-rose-400/15 text-rose-400' : 'bg-amber-400/15 text-amber-400'}`}>
            {bottleneck.severity}
          </span>
        </div>
        <p className="text-[11px] text-ghost-text-dim mt-0.5">
          {bottleneck.issue}
        </p>
        <p className="text-[10px] text-ghost-text-dim/60 mt-0.5 italic">
          Suggested: {bottleneck.suggestedAction}
        </p>
      </div>
    </div>
  )
}

// ─── Panel ──────────────────────────────────────────────────

export function SwarmAnalystPanel({ swarmId }: SwarmAnalystPanelProps) {
  const [latestReport, setLatestReport] = useState<SwarmAnalystReport | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const knownFilesRef = useRef<Set<string>>(new Set())

  const swarm = useSwarmStore((s) => s.swarms.find((sw) => sw.id === swarmId))
  const swarmRoot = swarm?.swarmRoot
  const swarmStatus = swarm?.status

  const pollAnalystReports = useCallback(async () => {
    if (!swarmRoot) return

    try {
      const reportsDir = `${swarmRoot}/reports/analyst`
      const files = await window.ghostshell.fsReadDir(reportsDir)
      const jsonFiles = files
        .filter((f: { name: string }) => f.name.endsWith('.json') && f.name.startsWith('analyst-report-'))
        .sort((a: { name: string }, b: { name: string }) => b.name.localeCompare(a.name))

      if (jsonFiles.length === 0) {
        setIsLoading(false)
        return
      }

      const latestFile = jsonFiles[0]
      // Only re-read if we have a new file (use ref to avoid stale closure)
      if (knownFilesRef.current.has(latestFile.name)) {
        return
      }

      const result = await window.ghostshell.fsReadFile(`${reportsDir}/${latestFile.name}`)
      if (result.success && result.content) {
        try {
          const parsed = JSON.parse(result.content) as SwarmAnalystReport
          if (parsed.type === 'analyst-report') {
            knownFilesRef.current.add(latestFile.name)
            setLatestReport(parsed)
          }
        } catch {
          // Invalid JSON — skip
        }
      }
    } catch {
      // reports/analyst directory might not exist yet
    } finally {
      setIsLoading(false)
    }
  }, [swarmRoot])

  useEffect(() => {
    // Initial poll
    pollAnalystReports()

    // Stop polling when swarm reaches a terminal state (completed, error, paused)
    const isTerminal = swarmStatus === 'completed' || swarmStatus === 'error' || swarmStatus === 'paused'
    if (isTerminal) {
      // Do one final poll to get the latest report, but don't start interval
      if (pollRef.current) clearInterval(pollRef.current)
      pollRef.current = null
      return
    }

    // Poll every 10 seconds while swarm is active
    pollRef.current = setInterval(pollAnalystReports, 10_000)

    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [pollAnalystReports, swarmStatus])

  // Reset when swarmId changes
  useEffect(() => {
    setLatestReport(null)
    setIsLoading(true)
    knownFilesRef.current.clear()
  }, [swarmId])

  const report = latestReport
  const taskProgress = report?.taskProgress
  const totalTasks = taskProgress?.total ?? 0
  const donePct = totalTasks > 0 ? Math.round((taskProgress!.done / totalTasks) * 100) : 0

  return (
    <motion.div
      className="rounded-xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm overflow-hidden"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/[0.06]">
        <span style={{ color: '#ec4899', display: 'inline-flex' }}>
          <LineChart className="w-4 h-4" />
        </span>
        <h3 className="text-xs font-semibold uppercase tracking-[0.15em]" style={{ color: '#ec4899' }}>
          Analyst Report
        </h3>
        {report && (
          <span className="ml-auto flex items-center gap-1 text-[10px] text-ghost-text-dim/40">
            <Clock className="w-3 h-3" />
            {formatTimestamp(report.timestamp)}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="p-3">
        <AnimatePresence mode="wait">
          {isLoading ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-2 py-4 justify-center"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-pink-400/40 animate-pulse" />
              <span className="text-xs text-ghost-text-dim/50">Loading analyst data...</span>
            </motion.div>
          ) : !report ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-2 py-6 justify-center"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-pink-400/30" />
              <span className="text-xs text-ghost-text-dim/50">Awaiting first analyst report...</span>
            </motion.div>
          ) : (
            <motion.div
              key="report"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="space-y-3"
            >
              {/* Summary */}
              <p className="text-[11px] text-ghost-text-dim leading-relaxed">
                {report.summary}
              </p>

              {/* Task Progress Bar */}
              {totalTasks > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold text-ghost-text-dim uppercase tracking-wider">
                      Tasks
                    </span>
                    <span className="text-[10px] font-mono text-ghost-text-dim/60 tabular-nums">
                      {taskProgress!.done}/{totalTasks} ({donePct}%)
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden flex">
                    <ProgressSegment
                      value={taskProgress!.done}
                      total={totalTasks}
                      color="#10b981"
                      label="Done"
                    />
                    <ProgressSegment
                      value={taskProgress!.inProgress}
                      total={totalTasks}
                      color="#3b82f6"
                      label="In Progress"
                    />
                    <ProgressSegment
                      value={taskProgress!.blocked}
                      total={totalTasks}
                      color="#ef4444"
                      label="Blocked"
                    />
                  </div>
                  <div className="flex items-center gap-3 text-[9px] text-ghost-text-dim/50">
                    <span className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#10b981' }} /> Done
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#3b82f6' }} /> In Progress
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#ef4444' }} /> Blocked
                    </span>
                  </div>
                </div>
              )}

              {/* Velocity Trend */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold text-ghost-text-dim uppercase tracking-wider">
                  Velocity
                </span>
                <VelocityBadge trend={report.velocityTrend} />
              </div>

              {/* Bottlenecks */}
              {report.bottlenecks.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[10px] font-semibold text-ghost-text-dim uppercase tracking-wider">
                    Bottlenecks ({report.bottlenecks.length})
                  </span>
                  <div className="space-y-1.5">
                    {report.bottlenecks.map((b, i) => (
                      <BottleneckItem key={i} bottleneck={b} />
                    ))}
                  </div>
                </div>
              )}

              {/* Recommendations */}
              {report.recommendations.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[10px] font-semibold text-ghost-text-dim uppercase tracking-wider">
                    Recommendations
                  </span>
                  <ul className="space-y-1">
                    {report.recommendations.map((rec, i) => (
                      <li key={i} className="flex items-start gap-2 text-[11px] text-ghost-text-dim/70">
                        <span className="text-pink-400 mt-0.5 shrink-0">-</span>
                        <span>{rec}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}

// ─── Helpers ────────────────────────────────────────────────

function formatTimestamp(ts: string): string {
  try {
    const date = new Date(ts)
    if (isNaN(date.getTime())) {
      // Try parsing as a Unix timestamp (number stored as string)
      const num = Number(ts)
      if (!isNaN(num)) {
        const d = new Date(num)
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      }
      return ts
    }
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch {
    return ts
  }
}
