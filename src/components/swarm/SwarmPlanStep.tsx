import { useState, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Network, Loader2, AlertTriangle, RotateCcw, Zap, Clock, Shield,
  ChevronDown, ChevronRight, ArrowRightLeft, CheckCircle2, XCircle,
  FolderTree, ListChecks, Users, FileText,
} from 'lucide-react'
import { useSwarmStore } from '../../stores/swarmStore'
import { analyzeMission } from '../../lib/mission-planner'
import type { MissionTask, MissionAnalysis, MissionPlannerStatus } from '../../lib/mission-planner'
import type { SwarmAgentRole, SwarmCliProvider } from '../../lib/swarm-types'
import { SWARM_ROLES, getRoleDef } from '../../lib/swarm-types'
import { previewSpecs } from '../../lib/swarm-spec-generator'
import type { SwarmSpec } from '../../lib/swarm-spec-generator'

const ACCENT = '#38bdf8'

type SpecTab = 'requirements' | 'architecture' | 'tasks'

const SPEC_TABS: { id: SpecTab; label: string; icon: typeof FileText }[] = [
  { id: 'requirements', label: 'Requisitos', icon: FileText },
  { id: 'architecture', label: 'Arquitectura', icon: FileText },
  { id: 'tasks', label: 'Tareas', icon: ListChecks },
]

// ─── Complexity Badge ───────────────────────────────────────────

function ComplexityBadge({ complexity }: { complexity: MissionTask['complexity'] }) {
  const config = {
    low: { label: 'BAJA', color: '#10b981', bg: 'rgba(16,185,129,0.1)', border: 'rgba(16,185,129,0.3)' },
    medium: { label: 'MEDIA', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.3)' },
    high: { label: 'ALTA', color: '#ef4444', bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.3)' },
  }[complexity]

  return (
    <span
      className="px-2 py-0.5 rounded text-[9px] font-bold font-mono uppercase tracking-widest"
      style={{ color: config.color, backgroundColor: config.bg, border: `1px solid ${config.border}` }}
    >
      {config.label}
    </span>
  )
}

// ─── Role Badge ─────────────────────────────────────────────────

function RoleBadge({ role }: { role: string }) {
  const roleDef = SWARM_ROLES.find((r) => r.id === role)
  const color = roleDef?.color || '#6b7280'
  const label = roleDef?.label?.toUpperCase() || role.toUpperCase()

  return (
    <span
      className="px-2 py-0.5 rounded text-[9px] font-bold font-mono uppercase tracking-widest"
      style={{ color, backgroundColor: `${color}15`, border: `1px solid ${color}40` }}
    >
      {label}
    </span>
  )
}

// ─── Task Row ───────────────────────────────────────────────────

function TaskRow({
  task,
  index,
  onUpdateTask,
}: {
  task: MissionTask
  index: number
  onUpdateTask: (taskId: string, updates: Partial<MissionTask>) => void
}) {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <div className="border-b border-white/[0.04] last:border-b-0">
      {/* Main row */}
      <div className="flex items-center gap-3 px-3 py-2.5 bg-white/[0.01] hover:bg-white/[0.04] transition-colors group">
        {/* Expand toggle */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-4 shrink-0 text-white/30 hover:text-white/60 transition-colors"
        >
          {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </button>

        {/* Index */}
        <span className="w-6 text-[10px] text-white/30 font-mono shrink-0">{index + 1}.</span>

        {/* Title (editable) */}
        <input
          type="text"
          value={task.title}
          onChange={(e) => onUpdateTask(task.id, { title: e.target.value })}
          className="flex-1 min-w-0 bg-transparent text-[11px] font-mono text-white/90 focus:outline-none focus:text-[#38bdf8] transition-colors truncate"
        />

        {/* Complexity */}
        <ComplexityBadge complexity={task.complexity} />

        {/* Role */}
        <RoleBadge role={task.suggestedRole} />

        {/* Estimated time */}
        <div className="flex items-center gap-1 shrink-0 w-16 justify-end">
          <Clock className="w-3 h-3 text-white/30" />
          <input
            type="number"
            value={task.estimatedMinutes}
            onChange={(e) => onUpdateTask(task.id, { estimatedMinutes: parseInt(e.target.value) || 0 })}
            className="w-8 bg-transparent text-[10px] font-mono text-white/60 text-right focus:outline-none focus:text-[#38bdf8]"
            min={1}
            max={999}
          />
          <span className="text-[9px] text-white/30 font-mono">m</span>
        </div>
      </div>

      {/* Expanded details */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="px-10 py-3 bg-white/[0.02] border-t border-white/[0.03] flex flex-col gap-2">
              {/* Description */}
              <div className="flex flex-col gap-1">
                <span className="text-[9px] text-white/40 font-mono uppercase tracking-widest">Descripcion</span>
                <textarea
                  value={task.description}
                  onChange={(e) => onUpdateTask(task.id, { description: e.target.value })}
                  rows={2}
                  className="w-full bg-white/[0.03] border border-white/10 rounded px-3 py-2 text-[11px] font-mono text-white/80 focus:outline-none focus:border-[#38bdf8] resize-none"
                />
              </div>

              {/* Likely files */}
              {task.likelyFiles.length > 0 && (
                <div className="flex flex-col gap-1">
                  <span className="text-[9px] text-white/40 font-mono uppercase tracking-widest">Archivos Probables</span>
                  <div className="flex flex-wrap gap-1.5">
                    {task.likelyFiles.map((file, fi) => (
                      <span
                        key={fi}
                        className="px-2 py-0.5 bg-white/[0.05] border border-white/10 rounded text-[10px] font-mono text-white/60"
                      >
                        {file}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Dependencies */}
              {task.dependencies.length > 0 && (
                <div className="flex flex-col gap-1">
                  <span className="text-[9px] text-white/40 font-mono uppercase tracking-widest">Depende De</span>
                  <div className="flex flex-wrap gap-1.5">
                    {task.dependencies.map((dep, di) => (
                      <span
                        key={di}
                        className="px-2 py-0.5 bg-[#38bdf8]/10 border border-[#38bdf8]/30 rounded text-[10px] font-mono text-[#38bdf8]/80"
                      >
                        {dep}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Editable role + complexity selects */}
              <div className="flex gap-4 mt-1">
                <div className="flex flex-col gap-1">
                  <span className="text-[9px] text-white/40 font-mono uppercase tracking-widest">Rol</span>
                  <select
                    value={task.suggestedRole}
                    onChange={(e) => onUpdateTask(task.id, { suggestedRole: e.target.value as MissionTask['suggestedRole'] })}
                    className="bg-white/[0.03] border border-white/10 rounded px-2 py-1 text-[10px] font-mono text-white/80 uppercase tracking-widest focus:outline-none focus:border-[#38bdf8] appearance-none cursor-pointer"
                  >
                    <option value="builder">Builder</option>
                    <option value="scout">Scout</option>
                    <option value="reviewer">Reviewer</option>
                    <option value="coordinator">Coordinator</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[9px] text-white/40 font-mono uppercase tracking-widest">Complejidad</span>
                  <select
                    value={task.complexity}
                    onChange={(e) => onUpdateTask(task.id, { complexity: e.target.value as MissionTask['complexity'] })}
                    className="bg-white/[0.03] border border-white/10 rounded px-2 py-1 text-[10px] font-mono text-white/80 uppercase tracking-widest focus:outline-none focus:border-[#38bdf8] appearance-none cursor-pointer"
                  >
                    <option value="low">Baja</option>
                    <option value="medium">Media</option>
                    <option value="high">Alta</option>
                  </select>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Main Component ─────────────────────────────────────────────

export function SwarmPlanStep() {
  const mission = useSwarmStore((s) => s.wizard.mission)
  const missionAnalysis = useSwarmStore((s) => s.wizard.missionAnalysis)
  const plannerStatus = useSwarmStore((s) => s.wizard.plannerStatus)
  const setMissionAnalysis = useSwarmStore((s) => s.setMissionAnalysis)
  const setPlannerStatus = useSwarmStore((s) => s.setPlannerStatus)
  const setRosterFromPreset = useSwarmStore((s) => s.setRosterFromPreset)
  const roster = useSwarmStore((s) => s.wizard.roster)

  // Local editable copy of tasks (synced to store on change)
  const [localTasks, setLocalTasks] = useState<MissionTask[]>(missionAnalysis?.tasks || [])
  const [showRisks, setShowRisks] = useState(false)
  const [showSpecs, setShowSpecs] = useState(false)
  const [specTab, setSpecTab] = useState<SpecTab>('requirements')

  // Detect the dominant provider from the current roster
  const dominantProvider = useMemo(() => {
    if (roster.length === 0) return 'claude'
    const counts: Record<string, number> = {}
    for (const agent of roster) {
      counts[agent.cliProvider] = (counts[agent.cliProvider] || 0) + 1
    }
    let max = 0
    let provider = 'claude'
    for (const [p, c] of Object.entries(counts)) {
      if (c > max) { max = c; provider = p }
    }
    return provider as 'claude' | 'gemini' | 'codex'
  }, [roster])

  const handleAnalyze = useCallback(async () => {
    if (!mission.trim()) return
    setPlannerStatus('analyzing')
    setMissionAnalysis(null)
    setLocalTasks([])

    try {
      const result = await analyzeMission(
        mission,
        // Use the current workspace path as fallback directory
        // (directory step comes after plan, so it may not be set yet)
        '.',
        undefined, // codebaseContext — not available at wizard time
        dominantProvider,
        (status) => setPlannerStatus(status),
      )

      if (result.analysis) {
        setMissionAnalysis(result.analysis)
        setLocalTasks(result.analysis.tasks)
        setPlannerStatus('done')
      } else {
        setPlannerStatus('error')
      }
    } catch (err) {
      console.error('[SwarmPlanStep] Analysis failed:', err)
      setPlannerStatus('error')
    }
  }, [mission, dominantProvider, setPlannerStatus, setMissionAnalysis])

  const handleSkip = useCallback(() => {
    setPlannerStatus('skipped')
    setMissionAnalysis(null)
  }, [setPlannerStatus, setMissionAnalysis])

  const handleUpdateTask = useCallback((taskId: string, updates: Partial<MissionTask>) => {
    setLocalTasks((prev) => {
      const updated = prev.map((t) => (t.id === taskId ? { ...t, ...updates } : t))
      // Sync back to store — read current analysis from store to avoid stale closure
      const analysis = useSwarmStore.getState().wizard.missionAnalysis
      if (analysis) {
        setMissionAnalysis({ ...analysis, tasks: updated })
      }
      return updated
    })
  }, [setMissionAnalysis])

  const handleApplyComposition = useCallback(() => {
    if (!missionAnalysis?.suggestedComposition) return
    const comp = missionAnalysis.suggestedComposition
    const composition: Record<SwarmAgentRole, number> = {
      coordinator: comp.coordinator || 1,
      builder: comp.builder || 1,
      scout: comp.scout || 0,
      reviewer: comp.reviewer || 0,
      analyst: comp.analyst || 0,
      custom: comp.custom || 0,
    }
    setRosterFromPreset(composition, dominantProvider as SwarmCliProvider)
  }, [missionAnalysis, dominantProvider, setRosterFromPreset])

  // Summary stats
  const totalMinutes = useMemo(() => localTasks.reduce((sum, t) => sum + t.estimatedMinutes, 0), [localTasks])
  const complexityCounts = useMemo(() => {
    const counts = { low: 0, medium: 0, high: 0 }
    for (const t of localTasks) counts[t.complexity]++
    return counts
  }, [localTasks])

  // Generate spec preview from current analysis state
  const specPreview = useMemo<SwarmSpec | null>(() => {
    if (!missionAnalysis || !mission.trim()) return null
    return previewSpecs(mission, missionAnalysis)
  }, [mission, missionAnalysis])

  const isAnalyzing = plannerStatus === 'analyzing'
  const isDone = plannerStatus === 'done' && missionAnalysis !== null
  const isError = plannerStatus === 'error'
  const isSkipped = plannerStatus === 'skipped'
  const isIdle = plannerStatus === 'idle'

  return (
    <div className="flex flex-col min-h-full max-w-5xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6 border-b border-white/10 pb-4 shrink-0">
        <Network className="w-5 h-5 text-[#38bdf8]" />
        <h3 className="text-[18px] font-bold text-white tracking-widest uppercase font-mono">PLANIFICADOR DE MISION</h3>
        <span className="ml-auto text-[9px] text-white/30 font-mono uppercase tracking-widest">Opcional</span>
      </div>

      {/* Idle / Not yet analyzed */}
      {(isIdle || isSkipped) && (
        <div className="flex-1 flex flex-col items-center justify-center gap-6 py-12">
          <div className="w-16 h-16 rounded-xl bg-white/[0.03] border border-white/10 flex items-center justify-center">
            <Network className="w-8 h-8 text-white/20" />
          </div>

          <div className="text-center max-w-md">
            <p className="text-[13px] text-white/60 font-mono leading-relaxed mb-2">
              El planificador analiza tu mision usando IA para generar un desglose de tareas,
              composicion sugerida y evaluacion de riesgos.
            </p>
            <p className="text-[10px] text-white/30 font-mono">
              Esto lanza un agente CLI temporal ({dominantProvider.toUpperCase()}) que produce un plan estructurado.
              Puedes saltar este paso si prefieres que el coordinador planifique durante la ejecucion.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleAnalyze}
              disabled={!mission.trim()}
              className="px-6 py-3 bg-[#38bdf8] text-black rounded text-[11px] font-black font-mono uppercase tracking-[0.2em] hover:bg-white transition-colors disabled:opacity-20 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Zap className="w-4 h-4" />
              ANALIZAR MISION
            </button>
            <button
              onClick={handleSkip}
              className="px-6 py-3 bg-white/[0.05] border border-white/10 text-white/60 rounded text-[11px] font-bold font-mono uppercase tracking-[0.15em] hover:text-white hover:bg-white/[0.1] transition-colors"
            >
              SALTAR
            </button>
          </div>

          {!mission.trim() && (
            <p className="text-[10px] text-yellow-500/70 font-mono">
              * Regresa al paso MISION para definir la directiva antes de analizar
            </p>
          )}

          {isSkipped && (
            <p className="text-[10px] text-white/40 font-mono flex items-center gap-1.5">
              <ArrowRightLeft className="w-3 h-3" /> Analisis omitido. Puedes proceder al siguiente paso.
            </p>
          )}
        </div>
      )}

      {/* Analyzing (loading state) */}
      {isAnalyzing && (
        <div className="flex-1 flex flex-col items-center justify-center gap-6 py-12">
          <div className="relative">
            <div className="w-16 h-16 rounded-xl bg-[#38bdf8]/10 border border-[#38bdf8]/30 flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-[#38bdf8] animate-spin" />
            </div>
          </div>

          <div className="text-center">
            <p className="text-[13px] text-white/80 font-mono font-bold mb-2">Analizando Mision...</p>
            <p className="text-[10px] text-white/40 font-mono">
              Agente CLI temporal procesando la directiva. Esto puede tomar hasta 90 segundos.
            </p>
          </div>

          {/* Pulsing progress bar */}
          <div className="w-64 h-1 bg-white/10 rounded-full overflow-hidden">
            <motion.div
              className="h-full rounded-full"
              style={{ backgroundColor: ACCENT }}
              animate={{ x: ['-100%', '100%'] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
            />
          </div>
        </div>
      )}

      {/* Error state */}
      {isError && (
        <div className="flex-1 flex flex-col items-center justify-center gap-6 py-12">
          <div className="w-16 h-16 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center justify-center">
            <XCircle className="w-8 h-8 text-red-400" />
          </div>

          <div className="text-center max-w-md">
            <p className="text-[13px] text-red-400 font-mono font-bold mb-2">Analisis Fallido</p>
            <p className="text-[10px] text-white/40 font-mono">
              El agente CLI no produjo un plan valido. Esto puede ocurrir si el CLI no esta instalado,
              no hay sesion activa, o la mision fue demasiado ambigua.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleAnalyze}
              className="px-6 py-3 bg-white/[0.05] border border-white/10 text-white/60 rounded text-[11px] font-bold font-mono uppercase tracking-[0.15em] hover:text-white hover:bg-white/[0.1] transition-colors flex items-center gap-2"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              REINTENTAR
            </button>
            <button
              onClick={handleSkip}
              className="px-6 py-3 bg-white/[0.05] border border-white/10 text-white/60 rounded text-[11px] font-bold font-mono uppercase tracking-[0.15em] hover:text-white hover:bg-white/[0.1] transition-colors"
            >
              SALTAR
            </button>
          </div>
        </div>
      )}

      {/* Analysis results */}
      {isDone && missionAnalysis && (
        <div className="flex flex-col gap-5 flex-1 min-h-0">

          {/* Summary bar */}
          <div className="flex items-center gap-4 px-4 py-3 bg-white/[0.03] border border-white/10 rounded-lg backdrop-blur-md shrink-0">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="text-[11px] font-mono text-white/80 font-bold">
              {localTasks.length} tarea{localTasks.length !== 1 ? 's' : ''} identificada{localTasks.length !== 1 ? 's' : ''}
            </span>
            <div className="flex items-center gap-1.5 ml-2">
              <Clock className="w-3 h-3 text-white/30" />
              <span className="text-[10px] font-mono text-white/50">
                {missionAnalysis.estimatedDuration}
              </span>
            </div>

            {/* Complexity distribution */}
            <div className="flex items-center gap-2 ml-auto">
              {complexityCounts.low > 0 && (
                <span className="text-[9px] font-mono text-emerald-400">{complexityCounts.low} baja</span>
              )}
              {complexityCounts.medium > 0 && (
                <span className="text-[9px] font-mono text-amber-400">{complexityCounts.medium} media</span>
              )}
              {complexityCounts.high > 0 && (
                <span className="text-[9px] font-mono text-red-400">{complexityCounts.high} alta</span>
              )}
              <span className="text-[9px] font-mono text-white/30 ml-1">|</span>
              <span className="text-[10px] font-mono text-white/50">{totalMinutes}m total</span>
            </div>
          </div>

          {/* Two-column layout: Tasks + Sidebar */}
          <div className="flex gap-5 flex-1 min-h-0">

            {/* Task breakdown table */}
            <div className="flex-1 flex flex-col border border-white/10 bg-white/[0.02] backdrop-blur-lg rounded-lg overflow-hidden min-h-0">
              {/* Table header */}
              <div className="flex items-center gap-3 px-3 py-2 bg-white/[0.03] border-b border-white/10 shrink-0">
                <div className="w-4" />
                <div className="w-6 text-[9px] text-white/40 font-mono uppercase tracking-widest">#</div>
                <div className="flex-1 text-[9px] text-white/40 font-mono uppercase tracking-widest">Tarea</div>
                <div className="w-14 text-[9px] text-white/40 font-mono uppercase tracking-widest text-center">Compl.</div>
                <div className="w-20 text-[9px] text-white/40 font-mono uppercase tracking-widest text-center">Rol</div>
                <div className="w-16 text-[9px] text-white/40 font-mono uppercase tracking-widest text-right">Est.</div>
              </div>

              {/* Table body */}
              <div className="flex-1 overflow-y-auto custom-scrollbar">
                {localTasks.map((task, i) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    index={i}
                    onUpdateTask={handleUpdateTask}
                  />
                ))}
              </div>
            </div>

            {/* Right sidebar: composition + risks + modules */}
            <div className="w-[240px] shrink-0 flex flex-col gap-4">

              {/* Suggested Composition */}
              <div className="flex flex-col gap-2.5 bg-white/[0.03] border border-white/10 rounded-lg p-4 backdrop-blur-md">
                <div className="flex items-center gap-2">
                  <Users className="w-3.5 h-3.5 text-[#38bdf8]/60" />
                  <span className="text-[9px] text-white/50 font-mono uppercase tracking-widest">Composicion Sugerida</span>
                </div>

                <div className="flex flex-col gap-1.5">
                  {Object.entries(missionAnalysis.suggestedComposition)
                    .filter(([, count]) => (count as number) > 0)
                    .map(([role, count]) => {
                      const roleDef = getRoleDef(role as SwarmAgentRole)
                      return (
                        <div key={role} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: roleDef.color }} />
                            <span className="text-[10px] font-mono text-white/70 uppercase tracking-widest">{roleDef.label}</span>
                          </div>
                          <span className="text-[11px] font-mono font-bold text-white/90">{count as number}</span>
                        </div>
                      )
                    })}
                </div>

                <button
                  onClick={handleApplyComposition}
                  className="mt-2 w-full py-2 bg-[#38bdf8]/10 border border-[#38bdf8]/30 rounded text-[9px] font-bold font-mono text-[#38bdf8] uppercase tracking-[0.15em] hover:bg-[#38bdf8]/20 transition-colors"
                >
                  APLICAR AL ROSTER
                </button>
              </div>

              {/* Affected Modules */}
              {missionAnalysis.affectedModules.length > 0 && (
                <div className="flex flex-col gap-2 bg-white/[0.03] border border-white/10 rounded-lg p-4 backdrop-blur-md">
                  <div className="flex items-center gap-2">
                    <FolderTree className="w-3.5 h-3.5 text-[#38bdf8]/60" />
                    <span className="text-[9px] text-white/50 font-mono uppercase tracking-widest">Modulos Afectados</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {missionAnalysis.affectedModules.map((mod, i) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 bg-white/[0.05] border border-white/10 rounded text-[10px] font-mono text-white/60"
                      >
                        {mod}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Risk Assessment */}
              {missionAnalysis.riskAssessment.length > 0 && (
                <div className="flex flex-col gap-2 bg-white/[0.03] border border-white/10 rounded-lg p-4 backdrop-blur-md">
                  <button
                    onClick={() => setShowRisks(!showRisks)}
                    className="flex items-center gap-2 w-full text-left"
                  >
                    <Shield className="w-3.5 h-3.5 text-amber-400/60" />
                    <span className="text-[9px] text-white/50 font-mono uppercase tracking-widest flex-1">
                      Riesgos ({missionAnalysis.riskAssessment.length})
                    </span>
                    <ChevronDown className={`w-3 h-3 text-white/30 transition-transform ${showRisks ? 'rotate-180' : ''}`} />
                  </button>

                  <AnimatePresence>
                    {showRisks && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="flex flex-col gap-1.5 pt-1">
                          {missionAnalysis.riskAssessment.map((risk, i) => (
                            <div key={i} className="flex items-start gap-2">
                              <AlertTriangle className="w-3 h-3 text-amber-400/50 shrink-0 mt-0.5" />
                              <span className="text-[10px] font-mono text-white/50 leading-relaxed">{risk}</span>
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {/* Re-analyze / Clear */}
              <div className="flex flex-col gap-2 mt-auto">
                <button
                  onClick={handleAnalyze}
                  className="w-full py-2 bg-white/[0.03] border border-white/10 rounded text-[9px] font-bold font-mono text-white/50 uppercase tracking-[0.15em] hover:text-white hover:bg-white/[0.06] transition-colors flex items-center justify-center gap-2"
                >
                  <RotateCcw className="w-3 h-3" />
                  RE-ANALIZAR
                </button>
                <button
                  onClick={() => {
                    setMissionAnalysis(null)
                    setLocalTasks([])
                    setPlannerStatus('idle')
                  }}
                  className="w-full py-2 bg-white/[0.03] border border-white/10 rounded text-[9px] font-bold font-mono text-white/40 uppercase tracking-[0.15em] hover:text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  LIMPIAR PLAN
                </button>
              </div>
            </div>
          </div>

          {/* Specs Preview — collapsible section showing generated spec documents */}
          {specPreview && (
            <div className="border border-white/10 bg-white/[0.02] backdrop-blur-lg rounded-lg overflow-hidden shrink-0">
              {/* Toggle header */}
              <button
                onClick={() => setShowSpecs(!showSpecs)}
                className="flex items-center gap-2.5 w-full px-4 py-2.5 bg-white/[0.03] hover:bg-white/[0.05] transition-colors text-left"
              >
                <FileText className="w-3.5 h-3.5 text-[#38bdf8]/60" />
                <span className="text-[9px] text-white/60 font-mono uppercase tracking-widest font-bold flex-1">
                  Vista Previa de Especificaciones
                </span>
                <span className="text-[9px] text-white/30 font-mono">3 docs</span>
                <ChevronDown className={`w-3 h-3 text-white/30 transition-transform ${showSpecs ? 'rotate-180' : ''}`} />
              </button>

              <AnimatePresence>
                {showSpecs && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="border-t border-white/[0.06]">
                      {/* Tab bar */}
                      <div className="flex items-center gap-0 border-b border-white/[0.06]">
                        {SPEC_TABS.map((tab) => {
                          const isActive = specTab === tab.id
                          return (
                            <button
                              key={tab.id}
                              onClick={() => setSpecTab(tab.id)}
                              className={`px-4 py-2 text-[9px] font-mono uppercase tracking-widest font-bold transition-colors relative ${
                                isActive
                                  ? 'text-[#38bdf8] bg-white/[0.03]'
                                  : 'text-white/40 hover:text-white/60'
                              }`}
                            >
                              {tab.label}
                              {isActive && (
                                <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#38bdf8]" />
                              )}
                            </button>
                          )
                        })}
                      </div>

                      {/* Spec content (read-only markdown rendered as plain text with pre) */}
                      <div className="max-h-[280px] overflow-y-auto custom-scrollbar p-4">
                        <pre className="text-[10px] font-mono text-white/60 leading-relaxed whitespace-pre-wrap break-words">
                          {specTab === 'requirements' && specPreview.requirements}
                          {specTab === 'architecture' && specPreview.architecture}
                          {specTab === 'tasks' && specPreview.tasks}
                        </pre>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
