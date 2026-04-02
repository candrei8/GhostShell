// swarm-cost-tracker — Real-time cost estimation for swarm execution
// Tracks per-agent, per-model token consumption and projects total cost

import type { Swarm, SwarmAgentState, SwarmRosterAgent } from './swarm-types'

// ─── Pricing Table (USD per million tokens) ─────────────────

interface ModelPricing {
  input: number   // $/MTok input
  output: number  // $/MTok output
  label: string
}

const MODEL_PRICING: Record<string, ModelPricing> = {
  // Claude models
  'claude-opus-4-6':          { input: 15, output: 75, label: 'Opus 4.6' },
  'claude-sonnet-4-6':        { input: 3, output: 15, label: 'Sonnet 4.6' },
  'claude-haiku-4-5-20251001': { input: 0.25, output: 1.25, label: 'Haiku 4.5' },
  // Gemini models
  'gemini-3.1-pro-preview':   { input: 1.25, output: 5, label: 'Gemini 3.1 Pro' },
  'pro':                      { input: 1.25, output: 5, label: 'Gemini Pro' },
  'flash':                    { input: 0.075, output: 0.3, label: 'Gemini Flash' },
  'flash-lite':               { input: 0.02, output: 0.08, label: 'Flash Lite' },
  // Codex models
  'gpt-5.3-codex':            { input: 2, output: 8, label: 'GPT-5.3 Codex' },
  'gpt-5.3-codex-spark':      { input: 0.5, output: 2, label: 'Codex Spark' },
  'gpt-5.2-codex':            { input: 2, output: 8, label: 'GPT-5.2 Codex' },
  'o3':                       { input: 10, output: 40, label: 'o3' },
}

// Default blended rate when model is unknown
const DEFAULT_PRICING: ModelPricing = { input: 3, output: 12, label: 'Unknown' }

// ─── Types ──────────────────────────────────────────────────

export interface AgentCostBreakdown {
  rosterId: string
  label: string
  model: string
  tokens: number
  estimatedInput: number   // tokens (approximate: 80% of total)
  estimatedOutput: number  // tokens (approximate: 20% of total)
  cost: number             // USD
}

export interface SwarmCostEstimate {
  totalTokens: number
  estimatedCostUSD: number
  perAgent: AgentCostBreakdown[]
  burnRatePerMinute: number   // USD/min
  projectedTotal: number      // USD (based on burn rate × predicted remaining)
  elapsedMinutes: number
}

// ─── Main Function ──────────────────────────────────────────

export function computeSwarmCost(
  swarm: Swarm,
  rosterMap: Map<string, SwarmRosterAgent>,
): SwarmCostEstimate {
  const now = Date.now()
  const elapsedMs = swarm.startedAt ? now - swarm.startedAt : 0
  const elapsedMin = elapsedMs / 60000

  const perAgent: AgentCostBreakdown[] = []
  let totalTokens = 0
  let totalCost = 0

  for (const agent of swarm.agents) {
    const roster = rosterMap.get(agent.rosterId)
    const model = (roster as unknown as { model?: string })?.model || 'claude-sonnet-4-6'
    const pricing = MODEL_PRICING[model] || DEFAULT_PRICING

    // Extract token count from agent metrics
    const metrics = (agent as unknown as { metrics?: { totalTokens?: number } }).metrics
    const tokens = metrics?.totalTokens || 0

    // Approximate input/output split (typically 80/20 for coding agents)
    const inputTokens = Math.round(tokens * 0.8)
    const outputTokens = tokens - inputTokens

    const cost = (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output

    const roleDef = roster ? roster.role : 'custom'
    const label = roster?.customName || `${roleDef} ${perAgent.length + 1}`

    perAgent.push({
      rosterId: agent.rosterId,
      label,
      model: pricing.label,
      tokens,
      estimatedInput: inputTokens,
      estimatedOutput: outputTokens,
      cost,
    })

    totalTokens += tokens
    totalCost += cost
  }

  // Burn rate
  const burnRate = elapsedMin > 0.5 ? totalCost / elapsedMin : 0

  // Projected total
  const predicted = swarm.simulation?.predictedDuration
  const remainingMin = predicted && predicted > elapsedMin
    ? predicted - elapsedMin
    : elapsedMin * 0.2 // assume 20% more if no prediction
  const projectedTotal = totalCost + burnRate * remainingMin

  return {
    totalTokens,
    estimatedCostUSD: totalCost,
    perAgent: perAgent.sort((a, b) => b.cost - a.cost),
    burnRatePerMinute: burnRate,
    projectedTotal,
    elapsedMinutes: elapsedMin,
  }
}

// ─── Utility: Get pricing for a model ───────────────────────

export function getModelPricing(model: string): ModelPricing {
  return MODEL_PRICING[model] || DEFAULT_PRICING
}

export function getAllModelPricing(): Record<string, ModelPricing> {
  return { ...MODEL_PRICING }
}
