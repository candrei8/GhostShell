// SwarmCIStatus — compact CI/CD status widget for the Swarm Dashboard (A5)
// Shows per-agent pipeline results with expandable failure output.

import { useState, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CircleCheck,
  CircleX,
  Loader2,
  Clock,
  ChevronDown,
  ChevronUp,
  Play,
  Minus,
} from 'lucide-react'
import { useSwarmStore } from '../../stores/swarmStore'
import { getRoleDef } from '../../lib/swarm-types'
import type { CICheck, CICheckStatus, CICheckType, CIPipeline, SwarmAgentRole } from '../../lib/swarm-types'
import { triggerManualCIRun } from '../../lib/swarm-ci-runner'

// ─── Helpers ──────────────────────────────────────────────────

function formatDuration(ms?: number): string {
  if (!ms) return ''
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  return `${Math.floor(diff / 3600)}h ago`
}

const CHECK_TYPE_LABELS: Record<CICheckType, string> = {
  lint: 'Lint',
  typecheck: 'Types',
  test: 'Test',
  build: 'Build',
}

// ─── Check Status Icon ───────────────────────────────────────

function CheckStatusIcon({ status }: { status: CICheckStatus }) {
  switch (status) {
    case 'passed':
      return <CircleCheck className="w-3.5 h-3.5 text-emerald-400" />
    case 'failed':
      return <CircleX className="w-3.5 h-3.5 text-rose-400" />
    case 'running':
      return <Loader2 className="w-3.5 h-3.5 text-sky-400 animate-spin" />
    case 'pending':
      return <Clock className="w-3.5 h-3.5 text-white/30" />
    case 'skipped':
      return <Minus className="w-3.5 h-3.5 text-white/20" />
    default:
      return <Minus className="w-3.5 h-3.5 text-white/20" />
  }
}

// ─── Pass Rate Badge ─────────────────────────────────────────

function PassRateBadge({ rate }: { rate: number }) {
  let color = 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20'
  if (rate < 100 && rate >= 50) {
    color = 'text-amber-400 bg-amber-400/10 border-amber-400/20'
  } else if (rate < 50) {
    color = 'text-rose-400 bg-rose-400/10 border-rose-400/20'
  }

  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold font-mono border ${color}`}>
      {rate}%
    </span>
  )
}

// ─── Agent CI Row ────────────────────────────────────────────

interface AgentCIRowProps {
  pipeline: CIPipeline
  role: SwarmAgentRole
  directory: string
}

function AgentCIRow({ pipeline, role, directory }: AgentCIRowProps) {
  const [expanded, setExpanded] = useState(false)
  const [manualRunning, setManualRunning] = useState(false)

  const roleDef = getRoleDef(role)
  const failedChecks = pipeline.checks.filter(c => c.status === 'failed')
  const isRunning = pipeline.checks.some(c => c.status === 'running')

  const handleManualRun = useCallback(async () => {
    if (manualRunning || isRunning) return
    setManualRunning(true)
    try {
      await triggerManualCIRun(pipeline.swarmId, pipeline.agentLabel, directory)
    } catch (err) {
      console.error('[CI] Manual run failed:', err)
    } finally {
      setManualRunning(false)
    }
  }, [pipeline.swarmId, pipeline.agentLabel, directory, manualRunning, isRunning])

  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02]">
      {/* Agent row header */}
      <div className="flex items-center gap-2 px-3 py-2">
        {/* Role dot + label */}
        <span
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ backgroundColor: roleDef.color }}
        />
        <span className="text-[11px] font-mono text-white/70 truncate min-w-0">
          {pipeline.agentLabel}
        </span>

        {/* Check status icons */}
        <div className="flex items-center gap-1.5 ml-auto">
          {pipeline.checks.map((check) => (
            <div
              key={check.id}
              className="flex items-center gap-0.5"
              title={`${CHECK_TYPE_LABELS[check.type]}: ${check.status}${check.duration ? ` (${formatDuration(check.duration)})` : ''}`}
            >
              <CheckStatusIcon status={check.status} />
              <span className="text-[9px] font-mono text-white/30 uppercase hidden sm:inline">
                {CHECK_TYPE_LABELS[check.type]}
              </span>
            </div>
          ))}
        </div>

        {/* Pass rate */}
        <PassRateBadge rate={pipeline.passRate} />

        {/* Last run time */}
        <span className="text-[9px] text-white/25 font-mono shrink-0">
          {timeAgo(pipeline.lastRun)}
        </span>

        {/* Manual run button */}
        <button
          onClick={handleManualRun}
          disabled={manualRunning || isRunning}
          className="flex items-center justify-center w-5 h-5 rounded border border-white/[0.08] bg-white/[0.02] text-white/40 hover:text-sky-400 hover:border-sky-400/30 hover:bg-sky-400/5 transition-colors disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
          title="Re-run CI checks"
        >
          {manualRunning || isRunning ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Play className="w-3 h-3" />
          )}
        </button>

        {/* Expand toggle (only if there are failures) */}
        {failedChecks.length > 0 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center justify-center w-5 h-5 rounded text-white/30 hover:text-white/60 transition-colors shrink-0"
          >
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>

      {/* Expanded failure output */}
      <AnimatePresence>
        {expanded && failedChecks.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="border-t border-white/[0.04] px-3 py-2 space-y-2">
              {failedChecks.map((check) => (
                <div key={check.id} className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <CircleX className="w-3 h-3 text-rose-400 shrink-0" />
                    <span className="text-[10px] font-semibold text-rose-400 uppercase tracking-wider">
                      {CHECK_TYPE_LABELS[check.type]}
                    </span>
                    {check.duration && (
                      <span className="text-[9px] text-white/25 font-mono">
                        {formatDuration(check.duration)}
                      </span>
                    )}
                  </div>
                  {check.output && (
                    <pre className="text-[10px] font-mono text-white/50 bg-black/30 rounded px-2 py-1.5 overflow-x-auto max-h-32 whitespace-pre-wrap break-all leading-relaxed">
                      {check.output}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────

interface SwarmCIStatusProps {
  swarmId: string
}

export default function SwarmCIStatus({ swarmId }: SwarmCIStatusProps) {
  const [collapsed, setCollapsed] = useState(false)
  const ciPipelines = useSwarmStore((s) => s.ciPipelines)
  // Subscribe to tick for periodic re-renders of "time ago" labels
  useSwarmStore((s) => s.tick)

  const swarm = useSwarmStore((s) => s.getSwarm(swarmId))

  // Filter pipelines belonging to this swarm and build role map
  const { pipelines, roleMap } = useMemo(() => {
    if (!swarm) return { pipelines: [], roleMap: new Map<string, SwarmAgentRole>() }

    const rMap = new Map<string, SwarmAgentRole>()
    swarm.config.roster.forEach((r, i) => {
      const label = r.customName || (() => {
        let roleIdx = 0
        for (let j = 0; j < i; j++) {
          if (swarm.config.roster[j].role === r.role) roleIdx++
        }
        return `${getRoleDef(r.role).label} ${roleIdx + 1}`
      })()
      rMap.set(label, r.role)
    })

    const relevant = Object.values(ciPipelines).filter(
      (p) => p.swarmId === swarmId,
    )

    return { pipelines: relevant, roleMap: rMap }
  }, [ciPipelines, swarmId, swarm])

  // Don't render if no pipelines yet
  if (pipelines.length === 0) return null

  // Aggregate stats
  const totalChecks = pipelines.reduce((sum, p) => sum + p.checks.length, 0)
  const passedChecks = pipelines.reduce(
    (sum, p) => sum + p.checks.filter(c => c.status === 'passed').length,
    0,
  )
  const failedChecks = pipelines.reduce(
    (sum, p) => sum + p.checks.filter(c => c.status === 'failed').length,
    0,
  )
  const runningChecks = pipelines.reduce(
    (sum, p) => sum + p.checks.filter(c => c.status === 'running').length,
    0,
  )
  const overallPassRate = totalChecks > 0 ? Math.round((passedChecks / totalChecks) * 100) : 0

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="overflow-hidden"
    >
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] backdrop-blur-sm">
        {/* Header */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-2 w-full px-4 py-2.5 text-left hover:bg-white/[0.02] transition-colors rounded-t-xl"
        >
          <CircleCheck className="w-4 h-4 text-sky-400 shrink-0" />
          <span className="text-xs font-semibold text-white/80 uppercase tracking-[0.12em]">
            CI/CD
          </span>

          {/* Aggregate stats */}
          <div className="flex items-center gap-2 ml-auto">
            {runningChecks > 0 && (
              <span className="flex items-center gap-1 text-[10px] text-sky-400 font-mono">
                <Loader2 className="w-3 h-3 animate-spin" />
                {runningChecks} running
              </span>
            )}
            {failedChecks > 0 && (
              <span className="flex items-center gap-1 text-[10px] text-rose-400 font-mono">
                <CircleX className="w-3 h-3" />
                {failedChecks} failed
              </span>
            )}
            <PassRateBadge rate={overallPassRate} />
            <span className="text-[10px] text-white/25 font-mono">
              {pipelines.length} agent{pipelines.length !== 1 ? 's' : ''}
            </span>
            {collapsed ? (
              <ChevronDown className="w-3.5 h-3.5 text-white/30" />
            ) : (
              <ChevronUp className="w-3.5 h-3.5 text-white/30" />
            )}
          </div>
        </button>

        {/* Pipeline rows */}
        <AnimatePresence>
          {!collapsed && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="overflow-hidden"
            >
              <div className="px-3 pb-3 space-y-1.5">
                {pipelines.map((pipeline) => (
                  <AgentCIRow
                    key={pipeline.agentLabel}
                    pipeline={pipeline}
                    role={roleMap.get(pipeline.agentLabel) || 'custom'}
                    directory={swarm?.config.directory || ''}
                  />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
