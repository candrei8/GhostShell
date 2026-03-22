import React from 'react'
import { AnimatePresence } from 'framer-motion'
import type { EnrichedSwarmAgent } from './SwarmCoordinationBoard'
import type { SwarmRosterAgent } from '../../lib/swarm-types'
import { SwarmAgentRosterCard } from './SwarmAgentRosterCard'
import { useTerminalStore } from '../../stores/terminalStore'
import { useSwarmStore } from '../../stores/swarmStore'

// ─── Props ──────────────────────────────────────────────────

interface SwarmAgentRosterProps {
  agents: EnrichedSwarmAgent[]
  roster: SwarmRosterAgent[]
  agentHealth?: Record<string, { lastSeen: number; status: 'healthy' | 'stale' | 'dead' }>
}

// ─── Component ──────────────────────────────────────────────

export default function SwarmAgentRoster({ agents, roster, agentHealth }: SwarmAgentRosterProps) {
  const handleAgentClick = (terminalId?: string) => {
    if (terminalId) {
      // Switch to terminal view and activate the agent's session
      useSwarmStore.getState().setSwarmViewMode('terminals')
      useTerminalStore.getState().setActiveSession(terminalId)
    }
  }

  return (
    <div className="space-y-2">
      {/* Section Header */}
      <div className="flex items-center gap-2 px-1">
        <span className="text-[10px] font-semibold text-ghost-text-dim uppercase tracking-[0.15em]">
          Agents
        </span>
        <span className="text-[10px] font-medium text-ghost-text-dim tabular-nums">
          {agents.length}
        </span>
      </div>

      {/* Agent Grid (1-column) */}
      <div className="grid grid-cols-1 gap-1.5">
        <AnimatePresence mode="popLayout">
          {agents.map((agent) => {
            const rosterAgent = roster.find((r) => r.id === agent.rosterId)
            if (!rosterAgent) return null

            // Per-role index from roster position
            const globalIdx = roster.indexOf(rosterAgent)
            let roleIdx = 0
            for (let j = 0; j < globalIdx; j++) {
              if (roster[j].role === rosterAgent.role) roleIdx++
            }

            return (
              <SwarmAgentRosterCard
                key={agent.rosterId}
                agent={agent}
                rosterAgent={rosterAgent}
                index={roleIdx}
                health={agent.agentName ? agentHealth?.[agent.agentName] : undefined}
                onClick={() => handleAgentClick(agent.terminalId)}
              />
            )
          })}
        </AnimatePresence>
      </div>
    </div>
  )
}
