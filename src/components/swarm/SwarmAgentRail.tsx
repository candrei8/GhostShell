// SwarmAgentRail — 48px vertical agent strip on the left edge
// Each agent is a compact icon with role color and status ring

import { useMemo } from 'react'
import type { SwarmAgentState, SwarmRosterAgent, SwarmAgentRole } from '../../lib/swarm-types'
import { getRoleDef } from '../../lib/swarm-types'
import { RoleIcon } from './swarm-icons'

interface AgentDisplay {
  agent: SwarmAgentState
  rosterAgent: SwarmRosterAgent
}

interface SwarmAgentRailProps {
  agents: AgentDisplay[]
  selectedAgentId: string | null
  onSelectAgent: (rosterId: string) => void
}

const STATUS_COLORS: Record<string, string> = {
  waiting:  '#64748b',
  idle:     '#64748b',
  planning: '#fb923c',
  building: '#38bdf8',
  review:   '#c084fc',
  done:     '#34d399',
  error:    '#ef4444',
}

const ACTIVE_STATUSES = new Set(['planning', 'building', 'review'])

export function SwarmAgentRail({ agents, selectedAgentId, onSelectAgent }: SwarmAgentRailProps) {
  return (
    <div
      className="flex flex-col items-center py-2 gap-1 shrink-0 custom-scrollbar"
      style={{
        width: 48,
        borderRight: '1px solid rgba(255,255,255,0.04)',
        background: 'rgba(255,255,255,0.01)',
        overflowY: 'auto',
        overflowX: 'hidden',
      }}
    >
      {agents.map(({ agent, rosterAgent }, idx) => (
        <RailIcon
          key={agent.rosterId}
          agent={agent}
          rosterAgent={rosterAgent}
          index={idx}
          isSelected={selectedAgentId === agent.rosterId}
          onSelect={() => onSelectAgent(agent.rosterId)}
        />
      ))}
    </div>
  )
}

// ─── Individual Rail Icon ────────────────────────────────────

function RailIcon({
  agent, rosterAgent, index, isSelected, onSelect,
}: {
  agent: SwarmAgentState
  rosterAgent: SwarmRosterAgent
  index: number
  isSelected: boolean
  onSelect: () => void
}) {
  const roleDef = useMemo(() => getRoleDef(rosterAgent.role), [rosterAgent.role])
  const statusColor = STATUS_COLORS[agent.status] || STATUS_COLORS.idle
  const isActive = ACTIVE_STATUSES.has(agent.status)
  const agentLabel = rosterAgent.customName || `${roleDef.label} ${index + 1}`

  return (
    <div
      className="relative flex items-center justify-center cursor-pointer group"
      style={{ width: 40, height: 40 }}
      onClick={onSelect}
      title={`${agentLabel} — ${agent.status.toUpperCase()}`}
    >
      {/* Selection indicator (left bar) */}
      {isSelected && (
        <div
          style={{
            position: 'absolute',
            left: -1,
            top: 6,
            bottom: 6,
            width: 2,
            borderRadius: 1,
            background: '#38bdf8',
          }}
        />
      )}

      {/* Agent circle */}
      <div
        className="flex items-center justify-center transition-all duration-200"
        style={{
          width: 32,
          height: 32,
          borderRadius: '50%',
          background: isSelected ? 'rgba(56,189,248,0.12)' : 'rgba(255,255,255,0.04)',
          border: `2px solid ${isSelected ? '#38bdf8' : statusColor}`,
          borderColor: isSelected ? '#38bdf8' : `${statusColor}60`,
        }}
      >
        <RoleIcon iconName={roleDef.icon} className="w-3.5 h-3.5" color={isSelected ? '#38bdf8' : roleDef.color} />
      </div>

      {/* Status dot */}
      <div
        style={{
          position: 'absolute',
          bottom: 4,
          right: 4,
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: statusColor,
          border: '1.5px solid #0a0a0a',
          ...(isActive ? { animation: 'pulse 2s infinite' } : {}),
        }}
      />

      {/* Hover tooltip backdrop */}
      <div
        className="absolute left-full ml-2 px-2 py-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150"
        style={{
          background: 'rgba(10,10,10,0.95)',
          border: '1px solid rgba(255,255,255,0.1)',
          whiteSpace: 'nowrap',
          zIndex: 100,
          fontSize: 10,
          fontFamily: 'monospace',
          color: 'rgba(255,255,255,0.7)',
        }}
      >
        <span style={{ fontWeight: 700, color: 'white' }}>{agentLabel}</span>
        <span style={{ color: statusColor, marginLeft: 6, fontWeight: 600, textTransform: 'uppercase', fontSize: 9, letterSpacing: '0.08em' }}>
          {agent.status}
        </span>
      </div>
    </div>
  )
}
