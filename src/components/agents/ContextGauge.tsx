import { ContextMetrics, Provider } from '../../lib/types'
import { getContextUsagePercentage } from '../../lib/contextMetrics'
import { getProviderColor } from '../../lib/providers'
import { formatCost, formatTokens } from '../../lib/formatUtils'

interface ContextGaugeProps {
  provider?: Provider
  metrics?: ContextMetrics
  active?: boolean
  onClick?: () => void
}

export function ContextGauge({ provider, metrics, active = false, onClick }: ContextGaugeProps) {
  if (!provider) return null

  const usagePercentage = getContextUsagePercentage(metrics)
  const color = getProviderColor(provider)
  const isHigh = typeof usagePercentage === 'number' && usagePercentage >= 90
  const isWarning = typeof usagePercentage === 'number' && usagePercentage >= 70 && !isHigh
  const statusColor = isHigh ? '#ef4444' : isWarning ? '#f59e0b' : color
  const width = typeof usagePercentage === 'number' ? Math.max(4, usagePercentage) : 8
  const label = typeof usagePercentage === 'number'
    ? `${Math.round(usagePercentage)}%`
    : metrics && (metrics.tokenEstimate > 0 || metrics.turnCount > 0 || metrics.costEstimate > 0)
      ? 'LIVE'
      : 'WAIT'

  const summaryParts: string[] = []
  if (metrics?.tokenEstimate) {
    summaryParts.push(
      metrics.maxTokens > 0
        ? `${formatTokens(metrics.tokenEstimate)}/${formatTokens(metrics.maxTokens)}`
        : formatTokens(metrics.tokenEstimate),
    )
  }
  if (metrics?.turnCount) summaryParts.push(`T${metrics.turnCount}`)
  if (metrics?.costEstimate) summaryParts.push(formatCost(metrics.costEstimate))
  const summary = summaryParts.slice(0, 3).join(' \u00b7 ') || (label === 'WAIT' ? 'Waiting' : 'Streaming')

  const content = (
    <div className="flex items-center gap-2">
      <span className="text-[9px] font-mono font-medium uppercase tracking-wider text-white/30">CTX</span>
      <div className="relative h-1 w-16 overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all duration-500 ease-out"
          style={{
            width: `${width}%`,
            backgroundColor: statusColor,
            boxShadow: `0 0 6px ${statusColor}40`,
          }}
        />
      </div>
      <span className="text-[9px] font-mono text-white/35">{label}</span>
      <span className="hidden xl:inline text-[9px] font-mono text-white/20">{summary}</span>
    </div>
  )

  if (!onClick) {
    return <div className="group flex items-center" title="Terminal context">{content}</div>
  }

  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className={`group flex items-center rounded-md px-1.5 py-1 transition-all ${
        active
          ? 'bg-white/[0.05]'
          : 'hover:bg-white/[0.03]'
      }`}
      title="Toggle context panel"
    >
      {content}
    </button>
  )
}
