import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Heart, ChevronDown, ChevronUp, RefreshCw, AlertTriangle, CheckCircle } from 'lucide-react'
import { useSwarmStore } from '../../stores/swarmStore'
import type { AgentRecoveryEvent } from '../../lib/swarm-self-heal'

// ─── Health Status Derivation ────────────────────────────────

type HealthLevel = 'healthy' | 'recovering' | 'failed'

function deriveHealthLevel(events: AgentRecoveryEvent[]): HealthLevel {
  if (events.length === 0) return 'healthy'

  const hasFailed = events.some(
    (e) => e.attempt >= e.maxAttempts && !e.recoveredAt,
  )
  if (hasFailed) return 'failed'

  const hasRecovering = events.some(
    (e) => e.attempt < e.maxAttempts && e.recoveredAt,
  )
  if (hasRecovering) return 'recovering'

  // Events exist but all recovered successfully
  return events.every((e) => e.recoveredAt) ? 'healthy' : 'recovering'
}

const HEALTH_DOT_COLORS: Record<HealthLevel, string> = {
  healthy: 'bg-emerald-400',
  recovering: 'bg-amber-400',
  failed: 'bg-rose-400',
}

const HEALTH_LABELS: Record<HealthLevel, string> = {
  healthy: 'All healthy',
  recovering: 'Recovery active',
  failed: 'Agent failed',
}

const ISSUE_LABELS: Record<string, string> = {
  crash: 'Process crashed',
  freeze: 'Agent frozen',
  context_limit: 'Context exhausted',
  error_loop: 'Error loop',
}

// ─── Component ───────────────────────────────────────────────

interface SwarmHealthIndicatorProps {
  swarmId: string
}

export function SwarmHealthIndicator({ swarmId }: SwarmHealthIndicatorProps) {
  const [expanded, setExpanded] = useState(false)
  const recoveryEvents = useSwarmStore((s) => s.recoveryEvents)

  // Filter events for this swarm (recovery events include agentLabel which starts from the swarm)
  const relevantEvents = useMemo(() => {
    // Recovery events are global — we filter by checking if the agent belongs to the active swarm
    const swarm = useSwarmStore.getState().getSwarm(swarmId)
    if (!swarm) return []
    const rosterIds = new Set(swarm.config.roster.map((r) => r.id))
    return recoveryEvents.filter((e) => rosterIds.has(e.rosterId))
  }, [swarmId, recoveryEvents])

  const healthLevel = useMemo(
    () => deriveHealthLevel(relevantEvents),
    [relevantEvents],
  )

  // Deduplicate: show latest event per agent
  const latestPerAgent = useMemo(() => {
    const map = new Map<string, AgentRecoveryEvent>()
    for (const event of relevantEvents) {
      const existing = map.get(event.rosterId)
      if (!existing || event.detectedAt > existing.detectedAt) {
        map.set(event.rosterId, event)
      }
    }
    return Array.from(map.values()).sort((a, b) => b.detectedAt - a.detectedAt)
  }, [relevantEvents])

  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02]">
      {/* Compact bar */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-white/[0.03] transition-colors rounded-lg"
      >
        <Heart className="w-3.5 h-3.5 text-ghost-text-dim/60" />
        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-ghost-text-dim/70">
          Health
        </span>
        <div className="flex items-center gap-1.5 ml-1">
          <span
            className={`w-2 h-2 rounded-full ${HEALTH_DOT_COLORS[healthLevel]} ${
              healthLevel === 'recovering' ? 'animate-pulse' : ''
            }`}
          />
          <span className="text-[10px] text-ghost-text-dim/50 font-mono">
            {HEALTH_LABELS[healthLevel]}
          </span>
        </div>
        {relevantEvents.length > 0 && (
          <span className="ml-auto text-[10px] text-ghost-text-dim/40 font-mono">
            {relevantEvents.length} event{relevantEvents.length !== 1 ? 's' : ''}
          </span>
        )}
        {relevantEvents.length > 0 && (
          expanded
            ? <ChevronUp className="w-3 h-3 text-ghost-text-dim/40" />
            : <ChevronDown className="w-3 h-3 text-ghost-text-dim/40" />
        )}
      </button>

      {/* Expanded: recovery history */}
      <AnimatePresence>
        {expanded && latestPerAgent.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-2 space-y-1.5">
              {latestPerAgent.map((event) => (
                <RecoveryEventRow key={`${event.rosterId}-${event.detectedAt}`} event={event} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Recovery Event Row ──────────────────────────────────────

function RecoveryEventRow({ event }: { event: AgentRecoveryEvent }) {
  const isFailed = event.attempt >= event.maxAttempts && !event.recoveredAt
  const isRecovered = !!event.recoveredAt

  const elapsed = Math.round((Date.now() - event.detectedAt) / 1000)
  const timeAgo =
    elapsed < 60
      ? `${elapsed}s ago`
      : elapsed < 3600
        ? `${Math.floor(elapsed / 60)}m ago`
        : `${Math.floor(elapsed / 3600)}h ago`

  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded border border-white/[0.04] bg-white/[0.01]">
      {/* Status icon */}
      {isFailed ? (
        <AlertTriangle className="w-3.5 h-3.5 text-rose-400 flex-shrink-0" />
      ) : isRecovered ? (
        <CheckCircle className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
      ) : (
        <RefreshCw className="w-3.5 h-3.5 text-amber-400 animate-spin flex-shrink-0" />
      )}

      {/* Agent label */}
      <span className="text-[11px] font-medium text-ghost-text truncate max-w-[100px]">
        {event.agentLabel}
      </span>

      {/* Issue type */}
      <span
        className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
          isFailed
            ? 'bg-rose-400/10 text-rose-400'
            : isRecovered
              ? 'bg-emerald-400/10 text-emerald-400'
              : 'bg-amber-400/10 text-amber-400'
        }`}
      >
        {ISSUE_LABELS[event.issue] || event.issue}
      </span>

      {/* Attempt counter */}
      <span className="text-[10px] text-ghost-text-dim/40 font-mono ml-auto flex-shrink-0">
        {event.attempt}/{event.maxAttempts}
      </span>

      {/* Time ago */}
      <span className="text-[10px] text-ghost-text-dim/30 font-mono flex-shrink-0">
        {timeAgo}
      </span>
    </div>
  )
}

export default SwarmHealthIndicator
