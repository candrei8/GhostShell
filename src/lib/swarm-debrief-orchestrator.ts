// Swarm Debrief Orchestrator — post-execution analysis chain.
//
// Stages: Interview → ReACT Report → Accuracy Comparison → Knowledge Graph Update → Next Steps
// Each stage is non-blocking — if one fails, subsequent stages still run.

import type {
  DebriefResult,
  SimulationAccuracy,
  SimulationResult,
} from './swarm-types'
import { useSwarmStore } from '../stores/swarmStore'

// ─── Constants ──────────────────────────────────────────────

const RETRO_QUESTIONS = [
  'What was your biggest challenge during this swarm?',
  'What would you do differently next time?',
  'Which files or modules were most problematic?',
]

const INTERVIEW_TIMEOUT_MS = 120_000 // 2 minutes

// ─── Main Entry ─────────────────────────────────────────────

export async function runDebrief(
  swarmId: string,
  onProgress?: (stage: string, percent: number) => void,
): Promise<DebriefResult> {
  const result: DebriefResult = {
    interviews: [],
    learnings: [],
    nextSteps: [],
    completedAt: 0,
  }

  const swarm = useSwarmStore.getState().swarms.find((s) => s.id === swarmId)
  if (!swarm) {
    console.warn('[debrief] Swarm not found:', swarmId)
    result.completedAt = Date.now()
    return result
  }

  // ── Stage 1: Interviews (0-30%) ─────────────────────────────
  onProgress?.('Entrevistando agentes...', 5)
  try {
    const { batchInterview } = await import('./swarm-interview-manager')
    for (const question of RETRO_QUESTIONS) {
      onProgress?.('Entrevistando agentes...', 10)
      await batchInterview(swarmId, question)
    }

    // Wait for responses (with timeout)
    await waitForInterviews(swarmId, INTERVIEW_TIMEOUT_MS)
    onProgress?.('Entrevistas completadas', 30)

    // Collect interview answers from store
    const interviews = useSwarmStore.getState().interviews
    const agentAnswers = new Map<string, { question: string; answer: string }[]>()

    for (const interview of interviews) {
      if (interview.status === 'answered' && interview.answer) {
        if (!agentAnswers.has(interview.targetAgent)) {
          agentAnswers.set(interview.targetAgent, [])
        }
        agentAnswers.get(interview.targetAgent)!.push({
          question: interview.question,
          answer: interview.answer,
        })
      }
    }

    result.interviews = [...agentAnswers.entries()].map(([label, answers]) => ({
      agentLabel: label,
      answers,
    }))
  } catch (err) {
    console.warn('[debrief] Interview stage failed:', err)
  }

  // ── Stage 2: ReACT Report (30-60%) ──────────────────────────
  onProgress?.('Generando reporte ReACT...', 35)
  try {
    if (swarm.swarmRoot && swarm.config.directory) {
      const { launchReACTReporter } = await import('./swarm-react-reporter')
      await launchReACTReporter(swarmId, swarm.swarmRoot, swarm.config.directory)

      // Wait for report to be generated (poll for completion)
      await waitForReACTReport(swarmId, 120_000)
    }
    onProgress?.('Reporte generado', 60)
  } catch (err) {
    console.warn('[debrief] ReACT report stage failed:', err)
  }

  // ── Stage 3: Accuracy Comparison (60-75%) ───────────────────
  onProgress?.('Comparando predicciones vs realidad...', 65)
  try {
    if (swarm.simulation) {
      result.accuracy = computeAccuracy(swarm.simulation, swarmId)
    }
    onProgress?.('Comparacion completada', 75)
  } catch (err) {
    console.warn('[debrief] Accuracy comparison failed:', err)
  }

  // ── Stage 4: Knowledge Graph Update (75-90%) ────────────────
  onProgress?.('Actualizando grafo de conocimiento...', 78)
  try {
    const { loadGraph, saveGraph, ingestSwarmResults, pruneGraph } = await import('./swarm-knowledge-graph')
    const graph = await loadGraph()

    // Prepare data for ingestion
    const tasks = swarm.tasks.map((t) => ({
      id: t.id,
      title: t.title,
      ownedFiles: t.ownedFiles,
      owner: t.owner,
      status: t.status,
      startedAt: t.startedAt,
      completedAt: t.completedAt,
    }))

    const conflicts = useSwarmStore.getState().conflicts
      .filter((c) => c.status === 'active' || c.status === 'resolved')
      .map((c) => ({
        filePath: c.filePath,
        agents: c.agents.map((a) => ({ label: a.label })),
      }))

    const performanceProfiles = useSwarmStore.getState().performanceProfiles

    ingestSwarmResults(graph, swarmId, tasks, conflicts, performanceProfiles)
    pruneGraph(graph)
    await saveGraph(graph)
    onProgress?.('Grafo actualizado', 90)
  } catch (err) {
    console.warn('[debrief] Knowledge graph update failed:', err)
  }

  // ── Stage 5: Next Steps & Learnings (90-100%) ───────────────
  onProgress?.('Generando recomendaciones...', 92)
  try {
    // Incomplete tasks
    const incompleteTasks = swarm.tasks.filter((t) => t.status !== 'done')
    if (incompleteTasks.length > 0) {
      result.nextSteps.push(
        `${incompleteTasks.length} tarea(s) incompleta(s): ${incompleteTasks.map((t) => t.title).join(', ')}`,
      )
    }

    // High-conflict files
    const conflictFiles = useSwarmStore.getState().conflicts
      .filter((c) => c.severity === 'critical')
      .map((c) => c.filePath)
    if (conflictFiles.length > 0) {
      result.nextSteps.push(
        `Archivos con conflictos criticos: ${conflictFiles.slice(0, 5).join(', ')}`,
      )
    }

    // Learnings from interviews
    for (const interview of result.interviews) {
      for (const { answer } of interview.answers) {
        if (answer.length > 20) {
          result.learnings.push(`[${interview.agentLabel}] ${answer.slice(0, 200)}`)
        }
      }
    }

    // Accuracy insights
    if (result.accuracy) {
      const acc = result.accuracy
      if (acc.durationAccuracy < 50) {
        result.learnings.push(
          `Precision de duracion baja (${Math.round(acc.durationAccuracy)}%) — considerar ajustar estimaciones base`,
        )
      }
      if (acc.actualConflicts > acc.predictedConflicts * 2) {
        result.learnings.push(
          `Conflictos reales (${acc.actualConflicts}) superaron prediccion (${acc.predictedConflicts}) — mejorar particionado de archivos`,
        )
      }
    }

    // Default next step
    if (result.nextSteps.length === 0) {
      result.nextSteps.push('Todas las tareas completadas. Sin acciones pendientes.')
    }
  } catch (err) {
    console.warn('[debrief] Next steps generation failed:', err)
  }

  result.completedAt = Date.now()
  onProgress?.('Debrief completado', 100)

  // Store result in swarmStore
  try {
    useSwarmStore.getState().setDebriefResult(result)
  } catch { /* non-fatal */ }

  return result
}

// ─── Accuracy Computation ───────────────────────────────────

function computeAccuracy(
  simulation: SimulationResult,
  swarmId: string,
): SimulationAccuracy {
  const swarm = useSwarmStore.getState().swarms.find((s) => s.id === swarmId)
  if (!swarm) {
    return {
      predictedDuration: simulation.predictedDuration,
      actualDuration: 0,
      durationAccuracy: 0,
      predictedConflicts: simulation.conflicts.length,
      actualConflicts: 0,
      taskAccuracy: [],
    }
  }

  const actualDuration = swarm.startedAt && swarm.completedAt
    ? (swarm.completedAt - swarm.startedAt) / 60000
    : 0

  // Accuracy: 100% when perfect match, 0% when off by 100%+
  const maxDur = Math.max(simulation.predictedDuration, actualDuration)
  const durationAccuracy = maxDur > 0
    ? Math.max(0, Math.round(100 - (Math.abs(simulation.predictedDuration - actualDuration) / maxDur) * 100))
    : 0

  const actualConflicts = useSwarmStore.getState().conflicts
    .filter((c) => c.swarmId === swarmId).length

  // Per-task accuracy — use real startedAt/completedAt timestamps when available
  const taskAccuracy = simulation.taskAssignments.map((ta) => {
    const task = swarm.tasks.find((t) => t.id === ta.taskId)
    let actual = 0
    if (task?.startedAt && task?.completedAt) {
      actual = (task.completedAt - task.startedAt) / 60000
    } else {
      // Fallback: estimate proportionally from total duration
      const predictedRatio = simulation.predictedDuration > 0
        ? ta.predictedDuration / simulation.predictedDuration
        : 0
      actual = actualDuration * predictedRatio
    }
    return {
      taskId: ta.taskId,
      predicted: ta.predictedDuration,
      actual: Math.round(actual * 10) / 10,
    }
  })

  return {
    predictedDuration: Math.round(simulation.predictedDuration * 10) / 10,
    actualDuration: Math.round(actualDuration * 10) / 10,
    durationAccuracy: Math.round(durationAccuracy),
    predictedConflicts: simulation.conflicts.length,
    actualConflicts,
    taskAccuracy,
  }
}

// ─── Helpers ────────────────────────────────────────────────

function waitForInterviews(swarmId: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    const start = Date.now()
    // Get agent labels for this swarm to filter interviews
    let swarmAgentLabels: Set<string> | null = null
    try {
      const swarm = useSwarmStore.getState().swarms.find((s) => s.id === swarmId)
      if (swarm) {
        swarmAgentLabels = new Set(
          swarm.config.roster.map((r, i) => {
            const roleDef = { coordinator: 'Coordinator', builder: 'Builder', scout: 'Scout', reviewer: 'Reviewer', analyst: 'Analyst', custom: 'Custom' }
            const roleIndex = swarm.config.roster.slice(0, i).filter((a) => a.role === r.role).length
            return r.customName || `${roleDef[r.role] || 'Agent'} ${roleIndex + 1}`
          }),
        )
      }
    } catch { /* fallback to unfiltered */ }

    const check = () => {
      const interviews = useSwarmStore.getState().interviews
      const pending = interviews.filter((i) => {
        if (i.status !== 'pending' && i.status !== 'sent') return false
        // Only wait for interviews targeting agents in THIS swarm
        if (swarmAgentLabels && !swarmAgentLabels.has(i.targetAgent)) return false
        return true
      })
      if (pending.length === 0 || Date.now() - start > timeoutMs) {
        resolve()
      } else {
        setTimeout(check, 3000)
      }
    }
    // Small delay to let batch interviews register in store
    setTimeout(check, 2000)
  })
}

function waitForReACTReport(swarmId: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    const start = Date.now()
    let seenReport = false
    const check = () => {
      if (Date.now() - start > timeoutMs) {
        resolve()
        return
      }
      const report = useSwarmStore.getState().reactReport
      if (report) {
        seenReport = true
        if (report.status === 'complete' || report.status === 'error') {
          resolve()
          return
        }
      }
      // Only resolve on null if we already saw a report (it was cleared)
      // OR if enough time passed for the report to have been created
      if (!report && seenReport) {
        resolve()
        return
      }
      setTimeout(check, 3000)
    }
    // Initial delay to let launchReACTReporter create the report
    setTimeout(check, 5000)
  })
}
