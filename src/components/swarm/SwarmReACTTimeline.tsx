// SwarmReACTTimeline — MiroFish-inspired ReACT reasoning visualization
// Shows Thought → Tool Call → Tool Result → Observation cycles per agent
// Each step is a typed, color-coded entry with expandable content
// Inspired by MiroFish's Step4Report agent workflow timeline

import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import {
  Brain, Zap, AlertCircle, ChevronDown, ChevronRight,
  ArrowDown, Pause, Play,
} from 'lucide-react'
import type { SwarmAgentState, SwarmRosterAgent, SwarmActivityEvent } from '../../lib/swarm-types'
import { getRoleDef } from '../../lib/swarm-types'
import { useSwarmStore } from '../../stores/swarmStore'
import { SwarmToolResultDisplay, ToolBadge, getToolColor } from './SwarmToolResultDisplay'

// ─── Types ──────────────────────────────────────────────────

interface SwarmReACTTimelineProps {
  agent: SwarmAgentState
  rosterAgent: SwarmRosterAgent
  agentIndex: number
  swarmId: string
}

// ReACT step types — maps activity events to reasoning phases
type ReACTPhase = 'thought' | 'action' | 'observation' | 'error' | 'milestone'

interface ReACTStep {
  id: string
  phase: ReACTPhase
  timestamp: number
  toolName?: string
  detail: string
  eventType: string
  iteration: number // which Thought→Action→Observation cycle this belongs to
}

// ─── Constants ──────────────────────────────────────────────

const PHASE_STYLES: Record<ReACTPhase, { color: string; bg: string; icon: typeof Brain; label: string }> = {
  thought:     { color: 'rgba(255,255,255,0.4)', bg: 'rgba(255,255,255,0.02)', icon: Brain, label: 'THOUGHT' },
  action:      { color: '#38bdf8', bg: 'rgba(56,189,248,0.04)', icon: Zap, label: 'ACTION' },
  observation: { color: '#34d399', bg: 'rgba(52,211,153,0.03)', icon: ChevronRight, label: 'RESULT' },
  error:       { color: '#ef4444', bg: 'rgba(239,68,68,0.05)', icon: AlertCircle, label: 'ERROR' },
  milestone:   { color: '#f59e0b', bg: 'rgba(245,158,11,0.04)', icon: Zap, label: 'MILESTONE' },
}

// ─── Build ReACT Steps from Activity Events ─────────────────

function buildReACTSteps(events: SwarmActivityEvent[]): ReACTStep[] {
  const steps: ReACTStep[] = []
  let iteration = 1
  let lastPhase: ReACTPhase = 'thought'

  for (const event of events) {
    let phase: ReACTPhase
    let toolName: string | undefined

    switch (event.type) {
      case 'thinking':
        phase = 'thought'
        // New iteration when we see a thinking event after an observation/action
        if (lastPhase === 'observation' || lastPhase === 'action') iteration++
        break
      case 'tool_call':
        phase = 'action'
        toolName = (event.metadata?.tool as string) || extractToolFromDetail(event.detail)
        break
      case 'search':
        phase = 'action'
        toolName = (event.metadata?.tool as string) || 'Grep'
        break
      case 'command_run':
        phase = 'action'
        toolName = 'Bash'
        break
      case 'file_read':
        phase = 'action'
        toolName = 'Read'
        break
      case 'file_write':
        phase = 'action'
        toolName = 'Write'
        break
      case 'file_edit':
        phase = 'action'
        toolName = 'Edit'
        break
      case 'subagent_spawn':
        phase = 'action'
        toolName = 'Agent'
        break
      case 'subagent_complete':
        phase = 'observation'
        toolName = 'Agent'
        break
      case 'error':
        phase = 'error'
        break
      case 'task_created':
      case 'task_status_change':
        phase = 'milestone'
        break
      case 'message_sent':
      case 'message_received':
      case 'review_submit':
        phase = 'milestone'
        break
      default:
        phase = 'observation'
    }

    steps.push({
      id: event.id,
      phase,
      timestamp: event.timestamp,
      toolName,
      detail: event.detail,
      eventType: event.type,
      iteration,
    })

    lastPhase = phase
  }

  return steps
}

function extractToolFromDetail(detail: string): string {
  const colonIdx = detail.indexOf(':')
  if (colonIdx > 0 && colonIdx < 20) return detail.slice(0, colonIdx).trim()
  return 'Tool'
}

// ─── Component ──────────────────────────────────────────────

export function SwarmReACTTimeline({ agent, rosterAgent, agentIndex, swarmId }: SwarmReACTTimelineProps) {
  const agentLabel = rosterAgent.customName || `${getRoleDef(rosterAgent.role).label} ${agentIndex + 1}`
  const activityFeed = useSwarmStore((s) => s.activityFeed)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set())

  // Filter events for this agent and build ReACT steps
  const agentEvents = useMemo(() =>
    activityFeed.filter((e) => e.agentLabel === agentLabel && e.swarmId === swarmId),
  [activityFeed, agentLabel, swarmId])

  const steps = useMemo(() => buildReACTSteps(agentEvents), [agentEvents])

  // Stats
  const stats = useMemo(() => {
    const iterations = steps.length > 0 ? steps[steps.length - 1].iteration : 0
    const toolCalls = steps.filter((s) => s.phase === 'action').length
    const errors = steps.filter((s) => s.phase === 'error').length
    const tools = new Set(steps.filter((s) => s.toolName).map((s) => s.toolName))
    return { iterations, toolCalls, errors, uniqueTools: tools.size }
  }, [steps])

  // Auto-scroll to bottom
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [steps.length, autoScroll])

  const toggleExpand = useCallback((id: string) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const statusColor = agent.status === 'building' ? '#38bdf8'
    : agent.status === 'planning' ? '#fb923c'
    : agent.status === 'review' ? '#c084fc'
    : agent.status === 'done' ? '#34d399'
    : agent.status === 'error' ? '#ef4444'
    : '#64748b'

  return (
    <div className="flex flex-col h-full">
      {/* Header with stats */}
      <div
        className="flex items-center gap-2 px-3 py-2 shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
      >
        <Brain className="w-3 h-3" style={{ color: statusColor }} />
        <span className="text-[9px] font-mono font-bold text-white/50 uppercase">ReACT</span>

        {/* Iteration counter */}
        <span
          className="text-[8px] font-mono px-1.5 py-px rounded"
          style={{ background: 'rgba(56,189,248,0.1)', color: '#38bdf8', fontWeight: 700 }}
        >
          Iter {stats.iterations}
        </span>

        {/* Stats pills */}
        <span className="text-[8px] font-mono text-white/20">
          {stats.toolCalls} tools
        </span>
        {stats.errors > 0 && (
          <span className="text-[8px] font-mono" style={{ color: '#ef4444' }}>
            {stats.errors} err
          </span>
        )}
        <span className="text-[8px] font-mono text-white/15">
          {stats.uniqueTools} tipos
        </span>

        {/* Auto-scroll toggle */}
        <button
          className="ml-auto p-0.5 rounded hover:bg-white/5 transition-colors"
          onClick={() => setAutoScroll(!autoScroll)}
          style={{ color: autoScroll ? '#38bdf8' : 'rgba(255,255,255,0.2)', cursor: 'pointer' }}
          title={autoScroll ? 'Auto-scroll ON' : 'Auto-scroll OFF'}
        >
          <ArrowDown className="w-3 h-3" />
        </button>
      </div>

      {/* Current agent state */}
      <div
        className="px-3 py-1.5 shrink-0 flex items-center gap-2"
        style={{ background: 'rgba(255,255,255,0.01)', borderBottom: '1px solid rgba(255,255,255,0.03)' }}
      >
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor, flexShrink: 0 }}>
          {['planning', 'building', 'review'].includes(agent.status) && (
            <span style={{
              display: 'block', width: 6, height: 6, borderRadius: '50%',
              background: statusColor, animation: 'pulse 2s infinite',
            }} />
          )}
        </span>
        <span className="text-[9px] font-mono font-bold uppercase" style={{ color: statusColor }}>
          {agent.status}
        </span>
        {agent.currentTask && (
          <span className="text-[8px] font-mono text-white/25 truncate flex-1">
            {agent.currentTask}
          </span>
        )}
      </div>

      {/* Timeline */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto custom-scrollbar min-h-0"
        style={{ padding: '4px 0' }}
      >
        {steps.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <span className="text-[9px] text-white/15 font-mono">Esperando actividad del agente...</span>
          </div>
        ) : (
          <div className="relative" style={{ paddingLeft: 20 }}>
            {/* Vertical timeline line */}
            <div
              className="absolute left-[9px] top-0 bottom-0 w-px"
              style={{ background: 'rgba(255,255,255,0.04)' }}
            />

            {steps.map((step, i) => {
              const style = PHASE_STYLES[step.phase]
              const Icon = style.icon
              const isExpanded = expandedSteps.has(step.id)
              const showIterationHeader = i === 0 || step.iteration !== steps[i - 1].iteration

              const ago = Math.round((Date.now() - step.timestamp) / 1000)
              const agoStr = ago < 60 ? `${ago}s` : ago < 3600 ? `${Math.round(ago / 60)}m` : `${Math.round(ago / 3600)}h`

              return (
                <div key={step.id}>
                  {/* Iteration header */}
                  {showIterationHeader && step.phase === 'thought' && (
                    <div className="flex items-center gap-1.5 mb-1 mt-2 ml-2">
                      <span
                        className="text-[7px] font-mono font-bold uppercase px-1.5 py-px rounded"
                        style={{
                          background: 'rgba(56,189,248,0.08)',
                          color: '#38bdf8',
                          letterSpacing: '0.08em',
                        }}
                      >
                        Iteracion {step.iteration}
                      </span>
                      <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.03)' }} />
                    </div>
                  )}

                  {/* Step entry */}
                  <div
                    className="flex items-start gap-1.5 mb-0.5 relative cursor-pointer hover:bg-white/[0.01] transition-colors"
                    style={{ paddingLeft: 4, paddingRight: 8, paddingTop: 2, paddingBottom: 2 }}
                    onClick={() => step.toolName && toggleExpand(step.id)}
                  >
                    {/* Timeline dot */}
                    <div
                      className="absolute left-[-13px] top-[6px]"
                      style={{
                        width: 7, height: 7, borderRadius: '50%',
                        background: step.phase === 'error' ? '#ef4444' : style.color,
                        border: '1.5px solid #0a0a0a',
                      }}
                    />

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      {/* Phase label + tool badge + time */}
                      <div className="flex items-center gap-1 mb-0.5">
                        {step.phase === 'action' && step.toolName ? (
                          <ToolBadge toolName={step.toolName} />
                        ) : (
                          <span
                            className="text-[7px] font-mono font-bold uppercase px-1 py-px rounded"
                            style={{ background: style.bg, color: style.color, letterSpacing: '0.05em' }}
                          >
                            {style.label}
                          </span>
                        )}

                        {/* Expand indicator for tool calls */}
                        {step.toolName && (
                          isExpanded
                            ? <ChevronDown className="w-2 h-2" style={{ color: 'rgba(255,255,255,0.15)' }} />
                            : <ChevronRight className="w-2 h-2" style={{ color: 'rgba(255,255,255,0.1)' }} />
                        )}

                        <span className="text-[7px] font-mono text-white/10 ml-auto shrink-0">{agoStr}</span>
                      </div>

                      {/* Detail text */}
                      <div
                        className="text-[8px] font-mono leading-relaxed"
                        style={{
                          color: step.phase === 'error' ? '#ef4444'
                            : step.phase === 'thought' ? 'rgba(255,255,255,0.3)'
                            : 'rgba(255,255,255,0.4)',
                          wordBreak: 'break-word',
                        }}
                      >
                        {isExpanded ? step.detail : (
                          step.detail.length > 120 ? step.detail.slice(0, 118) + '...' : step.detail
                        )}
                      </div>

                      {/* Expanded tool result display */}
                      {isExpanded && step.toolName && (
                        <div className="mt-1">
                          <SwarmToolResultDisplay
                            toolName={step.toolName}
                            detail={step.detail}
                            expanded={true}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
