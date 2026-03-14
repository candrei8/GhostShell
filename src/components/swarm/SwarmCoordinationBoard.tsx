import React, { useEffect, useMemo, useState } from 'react'
import { Network, AlertTriangle } from 'lucide-react'
import { useSwarmStore } from '../../stores/swarmStore'
import { useActivityStore } from '../../stores/activityStore'
import { useAgentStore } from '../../stores/agentStore'
import type { SwarmAgentState } from '../../lib/swarm-types'
import type { AgentActivity, ContextMetrics, SubAgent } from '../../lib/types'
import SwarmHeader from './SwarmHeader'
import SwarmMissionCard from './SwarmMissionCard'
import SwarmStatusTimeline from './SwarmStatusTimeline'
import SwarmAgentRoster from './SwarmAgentRoster'
import SwarmTaskQueue from './SwarmTaskQueue'
import SwarmMessageFeed from './SwarmMessageFeed'
import SwarmMetricsBar from './SwarmMetricsBar'
import { SwarmTopology } from './SwarmTopology'
import { SwarmDelegationTree } from './SwarmDelegationTree'
import { SwarmOperatorInbox } from './SwarmOperatorInbox'
import { SwarmTaskDAG } from './SwarmTaskDAG'

// ─── Enriched Agent Type ─────────────────────────────────────

export interface EnrichedSwarmAgent extends SwarmAgentState {
  agentName?: string
  currentActivity?: AgentActivity['currentActivity']
  contextMetrics?: ContextMetrics
  subAgents?: SubAgent[]
}

// ─── Empty State ─────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 px-6">
      <div
        className="flex items-center justify-center w-16 h-16 rounded-2xl border border-dashed border-white/10 bg-white/[0.03]"
        style={{ backdropFilter: 'blur(12px)' }}
      >
        <Network className="w-8 h-8 text-ghost-text-dim" />
      </div>

      <div className="text-center space-y-1">
        <p className="text-sm font-medium text-ghost-text">No active swarm</p>
        <p className="text-2xs text-ghost-text-dim">
          Launch a coordinated group of agents to tackle complex tasks together.
        </p>
      </div>

      <button
        onClick={() => useSwarmStore.getState().openWizard()}
        className="px-4 py-1.5 text-xs font-medium rounded-md bg-sky-400 text-white hover:bg-sky-500 transition-colors"
      >
        Create Swarm
      </button>
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────

export default function SwarmCoordinationBoard() {
  const swarm = useSwarmStore((s) => s.getActiveSwarm())
  const agentHealth = useSwarmStore((s) => s.agentHealth)
  const operatorMessages = useSwarmStore((s) => s.operatorMessages)
  const activities = useActivityStore((s) => s.activities)
  const agents = useAgentStore((s) => s.agents)

  // Live timer for durations
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    if (!swarm) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [swarm?.id])

  // Enrich swarm agents with activity data
  const enrichedAgents = useMemo<EnrichedSwarmAgent[]>(() => {
    if (!swarm) return []

    return swarm.agents.map((sa) => {
      const storeAgent = sa.agentId
        ? agents.find((a) => a.id === sa.agentId)
        : undefined
      const activity = sa.agentId ? activities[sa.agentId] : undefined

      return {
        ...sa,
        agentName: storeAgent?.name,
        currentActivity: activity?.currentActivity,
        contextMetrics: activity?.contextMetrics,
        subAgents: activity?.subAgents,
      }
    })
  }, [swarm?.agents, agents, activities])

  // Aggregate metrics
  const { totalTokens, totalCost, filesOwned } = useMemo(() => {
    if (!swarm) return { totalTokens: 0, totalCost: 0, filesOwned: 0 }

    let tokens = 0
    let cost = 0
    const ownedFilesSet = new Set<string>()

    for (const ea of enrichedAgents) {
      if (ea.contextMetrics) {
        tokens += ea.contextMetrics.tokenEstimate || 0
        cost += ea.contextMetrics.costEstimate || 0
      }
      for (const f of ea.filesOwned) {
        ownedFilesSet.add(f)
      }
    }

    return {
      totalTokens: tokens,
      totalCost: cost,
      filesOwned: ownedFilesSet.size,
    }
  }, [enrichedAgents])

  // ── Empty state ──
  if (!swarm) {
    return (
      <div className="flex flex-col h-full bg-transparent">
        <EmptyState />
      </div>
    )
  }

  const handleRetry = () => {
    useSwarmStore.getState().setSwarmStatus(swarm.id, 'launching')
  }

  // ── Active swarm ──
  return (
    <div className="flex flex-col h-full bg-transparent">
      <SwarmHeader swarm={swarm} now={now} />

      <div className="flex-1 overflow-y-auto sidebar-scroll space-y-3 p-3">
        {/* Error state banner */}
        {swarm.status === 'error' && (
          <div className="rounded-xl border border-rose-300/20 bg-rose-400/10 px-3 py-2">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 text-rose-100 shrink-0" />
              <span className="text-xs text-rose-100">Swarm failed to launch. Check agent terminals for errors.</span>
            </div>
            <button onClick={handleRetry} className="mt-2 text-[10px] text-rose-200 hover:text-white underline">
              Retry
            </button>
          </div>
        )}

        <SwarmMissionCard mission={swarm.config.mission} roster={swarm.config.roster} />
        <SwarmDelegationTree
          agents={swarm.agents}
          roster={swarm.config.roster}
          messages={swarm.messages}
          tasks={swarm.tasks}
          agentHealth={swarm.id ? agentHealth[swarm.id] : undefined}
        />
        <SwarmStatusTimeline status={swarm.status} tasks={swarm.tasks} startedAt={swarm.startedAt} />
        <SwarmAgentRoster agents={enrichedAgents} roster={swarm.config.roster} agentHealth={swarm.id ? agentHealth[swarm.id] : undefined} />
        {swarm.tasks.length > 0 && <SwarmTaskDAG tasks={swarm.tasks} />}
        <SwarmTaskQueue tasks={swarm.tasks} />
        {operatorMessages.length > 0 && <SwarmOperatorInbox messages={operatorMessages} swarmRoot={swarm.swarmRoot} />}
        <SwarmMessageFeed messages={swarm.messages} />
      </div>

      <SwarmMetricsBar tokens={totalTokens} cost={totalCost} files={filesOwned} />
    </div>
  )
}
