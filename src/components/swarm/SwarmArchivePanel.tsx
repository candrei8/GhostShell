// SwarmArchivePanel — post-swarm summary view shown when a swarm completes.
//
// Displays mission summary, task breakdown, files changed, scout findings,
// analyst recommendations, and provides Copy Report / View Full Report actions.

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Archive,
  Clock,
  Users,
  CheckCircle2,
  XCircle,
  FileText,
  Copy,
  ChevronDown,
  ChevronUp,
  GitBranch,
  MessageSquare,
  Radar,
  LineChart,
  AlertTriangle,
  BookOpen,
  Loader2,
} from 'lucide-react'
import { useSwarmStore } from '../../stores/swarmStore'
import type { SwarmSummaryReport } from '../../lib/swarm-report-generator'
import type { ReACTReport } from '../../lib/swarm-react-reporter'
import { SwarmReACTReportView } from './SwarmReACTReportView'

// ─── Props ──────────────────────────────────────────────────

interface SwarmArchivePanelProps {
  swarmId: string
}

// ─── Helpers ────────────────────────────────────────────────

function formatDuration(ms: number): string {
  const totalSecs = Math.floor(ms / 1000)
  const hours = Math.floor(totalSecs / 3600)
  const mins = Math.floor((totalSecs % 3600) / 60)
  const secs = totalSecs % 60

  if (hours > 0) return `${hours}h ${mins}m ${secs}s`
  if (mins > 0) return `${mins}m ${secs}s`
  return `${secs}s`
}

function formatDate(isoString: string): string {
  try {
    const d = new Date(isoString)
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return isoString
  }
}

const FILE_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  M: { label: 'M', color: 'text-amber-400' },
  A: { label: 'A', color: 'text-emerald-400' },
  D: { label: 'D', color: 'text-rose-400' },
  R: { label: 'R', color: 'text-sky-400' },
  C: { label: 'C', color: 'text-purple-400' },
  '?': { label: '?', color: 'text-ghost-text-dim' },
  '??': { label: '?', color: 'text-ghost-text-dim' },
}

function getFileStatusMeta(status: string): { label: string; color: string } {
  // Status might be "M ", " M", "MM", "A ", etc. — take first non-space char
  const cleaned = status.trim().charAt(0).toUpperCase()
  return FILE_STATUS_LABELS[cleaned] || { label: cleaned || '?', color: 'text-ghost-text-dim' }
}

// ─── Component ──────────────────────────────────────────────

export function SwarmArchivePanel({ swarmId }: SwarmArchivePanelProps) {
  const [report, setReport] = useState<SwarmSummaryReport | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [showFullReport, setShowFullReport] = useState(false)
  const [copied, setCopied] = useState(false)
  const [showAllFiles, setShowAllFiles] = useState(false)

  // ReACT Report state (A8)
  const [reactReport, setReactReport] = useState<Partial<ReACTReport> | null>(null)
  const [isGeneratingReact, setIsGeneratingReact] = useState(false)

  const swarm = useSwarmStore((s) => s.swarms.find((sw) => sw.id === swarmId))

  // Load the report from the archive directory
  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    setReport(null)

    async function loadReport() {
      if (!swarm?.swarmRoot) {
        setIsLoading(false)
        return
      }

      try {
        const { loadSwarmReport } = await import('../../lib/swarm-report-generator')
        const loaded = await loadSwarmReport(swarm.swarmRoot)
        if (!cancelled) {
          setReport(loaded)
        }
      } catch {
        // Report may not exist yet — it's generated asynchronously
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    loadReport()

    // If the report isn't available yet, retry after a short delay
    // (report generation is async and may still be in progress)
    const retryTimer = setTimeout(() => {
      if (!report && swarm?.swarmRoot) {
        loadReport()
      }
    }, 3000)

    return () => {
      cancelled = true
      clearTimeout(retryTimer)
    }
  }, [swarmId, swarm?.swarmRoot])

  // Try to load existing ReACT report on mount
  useEffect(() => {
    if (!swarm?.swarmRoot) return
    let cancelled = false

    async function loadExistingReact() {
      try {
        const { loadReACTReport } = await import('../../lib/swarm-react-reporter')
        const existing = await loadReACTReport(swarm!.swarmRoot!)
        if (!cancelled && existing) {
          setReactReport(existing)
        }
      } catch {
        // Non-fatal — report may not exist yet
      }
    }

    loadExistingReact()
    return () => { cancelled = true }
  }, [swarm?.swarmRoot])

  const handleCopyReport = useCallback(async () => {
    if (!report) return
    try {
      const text = JSON.stringify(report, null, 2)
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard may not be available
    }
  }, [report])

  const handleGenerateReactReport = useCallback(async () => {
    if (!swarm?.swarmRoot || isGeneratingReact) return

    setIsGeneratingReact(true)
    setReactReport({ status: 'planning', sections: [], startedAt: Date.now(), swarmId, swarmName: swarm.config.name })

    try {
      const { launchReACTReporter } = await import('../../lib/swarm-react-reporter')
      const result = await launchReACTReporter(
        swarmId,
        swarm.swarmRoot,
        swarm.config.directory,
        (progress) => {
          setReactReport(progress)
        },
      )
      if (result) {
        setReactReport(result)
      }
    } catch (err) {
      console.error('[archive] ReACT report generation failed:', err)
      setReactReport(prev => prev ? { ...prev, status: 'error' } : null)
    } finally {
      setIsGeneratingReact(false)
    }
  }, [swarmId, swarm?.swarmRoot, swarm?.config.directory, swarm?.config.name, isGeneratingReact])

  // ── Fallback metrics from swarm store if report isn't ready ──

  const duration = report
    ? report.duration
    : swarm?.startedAt
      ? (swarm.completedAt || Date.now()) - swarm.startedAt
      : 0

  const agentCount = report ? report.agentCount : (swarm?.agents.length ?? 0)
  const tasksCompleted = report ? report.tasks.completed : (swarm?.tasks.filter((t) => t.status === 'done').length ?? 0)
  const tasksTotal = report ? report.tasks.total : (swarm?.tasks.length ?? 0)
  const messagesExchanged = report ? report.messagesExchanged : (swarm?.messages.length ?? 0)
  const missionText = report ? report.mission : (swarm?.config.mission ?? '')
  const swarmName = report ? report.swarmName : (swarm?.config.name ?? 'Swarm')

  const filesChanged = report?.filesChanged ?? []
  const displayedFiles = showAllFiles ? filesChanged : filesChanged.slice(0, 15)
  const hasMoreFiles = filesChanged.length > 15

  const scoutFindings = report?.scoutFindings ?? []
  const analystRecs = report?.analystRecommendations ?? []

  return (
    <motion.div
      className="rounded-xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm overflow-hidden"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06] bg-white/[0.01]">
        <Archive className="w-4 h-4 text-sky-400" />
        <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-sky-400">
          Swarm Archive
        </h3>
        {report?.generatedAt && (
          <span className="ml-auto text-[10px] text-ghost-text-dim/40">
            {formatDate(report.generatedAt)}
          </span>
        )}
      </div>

      <div className="p-4 space-y-4">
        <AnimatePresence mode="wait">
          {isLoading ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-2 py-6 justify-center"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-sky-400/40 animate-pulse" />
              <span className="text-xs text-ghost-text-dim/50">Generating report...</span>
            </motion.div>
          ) : (
            <motion.div
              key="content"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="space-y-4"
            >
              {/* Mission Summary Card */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-ghost-text uppercase tracking-wider">
                  {swarmName}
                </h4>
                <p className="text-[11px] text-ghost-text-dim leading-relaxed">
                  {missionText}
                </p>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <StatCard
                  icon={<Clock className="w-3.5 h-3.5" />}
                  label="Duration"
                  value={formatDuration(duration)}
                  color="text-sky-400"
                />
                <StatCard
                  icon={<Users className="w-3.5 h-3.5" />}
                  label="Agents"
                  value={String(agentCount)}
                  color="text-sky-400"
                />
                <StatCard
                  icon={<CheckCircle2 className="w-3.5 h-3.5" />}
                  label="Tasks"
                  value={`${tasksCompleted}/${tasksTotal}`}
                  color={tasksCompleted === tasksTotal && tasksTotal > 0 ? 'text-emerald-400' : 'text-amber-400'}
                />
                <StatCard
                  icon={<MessageSquare className="w-3.5 h-3.5" />}
                  label="Messages"
                  value={String(messagesExchanged)}
                  color="text-sky-400"
                />
              </div>

              {/* Task Breakdown (from report) */}
              {report && report.tasks.breakdown.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-ghost-text-dim/50" />
                    <span className="text-[10px] font-semibold text-ghost-text-dim uppercase tracking-wider">
                      Task Breakdown
                    </span>
                  </div>
                  <div className="space-y-1">
                    {report.tasks.breakdown.slice(0, showFullReport ? undefined : 8).map((task) => (
                      <div
                        key={task.id}
                        className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white/[0.02] border border-white/[0.04]"
                      >
                        <TaskStatusDot status={task.status} />
                        <span className="text-[11px] text-ghost-text-dim flex-1 truncate">
                          {task.title}
                        </span>
                        <span className="text-[9px] text-ghost-text-dim/40 font-mono shrink-0">
                          {task.owner}
                        </span>
                      </div>
                    ))}
                    {!showFullReport && report.tasks.breakdown.length > 8 && (
                      <span className="text-[10px] text-ghost-text-dim/40 pl-2">
                        +{report.tasks.breakdown.length - 8} more tasks
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Files Changed */}
              {filesChanged.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <GitBranch className="w-3.5 h-3.5 text-ghost-text-dim/50" />
                    <span className="text-[10px] font-semibold text-ghost-text-dim uppercase tracking-wider">
                      Files Changed ({filesChanged.length})
                    </span>
                  </div>
                  <div className="space-y-0.5 max-h-48 overflow-y-auto">
                    {displayedFiles.map((file, i) => {
                      const meta = getFileStatusMeta(file.status)
                      return (
                        <div
                          key={i}
                          className="flex items-center gap-2 px-2 py-1 rounded hover:bg-white/[0.02]"
                        >
                          <span
                            className={`text-[10px] font-mono font-bold w-4 text-center shrink-0 ${meta.color}`}
                          >
                            {meta.label}
                          </span>
                          <span className="text-[11px] text-ghost-text-dim/70 truncate font-mono">
                            {file.path}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                  {hasMoreFiles && !showAllFiles && (
                    <button
                      onClick={() => setShowAllFiles(true)}
                      className="text-[10px] text-sky-400/60 hover:text-sky-400 transition-colors pl-2"
                    >
                      Show all {filesChanged.length} files
                    </button>
                  )}
                </div>
              )}

              {/* Scout Findings */}
              {scoutFindings.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Radar className="w-3.5 h-3.5 text-emerald-400/60" />
                    <span className="text-[10px] font-semibold text-ghost-text-dim uppercase tracking-wider">
                      Scout Findings
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {scoutFindings.slice(0, showFullReport ? undefined : 3).map((finding, i) => (
                      <p
                        key={i}
                        className="text-[11px] text-ghost-text-dim/70 leading-relaxed pl-2 border-l-2 border-emerald-400/20"
                      >
                        {finding.length > 200 && !showFullReport
                          ? finding.slice(0, 200) + '...'
                          : finding}
                      </p>
                    ))}
                    {!showFullReport && scoutFindings.length > 3 && (
                      <span className="text-[10px] text-ghost-text-dim/40 pl-2">
                        +{scoutFindings.length - 3} more findings
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Analyst Recommendations */}
              {analystRecs.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <LineChart className="w-3.5 h-3.5 text-pink-400/60" />
                    <span className="text-[10px] font-semibold text-ghost-text-dim uppercase tracking-wider">
                      Analyst Recommendations
                    </span>
                  </div>
                  <ul className="space-y-1">
                    {analystRecs.slice(0, showFullReport ? undefined : 5).map((rec, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-2 text-[11px] text-ghost-text-dim/70"
                      >
                        <span className="text-pink-400 mt-0.5 shrink-0">-</span>
                        <span>{rec}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Metrics (from report) */}
              {report && report.metrics.bottlenecksDetected > 0 && (
                <div className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-amber-400/5 border border-amber-400/15">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span className="text-[11px] text-amber-400/80">
                    {report.metrics.bottlenecksDetected} bottleneck{report.metrics.bottlenecksDetected !== 1 ? 's' : ''} detected during swarm execution
                  </span>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-2 pt-1 flex-wrap">
                <button
                  onClick={handleCopyReport}
                  disabled={!report}
                  className="h-7 px-3 rounded-lg border border-white/10 bg-white/[0.02] text-[10px] font-semibold uppercase tracking-[0.1em] text-ghost-text-dim hover:text-sky-400 hover:border-sky-400/25 hover:bg-sky-400/5 transition-colors flex items-center gap-1.5 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Copy className="w-3 h-3" />
                  {copied ? 'Copied' : 'Copy Report'}
                </button>
                {report && (
                  <button
                    onClick={() => setShowFullReport(!showFullReport)}
                    className="h-7 px-3 rounded-lg border border-white/10 bg-white/[0.02] text-[10px] font-semibold uppercase tracking-[0.1em] text-ghost-text-dim hover:text-ghost-text hover:border-white/15 transition-colors flex items-center gap-1.5"
                  >
                    {showFullReport ? (
                      <>
                        <ChevronUp className="w-3 h-3" />
                        Collapse
                      </>
                    ) : (
                      <>
                        <ChevronDown className="w-3 h-3" />
                        View Full Report
                      </>
                    )}
                  </button>
                )}
                {/* Generate ReACT Report (A8) */}
                <button
                  onClick={handleGenerateReactReport}
                  disabled={isGeneratingReact}
                  className="h-7 px-3 rounded-lg border border-sky-400/20 bg-sky-400/5 text-[10px] font-semibold uppercase tracking-[0.1em] text-sky-400 hover:bg-sky-400/10 hover:border-sky-400/30 transition-colors flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isGeneratingReact ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <BookOpen className="w-3 h-3" />
                  )}
                  {isGeneratingReact ? 'Generating...' : reactReport?.status === 'complete' ? 'Regenerate Report' : 'Generate Report'}
                </button>
              </div>

              {/* ReACT Report View (A8) — shown when a report exists or is being generated */}
              {(reactReport || isGeneratingReact) && (
                <SwarmReACTReportView
                  report={reactReport}
                  isGenerating={isGeneratingReact}
                />
              )}

              {/* Full Report JSON (expandable) */}
              {showFullReport && report && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="mt-2 p-3 rounded-lg bg-black/30 border border-white/[0.06] max-h-96 overflow-y-auto">
                    <pre className="text-[10px] text-ghost-text-dim/60 font-mono whitespace-pre-wrap break-words leading-relaxed">
                      {JSON.stringify(report, null, 2)}
                    </pre>
                  </div>
                </motion.div>
              )}

              {/* No report available fallback */}
              {!report && !isLoading && (
                <div className="flex items-center gap-2 py-2 justify-center">
                  <span className="text-[10px] text-ghost-text-dim/40">
                    Report not available — data shown from swarm state
                  </span>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}

// ─── Sub-components ─────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode
  label: string
  value: string
  color: string
}) {
  return (
    <div className="flex flex-col items-center gap-1 px-3 py-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04]">
      <span className={color}>{icon}</span>
      <span className={`text-sm font-semibold font-mono tabular-nums ${color}`}>{value}</span>
      <span className="text-[9px] text-ghost-text-dim/50 uppercase tracking-wider">{label}</span>
    </div>
  )
}

function TaskStatusDot({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    done: 'bg-emerald-400',
    completed: 'bg-emerald-400',
    building: 'bg-sky-400',
    review: 'bg-purple-400',
    planning: 'bg-amber-400',
    assigned: 'bg-amber-400/60',
    open: 'bg-white/20',
    failed: 'bg-rose-400',
    error: 'bg-rose-400',
  }
  const bg = colorMap[status] || 'bg-white/20'

  return <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${bg}`} />
}
