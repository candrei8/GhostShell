// SwarmApprovalQueue — pending approval requests during a running swarm (B11)
// Shows actions that triggered autonomy gates, allowing operator to approve/deny.
// Glass UI, no gradients, no glows.

import { useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ShieldAlert,
  Check,
  X,
  Clock,
  CheckCircle2,
  XCircle,
  Trash2,
  Settings,
  Package,
  Database,
  GitBranch,
  Code2,
} from 'lucide-react'
import { useSwarmStore } from '../../stores/swarmStore'
import type { ApprovalRequest } from '../../lib/swarm-types'

// ─── Icon mapping ───────────────────────────────────────────

const ICON_MAP: Record<string, React.FC<{ className?: string }>> = {
  Trash2,
  Settings,
  Package,
  Database,
  GitBranch,
  Code2,
}

function RuleIcon({ iconName, className }: { iconName: string; className?: string }) {
  const Icon = ICON_MAP[iconName]
  if (!Icon) return <ShieldAlert className={className} />
  return <Icon className={className} />
}

// ─── Helpers ────────────────────────────────────────────────

function elapsedSince(ts: number): string {
  const elapsed = Math.floor((Date.now() - ts) / 1000)
  if (elapsed < 60) return `${elapsed}s`
  const mins = Math.floor(elapsed / 60)
  return `${mins}m`
}

// ─── Approval Card ──────────────────────────────────────────

function ApprovalCard({
  request,
  onResolve,
}: {
  request: ApprovalRequest
  onResolve: (id: string, approved: boolean) => void
}) {
  const isPending = request.status === 'pending'

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.15 }}
      className={`rounded-lg border p-3 transition-colors ${
        isPending
          ? 'border-amber-400/20 bg-amber-400/[0.03]'
          : request.status === 'approved'
            ? 'border-emerald-400/10 bg-emerald-400/[0.02] opacity-50'
            : 'border-rose-400/10 bg-rose-400/[0.02] opacity-50'
      }`}
    >
      {/* Header: agent + rule */}
      <div className="flex items-center gap-2 mb-1.5">
        <RuleIcon
          iconName={request.rule.icon}
          className="w-3.5 h-3.5 flex-shrink-0"
        />
        <span className="text-[11px] font-semibold text-ghost-text/80">
          {request.agentLabel}
        </span>
        <span
          className="text-[9px] font-mono px-1.5 py-0.5 rounded"
          style={{
            backgroundColor: request.rule.color + '15',
            color: request.rule.color,
          }}
        >
          {request.rule.name}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <Clock className="w-2.5 h-2.5 text-ghost-text-dim/25" />
          <span className="text-[9px] text-ghost-text-dim/30 tabular-nums">
            {elapsedSince(request.requestedAt)}
          </span>
        </div>
      </div>

      {/* Action detail */}
      <div className="text-[11px] text-ghost-text-dim/60 mb-2 leading-relaxed">
        <span className="text-ghost-text-dim/40">Action: </span>
        {request.action}
        {request.detail && (
          <>
            <br />
            <span className="text-ghost-text-dim/40">Detail: </span>
            <span className="font-mono text-[10px]">{request.detail}</span>
          </>
        )}
      </div>

      {/* Actions or status */}
      {isPending ? (
        <div className="flex items-center gap-2">
          <button
            onClick={() => onResolve(request.id, true)}
            className="h-6 px-3 rounded border border-emerald-400/25 bg-emerald-400/8 text-[10px] font-semibold uppercase tracking-wider text-emerald-400 hover:bg-emerald-400/15 transition-colors flex items-center gap-1"
          >
            <Check className="w-3 h-3" />
            Approve
          </button>
          <button
            onClick={() => onResolve(request.id, false)}
            className="h-6 px-3 rounded border border-rose-400/25 bg-rose-400/8 text-[10px] font-semibold uppercase tracking-wider text-rose-400 hover:bg-rose-400/15 transition-colors flex items-center gap-1"
          >
            <X className="w-3 h-3" />
            Deny
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-1.5">
          {request.status === 'approved' ? (
            <CheckCircle2 className="w-3 h-3 text-emerald-400/60" />
          ) : (
            <XCircle className="w-3 h-3 text-rose-400/60" />
          )}
          <span className={`text-[10px] font-medium ${
            request.status === 'approved' ? 'text-emerald-400/50' : 'text-rose-400/50'
          }`}>
            {request.status === 'approved' ? 'Approved' : 'Denied'}
            {request.resolvedBy && ` by ${request.resolvedBy}`}
          </span>
        </div>
      )}
    </motion.div>
  )
}

// ─── Main Component ─────────────────────────────────────────

interface SwarmApprovalQueueProps {
  swarmId: string
}

export function SwarmApprovalQueue({ swarmId }: SwarmApprovalQueueProps) {
  // Subscribe to tick for elapsed time refresh
  useSwarmStore((s) => s.tick)

  const approvalQueue = useSwarmStore((s) => s.approvalQueue)
  const resolveApproval = useSwarmStore((s) => s.resolveApproval)

  // Filter to this swarm's requests
  const swarmRequests = useMemo(
    () => approvalQueue.filter((req) => req.swarmId === swarmId),
    [approvalQueue, swarmId],
  )

  const pendingRequests = useMemo(
    () => swarmRequests.filter((req) => req.status === 'pending'),
    [swarmRequests],
  )

  const resolvedRequests = useMemo(
    () =>
      swarmRequests
        .filter((req) => req.status !== 'pending')
        .sort((a, b) => (b.resolvedAt || 0) - (a.resolvedAt || 0))
        .slice(0, 10), // Show last 10 resolved
    [swarmRequests],
  )

  const handleResolve = useCallback(
    (id: string, approved: boolean) => {
      resolveApproval(id, approved)
    },
    [resolveApproval],
  )

  // Don't render if there are no requests at all
  if (swarmRequests.length === 0) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="rounded-xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-2.5 border-b border-white/[0.04]">
        <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ghost-text-dim/60">
          Approval Queue
        </span>
        {pendingRequests.length > 0 && (
          <span className="ml-auto flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-400/10 text-amber-400 animate-pulse">
            {pendingRequests.length} pending
          </span>
        )}
        {pendingRequests.length === 0 && swarmRequests.length > 0 && (
          <span className="ml-auto text-[9px] text-ghost-text-dim/30">
            All resolved
          </span>
        )}
      </div>

      <div className="px-4 py-3 flex flex-col gap-2">
        {/* Pending requests */}
        <AnimatePresence>
          {pendingRequests.map((req) => (
            <ApprovalCard
              key={req.id}
              request={req}
              onResolve={handleResolve}
            />
          ))}
        </AnimatePresence>

        {/* Empty state for pending */}
        {pendingRequests.length === 0 && (
          <div className="flex items-center gap-2 py-2 justify-center">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400/30" />
            <span className="text-[10px] text-ghost-text-dim/30">
              No pending approvals
            </span>
          </div>
        )}

        {/* Recent resolved requests (faded) */}
        {resolvedRequests.length > 0 && (
          <div className="mt-1 pt-2 border-t border-white/[0.04]">
            <span className="text-[9px] text-ghost-text-dim/20 uppercase tracking-widest mb-1.5 block">
              Recently Resolved
            </span>
            <div className="flex flex-col gap-1.5">
              {resolvedRequests.map((req) => (
                <ApprovalCard
                  key={req.id}
                  request={req}
                  onResolve={handleResolve}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  )
}
