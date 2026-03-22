// SwarmSimulationView — Simulation results for the wizard simulate step.
// Sub-panels: Status, Timeline (Gantt), Risks, Conflicts, Utilization.
// Glass UI, solid colors only, no gradients.

import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Activity, AlertTriangle, Check, Clock, Loader2,
  BarChart3, GitBranch, Shield, Zap, SkipForward,
  Play, ChevronDown, ChevronRight, Target,
} from 'lucide-react'
import { useSwarmStore } from '../../stores/swarmStore'
import { getRoleDef } from '../../lib/swarm-types'
import type {
  SimulationResult,
  SimulatedTask,
  SimulatedConflict,
  SimulatedRisk,
  AgentUtilization,
  SwarmRosterAgent,
} from '../../lib/swarm-types'

const ACCENT = '#38bdf8'

// ─── Status Bar ─────────────────────────────────────────────

function SimulationStatus({
  simulation,
  isRunning,
}: {
  simulation: SimulationResult | null
  isRunning: boolean
}) {
  if (isRunning) {
    return (
      <div className="flex items-center gap-3 px-5 py-3 bg-white/[0.02] border border-white/5 rounded-xl">
        <Loader2 className="w-4 h-4 text-sky-400 animate-spin" />
        <span className="font-mono text-xs text-white/60">Simulando ejecucion del enjambre...</span>
        <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
          <motion.div
            className="h-full w-[30%] rounded-full"
            style={{ backgroundColor: ACCENT }}
            animate={{ x: ['0%', '233%', '0%'] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
          />
        </div>
      </div>
    )
  }

  if (!simulation) return null

  return (
    <div className="flex items-center gap-4 px-5 py-3 bg-white/[0.02] border border-white/5 rounded-xl">
      <Check className="w-4 h-4 text-emerald-400" />
      <span className="font-mono text-xs text-white/60">Simulacion completa</span>
      <div className="flex items-center gap-6 ml-auto">
        <div className="flex items-center gap-1.5">
          <Clock className="w-3 h-3 text-white/40" />
          <span className="font-mono text-[11px] text-white/70">
            {Math.round(simulation.predictedDuration)}m predecidos
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Target className="w-3 h-3 text-white/40" />
          <span className="font-mono text-[11px] text-white/70">
            {simulation.taskAssignments.length} tareas
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <AlertTriangle className="w-3 h-3 text-white/40" />
          <span className="font-mono text-[11px] text-white/70">
            {simulation.risks.length} riesgos
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <GitBranch className="w-3 h-3 text-white/40" />
          <span className="font-mono text-[11px] text-white/70">
            {simulation.conflicts.length} conflictos
          </span>
        </div>
      </div>
    </div>
  )
}

// ─── Timeline (Gantt) ───────────────────────────────────────

function GanttTimeline({
  simulation,
  roster,
}: {
  simulation: SimulationResult
  roster: SwarmRosterAgent[]
}) {
  const rosterMap = useMemo(
    () => new Map(roster.map((r) => [r.id, r])),
    [roster],
  )

  const criticalSet = useMemo(
    () => new Set(simulation.criticalPath),
    [simulation.criticalPath],
  )

  const maxTime = simulation.predictedDuration || 1

  // Group timeline by agent
  const agentTimelines = useMemo(() => {
    const map = new Map<string, typeof simulation.timeline>()
    for (const slot of simulation.timeline) {
      if (!map.has(slot.agentRosterId)) map.set(slot.agentRosterId, [])
      map.get(slot.agentRosterId)!.push(slot)
    }
    return map
  }, [simulation.timeline])

  // Sorted agents (coordinators first, then by role)
  const sortedAgents = useMemo(() => {
    const roleOrder = ['coordinator', 'scout', 'builder', 'reviewer', 'analyst', 'custom']
    return roster
      .filter((r) => agentTimelines.has(r.id))
      .sort((a, b) => roleOrder.indexOf(a.role) - roleOrder.indexOf(b.role))
  }, [roster, agentTimelines])

  if (simulation.timeline.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-white/20 font-mono text-[10px] uppercase tracking-widest">
        Sin datos de linea de tiempo
      </div>
    )
  }

  // Time markers
  const markers = useMemo(() => {
    const count = Math.min(6, Math.ceil(maxTime / 5))
    const step = maxTime / count
    return Array.from({ length: count + 1 }, (_, i) => Math.round(i * step))
  }, [maxTime])

  return (
    <div className="flex flex-col gap-1 w-full overflow-x-auto">
      {/* Time axis */}
      <div className="flex items-center h-5">
        <div className="w-[120px] shrink-0" />
        <div className="flex-1 relative h-5">
          {markers.map((m) => (
            <div
              key={m}
              className="absolute font-mono text-[8px] text-white/30 uppercase"
              style={{ left: `${(m / maxTime) * 100}%`, transform: 'translateX(-50%)' }}
            >
              {m}m
            </div>
          ))}
        </div>
      </div>

      {/* Agent rows */}
      {sortedAgents.map((agent) => {
        const roleDef = getRoleDef(agent.role)
        const slots = agentTimelines.get(agent.id) || []
        const label = agent.customName || `${roleDef.label} ${roster.filter((r) => r.role === agent.role).indexOf(agent) + 1}`

        return (
          <div key={agent.id} className="flex items-center gap-0 h-7">
            {/* Agent label */}
            <div className="w-[120px] shrink-0 flex items-center gap-2 pr-2">
              <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: roleDef.color }} />
              <span className="font-mono text-[9px] text-white/60 truncate uppercase tracking-wider">
                {label}
              </span>
            </div>

            {/* Timeline bar */}
            <div className="flex-1 relative h-5 bg-white/[0.02] rounded">
              {slots.map((slot) => {
                const left = (slot.start / maxTime) * 100
                const width = Math.max(((slot.end - slot.start) / maxTime) * 100, 1)
                const isCritical = criticalSet.has(slot.taskId)
                const task = simulation.taskAssignments.find((t) => t.taskId === slot.taskId)

                return (
                  <div
                    key={slot.taskId}
                    className="absolute top-0.5 bottom-0.5 rounded-sm flex items-center justify-center overflow-hidden"
                    style={{
                      left: `${left}%`,
                      width: `${width}%`,
                      backgroundColor: isCritical ? ACCENT : `${roleDef.color}80`,
                      border: isCritical ? `1px solid ${ACCENT}` : `1px solid ${roleDef.color}40`,
                    }}
                    title={`${slot.taskId}: ${Math.round(slot.end - slot.start)}m ${isCritical ? '(ruta critica)' : ''}`}
                  >
                    {width > 5 && (
                      <span className="font-mono text-[7px] text-white/80 truncate px-1">
                        {slot.taskId.replace('task-', 'T')}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Risk Panel ─────────────────────────────────────────────

function RiskPanel({ risks }: { risks: SimulatedRisk[] }) {
  if (risks.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-white/20 font-mono text-[10px] uppercase tracking-widest">
        Sin riesgos detectados
      </div>
    )
  }

  const severityColor = {
    low: 'text-emerald-400 border-emerald-400/30',
    medium: 'text-amber-400 border-amber-400/30',
    high: 'text-red-400 border-red-400/30',
  }

  return (
    <div className="flex flex-col gap-2 overflow-y-auto custom-scrollbar">
      {risks.map((risk, i) => (
        <div key={i} className="flex items-start gap-3 p-3 bg-white/[0.01] border border-white/5 rounded-lg">
          <span className={`font-mono text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 border rounded shrink-0 mt-0.5 ${severityColor[risk.severity]}`}>
            {risk.severity}
          </span>
          <div className="flex flex-col gap-1 min-w-0">
            <span className="font-mono text-[10px] text-white/70">{risk.description}</span>
            {risk.affectedFiles && risk.affectedFiles.length > 0 && (
              <span className="font-mono text-[9px] text-white/30 truncate">
                {risk.affectedFiles.join(', ')}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Conflict Preview ───────────────────────────────────────

function ConflictPreview({ conflicts }: { conflicts: SimulatedConflict[] }) {
  if (conflicts.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-white/20 font-mono text-[10px] uppercase tracking-widest">
        Sin conflictos predecidos
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2 overflow-y-auto custom-scrollbar">
      {conflicts.map((conflict, i) => (
        <div key={i} className="flex items-start gap-3 p-3 bg-white/[0.01] border border-white/5 rounded-lg">
          <GitBranch className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${conflict.severity === 'critical' ? 'text-red-400' : 'text-amber-400'}`} />
          <div className="flex flex-col gap-1 min-w-0">
            <span className="font-mono text-[10px] text-white/70 truncate">{conflict.filePath}</span>
            <span className="font-mono text-[9px] text-white/40">
              {conflict.agents.length} agentes · {conflict.taskIds.length} tareas
              {conflict.historicalFrequency > 0 && ` · ${conflict.historicalFrequency} conflictos previos`}
            </span>
          </div>
          <span className={`font-mono text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 border rounded shrink-0 ${
            conflict.severity === 'critical' ? 'text-red-400 border-red-400/30' : 'text-amber-400 border-amber-400/30'
          }`}>
            {conflict.severity}
          </span>
        </div>
      ))}
    </div>
  )
}

// ─── Utilization Bars ───────────────────────────────────────

function UtilizationBars({
  utilization,
  roster,
}: {
  utilization: AgentUtilization[]
  roster: SwarmRosterAgent[]
}) {
  if (utilization.length === 0) return null

  return (
    <div className="flex flex-col gap-2">
      {utilization.map((u) => {
        const agent = roster.find((r) => r.id === u.rosterId)
        if (!agent) return null
        const roleDef = getRoleDef(agent.role)
        const pct = Math.round(u.utilization * 100)
        const color =
          u.isBottleneck ? '#ef4444' :
          u.isUnderutilized ? '#6b7280' :
          pct > 70 ? '#f59e0b' :
          '#10b981'
        const label = agent.customName || `${roleDef.label} ${roster.filter((r) => r.role === agent.role).indexOf(agent) + 1}`

        return (
          <div key={u.rosterId} className="flex items-center gap-3">
            <span className="w-[100px] font-mono text-[9px] text-white/50 truncate uppercase tracking-wider shrink-0">
              {label}
            </span>
            <div className="flex-1 h-3 bg-white/[0.03] rounded-sm overflow-hidden">
              <div
                className="h-full rounded-sm transition-all duration-300"
                style={{ width: `${pct}%`, backgroundColor: color }}
              />
            </div>
            <span className="w-10 font-mono text-[9px] text-white/50 text-right shrink-0">
              {pct}%
            </span>
            <span className="w-6 font-mono text-[8px] text-white/30 text-right shrink-0">
              ×{u.taskCount}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ─── Section Wrapper ────────────────────────────────────────

function Section({
  title,
  icon: Icon,
  children,
  defaultOpen = true,
  badge,
}: {
  title: string
  icon: React.ComponentType<{ className?: string }>
  children: React.ReactNode
  defaultOpen?: boolean
  badge?: string | number
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="bg-white/[0.01] border border-white/5 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2.5 w-full px-4 py-2.5 hover:bg-white/[0.02] transition-colors"
      >
        {open ? <ChevronDown className="w-3 h-3 text-white/30" /> : <ChevronRight className="w-3 h-3 text-white/30" />}
        <Icon className="w-3.5 h-3.5 text-sky-400/60" />
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/50 flex-1 text-left">
          {title}
        </span>
        {badge !== undefined && (
          <span className="font-mono text-[9px] text-white/30 bg-white/[0.03] px-1.5 py-0.5 rounded">
            {badge}
          </span>
        )}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-1">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Main Component ─────────────────────────────────────────

interface SwarmSimulationViewProps {
  onApprove: () => void
  onAdjust: () => void
  onSkip: () => void
}

export function SwarmSimulationView({ onApprove, onAdjust, onSkip }: SwarmSimulationViewProps) {
  const simulation = useSwarmStore((s) => s.wizard.simulation)
  const roster = useSwarmStore((s) => s.wizard.roster)
  const missionAnalysis = useSwarmStore((s) => s.wizard.missionAnalysis)
  const directory = useSwarmStore((s) => s.wizard.directory)
  const setSimulation = useSwarmStore((s) => s.setSimulation)
  const [isRunning, setIsRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [llmRunning, setLlmRunning] = useState(false)

  // Auto-trigger simulation on mount if not already done.
  // Uses a ref to track running state to avoid including isRunning in deps.
  const runningRef = useRef(false)

  useEffect(() => {
    if (simulation || runningRef.current || !missionAnalysis) return

    let cancelled = false
    runningRef.current = true
    setIsRunning(true)
    setError(null)

    async function run() {
      try {
        const { simulateSwarm } = await import('../../lib/swarm-simulator')

        // Try to load codebase map + knowledge graph
        let codebaseMap = null
        let knowledgeGraph = null

        try {
          const { analyzeCodebase } = await import('../../lib/codebase-analyzer')
          codebaseMap = await analyzeCodebase(directory)
        } catch { /* non-fatal */ }

        try {
          const { loadGraph } = await import('../../lib/swarm-knowledge-graph')
          knowledgeGraph = await loadGraph()
        } catch { /* non-fatal */ }

        // Read latest config from store (avoids stale closures)
        const config = useSwarmStore.getState().wizard
        const analysis = config.missionAnalysis
        if (!analysis || cancelled) return

        const result = await simulateSwarm(
          {
            name: config.swarmName,
            mission: config.mission,
            directory: config.directory,
            roster: config.roster,
            contextFiles: config.contextFiles,
            skills: config.enabledSkills,
            createdAt: Date.now(),
            missionAnalysis: analysis,
          },
          analysis,
          codebaseMap,
          knowledgeGraph,
        )

        if (!cancelled) {
          setSimulation(result)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Error en simulacion')
        }
      } finally {
        runningRef.current = false
        if (!cancelled) setIsRunning(false)
      }
    }

    run()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simulation, missionAnalysis])

  // Resimulate handler — clearing simulation re-triggers the useEffect
  const handleResimulate = useCallback(() => {
    runningRef.current = false
    setSimulation(null)
    setError(null)
  }, [setSimulation])

  // Optional LLM deep analysis
  const handleLLMAnalysis = useCallback(async () => {
    if (!simulation || llmRunning) return
    setLlmRunning(true)
    try {
      const { runLLMAnalysis } = await import('../../lib/swarm-simulator')
      const config = useSwarmStore.getState().wizard
      const insights = await runLLMAnalysis(
        {
          name: config.swarmName,
          mission: config.mission,
          directory: config.directory,
          roster: config.roster,
          contextFiles: config.contextFiles,
          skills: config.enabledSkills,
          createdAt: Date.now(),
          missionAnalysis: config.missionAnalysis || undefined,
        },
        simulation,
      )
      if (insights.length > 0) {
        setSimulation({ ...simulation, llmInsights: insights })
      }
    } catch (err) {
      console.warn('[simulation] LLM analysis failed:', err)
    } finally {
      setLlmRunning(false)
    }
  }, [simulation, llmRunning, setSimulation])

  return (
    <div className="flex flex-col gap-4 w-full max-w-[1400px] mx-auto h-full min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex flex-col gap-1">
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-sky-400">FASE 03</span>
          <h2 className="text-2xl font-black tracking-[0.15em] uppercase text-white">Simulacion</h2>
          <p className="font-mono text-[10px] text-white/40 uppercase tracking-[0.15em]">
            Prediccion de ejecucion antes del despliegue real
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={onSkip}
            className="flex items-center gap-1.5 px-4 py-2 text-white/40 hover:text-white/70 transition-colors font-mono text-[10px] uppercase tracking-[0.15em]"
          >
            <SkipForward className="w-3.5 h-3.5" />
            Omitir
          </button>
          {simulation && (
            <button
              onClick={handleResimulate}
              className="flex items-center gap-1.5 px-4 py-2 text-white/40 hover:text-sky-400 transition-colors font-mono text-[10px] uppercase tracking-[0.15em]"
            >
              <Activity className="w-3.5 h-3.5" />
              Re-simular
            </button>
          )}
        </div>
      </div>

      {/* Status bar */}
      <SimulationStatus simulation={simulation} isRunning={isRunning} />

      {/* Error state */}
      {error && (
        <div className="flex items-center gap-3 px-5 py-3 bg-red-500/5 border border-red-500/20 rounded-xl">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
          <span className="font-mono text-xs text-red-400/80">{error}</span>
        </div>
      )}

      {/* No analysis available */}
      {!missionAnalysis && !isRunning && (
        <div className="flex items-center gap-3 px-5 py-3 bg-amber-500/5 border border-amber-500/20 rounded-xl">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <span className="font-mono text-xs text-amber-400/80">
            Sin analisis de mision disponible. Regrese a Configurar y ejecute el analisis primero, o salte la simulacion.
          </span>
        </div>
      )}

      {/* Results */}
      {simulation && (
        <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-3 pb-4">
          {/* Timeline (Gantt) */}
          <Section title="Linea de Tiempo" icon={BarChart3} badge={`${Math.round(simulation.predictedDuration)}m`}>
            <div className="min-h-[120px]">
              <GanttTimeline simulation={simulation} roster={roster} />
            </div>
            {simulation.criticalPath.length > 0 && (
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-white/5">
                <div className="w-3 h-1 rounded-full" style={{ backgroundColor: ACCENT }} />
                <span className="font-mono text-[9px] text-white/40 uppercase tracking-wider">
                  Ruta critica: {simulation.criticalPath.join(' → ')}
                </span>
              </div>
            )}
          </Section>

          {/* Risks */}
          <Section title="Riesgos" icon={Shield} badge={simulation.risks.length}>
            <div className="max-h-[200px]">
              <RiskPanel risks={simulation.risks} />
            </div>
          </Section>

          {/* Conflicts */}
          <Section title="Conflictos Predecidos" icon={GitBranch} badge={simulation.conflicts.length} defaultOpen={simulation.conflicts.length > 0}>
            <div className="max-h-[200px]">
              <ConflictPreview conflicts={simulation.conflicts} />
            </div>
          </Section>

          {/* Utilization */}
          <Section title="Utilizacion de Agentes" icon={Zap} defaultOpen={false}>
            <UtilizationBars utilization={simulation.utilization} roster={roster} />
          </Section>

          {/* LLM Insights (optional deep analysis) */}
          {simulation.llmInsights && simulation.llmInsights.length > 0 && (
            <Section title="Analisis IA Profundo" icon={Target} badge={simulation.llmInsights.length}>
              <div className="flex flex-col gap-2">
                {simulation.llmInsights.map((insight, i) => (
                  <div key={i} className="flex items-start gap-2 py-1">
                    <Target className="w-3 h-3 text-sky-400/60 shrink-0 mt-0.5" />
                    <span className="font-mono text-[10px] text-white/70">{insight}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Run LLM Analysis button */}
          {!simulation.llmInsights && (
            <button
              onClick={handleLLMAnalysis}
              disabled={llmRunning}
              className="flex items-center gap-2 px-4 py-2.5 bg-white/[0.02] border border-white/5 rounded-xl hover:bg-white/[0.04] hover:border-white/10 transition-colors disabled:opacity-30"
            >
              {llmRunning ? (
                <Loader2 className="w-3.5 h-3.5 text-sky-400 animate-spin" />
              ) : (
                <Target className="w-3.5 h-3.5 text-sky-400/60" />
              )}
              <span className="font-mono text-[10px] text-white/50 uppercase tracking-[0.15em]">
                {llmRunning ? 'Analizando con IA...' : 'Analisis IA Profundo (opcional, ~30s)'}
              </span>
            </button>
          )}
        </div>
      )}

      {/* Bottom actions (only when simulation is ready) */}
      {simulation && (
        <div className="flex items-center justify-between shrink-0 pt-2 border-t border-white/5">
          <button
            onClick={onAdjust}
            className="flex items-center gap-2 px-5 py-2.5 text-white/40 hover:text-white/70 transition-colors font-mono text-[10px] uppercase tracking-[0.15em]"
          >
            Ajustar Equipo
          </button>
          <button
            onClick={onApprove}
            className="flex items-center gap-2 px-6 py-2.5 text-black font-bold font-mono text-[10px] uppercase tracking-[0.2em] transition-colors"
            style={{ backgroundColor: ACCENT }}
          >
            <Play className="w-3.5 h-3.5" />
            Aprobar y Desplegar
          </button>
        </div>
      )}
    </div>
  )
}
