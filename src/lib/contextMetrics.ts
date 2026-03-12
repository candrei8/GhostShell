import { ContextMetrics } from './types'

function clampPercentage(value: number): number {
  return Math.max(0, Math.min(100, value))
}

export function getContextUsagePercentage(metrics?: ContextMetrics | null): number | null {
  if (!metrics) return null

  if (typeof metrics.usagePercentage === 'number') {
    return clampPercentage(metrics.usagePercentage)
  }

  if (metrics.maxTokens > 0 && metrics.tokenEstimate > 0) {
    return clampPercentage((metrics.tokenEstimate / metrics.maxTokens) * 100)
  }

  if (metrics.tokenEstimate === 0 && metrics.turnCount === 0 && metrics.costEstimate === 0) {
    return 0
  }

  return null
}

export function hasContextMetrics(metrics?: ContextMetrics | null): boolean {
  if (!metrics) return false
  return (
    metrics.tokenEstimate > 0 ||
    metrics.turnCount > 0 ||
    metrics.costEstimate > 0 ||
    typeof metrics.usagePercentage === 'number'
  )
}
