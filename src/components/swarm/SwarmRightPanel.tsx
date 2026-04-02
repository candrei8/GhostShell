// SwarmRightPanel — 300px right panel with 5-tab agent deep dive
// Tabs: Profile | Msgs | Activity | Reasoning | Metrics
// Also shows: Conversation panel (when edge selected), Agent Roster, Quick Actions

import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import {
  Terminal, ChevronRight, ChevronDown,
  Send, MessageSquare, Radio, Activity, Brain, BarChart3,
  FileText, Zap, AlertCircle, User,
} from 'lucide-react'
import type {
  SwarmAgentState, SwarmRosterAgent, SwarmMessage, Swarm,
  SwarmActivityEvent, SwarmTaskItem,
} from '../../lib/swarm-types'
import { getRoleDef } from '../../lib/swarm-types'
import { RoleIcon } from './swarm-icons'
import { operatorBroadcast, operatorMessageAgent } from '../../lib/swarm-operator'
import { SwarmConversationPanel } from './SwarmConversationPanel'
import { SwarmReACTTimeline } from './SwarmReACTTimeline'
import { useSwarmStore } from '../../stores/swarmStore'
import { getAgentOutputLines } from '../../lib/swarm-self-heal'
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

type AgentTab = 'profile' | 'msgs' | 'activity' | 'reasoning' | 'metrics' | 'console'

const STATUS_COLORS: Record<string, string> = {
  waiting: '#64748b', idle: '#64748b', planning: '#fb923c',
  building: '#38bdf8', review: '#c084fc', done: '#34d399', error: '#ef4444',
}

const TAB_DEFS: Array<{ id: AgentTab; icon: typeof User; label: string }> = [
  { id: 'profile', icon: User, label: 'Perfil' },
  { id: 'msgs', icon: MessageSquare, label: 'Msgs' },
  { id: 'activity', icon: Activity, label: 'Act' },
  { id: 'reasoning', icon: Brain, label: 'AI' },
  { id: 'console', icon: Terminal, label: 'Term' },
  { id: 'metrics', icon: BarChart3, label: 'Stats' },
]

// ─── Main Panel ─────────────────────────────────────────────

export function SwarmRightPanel({
  swarm, agents, selectedAgentId, selectedEdge, onSelectAgent, onClearEdge, onJumpToTerminal,
}: SwarmRightPanelProps) {
  const selectedAgent = useMemo(() => {
    if (!selectedAgentId) return null
    return agents.find((d) => d.agent.rosterId === selectedAgentId) || null
  }, [agents, selectedAgentId])

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
    return a && b ? { a, b } : null
  }, [selectedEdge, agents])

  const [activeTab, setActiveTab] = useState<AgentTab>('profile')
  const [rosterCollapsed, setRosterCollapsed] = useState(false)
  const [actionsCollapsed, setActionsCollapsed] = useState(true)

  return (
    <div
      className="flex flex-col shrink-0 custom-scrollbar"
      style={{
        width: 300,
        borderLeft: '1px solid rgba(255,255,255,0.04)',
        background: 'rgba(255,255,255,0.01)',
        overflowY: 'auto',
        overflowX: 'hidden',
      }}
    >
      {/* Conversation Panel (edge selected) */}
      {selectedEdge && edgeAgents ? (
        <SwarmConversationPanel
          agentA={edgeAgents.a}
          agentB={edgeAgents.b}
          messages={swarm.messages}
          onClose={onClearEdge}
        />
      ) : selectedAgent ? (
        <>
          {/* Tab Bar */}
          <div
            className="flex shrink-0"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
          >
            {TAB_DEFS.map(({ id, icon: Icon, label }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className="flex-1 flex flex-col items-center gap-0.5 py-1.5 transition-colors"
                style={{
                  background: activeTab === id ? 'rgba(255,255,255,0.04)' : 'transparent',
                  borderBottom: activeTab === id ? '2px solid #38bdf8' : '2px solid transparent',
                  color: activeTab === id ? '#38bdf8' : 'rgba(255,255,255,0.3)',
                  cursor: 'pointer',
                  fontSize: 7,
                  fontFamily: 'monospace',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                <Icon className="w-3 h-3" />
                {label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div style={{ maxHeight: 'calc(100vh - 280px)', overflowY: 'auto' }} className="custom-scrollbar">
            {activeTab === 'profile' && (
              <AgentProfile
                agent={selectedAgent.agent}
                rosterAgent={selectedAgent.rosterAgent}
                index={agents.findIndex((d) => d.agent.rosterId === selectedAgentId)}
                messages={swarm.messages}
                onJumpToTerminal={onJumpToTerminal}
              />
            )}
            {activeTab === 'msgs' && (
              <AgentMessagesTab
                agent={selectedAgent.agent}
                rosterAgent={selectedAgent.rosterAgent}
                index={agents.findIndex((d) => d.agent.rosterId === selectedAgentId)}
                messages={swarm.messages}
              />
            )}
            {activeTab === 'activity' && (
              <AgentActivityTab
                agent={selectedAgent.agent}
                rosterAgent={selectedAgent.rosterAgent}
                index={agents.findIndex((d) => d.agent.rosterId === selectedAgentId)}
                swarmId={swarm.id}
              />
            )}
            {activeTab === 'reasoning' && (
              <SwarmReACTTimeline
                agent={selectedAgent.agent}
                rosterAgent={selectedAgent.rosterAgent}
                agentIndex={agents.findIndex((d) => d.agent.rosterId === selectedAgentId)}
                swarmId={swarm.id}
              />
            )}
            {activeTab === 'console' && (
              <AgentConsoleTab
                agent={selectedAgent.agent}
                onJumpToTerminal={onJumpToTerminal}
              />
            )}
            {activeTab === 'metrics' && (
              <AgentMetricsTab
                agent={selectedAgent.agent}
                rosterAgent={selectedAgent.rosterAgent}
                index={agents.findIndex((d) => d.agent.rosterId === selectedAgentId)}
                messages={swarm.messages}
                tasks={swarm.tasks}
              />
            )}
          </div>
        </>
      ) : null}

      {/* Agent Roster */}
      <SectionHeader label="AGENTS" count={agents.length}
        collapsed={rosterCollapsed} onToggle={() => setRosterCollapsed(!rosterCollapsed)} />
      {!rosterCollapsed && (
        <div className="flex flex-col">
          {agents.map(({ agent, rosterAgent }, idx) => (
            <AgentRow key={agent.rosterId} agent={agent} rosterAgent={rosterAgent}
              index={idx} isSelected={selectedAgentId === agent.rosterId}
              onSelect={() => onSelectAgent(agent.rosterId)} />
          ))}
        </div>
      )}

      {/* Quick Actions */}
      <SectionHeader label="QUICK ACTIONS"
        collapsed={actionsCollapsed} onToggle={() => setActionsCollapsed(!actionsCollapsed)} />
      {!actionsCollapsed && (
        <QuickActions swarm={swarm} agents={agents} selectedAgentId={selectedAgentId} />
      )}
    </div>
  )
}

// ─── Tab 1: Profile (enhanced AgentDetail) ──────────────────

function AgentProfile({ agent, rosterAgent, index, messages, onJumpToTerminal }: {
  agent: SwarmAgentState; rosterAgent: SwarmRosterAgent; index: number
  messages: SwarmMessage[]; onJumpToTerminal: (terminalId: string) => void
}) {
  const roleDef = getRoleDef(rosterAgent.role)
  const statusColor = STATUS_COLORS[agent.status] || STATUS_COLORS.idle
  const agentLabel = rosterAgent.customName || `${roleDef.label} ${index + 1}`
  const ctxPercent = Math.min(100, Math.max(0,
    Math.floor(((agent as unknown as { metrics?: { totalTokens?: number } }).metrics?.totalTokens || 0) / 128000 * 100),
  ))
  const msgsSent = messages.filter((m) => m.from === agentLabel).length
  const msgsRecv = messages.filter((m) => m.to === agentLabel || m.to === '@all').length
  const performanceProfiles = useSwarmStore((s) => s.performanceProfiles)
  const profile = performanceProfiles[agentLabel]

  return (
    <div style={{ padding: 12 }}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <div className="flex items-center justify-center shrink-0"
          style={{ width: 32, height: 32, borderRadius: '50%', background: `${roleDef.color}15`, border: `1.5px solid ${roleDef.color}40` }}>
          <RoleIcon iconName={roleDef.icon} className="w-4 h-4" color={roleDef.color} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-bold text-white truncate">{agentLabel}</div>
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] font-mono" style={{ color: roleDef.color, textTransform: 'uppercase', fontWeight: 600 }}>{roleDef.label}</span>
            <span className="text-[9px] text-white/20 font-mono">{rosterAgent.cliProvider}</span>
            {rosterAgent.personaId && (
              <span className="text-[8px] text-white/15 font-mono">• {rosterAgent.personaId}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor }} />
          <span style={{ fontSize: 9, color: statusColor, fontWeight: 700, textTransform: 'uppercase', fontFamily: 'monospace' }}>
            {agent.status}
          </span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-1 mb-2" style={{ fontSize: 10, fontFamily: 'monospace' }}>
        <StatCell label="SENT" value={msgsSent} />
        <StatCell label="RECV" value={msgsRecv} />
        <StatCell label="FILES" value={agent.filesOwned.length} />
        <StatCell label="TASKS" value={profile?.tasksCompleted || 0} />
      </div>

      {/* Context bar */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[8px] text-white/20 font-mono shrink-0">CTX</span>
        <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
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

      {/* Performance score */}
      {profile && (
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[8px] text-white/20 font-mono shrink-0">PERF</span>
          <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{
              width: `${profile.tasksCompleted + profile.tasksFailed > 0 ? Math.round(profile.tasksCompleted / (profile.tasksCompleted + profile.tasksFailed) * 100) : 0}%`,
              height: '100%', background: '#34d399', transition: 'width 0.5s ease',
            }} />
          </div>
          <span style={{ fontSize: 9, fontFamily: 'monospace', color: 'rgba(255,255,255,0.3)' }}>
            {profile.tasksCompleted}/{profile.tasksCompleted + profile.tasksFailed}
          </span>
        </div>
      )}

      {/* Current task */}
      {agent.currentTask && (
        <div className="mb-2 px-2 py-1 rounded" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
          <span className="text-[8px] text-white/20 font-mono uppercase block mb-0.5">Tarea Actual</span>
          <span className="text-[10px] text-white/60 font-mono">{agent.currentTask}</span>
        </div>
      )}

      {/* Files owned */}
      {agent.filesOwned.length > 0 && (
        <div className="mb-2">
          <span className="text-[8px] text-white/20 font-mono uppercase block mb-1">Archivos ({agent.filesOwned.length})</span>
          <div className="flex flex-col gap-0.5" style={{ maxHeight: 80, overflowY: 'auto' }}>
            {agent.filesOwned.slice(0, 8).map((f, i) => (
              <span key={i} className="text-[9px] text-white/25 font-mono truncate">{f}</span>
            ))}
            {agent.filesOwned.length > 8 && (
              <span className="text-[9px] text-white/15 font-mono">+{agent.filesOwned.length - 8} mas</span>
            )}
          </div>
        </div>
      )}

      {/* Terminal button */}
      {agent.terminalId && (
        <button onClick={() => agent.terminalId && onJumpToTerminal(agent.terminalId)}
          className="flex items-center justify-center gap-1.5 w-full py-1.5 hover:bg-sky-500/15 transition-colors"
          style={{
            borderRadius: 3, border: '1px solid rgba(56,189,248,0.2)',
            background: 'rgba(56,189,248,0.08)', color: '#38bdf8',
            fontSize: 10, fontWeight: 700, fontFamily: 'monospace',
            textTransform: 'uppercase', letterSpacing: '0.1em', cursor: 'pointer',
          }}>
          <Terminal className="w-3 h-3" /> TERMINAL <ChevronRight className="w-2.5 h-2.5" />
        </button>
      )}
    </div>
  )
}

// ─── Tab 2: Messages ────────────────────────────────────────

function AgentMessagesTab({ agent, rosterAgent, index, messages }: {
  agent: SwarmAgentState; rosterAgent: SwarmRosterAgent; index: number; messages: SwarmMessage[]
}) {
  const agentLabel = rosterAgent.customName || `${getRoleDef(rosterAgent.role).label} ${index + 1}`

  // Group messages by conversation partner
  const conversations = useMemo(() => {
    const partnerMap = new Map<string, SwarmMessage[]>()
    for (const msg of messages) {
      if (msg.from === agentLabel && msg.to && msg.to !== '@all' && msg.to !== '@operator') {
        const arr = partnerMap.get(msg.to) || []
        arr.push(msg)
        partnerMap.set(msg.to, arr)
      } else if (msg.to === agentLabel && msg.from) {
        const arr = partnerMap.get(msg.from) || []
        arr.push(msg)
        partnerMap.set(msg.from, arr)
      }
    }
    return Array.from(partnerMap.entries())
      .map(([partner, msgs]) => ({ partner, count: msgs.length, lastMsg: msgs[msgs.length - 1] }))
      .sort((a, b) => b.count - a.count)
  }, [messages, agentLabel])

  const broadcastCount = messages.filter((m) => m.to === '@all' && m.from === agentLabel).length

  return (
    <div style={{ padding: 8 }}>
      <div className="text-[8px] text-white/20 font-mono uppercase mb-2 px-1">
        Conversaciones ({conversations.length})
      </div>
      {broadcastCount > 0 && (
        <div className="flex items-center gap-2 px-2 py-1.5 mb-1 rounded" style={{ background: 'rgba(255,255,255,0.02)' }}>
          <Radio className="w-3 h-3 text-white/20" />
          <span className="text-[9px] text-white/40 font-mono flex-1">@all (broadcasts)</span>
          <span className="text-[9px] text-white/30 font-mono font-bold">{broadcastCount}</span>
        </div>
      )}
      {conversations.map(({ partner, count, lastMsg }) => (
        <div key={partner}
          className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-white/[0.02] transition-colors"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
          <MessageSquare className="w-3 h-3 text-white/15 shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-[10px] text-white/50 font-mono block truncate">{partner}</span>
            {lastMsg?.body && (
              <span className="text-[8px] text-white/20 font-mono block truncate">{lastMsg.body.slice(0, 50)}</span>
            )}
          </div>
          <span className="text-[9px] text-sky-400/60 font-mono font-bold shrink-0">{count}</span>
        </div>
      ))}
      {conversations.length === 0 && (
        <div className="text-[9px] text-white/15 font-mono text-center py-4">Sin mensajes</div>
      )}
    </div>
  )
}

// ─── Tab 3: Activity Log ────────────────────────────────────

function AgentActivityTab({ agent, rosterAgent, index, swarmId }: {
  agent: SwarmAgentState; rosterAgent: SwarmRosterAgent; index: number; swarmId: string
}) {
  const agentLabel = rosterAgent.customName || `${getRoleDef(rosterAgent.role).label} ${index + 1}`
  const activityFeed = useSwarmStore((s) => s.activityFeed)
  const scrollRef = useRef<HTMLDivElement>(null)

  const agentEvents = useMemo(() =>
    activityFeed
      .filter((e) => e.agentLabel === agentLabel && e.swarmId === swarmId)
      .slice(-50)
      .reverse(),
  [activityFeed, agentLabel, swarmId])

  const ACTIVITY_ICONS: Record<string, { icon: typeof FileText; color: string }> = {
    file_read:    { icon: FileText, color: '#38bdf8' },
    file_write:   { icon: FileText, color: '#f59e0b' },
    file_edit:    { icon: FileText, color: '#fb923c' },
    command_run:  { icon: Terminal, color: '#34d399' },
    tool_call:    { icon: Zap, color: '#c084fc' },
    error:        { icon: AlertCircle, color: '#ef4444' },
    thinking:     { icon: Brain, color: 'rgba(255,255,255,0.2)' },
    message_sent: { icon: Send, color: '#38bdf8' },
    search:       { icon: Activity, color: '#8b5cf6' },
  }

  return (
    <div ref={scrollRef} style={{ padding: 4 }}>
      <div className="text-[8px] text-white/20 font-mono uppercase mb-1 px-2">
        Ultimas {agentEvents.length} acciones
      </div>
      {agentEvents.map((event) => {
        const meta = ACTIVITY_ICONS[event.type] || { icon: Activity, color: 'rgba(255,255,255,0.2)' }
        const Icon = meta.icon
        const ago = Math.round((Date.now() - event.timestamp) / 1000)
        const agoStr = ago < 60 ? `${ago}s` : ago < 3600 ? `${Math.round(ago / 60)}m` : `${Math.round(ago / 3600)}h`

        return (
          <div key={event.id}
            className="flex items-start gap-1.5 px-2 py-1 hover:bg-white/[0.02] transition-colors"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
            <Icon className="w-2.5 h-2.5 shrink-0 mt-0.5" style={{ color: meta.color }} />
            <div className="flex-1 min-w-0">
              <span className="text-[9px] text-white/40 font-mono block truncate">{event.detail}</span>
            </div>
            <span className="text-[8px] text-white/15 font-mono shrink-0">{agoStr}</span>
          </div>
        )
      })}
      {agentEvents.length === 0 && (
        <div className="text-[9px] text-white/15 font-mono text-center py-4">Sin actividad</div>
      )}
    </div>
  )
}

// ─── Tab 4: Reasoning (AI Trace) ────────────────────────────

function AgentReasoningTab({ agent, rosterAgent, index }: {
  agent: SwarmAgentState; rosterAgent: SwarmRosterAgent; index: number
}) {
  const agentLabel = rosterAgent.customName || `${getRoleDef(rosterAgent.role).label} ${index + 1}`
  const activityFeed = useSwarmStore((s) => s.activityFeed)

  // Extract reasoning-related events (tool calls, thinking, searches)
  const reasoningEvents = useMemo(() =>
    activityFeed
      .filter((e) => e.agentLabel === agentLabel && ['tool_call', 'thinking', 'search', 'command_run'].includes(e.type))
      .slice(-30)
      .reverse(),
  [activityFeed, agentLabel])

  const statusColor = STATUS_COLORS[agent.status] || STATUS_COLORS.idle

  return (
    <div style={{ padding: 8 }}>
      {/* Current state indicator */}
      <div className="px-2 py-2 mb-2 rounded" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
        <div className="flex items-center gap-2 mb-1">
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor }}>
            {['planning', 'building', 'review'].includes(agent.status) && (
              <span style={{ display: 'block', width: 6, height: 6, borderRadius: '50%', background: statusColor, animation: 'pulse 2s infinite' }} />
            )}
          </span>
          <span className="text-[9px] font-mono font-bold text-white/60 uppercase">{agent.status}</span>
        </div>
        {agent.currentTask && (
          <div className="text-[9px] text-white/35 font-mono">{agent.currentTask}</div>
        )}
        {agent.progress && (
          <div className="text-[9px] text-white/25 font-mono mt-1 italic">{agent.progress}</div>
        )}
      </div>

      {/* Reasoning trace */}
      <div className="text-[8px] text-white/20 font-mono uppercase mb-1 px-1">
        Traza de Razonamiento
      </div>
      {reasoningEvents.map((event) => {
        const isThinking = event.type === 'thinking'
        const isTool = event.type === 'tool_call'
        const isSearch = event.type === 'search'
        const isCmd = event.type === 'command_run'

        return (
          <div key={event.id}
            className="px-2 py-1 mb-0.5 rounded"
            style={{
              background: isTool ? 'rgba(139,92,246,0.05)' : isCmd ? 'rgba(52,211,153,0.05)' : 'transparent',
              borderLeft: `2px solid ${isTool ? '#8b5cf6' : isSearch ? '#38bdf8' : isCmd ? '#34d399' : 'rgba(255,255,255,0.05)'}`,
            }}>
            <div className="flex items-center gap-1 mb-0.5">
              <span className="text-[7px] font-mono font-bold uppercase px-1 py-px rounded" style={{
                background: isTool ? 'rgba(139,92,246,0.15)' : isSearch ? 'rgba(56,189,248,0.15)' : isCmd ? 'rgba(52,211,153,0.15)' : 'rgba(255,255,255,0.05)',
                color: isTool ? '#8b5cf6' : isSearch ? '#38bdf8' : isCmd ? '#34d399' : 'rgba(255,255,255,0.3)',
              }}>
                {isThinking ? 'THINK' : isTool ? 'TOOL' : isSearch ? 'SEARCH' : 'CMD'}
              </span>
              <span className="text-[8px] text-white/15 font-mono ml-auto">
                {new Date(event.timestamp).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </div>
            <div className="text-[9px] text-white/40 font-mono" style={{ wordBreak: 'break-word' }}>
              {event.detail.length > 200 ? event.detail.slice(0, 200) + '...' : event.detail}
            </div>
          </div>
        )
      })}
      {reasoningEvents.length === 0 && (
        <div className="text-[9px] text-white/15 font-mono text-center py-4">Sin traza de razonamiento</div>
      )}
    </div>
  )
}

// ─── Tab 5: Metrics ─────────────────────────────────────────

function AgentMetricsTab({ agent, rosterAgent, index, messages, tasks }: {
  agent: SwarmAgentState; rosterAgent: SwarmRosterAgent; index: number
  messages: SwarmMessage[]; tasks: SwarmTaskItem[]
}) {
  const agentLabel = rosterAgent.customName || `${getRoleDef(rosterAgent.role).label} ${index + 1}`
  const performanceProfiles = useSwarmStore((s) => s.performanceProfiles)
  const profile = performanceProfiles[agentLabel]

  const agentTasks = useMemo(() => tasks.filter((t) => t.owner === agent.rosterId), [tasks, agent.rosterId])
  const completedTasks = agentTasks.filter((t) => t.status === 'done')
  const inProgressTasks = agentTasks.filter((t) => t.status === 'building' || t.status === 'review')
  const failedTasks: SwarmTaskItem[] = [] // tasks don't have 'error' status in this system

  const msgsSent = messages.filter((m) => m.from === agentLabel).length
  const msgsRecv = messages.filter((m) => m.to === agentLabel || m.to === '@all').length

  const tokens = (agent as unknown as { metrics?: { totalTokens?: number } }).metrics?.totalTokens || 0
  const tokensK = Math.round(tokens / 1000)

  // Average task duration
  const avgDuration = useMemo(() => {
    const durations = completedTasks
      .filter((t) => t.startedAt && t.completedAt)
      .map((t) => (t.completedAt! - t.startedAt!) / 60000)
    return durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0
  }, [completedTasks])

  return (
    <div style={{ padding: 8 }}>
      {/* Task stats */}
      <MetricSection title="TAREAS">
        <MetricRow label="Completadas" value={completedTasks.length} color="#34d399" />
        <MetricRow label="En progreso" value={inProgressTasks.length} color="#38bdf8" />
        <MetricRow label="Fallidas" value={failedTasks.length} color="#ef4444" />
        <MetricRow label="Total asignadas" value={agentTasks.length} color="rgba(255,255,255,0.4)" />
        {avgDuration > 0 && (
          <MetricRow label="Dur. promedio" value={`${avgDuration.toFixed(1)}m`} color="rgba(255,255,255,0.4)" />
        )}
      </MetricSection>

      {/* Communication stats */}
      <MetricSection title="COMUNICACION">
        <MetricRow label="Msgs enviados" value={msgsSent} color="#38bdf8" />
        <MetricRow label="Msgs recibidos" value={msgsRecv} color="#8b5cf6" />
        <MetricRow label="Ratio E/R" value={msgsRecv > 0 ? (msgsSent / msgsRecv).toFixed(1) : '—'} color="rgba(255,255,255,0.4)" />
      </MetricSection>

      {/* Resource usage */}
      <MetricSection title="RECURSOS">
        <MetricRow label="Tokens usados" value={`${tokensK}k`} color={tokens > 100000 ? '#f59e0b' : 'rgba(255,255,255,0.4)'} />
        <MetricRow label="Archivos" value={agent.filesOwned.length} color="rgba(255,255,255,0.4)" />
      </MetricSection>

      {/* Domain scores from performance profile */}
      {profile && Object.keys(profile.domainScores).length > 0 && (
        <MetricSection title="DOMINIOS">
          {Object.entries(profile.domainScores)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([domain, score]) => (
              <MetricRow key={domain} label={domain} value={`${score}%`}
                color={score >= 80 ? '#34d399' : score >= 50 ? '#f59e0b' : '#ef4444'} />
            ))}
        </MetricSection>
      )}
    </div>
  )
}

// ─── Metric Helpers ─────────────────────────────────────────

// ─── Tab 6: Console (live terminal output) ──────────────────

function AgentConsoleTab({ agent, onJumpToTerminal }: {
  agent: SwarmAgentState; onJumpToTerminal: (terminalId: string) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)
  const [, forceRender] = useState(0)

  // Poll output every 2 seconds
  useEffect(() => {
    const iv = setInterval(() => forceRender((c) => c + 1), 2000)
    return () => clearInterval(iv)
  }, [])

  const lines = agent.terminalId ? getAgentOutputLines(agent.terminalId, 30) : []

  // Auto-scroll
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [lines.length, autoScroll])

  return (
    <div className="flex flex-col h-full">
      {/* Controls */}
      <div className="flex items-center gap-2 px-2 py-1.5 shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <Terminal className="w-3 h-3" style={{ color: '#34d399' }} />
        <span className="text-[8px] font-mono text-white/30 uppercase">Live Output</span>
        <span className="text-[8px] font-mono text-white/15">{lines.length} lineas</span>
        <div className="flex-1" />
        <button
          onClick={() => setAutoScroll(!autoScroll)}
          className="text-[7px] font-mono px-1 py-px rounded"
          style={{
            background: autoScroll ? 'rgba(52,211,153,0.1)' : 'rgba(255,255,255,0.03)',
            color: autoScroll ? '#34d399' : 'rgba(255,255,255,0.2)',
            cursor: 'pointer',
          }}
        >
          {autoScroll ? 'AUTO' : 'PAUSED'}
        </button>
      </div>

      {/* Output lines */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto custom-scrollbar min-h-0 px-2 py-1"
        style={{ background: 'rgba(0,0,0,0.3)' }}
      >
        {lines.length === 0 ? (
          <div className="text-[9px] text-white/10 font-mono text-center py-4">
            {agent.terminalId ? 'Esperando output...' : 'Sin terminal asignada'}
          </div>
        ) : (
          lines.map((line, i) => (
            <div key={i} className="text-[8px] font-mono leading-relaxed" style={{ color: 'rgba(255,255,255,0.45)' }}>
              {line}
            </div>
          ))
        )}
      </div>

      {/* Open terminal button */}
      {agent.terminalId && (
        <button
          onClick={() => agent.terminalId && onJumpToTerminal(agent.terminalId)}
          className="flex items-center justify-center gap-1 py-1.5 shrink-0 hover:bg-emerald-500/10 transition-colors"
          style={{
            borderTop: '1px solid rgba(255,255,255,0.04)',
            color: '#34d399', fontSize: 9, fontWeight: 700, fontFamily: 'monospace',
            textTransform: 'uppercase', letterSpacing: '0.08em', cursor: 'pointer',
          }}
        >
          <Terminal className="w-3 h-3" />
          Abrir Terminal Completa
        </button>
      )}
    </div>
  )
}

function MetricSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <div className="text-[8px] text-white/20 font-mono uppercase mb-1 px-1 tracking-wider">{title}</div>
      <div className="rounded" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.03)' }}>
        {children}
      </div>
    </div>
  )
}

function MetricRow({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className="flex items-center justify-between px-2 py-1" style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
      <span className="text-[9px] text-white/30 font-mono">{label}</span>
      <span className="text-[10px] font-mono font-bold" style={{ color, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </span>
    </div>
  )
}

function StatCell({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col items-center py-1 rounded" style={{ background: 'rgba(255,255,255,0.02)' }}>
      <span style={{ fontWeight: 700, color: 'rgba(255,255,255,0.6)', fontVariantNumeric: 'tabular-nums', fontSize: 11 }}>{value}</span>
      <span style={{ fontSize: 7, color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{label}</span>
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

// ─── Agent Roster Row ───────────────────────────────────────

function AgentRow({ agent, rosterAgent, index, isSelected, onSelect }: {
  agent: SwarmAgentState; rosterAgent: SwarmRosterAgent; index: number; isSelected: boolean; onSelect: () => void
}) {
  const roleDef = getRoleDef(rosterAgent.role)
  const statusColor = STATUS_COLORS[agent.status] || STATUS_COLORS.idle
  const agentLabel = rosterAgent.customName || `${roleDef.label} ${index + 1}`
  const ctxPercent = Math.min(100, Math.max(0,
    Math.floor(((agent as unknown as { metrics?: { totalTokens?: number } }).metrics?.totalTokens || 0) / 128000 * 100),
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
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: roleDef.color, flexShrink: 0 }} />
      <span className="flex-1 truncate" style={{ fontSize: 11, color: isSelected ? 'white' : 'rgba(255,255,255,0.6)', fontWeight: isSelected ? 600 : 400 }}>
        {agentLabel}
      </span>
      <span style={{ fontSize: 9, color: statusColor, fontWeight: 600, textTransform: 'uppercase', fontFamily: 'monospace', letterSpacing: '0.05em', flexShrink: 0 }}>
        {agent.status}
      </span>
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
      const found = agents.find((d) => d.agent.rosterId === selectedAgentId)
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
      <div className="flex gap-1">
        <ModeBtn active={mode === 'broadcast'} onClick={() => setMode('broadcast')} label="BROADCAST" />
        <ModeBtn active={mode === 'dm'} onClick={() => setMode('dm')} label="DM" />
      </div>
      {mode === 'dm' && !selectedAgentId && (
        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', fontFamily: 'monospace' }}>Selecciona un agente</span>
      )}
      <div className="flex gap-1">
        <input value={message} onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder={mode === 'broadcast' ? 'Mensaje a todos...' : 'Mensaje al agente...'}
          className="flex-1 px-2 py-1 rounded outline-none"
          style={{ fontSize: 10, fontFamily: 'monospace', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: 'white' }} />
        <button onClick={handleSend}
          disabled={!message.trim() || (mode === 'dm' && !selectedAgentId)}
          className="px-2 py-1 rounded hover:bg-sky-500/20 transition-colors disabled:opacity-30"
          style={{ background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.2)', color: '#38bdf8', cursor: 'pointer' }}>
          <Send className="w-3 h-3" />
        </button>
      </div>
    </div>
  )
}

function ModeBtn({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick}
      className="flex items-center gap-1 px-2 py-1 rounded transition-colors"
      style={{
        fontSize: 9, fontFamily: 'monospace', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
        background: active ? 'rgba(255,255,255,0.08)' : 'transparent',
        color: active ? 'white' : 'rgba(255,255,255,0.3)',
        border: active ? '1px solid rgba(255,255,255,0.1)' : '1px solid transparent',
        cursor: 'pointer',
      }}>
      {label}
    </button>
  )
}
