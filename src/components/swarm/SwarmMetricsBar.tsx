import React from 'react'
import { Zap, Coins, FileText } from 'lucide-react'

// ─── Formatters ─────────────────────────────────────────────

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toString()
}

function formatCost(n: number): string {
  if (n >= 100) return `$${n.toFixed(0)}`
  if (n >= 1) return `$${n.toFixed(2)}`
  return `$${n.toFixed(3)}`
}

// ─── Component ──────────────────────────────────────────────

interface SwarmMetricsBarProps {
  tokens: number
  cost: number
  files: number
}

const SwarmMetricsBar: React.FC<SwarmMetricsBarProps> = ({ tokens, cost, files }) => {
  return (
    <div className="border-t border-white/[0.06] px-3 py-2 flex items-center justify-between shrink-0">
      {/* Tokens */}
      <div className="flex items-center gap-1.5">
        <Zap className="w-3 h-3 text-ghost-text-dim" />
        <span className="text-[10px] text-ghost-text-dim">Tokens</span>
        <span className="text-[10px] tabular-nums font-mono text-ghost-text-dim font-medium">
          {formatTokens(tokens)}
        </span>
      </div>

      <span className="text-ghost-text-dim/30 text-[10px]">|</span>

      {/* Cost */}
      <div className="flex items-center gap-1.5">
        <Coins className="w-3 h-3 text-ghost-text-dim" />
        <span className="text-[10px] text-ghost-text-dim">Cost</span>
        <span className="text-[10px] tabular-nums font-mono text-ghost-text-dim font-medium">
          {formatCost(cost)}
        </span>
      </div>

      <span className="text-ghost-text-dim/30 text-[10px]">|</span>

      {/* Files touched */}
      <div className="flex items-center gap-1.5">
        <FileText className="w-3 h-3 text-ghost-text-dim" />
        <span className="text-[10px] text-ghost-text-dim">Files</span>
        <span className="text-[10px] tabular-nums font-mono text-ghost-text-dim font-medium">
          {files}
        </span>
      </div>
    </div>
  )
}

export default SwarmMetricsBar
