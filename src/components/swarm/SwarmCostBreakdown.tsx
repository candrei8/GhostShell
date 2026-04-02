// SwarmCostBreakdown — Enterprise cost tracking dashboard
// Per-agent cost cards, per-task attribution, budget gauge, provider breakdown, burn rate

import { useMemo } from 'react'
import {
  DollarSign, TrendingUp, AlertTriangle, Users, Zap, Clock,
} from 'lucide-react'
import type { Swarm, SwarmRosterAgent } from '../../lib/swarm-types'
import { getRoleDef } from '../../lib/swarm-types'
import { computeSwarmCost, type SwarmCostEstimate } from '../../lib/swarm-cost-tracker'

// ─── Types ──────────────────────────────────────────────────

interface SwarmCostBreakdownProps {
  swarm: Swarm
}

// ─── Component ──────────────────────────────────────────────

export function SwarmCostBreakdown({ swarm }: SwarmCostBreakdownProps) {
  const rosterMap = useMemo(() =>
    new Map(swarm.config.roster.map((r) => [r.id, r])),
  [swarm.config.roster])

  const cost = useMemo(() => computeSwarmCost(swarm, rosterMap), [swarm, rosterMap])

  return (
    <div className="flex flex-col w-full h-full overflow-y-auto custom-scrollbar" style={{ background: 'rgba(0,0,0,0.15)' }}>
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <DollarSign className="w-4 h-4" style={{ color: '#f59e0b' }} />
        <span style={{ fontSize: 11, fontFamily: 'monospace', fontWeight: 700, color: '#f59e0b' }}>
          Cost Center
        </span>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-2 p-3">
        <CostCard label="COSTO ACTUAL" value={`$${cost.estimatedCostUSD.toFixed(2)}`}
          color={cost.estimatedCostUSD > 10 ? '#ef4444' : cost.estimatedCostUSD > 5 ? '#f59e0b' : '#34d399'} />
        <CostCard label="PROYECTADO" value={`$${cost.projectedTotal.toFixed(2)}`}
          color={cost.projectedTotal > 15 ? '#ef4444' : '#f59e0b'} />
        <CostCard label="BURN RATE" value={`$${cost.burnRatePerMinute.toFixed(3)}/m`}
          color={cost.burnRatePerMinute > 0.5 ? '#ef4444' : '#38bdf8'} />
      </div>

      {/* Token summary */}
      <div className="px-3 mb-3">
        <div className="flex items-center gap-3 px-3 py-2 rounded"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
          <Zap className="w-3 h-3 text-white/20" />
          <span className="text-[9px] font-mono text-white/40">
            {Math.round(cost.totalTokens / 1000)}k tokens totales
          </span>
          <Clock className="w-3 h-3 text-white/20 ml-auto" />
          <span className="text-[9px] font-mono text-white/40">
            {Math.round(cost.elapsedMinutes)}m transcurridos
          </span>
        </div>
      </div>

      {/* Budget gauge */}
      <div className="px-3 mb-3">
        <BudgetGauge current={cost.estimatedCostUSD} projected={cost.projectedTotal} />
      </div>

      {/* Per-agent breakdown */}
      <div className="px-3 mb-3">
        <span className="text-[8px] text-white/20 font-mono uppercase block mb-2 tracking-wider">
          Desglose por Agente ({cost.perAgent.length})
        </span>
        {cost.perAgent.map((agent) => (
          <AgentCostRow key={agent.rosterId} agent={agent} totalCost={cost.estimatedCostUSD} />
        ))}
      </div>

      {/* Provider breakdown */}
      <div className="px-3 mb-3">
        <span className="text-[8px] text-white/20 font-mono uppercase block mb-2 tracking-wider">
          Desglose por Modelo
        </span>
        <ProviderBreakdown perAgent={cost.perAgent} totalCost={cost.estimatedCostUSD} />
      </div>

      {/* Cost efficiency */}
      <div className="px-3 mb-3">
        <span className="text-[8px] text-white/20 font-mono uppercase block mb-2 tracking-wider">
          Eficiencia
        </span>
        <div className="rounded" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.03)' }}>
          <EfficiencyRow label="Costo por tarea"
            value={swarm.tasks.length > 0 ? `$${(cost.estimatedCostUSD / swarm.tasks.length).toFixed(3)}` : '—'} />
          <EfficiencyRow label="Costo por agente"
            value={swarm.agents.length > 0 ? `$${(cost.estimatedCostUSD / swarm.agents.length).toFixed(3)}` : '—'} />
          <EfficiencyRow label="Costo por mensaje"
            value={swarm.messages.length > 0 ? `$${(cost.estimatedCostUSD / swarm.messages.length).toFixed(4)}` : '—'} />
          <EfficiencyRow label="Tokens por minuto"
            value={cost.elapsedMinutes > 0 ? `${Math.round(cost.totalTokens / cost.elapsedMinutes)}` : '—'} />
        </div>
      </div>
    </div>
  )
}

// ─── Sub-components ─────────────────────────────────────────

function CostCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded p-2" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
      <div className="text-[7px] font-mono text-white/20 uppercase tracking-wider mb-1">{label}</div>
      <div className="text-[14px] font-mono font-bold" style={{ color, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
    </div>
  )
}

function BudgetGauge({ current, projected }: { current: number; projected: number }) {
  // Default budget: $20 (configurable in future)
  const budget = 20
  const percent = Math.min(100, (current / budget) * 100)
  const projPercent = Math.min(100, (projected / budget) * 100)
  const isOverBudget = projected > budget
  const isWarning = percent > 60

  return (
    <div className="rounded p-2" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[8px] font-mono text-white/25 uppercase">Budget (${ budget})</span>
        {isOverBudget && (
          <span className="flex items-center gap-1 text-[8px] font-mono" style={{ color: '#ef4444' }}>
            <AlertTriangle className="w-2.5 h-2.5" />
            EXCEDIDO
          </span>
        )}
      </div>
      <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden', position: 'relative' }}>
        {/* Projected (background) */}
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0,
          width: `${projPercent}%`,
          background: isOverBudget ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.1)',
          borderRadius: 3,
        }} />
        {/* Current (foreground) */}
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0,
          width: `${percent}%`,
          background: isOverBudget ? '#ef4444' : isWarning ? '#f59e0b' : '#34d399',
          borderRadius: 3,
          transition: 'width 0.5s ease',
        }} />
      </div>
      <div className="flex items-center justify-between mt-1">
        <span className="text-[8px] font-mono text-white/20">{Math.round(percent)}% usado</span>
        <span className="text-[8px] font-mono" style={{ color: 'rgba(255,255,255,0.15)' }}>
          ~{Math.round(projPercent)}% proyectado
        </span>
      </div>
    </div>
  )
}

function AgentCostRow({ agent, totalCost }: {
  agent: { rosterId: string; label: string; model: string; tokens: number; cost: number }
  totalCost: number
}) {
  const percent = totalCost > 0 ? Math.round((agent.cost / totalCost) * 100) : 0

  return (
    <div
      className="flex items-center gap-2 px-2 py-1.5 mb-0.5 rounded"
      style={{ background: 'rgba(255,255,255,0.01)', borderBottom: '1px solid rgba(255,255,255,0.02)' }}
    >
      <Users className="w-3 h-3 text-white/15 shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="text-[9px] font-mono text-white/50 block truncate">{agent.label}</span>
        <span className="text-[7px] font-mono text-white/20">{agent.model} · {Math.round(agent.tokens / 1000)}k tok</span>
      </div>
      {/* Cost bar */}
      <div style={{ width: 40, height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{
          width: `${percent}%`, height: '100%',
          background: percent > 40 ? '#f59e0b' : '#38bdf8',
        }} />
      </div>
      <span className="text-[9px] font-mono font-bold shrink-0" style={{
        color: agent.cost > 2 ? '#f59e0b' : 'rgba(255,255,255,0.4)',
        fontVariantNumeric: 'tabular-nums', width: 45, textAlign: 'right',
      }}>
        ${agent.cost.toFixed(3)}
      </span>
    </div>
  )
}

function ProviderBreakdown({ perAgent, totalCost }: {
  perAgent: Array<{ model: string; cost: number; tokens: number }>
  totalCost: number
}) {
  // Group by model
  const byModel = new Map<string, { cost: number; tokens: number; count: number }>()
  for (const agent of perAgent) {
    const existing = byModel.get(agent.model)
    if (existing) {
      existing.cost += agent.cost
      existing.tokens += agent.tokens
      existing.count++
    } else {
      byModel.set(agent.model, { cost: agent.cost, tokens: agent.tokens, count: 1 })
    }
  }

  const sorted = Array.from(byModel.entries()).sort((a, b) => b[1].cost - a[1].cost)

  return (
    <div className="rounded" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.03)' }}>
      {sorted.map(([model, data]) => {
        const percent = totalCost > 0 ? Math.round((data.cost / totalCost) * 100) : 0
        return (
          <div key={model} className="flex items-center gap-2 px-2 py-1.5"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
            <span className="text-[9px] font-mono text-white/40 flex-1">{model}</span>
            <span className="text-[8px] font-mono text-white/20">{data.count} agentes</span>
            <span className="text-[8px] font-mono text-white/20">{Math.round(data.tokens / 1000)}k</span>
            <span className="text-[9px] font-mono font-bold" style={{ color: '#f59e0b', fontVariantNumeric: 'tabular-nums' }}>
              ${data.cost.toFixed(2)} ({percent}%)
            </span>
          </div>
        )
      })}
    </div>
  )
}

function EfficiencyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-2 py-1.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
      <span className="text-[9px] font-mono text-white/30">{label}</span>
      <span className="text-[9px] font-mono font-bold text-white/50" style={{ fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  )
}
