// SwarmIntelligenceBar — Slim 32px horizontal bar showing system health at a glance
// 4 sections: Conflicts | CI Status | Approval Queue | Cost & Time

import { useMemo } from 'react'
import {
  AlertTriangle, CheckCircle, XCircle, Shield, Clock, DollarSign,
} from 'lucide-react'
import { useSwarmStore } from '../../stores/swarmStore'
import type { Swarm } from '../../lib/swarm-types'

// ─── Types ──────────────────────────────────────────────────

interface SwarmIntelligenceBarProps {
  swarm: Swarm
}

// ─── Component ──────────────────────────────────────────────

export function SwarmIntelligenceBar({ swarm }: SwarmIntelligenceBarProps) {
  const conflicts = useSwarmStore((s) => s.conflicts)
  const ciPipelines = useSwarmStore((s) => s.ciPipelines)
  const approvalQueue = useSwarmStore((s) => s.approvalQueue)
  const resolveApproval = useSwarmStore((s) => s.resolveApproval)

  // Active conflicts for this swarm
  const activeConflicts = useMemo(() =>
    conflicts.filter((c) => c.swarmId === swarm.id && c.status === 'active'),
  [conflicts, swarm.id])

  const criticalCount = activeConflicts.filter((c) => c.severity === 'critical').length
  const warningCount = activeConflicts.length - criticalCount

  // CI status aggregation
  const ciStatus = useMemo(() => {
    const pipelines = Object.values(ciPipelines).filter((p) => p.swarmId === swarm.id)
    if (pipelines.length === 0) return { total: 0, passed: 0, failed: 0, running: 0 }
    let passed = 0, failed = 0, running = 0
    for (const p of pipelines) {
      for (const c of p.checks) {
        if (c.status === 'passed') passed++
        else if (c.status === 'failed') failed++
        else if (c.status === 'running') running++
      }
    }
    return { total: passed + failed + running, passed, failed, running }
  }, [ciPipelines, swarm.id])

  // Pending approvals
  const pendingApprovals = useMemo(() =>
    approvalQueue.filter((a) => a.status === 'pending'),
  [approvalQueue])

  // Elapsed time
  const elapsed = swarm.startedAt ? (Date.now() - swarm.startedAt) / 60000 : 0
  const elapsedStr = elapsed < 60
    ? `${Math.round(elapsed)}m`
    : `${Math.floor(elapsed / 60)}h${Math.round(elapsed % 60)}m`

  // Predicted remaining
  const predicted = swarm.simulation?.predictedDuration
  const remaining = predicted && predicted > elapsed
    ? `~${Math.round(predicted - elapsed)}m restante`
    : null

  // Cost estimate (rough: tokens × pricing)
  const totalTokens = useMemo(() => {
    let sum = 0
    for (const agent of swarm.agents) {
      const metrics = (agent as unknown as { metrics?: { totalTokens?: number } }).metrics
      if (metrics?.totalTokens) sum += metrics.totalTokens
    }
    return sum
  }, [swarm.agents])

  // Rough cost: assume average $5/MTok (blended input/output)
  const estimatedCost = (totalTokens / 1_000_000) * 5

  return (
    <div
      className="flex items-center shrink-0 px-3 gap-1 overflow-x-auto"
      style={{
        height: 30,
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        background: 'rgba(255,255,255,0.01)',
        fontSize: 9,
        fontFamily: 'monospace',
      }}
    >
      {/* ─── Conflicts ────────────────────────────────── */}
      <Section>
        <AlertTriangle
          className="w-3 h-3 shrink-0"
          style={{ color: criticalCount > 0 ? '#ef4444' : warningCount > 0 ? '#f59e0b' : 'rgba(255,255,255,0.2)' }}
        />
        {activeConflicts.length === 0 ? (
          <span style={{ color: 'rgba(255,255,255,0.25)' }}>Sin conflictos</span>
        ) : (
          <>
            {criticalCount > 0 && (
              <Badge color="#ef4444">{criticalCount} CRIT</Badge>
            )}
            {warningCount > 0 && (
              <Badge color="#f59e0b">{warningCount} WARN</Badge>
            )}
            <span style={{ color: 'rgba(255,255,255,0.3)' }}>
              {activeConflicts[0]?.filePath.split('/').pop()}
              {activeConflicts.length > 1 && ` +${activeConflicts.length - 1}`}
            </span>
          </>
        )}
      </Section>

      <Divider />

      {/* ─── CI Status ────────────────────────────────── */}
      <Section>
        {ciStatus.total === 0 ? (
          <>
            <CheckCircle className="w-3 h-3 shrink-0" style={{ color: 'rgba(255,255,255,0.15)' }} />
            <span style={{ color: 'rgba(255,255,255,0.2)' }}>CI —</span>
          </>
        ) : ciStatus.failed > 0 ? (
          <>
            <XCircle className="w-3 h-3 shrink-0" style={{ color: '#ef4444' }} />
            <Badge color="#ef4444">{ciStatus.failed} fail</Badge>
            {ciStatus.passed > 0 && <Badge color="#34d399">{ciStatus.passed} pass</Badge>}
          </>
        ) : ciStatus.running > 0 ? (
          <>
            <CheckCircle className="w-3 h-3 shrink-0" style={{ color: '#38bdf8' }} />
            <Badge color="#38bdf8">{ciStatus.running} running</Badge>
            <Badge color="#34d399">{ciStatus.passed} pass</Badge>
          </>
        ) : (
          <>
            <CheckCircle className="w-3 h-3 shrink-0" style={{ color: '#34d399' }} />
            <Badge color="#34d399">{ciStatus.passed} pass</Badge>
          </>
        )}
      </Section>

      <Divider />

      {/* ─── Approvals ────────────────────────────────── */}
      <Section>
        <Shield
          className="w-3 h-3 shrink-0"
          style={{ color: pendingApprovals.length > 0 ? '#f59e0b' : 'rgba(255,255,255,0.15)' }}
        />
        {pendingApprovals.length === 0 ? (
          <span style={{ color: 'rgba(255,255,255,0.2)' }}>0 pendientes</span>
        ) : (
          <>
            <Badge color="#f59e0b">{pendingApprovals.length} pendiente{pendingApprovals.length > 1 ? 's' : ''}</Badge>
            {pendingApprovals.slice(0, 2).map((a) => (
              <span key={a.id} className="flex items-center gap-0.5">
                <span style={{ color: 'rgba(255,255,255,0.35)' }}>{a.action}</span>
                <button
                  onClick={() => resolveApproval(a.id, true)}
                  className="px-1 rounded hover:bg-emerald-500/20 transition-colors"
                  style={{ color: '#34d399', cursor: 'pointer', fontWeight: 700 }}
                >
                  ✓
                </button>
                <button
                  onClick={() => resolveApproval(a.id, false)}
                  className="px-1 rounded hover:bg-red-500/20 transition-colors"
                  style={{ color: '#ef4444', cursor: 'pointer', fontWeight: 700 }}
                >
                  ✗
                </button>
              </span>
            ))}
          </>
        )}
      </Section>

      <Divider />

      {/* ─── Cost & Time ──────────────────────────────── */}
      <Section>
        <Clock className="w-3 h-3 shrink-0" style={{ color: 'rgba(255,255,255,0.25)' }} />
        <span style={{ color: 'rgba(255,255,255,0.5)', fontWeight: 700 }}>{elapsedStr}</span>
        {remaining && (
          <span style={{ color: 'rgba(255,255,255,0.2)' }}>{remaining}</span>
        )}
        <Divider />
        <DollarSign className="w-3 h-3 shrink-0" style={{ color: 'rgba(255,255,255,0.2)' }} />
        <span style={{ color: estimatedCost > 10 ? '#f59e0b' : 'rgba(255,255,255,0.4)', fontWeight: 600 }}>
          ${estimatedCost.toFixed(2)}
        </span>
        <span style={{ color: 'rgba(255,255,255,0.15)' }}>
          ({Math.round(totalTokens / 1000)}k tok)
        </span>
      </Section>
    </div>
  )
}

// ─── Sub-components ─────────────────────────────────────────

function Section({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      {children}
    </div>
  )
}

function Divider() {
  return <div className="w-px h-3 mx-1 shrink-0" style={{ background: 'rgba(255,255,255,0.08)' }} />
}

function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span
      className="px-1 py-px rounded shrink-0"
      style={{
        background: `${color}15`,
        color,
        fontWeight: 700,
        fontSize: 8,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
      }}
    >
      {children}
    </span>
  )
}
