import { useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Shield, AlertTriangle, FileWarning, Clock, CheckCircle2 } from 'lucide-react'
import { useSwarmStore } from '../../stores/swarmStore'
import type { SwarmFileConflict, SwarmAgentRole } from '../../lib/swarm-types'
import { getRoleDef } from '../../lib/swarm-types'
import { getConflictMatrix } from '../../lib/swarm-conflict-detector'

// ─── Helpers ──────────────────────────────────────────────────

function formatTime(ts: number): string {
  const d = new Date(ts)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`
}

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  return `${Math.floor(diff / 3600)}h ago`
}

function truncatePath(path: string, maxLen = 50): string {
  if (path.length <= maxLen) return path
  const parts = path.replace(/\\/g, '/').split('/')
  if (parts.length <= 2) return '...' + path.slice(-(maxLen - 3))
  return parts[0] + '/.../' + parts.slice(-2).join('/')
}

// ─── Severity Badge ───────────────────────────────────────────

function SeverityBadge({ severity }: { severity: 'warning' | 'critical' }) {
  if (severity === 'critical') {
    return (
      <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider text-rose-400 bg-rose-400/10 border border-rose-400/20">
        <AlertTriangle className="w-3 h-3" />
        Critical
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider text-amber-400 bg-amber-400/10 border border-amber-400/20">
      <FileWarning className="w-3 h-3" />
      Warning
    </span>
  )
}

// ─── Agent Dot ────────────────────────────────────────────────

function AgentDot({ role, label }: { role: SwarmAgentRole; label: string }) {
  const roleDef = getRoleDef(role)
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono border border-white/[0.06] bg-white/[0.03]"
      title={label}
    >
      <span
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{ backgroundColor: roleDef.color }}
      />
      <span className="text-white/60 truncate max-w-[80px]">{label}</span>
    </span>
  )
}

// ─── Conflict Card ─────────────────────────────────────────────

function ConflictCard({ conflict }: { conflict: SwarmFileConflict }) {
  const resolveConflict = useSwarmStore((s) => s.resolveConflict)
  const isResolved = conflict.status === 'resolved'

  const borderColor = isResolved
    ? 'border-white/[0.06]'
    : conflict.severity === 'critical'
      ? 'border-rose-400/25'
      : 'border-amber-400/20'

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: isResolved ? 0.5 : 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      className={`rounded-lg border ${borderColor} bg-white/[0.02] p-3`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <SeverityBadge severity={conflict.severity} />
          <code className="text-[11px] font-mono text-white/70 truncate">
            {truncatePath(conflict.filePath)}
          </code>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="flex items-center gap-1 text-[10px] text-white/30">
            <Clock className="w-3 h-3" />
            {timeAgo(conflict.detectedAt)}
          </span>
          {!isResolved && (
            <button
              onClick={() => resolveConflict(conflict.id)}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-emerald-400/70 hover:text-emerald-400 border border-emerald-400/15 hover:border-emerald-400/30 bg-emerald-400/5 hover:bg-emerald-400/10 transition-colors"
              title="Mark as resolved"
            >
              <CheckCircle2 className="w-3 h-3" />
              Resolve
            </button>
          )}
        </div>
      </div>

      {/* Agents involved */}
      <div className="flex flex-wrap gap-1.5">
        {conflict.agents.map((agent) => (
          <div key={agent.label} className="flex items-center gap-1">
            <AgentDot role={agent.role} label={agent.label} />
            <span className="text-[9px] font-mono text-white/30 uppercase">
              {agent.operation}
            </span>
          </div>
        ))}
      </div>
    </motion.div>
  )
}

// ─── File Ownership Row ────────────────────────────────────────

function FileOwnershipRow({
  filePath,
  agents,
}: {
  filePath: string
  agents: Set<string>
}) {
  const swarm = useSwarmStore((s) => s.getActiveSwarm())
  const agentRoles = useMemo(() => {
    if (!swarm) return new Map<string, SwarmAgentRole>()
    const map = new Map<string, SwarmAgentRole>()
    swarm.config.roster.forEach((r, i) => {
      const label = r.customName || (() => {
        let roleIdx = 0
        for (let j = 0; j < i; j++) {
          if (swarm.config.roster[j].role === r.role) roleIdx++
        }
        return `${getRoleDef(r.role).label} ${roleIdx + 1}`
      })()
      map.set(label, r.role)
    })
    return map
  }, [swarm])

  return (
    <div className="flex items-center gap-2 py-1">
      <code className="text-[10px] font-mono text-white/50 truncate min-w-0 flex-1 max-w-[200px]">
        {truncatePath(filePath, 35)}
      </code>
      <div className="flex gap-1 flex-wrap">
        {Array.from(agents).map((label) => {
          const role = agentRoles.get(label) || 'custom'
          const roleDef = getRoleDef(role)
          return (
            <span
              key={label}
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: roleDef.color }}
              title={label}
            />
          )
        })}
      </div>
    </div>
  )
}

// ─── Main Component ────────────────────────────────────────────

interface SwarmConflictMatrixProps {
  swarmId: string
}

export default function SwarmConflictMatrix({ swarmId }: SwarmConflictMatrixProps) {
  // Subscribe to conflicts + tick to trigger re-renders
  const conflicts = useSwarmStore((s) => s.conflicts)
  useSwarmStore((s) => s.tick)

  const matrix = useMemo(() => getConflictMatrix(swarmId), [swarmId, conflicts])

  const activeConflicts = useMemo(
    () => conflicts.filter((c) => c.status === 'active'),
    [conflicts],
  )

  const recentResolved = useMemo(
    () =>
      conflicts
        .filter((c) => c.status === 'resolved' && c.resolvedAt && Date.now() - c.resolvedAt < 300_000)
        .slice(-3),
    [conflicts],
  )

  // Only render when there's something worth showing
  const hasContent = activeConflicts.length > 0 || matrix.sharedFiles > 0
  if (!hasContent) return null

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="rounded-xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.04]">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-sky-400" />
          <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-ghost-text">
            Conflict Detection
          </h3>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="flex items-center gap-4 px-4 py-2.5 border-b border-white/[0.04] bg-white/[0.01]">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-mono text-white/30 uppercase tracking-wider">Files</span>
          <span className="text-xs font-bold tabular-nums text-white/60">{matrix.totalFilesTouched}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-mono text-white/30 uppercase tracking-wider">Shared</span>
          <span className="text-xs font-bold tabular-nums text-amber-400/80">{matrix.sharedFiles}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-mono text-white/30 uppercase tracking-wider">Conflicts</span>
          <span className={`text-xs font-bold tabular-nums ${activeConflicts.length > 0 ? 'text-rose-400' : 'text-emerald-400/60'}`}>
            {activeConflicts.length}
          </span>
        </div>
      </div>

      <div className="p-3 space-y-3">
        {/* Active Conflict Alerts */}
        {activeConflicts.length > 0 && (
          <div className="space-y-2">
            <AnimatePresence mode="popLayout">
              {activeConflicts.map((conflict) => (
                <ConflictCard key={conflict.id} conflict={conflict} />
              ))}
            </AnimatePresence>
          </div>
        )}

        {/* Recently Resolved (faded) */}
        {recentResolved.length > 0 && (
          <div className="space-y-1">
            <span className="text-[10px] font-mono text-white/20 uppercase tracking-wider">
              Recently Resolved
            </span>
            <AnimatePresence>
              {recentResolved.map((conflict) => (
                <ConflictCard key={conflict.id} conflict={conflict} />
              ))}
            </AnimatePresence>
          </div>
        )}

        {/* File Ownership Summary */}
        {matrix.sharedFiles > 0 && (
          <div>
            <span className="text-[10px] font-mono text-white/20 uppercase tracking-wider block mb-1.5">
              Shared Files ({matrix.sharedFiles})
            </span>
            <div className="rounded-lg border border-white/[0.04] bg-white/[0.01] px-3 py-1.5 max-h-[120px] overflow-y-auto">
              {Array.from(matrix.fileMap.entries())
                .filter(([, agents]) => agents.size > 1)
                .slice(0, 15)
                .map(([filePath, agents]) => (
                  <FileOwnershipRow key={filePath} filePath={filePath} agents={agents} />
                ))}
            </div>
          </div>
        )}

        {/* No conflicts state */}
        {activeConflicts.length === 0 && matrix.sharedFiles > 0 && (
          <div className="flex items-center gap-2 px-2 py-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400/50" />
            <span className="text-[11px] text-white/30">
              No active conflicts — {matrix.sharedFiles} shared file{matrix.sharedFiles !== 1 ? 's' : ''} being monitored
            </span>
          </div>
        )}
      </div>
    </motion.div>
  )
}
