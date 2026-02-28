/**
 * Shared formatting utilities for Mission Control and agent components.
 */

export function formatDuration(startMs: number, endMs?: number): string {
  const elapsed = (endMs || Date.now()) - startMs
  if (elapsed < 1000) return '<1s'
  if (elapsed < 60000) return `${Math.round(elapsed / 1000)}s`
  if (elapsed < 3600000) {
    const mins = Math.floor(elapsed / 60000)
    const secs = Math.round((elapsed % 60000) / 1000)
    return `${mins}m${secs.toString().padStart(2, '0')}s`
  }
  const hrs = Math.floor(elapsed / 3600000)
  const mins = Math.floor((elapsed % 3600000) / 60000)
  return `${hrs}h${mins.toString().padStart(2, '0')}m`
}

export function formatTokens(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(0)}k`
  return String(n)
}

export function formatCost(n: number): string {
  if (n === 0) return '$0.00'
  if (n < 0.01) return '<$0.01'
  return `$${n.toFixed(2)}`
}

export function smartTruncatePath(path: string, maxLen: number): string {
  if (path.length <= maxLen) return path
  const normalized = path.replace(/\\/g, '/')
  const parts = normalized.split('/')
  if (parts.length <= 2) return normalized.slice(0, maxLen - 1) + '\u2026'
  const fileName = parts[parts.length - 1]
  const firstDir = parts[0]
  const result = `${firstDir}/\u2026/${fileName}`
  if (result.length <= maxLen) return result
  if (fileName.length <= maxLen) return fileName
  return fileName.slice(0, maxLen - 1) + '\u2026'
}
