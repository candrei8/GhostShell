// SwarmRightPanel — 260px fixed right panel
// Agent Detail + Agent Roster + Quick Actions

import { useState, useMemo, useCallback } from 'react'
import {
  Terminal, ChevronRight, ChevronDown, ChevronUp,
  Send, FileText, MessageSquare, Users, Radio,
} from 'lucide-react'
import type {
  SwarmAgentState, SwarmRosterAgent, SwarmMessage, Swarm,
} from '../../lib/swarm-types'
import { getRoleDef } from '../../lib/swarm-types'
import { RoleIcon } from './swarm-icons'
import { operatorBroadcast, operatorMessageAgent } from '../../lib/swarm-operator'
import { SwarmConversationPanel } from './SwarmConversationPanel'
import type { SelectedEdge } from './SwarmInteractiveGraph'

// ─── Types ──────────────────────────────────────────────────

interface AgentDisplay {
  agent: SwarmAgentState
  rosterAgent: SwarmRosterAgent
}

interface SwarmRightPanelProps {
  swarm: Swarm
  agents: AgentDisplay[]
  selectedAgentId: string | null
  selectedEdge: SelectedEdge | null
  onSelectAgent: (rosterId: string) => void
  onClearEdge: () => void
  onJumpToTerminal: (terminalId: string) => void
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

// ─── Main Panel ─────────────────────────────────────────────

export function SwarmRightPanel({
  swarm, agents, selectedAgentId, selectedEdge, onSelectAgent, onClearEdge, onJumpToTerminal,
}: SwarmRightPanelProps) {
  const selectedAgent = useMemo(() => {
    if (!selectedAgentId) return null
    const found = agents.find((d) => d.agent.rosterId === selectedAgentId)
    return found || null
  }, [agents, selectedAgentId])

  // Resolve edge agents for conversation panel
  const edgeAgents = useMemo(() => {
    if (!selectedEdge) return null
    const resolve = (rosterId: string) => {
      const idx = agents.findIndex((d) => d.agent.rosterId === rosterId)
      if (idx === -1) return null
      const { rosterAgent } = agents[idx]
      const roleDef = getRoleDef(rosterAgent.role)
      return {
        rosterId,
        label: rosterAgent.customName || `${roleDef.label} ${idx + 1}`,
        role: roleDef.label,
        color: roleDef.color,
      }
    }
    const a = resolve(selectedEdge.a)
    const b = resolve(selectedEdge.b)
    if (!a || !b) return null
    return { a, b }
  }, [selectedEdge, agents])

  const [rosterCollapsed, setRosterCollapsed] = useState(false)
  const [actionsCollapsed, setActionsCollapsed] = useState(true)

  return (
    <div
      className="flex flex-col shrink-0 custom-scrollbar"
      style={{
        width: 260,
        borderLeft: '1px solid rgba(255,255,255,0.04)',
        background: 'rgba(255,255,255,0.01)',
        overflowY: 'auto',
        overflowX: 'hidden',
      }}
    >
      {/* Conversation Panel (when edge selected) */}
      {selectedEdge && edgeAgents ? (
        <SwarmConversationPanel
          agentA={edgeAgents.a}
          agentB={edgeAgents.b}
          messages={swarm.messages}
          onClose={onClearEdge}
        />
      ) : selectedAgent ? (
        <AgentDetail
          agent={selectedAgent.agent}
          rosterAgent={selectedAgent.rosterAgent}
          index={agents.findIndex((d) => d.agent.rosterId === selectedAgentId)}
          messages={swarm.messages}
          onJumpToTerminal={onJumpToTerminal}
        />
      ) : null}

      {/* Agent Roster */}
      <SectionHeader
        label="AGENTS"
        count={agents.length}
        collapsed={rosterCollapsed}
        onToggle={() => setRosterCollapsed(!rosterCollapsed)}
      />
      {!rosterCollapsed && (
        <div className="flex flex-col">
          {agents.map(({ agent, rosterAgent }, idx) => (
            <AgentRow
              key={agent.rosterId}
              agent={agent}
              rosterAgent={rosterAgent}
              index={idx}
              isSelected={selectedAgentId === agent.rosterId}
              onSelect={() => onSelectAgent(agent.rosterId)}
            />
          ))}
        </div>
      )}

      {/* Quick Actions */}
      <SectionHeader
        label="QUICK ACTIONS"
        collapsed={actionsCollapsed}
        onToggle={() => setActionsCollapsed(!actionsCollapsed)}
      />
      {!actionsCollapsed && (
        <QuickActions swarm={swarm} agents={agents} selectedAgentId={selectedAgentId} />
      )}
    </div>
  )
}

// ─── Section Header ─────────────────────────────────────────

function SectionHeader({ label, count, collapsed, onToggle }: {
  label: string; count?: number; collapsed: boolean; onToggle: () => void
}) {
  return (
    <div
      className="flex items-center justify-between px-3 py-2 cursor-pointer select-none hover:bg-white/[0.02] transition-colors"
      style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
      onClick={onToggle}
    >
      <div className="flex items-center gap-2">
        <span style={{ fontSize: 9, fontFamily: 'monospace', fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
          {label}
        </span>
        {count !== undefined && (
          <span style={{ fontSize: 9, fontFamily: 'monospace', color: 'rgba(255,255,255,0.15)', fontVariantNumeric: 'tabular-nums' }}>
            {count}
          </span>
        )}
      </div>
      {collapsed ? (
        <ChevronRight className="w-3 h-3" style={{ color: 'rgba(255,255,255,0.2)' }} />
      ) : (
        <ChevronDown className="w-3 h-3" style={{ color: 'rgba(255,255,255,0.2)' }} />
      )}
    </div>
  )
}

// ─── Agent Detail ───────────────────────────────────────────

function AgentDetail({ agent, rosterAgent, index, messages, onJumpToTerminal }: {
  agent: SwarmAgentState
  rosterAgent: SwarmRosterAgent
  index: number
  messages: SwarmMessage[]
  onJumpToTerminal: (terminalId: string) => void
}) {
  const roleDef = getRoleDef(rosterAgent.role)
  const statusColor = STATUS_COLORS[agent.status] || STATUS_COLORS.idle
  const agentLabel = rosterAgent.customName || `${roleDef.label} ${index + 1}`
  const ctxPercent = Math.min(100, Math.max(0,
    Math.floor(((agent as unknown as { metrics?: { totalTokens?: number } }).metrics?.totalTokens || 0) / 128000 * 100)
  ))
  const msgsSent = messages.filter(m => m.from === agentLabel).length
  const msgsRecv = messages.filter(m => m.to === agentLabel || m.to === '@all').length

  return (
    <div style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', padding: 12 }}>
      {/* Header row */}
      <div className="flex items-center gap-2 mb-2">
        <div
          className="flex items-center justify-center shrink-0"
          style={{ width: 28, height: 28, borderRadius: '50%', background: `${roleDef.color}15`, border: `1.5px solid ${roleDef.color}40` }}
        >
          <RoleIcon iconName={roleDef.icon} className="w-3.5 h-3.5" color={roleDef.color} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-bold text-white truncate">{agentLabel}</div>
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] font-mono" style={{ color: roleDef.color, textTransform: 'uppercase', fontWeight: 600 }}>{roleDef.label}</span>
            <span className="text-[9px] text-white/20 font-mono">{rosterAgent.cliProvider}</span>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor }} />
          <span style={{ fontSize: 9, color: statusColor, fontWeight: 700, textTransform: 'uppercase', fontFamily: 'monospace', letterSpacing: '0.05em' }}>
            {agent.status}
          </span>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-1 mb-2" style={{ fontSize: 10, fontFamily: 'monospace' }}>
        <StatCell label="SENT" value={msgsSent} />
        <StatCell label="RECV" value={msgsRecv} />
        <StatCell label="FILES" value={agent.filesOwned.length} />
      </div>

      {/* Context bar */}
      <div className="flex items-center gap-2 mb-2">
        <div style={{ flex: 1, height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 1, overflow: 'hidden' }}>
          <div style={{
            width: `${ctxPercent}%`, height: '100%',
            background: ctxPercent >= 90 ? '#f87171' : ctxPercent >= 70 ? '#fbbf24' : '#38bdf8',
            transition: 'width 0.5s ease',
          }} />
        </div>
        <span style={{ fontSize: 9, fontFamily: 'monospace', color: 'rgba(255,255,255,0.3)', fontVariantNumeric: 'tabular-nums' }}>
          {ctxPercent}%
        </span>
      </div>

      {/* Current task */}
      {agent.currentTask && (
        <div className="mb-2">
          <span className="text-[9px] text-white/20 font-mono uppercase">Task: </span>
          <span className="text-[10px] text-white/50 font-mono">{agent.currentTask}</span>
        </div>
      )}

      {/* Files owned */}
      {agent.filesOwned.length > 0 && (
        <div className="flex flex-col gap-0.5 mb-2" style={{ maxHeight: 60, overflowY: 'auto' }}>
          {agent.filesOwned.slice(0, 5).map((f, i) => (
            <span key={i} className="text-[9px] text-white/25 font-mono truncate">{f}</span>
          ))}
          {agent.filesOwned.length > 5 && (
            <span className="text-[9px] text-white/15 font-mono">+{agent.filesOwned.length - 5} more</span>
          )}
        </div>
      )}

      {/* Open Terminal button */}
      {agent.terminalId && (
        <button
          onClick={() => agent.terminalId && onJumpToTerminal(agent.terminalId)}
          className="flex items-center justify-center gap-1.5 w-full py-1.5 hover:bg-sky-500/15 transition-colors"
          style={{
            borderRadius: 3,
            border: '1px solid rgba(56,189,248,0.2)',
            background: 'rgba(56,189,248,0.08)',
            color: '#38bdf8',
            fontSize: 10,
            fontWeight: 700,
            fontFamily: 'monospace',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            cursor: 'pointer',
          }}
        >
          <Terminal className="w-3 h-3" />
          OPEN TERMINAL
          <ChevronRight className="w-2.5 h-2.5" />
        </button>
      )}
    </div>
  )
}

function StatCell({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col items-center py-1 rounded" style={{ background: 'rgba(255,255,255,0.02)' }}>
      <span style={{ fontWeight: 700, color: 'rgba(255,255,255,0.6)', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
      <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{label}</span>
    </div>
  )
}

// ─── Agent Roster Row ───────────────────────────────────────

function AgentRow({ agent, rosterAgent, index, isSelected, onSelect }: {
  agent: SwarmAgentState; rosterAgent: SwarmRosterAgent; index: number; isSelected: boolean; onSelect: () => void
}) {
  const roleDef = getRoleDef(rosterAgent.role)
  const statusColor = STATUS_COLORS[agent.status] || STATUS_COLORS.idle
  const agentLabel = rosterAgent.customName || `${roleDef.label} ${index + 1}`
  const ctxPercent = Math.min(100, Math.max(0,
    Math.floor(((agent as unknown as { metrics?: { totalTokens?: number } }).metrics?.totalTokens || 0) / 128000 * 100)
  ))

  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-white/[0.03] transition-colors"
      style={{
        borderBottom: '1px solid rgba(255,255,255,0.02)',
        background: isSelected ? 'rgba(56,189,248,0.06)' : 'transparent',
      }}
      onClick={onSelect}
    >
      {/* Role dot */}
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: roleDef.color, flexShrink: 0 }} />

      {/* Name */}
      <span className="flex-1 truncate" style={{ fontSize: 11, color: isSelected ? 'white' : 'rgba(255,255,255,0.6)', fontWeight: isSelected ? 600 : 400 }}>
        {agentLabel}
      </span>

      {/* Status */}
      <span style={{ fontSize: 9, color: statusColor, fontWeight: 600, textTransform: 'uppercase', fontFamily: 'monospace', letterSpacing: '0.05em', flexShrink: 0 }}>
        {agent.status}
      </span>

      {/* Mini context bar */}
      <div style={{ width: 28, height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 1, flexShrink: 0, overflow: 'hidden' }}>
        <div style={{
          width: `${ctxPercent}%`, height: '100%',
          background: ctxPercent >= 90 ? '#f87171' : ctxPercent >= 70 ? '#fbbf24' : '#38bdf8',
          transition: 'width 0.5s ease',
        }} />
      </div>
    </div>
  )
}

// ─── Quick Actions ──────────────────────────────────────────

function QuickActions({ swarm, agents, selectedAgentId }: {
  swarm: Swarm; agents: AgentDisplay[]; selectedAgentId: string | null
}) {
  const [message, setMessage] = useState('')
  const [mode, setMode] = useState<'broadcast' | 'dm'>('broadcast')

  const handleSend = useCallback(() => {
    if (!message.trim()) return
    const swarmRoot = (swarm as unknown as { swarmRoot?: string }).swarmRoot
    if (!swarmRoot) return

    if (mode === 'broadcast') {
      operatorBroadcast(swarmRoot, message.trim(), undefined, 'message')
    } else if (selectedAgentId) {
      const found = agents.find(d => d.agent.rosterId === selectedAgentId)
      if (found) {
        const roleDef = getRoleDef(found.rosterAgent.role)
        const label = found.rosterAgent.customName || `${roleDef.label}`
        operatorMessageAgent(swarmRoot, label, message.trim(), 'message')
      }
    }
    setMessage('')
  }, [message, mode, swarm, agents, selectedAgentId])

  return (
    <div className="px-3 py-2 flex flex-col gap-2">
      {/* Mode toggle */}
      <div className="flex gap-1">
        <ModeButton active={mode === 'broadcast'} onClick={() => setMode('broadcast')} icon={Radio} label="BROADCAST" />
        <ModeButton active={mode === 'dm'} onClick={() => setMode('dm')} icon={MessageSquare} label="DM" />
      </div>

      {mode === 'dm' && !selectedAgentId && (
        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', fontFamily: 'monospace' }}>
          Select an agent first
        </span>
      )}

      {/* Input */}
      <div className="flex gap-1">
        <input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder={mode === 'broadcast' ? 'Message all agents...' : 'Message selected agent...'}
          className="flex-1 px-2 py-1 rounded outline-none"
          style={{
            fontSize: 10,
            fontFamily: 'monospace',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.06)',
            color: 'white',
          }}
        />
        <button
          onClick={handleSend}
          disabled={!message.trim() || (mode === 'dm' && !selectedAgentId)}
          className="px-2 py-1 rounded hover:bg-sky-500/20 transition-colors disabled:opacity-30"
          style={{
            background: 'rgba(56,189,248,0.1)',
            border: '1px solid rgba(56,189,248,0.2)',
            color: '#38bdf8',
            cursor: 'pointer',
          }}
        >
          <Send className="w-3 h-3" />
        </button>
      </div>
    </div>
  )
}

function ModeButton({ active, onClick, icon: Icon, label }: {
  active: boolean; onClick: () => void; icon: typeof Radio; label: string
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 px-2 py-1 rounded transition-colors"
      style={{
        fontSize: 9,
        fontFamily: 'monospace',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        background: active ? 'rgba(255,255,255,0.08)' : 'transparent',
        color: active ? 'white' : 'rgba(255,255,255,0.3)',
        border: active ? '1px solid rgba(255,255,255,0.1)' : '1px solid transparent',
        cursor: 'pointer',
      }}
    >
      <Icon className="w-2.5 h-2.5" />
      {label}
    </button>
  )
}
