// SwarmDeepInteraction — Post-execution deep interaction mode
// Inspired by MiroFish Stage 5: chat with agents, replay decisions, accuracy dashboard
// 4 tabs: Interview | Replay | Accuracy | Knowledge

import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import {
  MessageSquare, Clock, Target, Brain, ChevronRight,
  Lightbulb, Zap, CheckCircle, XCircle, TrendingUp,
} from 'lucide-react'
import type {
  Swarm, SwarmMessage, SwarmTaskItem, DebriefResult, SimulationResult,
} from '../../lib/swarm-types'
import { getRoleDef } from '../../lib/swarm-types'
import { useSwarmStore } from '../../stores/swarmStore'

// ─── Types ──────────────────────────────────────────────────

interface SwarmDeepInteractionProps {
  swarm: Swarm
}

type DeepTab = 'interview' | 'replay' | 'accuracy' | 'insights'

const TAB_DEFS: Array<{ id: DeepTab; icon: typeof MessageSquare; label: string }> = [
  { id: 'interview', icon: MessageSquare, label: 'Entrevistas' },
  { id: 'replay', icon: Clock, label: 'Replay' },
  { id: 'accuracy', icon: Target, label: 'Precision' },
  { id: 'insights', icon: Lightbulb, label: 'Insights' },
]

// ─── Component ──────────────────────────────────────────────

export function SwarmDeepInteraction({ swarm }: SwarmDeepInteractionProps) {
  const [activeTab, setActiveTab] = useState<DeepTab>('accuracy')
  const debriefResult = useSwarmStore((s) => s.debriefResult)

  return (
    <div className="flex flex-col w-full h-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.15)' }}>
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2 shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <Brain className="w-4 h-4" style={{ color: '#38bdf8' }} />
        <span style={{ fontSize: 11, fontFamily: 'monospace', fontWeight: 700, color: '#38bdf8' }}>
          Deep Interaction
        </span>
        <span style={{ fontSize: 9, fontFamily: 'monospace', color: 'rgba(255,255,255,0.2)' }}>
          {swarm.config.name || swarm.id}
        </span>
      </div>

      {/* Tab bar */}
      <div className="flex shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        {TAB_DEFS.map(({ id, icon: Icon, label }) => (
          <button key={id} onClick={() => setActiveTab(id)}
            className="flex items-center gap-1.5 px-3 py-2 transition-colors"
            style={{
              fontSize: 9, fontFamily: 'monospace', fontWeight: 700,
              color: activeTab === id ? '#38bdf8' : 'rgba(255,255,255,0.3)',
              borderBottom: activeTab === id ? '2px solid #38bdf8' : '2px solid transparent',
              cursor: 'pointer',
            }}>
            <Icon className="w-3 h-3" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
        {activeTab === 'interview' && <InterviewTab swarm={swarm} debriefResult={debriefResult} />}
        {activeTab === 'replay' && <ReplayTab swarm={swarm} />}
        {activeTab === 'accuracy' && <AccuracyTab swarm={swarm} />}
        {activeTab === 'insights' && <InsightsTab swarm={swarm} debriefResult={debriefResult} />}
      </div>
    </div>
  )
}

// ─── Interview Tab ──────────────────────────────────────────

function InterviewTab({ swarm, debriefResult }: { swarm: Swarm; debriefResult: DebriefResult | null }) {
  if (!debriefResult || !debriefResult.interviews || debriefResult.interviews.length === 0) {
    return <EmptyState text="Sin entrevistas de debrief disponibles" />
  }

  return (
    <div style={{ padding: 12 }}>
      <div className="text-[8px] text-white/20 font-mono uppercase mb-2 tracking-wider">
        Respuestas de Debrief ({debriefResult.interviews.length} agentes)
      </div>
      {debriefResult.interviews.map((interview, i) => (
        <div key={i} className="mb-3 rounded" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
          <div className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
            <MessageSquare className="w-3 h-3 text-sky-400/50" />
            <span className="text-[10px] font-mono font-bold text-white/60">
              {(interview as { agent?: string }).agent || `Agente ${i + 1}`}
            </span>
          </div>
          <div className="px-3 py-2">
            {Array.isArray(interview) ? (
              interview.map((qa: { q?: string; a?: string; question?: string; answer?: string }, j: number) => (
                <div key={j} className="mb-2">
                  <div className="text-[9px] text-sky-400/50 font-mono mb-0.5">
                    Q: {qa.q || qa.question || '?'}
                  </div>
                  <div className="text-[9px] text-white/40 font-mono pl-2" style={{ wordBreak: 'break-word' }}>
                    {qa.a || qa.answer || '—'}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-[9px] text-white/40 font-mono" style={{ wordBreak: 'break-word' }}>
                {JSON.stringify(interview, null, 2)}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Replay Tab ─────────────────────────────────────────────

function ReplayTab({ swarm }: { swarm: Swarm }) {
  // Build a chronological timeline of major events
  const events = useMemo(() => {
    const timeline: Array<{
      timestamp: number
      type: 'task_start' | 'task_done' | 'message' | 'conflict'
      label: string
      detail: string
      color: string
    }> = []

    // Task events
    for (const task of swarm.tasks) {
      if (task.startedAt) {
        timeline.push({
          timestamp: task.startedAt,
          type: 'task_start',
          label: `Tarea iniciada: ${task.title}`,
          detail: `Owner: ${task.owner}`,
          color: '#38bdf8',
        })
      }
      if (task.completedAt) {
        timeline.push({
          timestamp: task.completedAt,
          type: 'task_done',
          label: `Tarea completada: ${task.title}`,
          detail: task.verdict ? `Veredicto: ${task.verdict}` : '',
          color: '#34d399',
        })
      }
    }

    // Key messages (escalations, assignments, reviews)
    for (const msg of swarm.messages) {
      if (['escalation', 'assignment', 'review_complete', 'worker_done'].includes(msg.type)) {
        timeline.push({
          timestamp: msg.timestamp,
          type: 'message',
          label: `${msg.type}: ${msg.from} → ${msg.to}`,
          detail: msg.body?.slice(0, 80) || '',
          color: msg.type === 'escalation' ? '#f59e0b' : msg.type === 'assignment' ? '#3b82f6' : '#8b5cf6',
        })
      }
    }

    return timeline.sort((a, b) => a.timestamp - b.timestamp)
  }, [swarm])

  const startMs = swarm.startedAt || (events[0]?.timestamp || Date.now())

  if (events.length === 0) {
    return <EmptyState text="Sin eventos para reproducir" />
  }

  return (
    <div style={{ padding: 12 }}>
      <div className="text-[8px] text-white/20 font-mono uppercase mb-2 tracking-wider">
        Replay de Decisiones ({events.length} eventos)
      </div>
      <div className="relative" style={{ paddingLeft: 16 }}>
        {/* Vertical timeline line */}
        <div className="absolute left-[5px] top-0 bottom-0 w-px" style={{ background: 'rgba(255,255,255,0.06)' }} />

        {events.map((event, i) => {
          const elapsed = Math.round((event.timestamp - startMs) / 60000)
          return (
            <div key={i} className="flex items-start gap-2 mb-2 relative">
              {/* Dot on timeline */}
              <div className="absolute left-[-13px] top-1" style={{ width: 8, height: 8, borderRadius: '50%', background: event.color, border: '2px solid #0a0a0a' }} />
              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-mono font-bold" style={{ color: event.color }}>{event.label}</span>
                  <span className="text-[7px] font-mono text-white/15 ml-auto shrink-0">+{elapsed}m</span>
                </div>
                {event.detail && (
                  <div className="text-[8px] font-mono text-white/25 mt-0.5">{event.detail}</div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Accuracy Tab ───────────────────────────────────────────

function AccuracyTab({ swarm }: { swarm: Swarm }) {
  const sim = swarm.simulation
  const conflicts = useSwarmStore((s) => s.conflicts)

  if (!sim) {
    return <EmptyState text="Sin datos de simulacion para comparar" />
  }

  const actualDuration = swarm.startedAt && swarm.completedAt
    ? (swarm.completedAt - swarm.startedAt) / 60000
    : swarm.startedAt ? (Date.now() - swarm.startedAt) / 60000 : 0

  const durationAccuracy = sim.predictedDuration > 0
    ? Math.max(0, Math.round(100 - (Math.abs(sim.predictedDuration - actualDuration) / sim.predictedDuration) * 100))
    : 0

  const predConflicts = sim.conflicts.length
  const actualConflicts = conflicts.filter((c) => c.swarmId === swarm.id).length

  // Per-task accuracy
  const taskAccuracy = useMemo(() => {
    return sim.taskAssignments.map((simTask) => {
      const actual = swarm.tasks.find((t) => t.id === simTask.taskId)
      if (!actual) return null
      const actualDur = actual.startedAt && actual.completedAt
        ? (actual.completedAt - actual.startedAt) / 60000
        : null
      const predicted = simTask.predictedDuration
      const accuracy = actualDur && predicted > 0
        ? Math.max(0, Math.round(100 - (Math.abs(predicted - actualDur) / predicted) * 100))
        : null

      return {
        taskId: simTask.taskId,
        title: actual.title,
        predicted,
        actual: actualDur,
        accuracy,
        wasCritical: simTask.isCriticalPath,
      }
    }).filter(Boolean) as Array<{
      taskId: string; title: string; predicted: number; actual: number | null; accuracy: number | null; wasCritical: boolean
    }>
  }, [sim, swarm.tasks])

  const avgTaskAccuracy = useMemo(() => {
    const valid = taskAccuracy.filter((t) => t.accuracy !== null)
    if (valid.length === 0) return null
    return Math.round(valid.reduce((sum, t) => sum + t.accuracy!, 0) / valid.length)
  }, [taskAccuracy])

  return (
    <div style={{ padding: 12 }}>
      {/* Overall accuracy cards */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <AccuracyCard
          label="Duracion"
          predicted={`${Math.round(sim.predictedDuration)}m`}
          actual={`${Math.round(actualDuration)}m`}
          accuracy={durationAccuracy}
        />
        <AccuracyCard
          label="Conflictos"
          predicted={`${predConflicts}`}
          actual={`${actualConflicts}`}
          accuracy={predConflicts === actualConflicts ? 100 : predConflicts > 0
            ? Math.max(0, Math.round(100 - (Math.abs(predConflicts - actualConflicts) / predConflicts) * 100))
            : actualConflicts === 0 ? 100 : 0}
        />
        <AccuracyCard
          label="Tareas"
          predicted={`${sim.taskAssignments.length}`}
          actual={`${swarm.tasks.length}`}
          accuracy={avgTaskAccuracy ?? 0}
        />
      </div>

      {/* Per-task breakdown */}
      <div className="text-[8px] text-white/20 font-mono uppercase mb-2 tracking-wider">
        Precision por Tarea
      </div>
      {taskAccuracy.map((task) => (
        <div key={task.taskId}
          className="flex items-center gap-2 px-2 py-1.5 mb-0.5 rounded"
          style={{ background: 'rgba(255,255,255,0.01)', borderLeft: `2px solid ${task.wasCritical ? '#38bdf8' : 'rgba(255,255,255,0.05)'}` }}>
          <div className="flex-1 min-w-0">
            <span className="text-[9px] font-mono text-white/50 block truncate">{task.title}</span>
            <span className="text-[8px] font-mono text-white/20">
              Pred: {Math.round(task.predicted)}m · Actual: {task.actual !== null ? `${Math.round(task.actual)}m` : '—'}
            </span>
          </div>
          {task.accuracy !== null ? (
            <span className={`text-[10px] font-mono font-bold ${task.accuracy >= 70 ? 'text-emerald-400' : task.accuracy >= 40 ? 'text-amber-400' : 'text-red-400'}`}>
              {task.accuracy}%
            </span>
          ) : (
            <span className="text-[9px] font-mono text-white/15">—</span>
          )}
        </div>
      ))}
    </div>
  )
}

function AccuracyCard({ label, predicted, actual, accuracy }: {
  label: string; predicted: string; actual: string; accuracy: number
}) {
  const color = accuracy >= 70 ? '#34d399' : accuracy >= 40 ? '#f59e0b' : '#ef4444'
  return (
    <div className="rounded p-2" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
      <div className="text-[8px] font-mono text-white/25 uppercase mb-1">{label}</div>
      <div className="text-[16px] font-mono font-bold mb-1" style={{ color, fontVariantNumeric: 'tabular-nums' }}>
        {accuracy}%
      </div>
      <div className="text-[8px] font-mono text-white/20">
        <span>Pred: {predicted}</span>
        <span className="mx-1">·</span>
        <span>Real: {actual}</span>
      </div>
    </div>
  )
}

// ─── Insights Tab ───────────────────────────────────────────

function InsightsTab({ swarm, debriefResult }: { swarm: Swarm; debriefResult: DebriefResult | null }) {
  const sim = swarm.simulation

  return (
    <div style={{ padding: 12 }}>
      {/* Learnings from debrief */}
      {debriefResult?.learnings && debriefResult.learnings.length > 0 && (
        <div className="mb-4">
          <div className="text-[8px] text-white/20 font-mono uppercase mb-2 tracking-wider">
            Aprendizajes ({debriefResult.learnings.length})
          </div>
          {debriefResult.learnings.map((learning, i) => (
            <div key={i} className="flex items-start gap-2 mb-1.5 px-2 py-1.5 rounded"
              style={{ background: 'rgba(56,189,248,0.03)', borderLeft: '2px solid rgba(56,189,248,0.2)' }}>
              <Lightbulb className="w-3 h-3 text-sky-400/40 shrink-0 mt-0.5" />
              <span className="text-[9px] font-mono text-white/40" style={{ wordBreak: 'break-word' }}>{learning}</span>
            </div>
          ))}
        </div>
      )}

      {/* Next steps from debrief */}
      {debriefResult?.nextSteps && debriefResult.nextSteps.length > 0 && (
        <div className="mb-4">
          <div className="text-[8px] text-white/20 font-mono uppercase mb-2 tracking-wider">
            Proximos Pasos ({debriefResult.nextSteps.length})
          </div>
          {debriefResult.nextSteps.map((step, i) => (
            <div key={i} className="flex items-start gap-2 mb-1 px-2 py-1 rounded"
              style={{ background: 'rgba(52,211,153,0.03)', borderLeft: '2px solid rgba(52,211,153,0.2)' }}>
              <Zap className="w-3 h-3 text-emerald-400/40 shrink-0 mt-0.5" />
              <span className="text-[9px] font-mono text-white/40" style={{ wordBreak: 'break-word' }}>{step}</span>
            </div>
          ))}
        </div>
      )}

      {/* Risks that materialized (from simulation) */}
      {sim && sim.risks.length > 0 && (
        <div className="mb-4">
          <div className="text-[8px] text-white/20 font-mono uppercase mb-2 tracking-wider">
            Riesgos Predichos ({sim.risks.length})
          </div>
          {sim.risks.map((risk, i) => (
            <div key={i} className="flex items-start gap-2 mb-1 px-2 py-1 rounded"
              style={{
                background: risk.severity === 'high' ? 'rgba(239,68,68,0.03)' : 'rgba(245,158,11,0.03)',
                borderLeft: `2px solid ${risk.severity === 'high' ? 'rgba(239,68,68,0.3)' : 'rgba(245,158,11,0.2)'}`,
              }}>
              <AlertTriangleIcon severity={risk.severity} />
              <div className="flex-1 min-w-0">
                <span className="text-[9px] font-mono font-bold text-white/40 block">{risk.type}</span>
                <span className="text-[8px] font-mono text-white/25">{risk.description}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* LLM insights (if available) */}
      {sim?.llmInsights && sim.llmInsights.length > 0 && (
        <div>
          <div className="text-[8px] text-white/20 font-mono uppercase mb-2 tracking-wider">
            Analisis IA
          </div>
          {sim.llmInsights.map((insight, i) => (
            <div key={i} className="flex items-start gap-2 mb-1 px-2 py-1.5 rounded"
              style={{ background: 'rgba(139,92,246,0.03)', borderLeft: '2px solid rgba(139,92,246,0.2)' }}>
              <Brain className="w-3 h-3 text-violet-400/40 shrink-0 mt-0.5" />
              <span className="text-[9px] font-mono text-white/40" style={{ wordBreak: 'break-word' }}>{insight}</span>
            </div>
          ))}
        </div>
      )}

      {!debriefResult && !sim && <EmptyState text="Completa un swarm para ver insights" />}
    </div>
  )
}

function AlertTriangleIcon({ severity }: { severity: string }) {
  const color = severity === 'high' ? '#ef4444' : severity === 'medium' ? '#f59e0b' : '#64748b'
  return (
    <svg className="w-3 h-3 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex items-center justify-center h-full py-12">
      <span className="text-[10px] text-white/15 font-mono">{text}</span>
    </div>
  )
}
