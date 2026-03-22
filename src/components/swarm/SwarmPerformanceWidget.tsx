// SwarmPerformanceWidget — compact leaderboard showing per-agent performance metrics.
// Displays agent ranking by success rate, tasks completed, avg time, and domain expertise.

import { useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Trophy, Zap, Clock, Target } from 'lucide-react'
import { useSwarmStore } from '../../stores/swarmStore'
import {
  getPerformanceProfiles,
  getSuccessRate,
  formatDurationMs,
  type AgentPerformanceProfile,
} from '../../lib/swarm-performance-tracker'
import { getRoleDef } from '../../lib/swarm-types'

// ─── Props ──────────────────────────────────────────────────

interface SwarmPerformanceWidgetProps {
  swarmId: string
}

// ─── Component ──────────────────────────────────────────────

export function SwarmPerformanceWidget({ swarmId }: SwarmPerformanceWidgetProps) {
  // Subscribe to store updates by watching the tick (performance data may change with tasks)
  useSwarmStore((s) => s.tick)

  const profiles = useMemo(() => {
    return getPerformanceProfiles(swarmId)
  }, [swarmId, useSwarmStore.getState().tick])

  // Only show if there's meaningful data
  const hasData = profiles.some(p => p.tasksCompleted > 0 || p.tasksFailed > 0)

  if (profiles.length === 0) return null

  return (
    <motion.div
      className="rounded-xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm overflow-hidden"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/[0.06] bg-white/[0.01]">
        <Trophy className="w-3.5 h-3.5 text-amber-400" />
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.15em] text-ghost-text-dim">
          Agent Performance
        </h3>
        {hasData && (
          <span className="ml-auto text-[9px] text-ghost-text-dim/40 font-mono">
            {profiles.filter(p => p.tasksCompleted > 0).length} active
          </span>
        )}
      </div>

      {/* Table */}
      <div className="px-3 py-2">
        {!hasData ? (
          <div className="flex items-center justify-center py-4">
            <span className="text-[10px] text-ghost-text-dim/30">
              No task completions recorded yet
            </span>
          </div>
        ) : (
          <div className="space-y-0.5">
            {/* Column headers */}
            <div className="flex items-center gap-2 px-2 py-1 text-[9px] text-ghost-text-dim/40 uppercase tracking-wider font-mono">
              <span className="w-4 shrink-0 text-center">#</span>
              <span className="flex-1 min-w-0">Agent</span>
              <span className="w-10 text-center shrink-0">Done</span>
              <span className="w-12 text-center shrink-0">Rate</span>
              <span className="w-14 text-center shrink-0">Avg Time</span>
              <span className="w-16 text-right shrink-0">Domain</span>
            </div>

            <AnimatePresence mode="popLayout">
              {profiles.map((profile, idx) => (
                <AgentRow
                  key={profile.agentLabel}
                  profile={profile}
                  rank={idx + 1}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </motion.div>
  )
}

// ─── Agent Row ──────────────────────────────────────────────

function AgentRow({
  profile,
  rank,
}: {
  profile: AgentPerformanceProfile
  rank: number
}) {
  const successRate = getSuccessRate(profile)
  const roleDef = getRoleDef(profile.role)
  const avgTime = formatDurationMs(profile.avgTaskDurationMs)
  const topDomain = getTopDomain(profile.domainScores)
  const hasActivity = profile.tasksCompleted > 0 || profile.tasksFailed > 0

  // Color coding: green >80%, amber 50-80%, red <50%
  const rateColor = !hasActivity
    ? 'text-ghost-text-dim/30'
    : successRate >= 80
      ? 'text-emerald-400'
      : successRate >= 50
        ? 'text-amber-400'
        : 'text-rose-400'

  const rateBg = !hasActivity
    ? 'bg-transparent'
    : successRate >= 80
      ? 'bg-emerald-400/8'
      : successRate >= 50
        ? 'bg-amber-400/8'
        : 'bg-rose-400/8'

  // Rank medal for top 3
  const rankDisplay = rank <= 3
    ? ['text-amber-400', 'text-gray-300', 'text-amber-600'][rank - 1]
    : 'text-ghost-text-dim/30'

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -4 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 4 }}
      transition={{ duration: 0.15 }}
      className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/[0.02] transition-colors"
    >
      {/* Rank */}
      <span className={`w-4 shrink-0 text-center text-[10px] font-bold font-mono ${rankDisplay}`}>
        {rank}
      </span>

      {/* Agent label + role dot */}
      <div className="flex items-center gap-1.5 flex-1 min-w-0">
        <span
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ backgroundColor: roleDef.color }}
        />
        <span className="text-[11px] text-ghost-text-dim truncate">
          {profile.agentLabel}
        </span>
      </div>

      {/* Tasks completed */}
      <span className="w-10 text-center shrink-0 text-[10px] font-mono tabular-nums text-ghost-text-dim/60">
        {profile.tasksCompleted}
      </span>

      {/* Success rate */}
      <span className={`w-12 text-center shrink-0 text-[10px] font-mono font-semibold tabular-nums px-1.5 py-0.5 rounded ${rateColor} ${rateBg}`}>
        {hasActivity ? `${successRate}%` : '--'}
      </span>

      {/* Avg time */}
      <span className="w-14 text-center shrink-0 text-[10px] font-mono tabular-nums text-ghost-text-dim/50">
        {hasActivity ? avgTime : '--'}
      </span>

      {/* Top domain */}
      <span className="w-16 text-right shrink-0 text-[9px] font-mono text-ghost-text-dim/40 truncate">
        {topDomain || '--'}
      </span>
    </motion.div>
  )
}

// ─── Helpers ────────────────────────────────────────────────

function getTopDomain(domainScores: Record<string, number>): string | null {
  const entries = Object.entries(domainScores)
  if (entries.length === 0) return null

  let best = entries[0]
  for (const entry of entries) {
    if (entry[1] > best[1]) best = entry
  }

  return best[0]
}
