import { useMemo } from 'react'
import { ContextMetrics } from '../../lib/types'

interface ContextGaugeProps {
  metrics: ContextMetrics
  compact?: boolean
}

function formatTokens(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(0)}k`
  return String(n)
}

function formatCost(n: number): string {
  if (n === 0) return '$0'
  if (n < 0.01) return '<$0.01'
  return `$${n.toFixed(2)}`
}

export function ContextGauge({ metrics, compact = false }: ContextGaugeProps) {
  const pct = useMemo(() => {
    if (metrics.maxTokens === 0) return 0
    return Math.min(100, Math.round((metrics.tokenEstimate / metrics.maxTokens) * 100))
  }, [metrics.tokenEstimate, metrics.maxTokens])

  const barColor = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-yellow-500' : 'bg-ghost-accent'

  if (compact) {
    return (
      <div className="flex items-center gap-2" title={`Context: ${formatTokens(metrics.tokenEstimate)} / ${formatTokens(metrics.maxTokens)} tokens`}>
        <div className="w-12 h-1 rounded-full bg-slate-800 overflow-hidden">
          <div
            className={`h-full rounded-full ${barColor} transition-all duration-500`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-[11px] text-ghost-text-dim font-mono tabular-nums">{pct}%</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-ghost-text-dim uppercase tracking-wider font-medium">Context</span>
        <span className="text-[11px] text-ghost-text-dim font-mono tabular-nums">
          {formatTokens(metrics.tokenEstimate)} / {formatTokens(metrics.maxTokens)}
        </span>
      </div>
      <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
        <div
          className={`h-full rounded-full ${barColor} transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-ghost-text-dim font-mono tabular-nums">
          Turn {metrics.turnCount}
        </span>
        <span className="text-[11px] text-ghost-text-dim font-mono tabular-nums">
          {formatCost(metrics.costEstimate)}
        </span>
      </div>
    </div>
  )
}
