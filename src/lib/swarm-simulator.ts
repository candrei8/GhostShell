// Swarm Simulator — predicts execution plan, conflicts, risks, and durations
// before any agent runs. Pure computation (no LLM required).
//
// Algorithm: topological sort → greedy agent assignment → parallel execution sim
// → critical path → conflict prediction → risk analysis → utilization

import type {
  SwarmConfig,
  SimulationResult,
  SimulatedTask,
  SimulatedTimelineSlot,
  SimulatedConflict,
  SimulatedRisk,
  AgentUtilization,
  KnowledgeGraph,
} from './swarm-types'
import type { MissionAnalysis, MissionTask } from './mission-planner'
import type { CodebaseMap } from './codebase-analyzer'
import { PROVIDER_ROLE_MATRIX } from './swarm-provider-intelligence'
import { getPersonaById } from './swarm-personas'
import {
  getTaskDurationEstimates,
  getConflictHistory,
} from './swarm-knowledge-graph'

// ─── Main Entry ─────────────────────────────────────────────

export async function simulateSwarm(
  config: SwarmConfig,
  analysis: MissionAnalysis,
  codebaseMap: CodebaseMap | null,
  graph: KnowledgeGraph | null,
): Promise<SimulationResult> {
  const tasks = analysis.tasks
  if (tasks.length === 0) {
    return emptyResult()
  }

  // 1. Topological sort
  const sorted = topologicalSort(tasks)

  // 2. Agent assignment (greedy scoring)
  const assignments = assignAgents(sorted, config, codebaseMap, graph)

  // 3. Duration prediction per task (uses assignments to find assigned persona)
  const durations = predictDurations(sorted, config, codebaseMap, graph, assignments)

  // 4. Parallel execution simulation
  const { timeline, totalDuration } = simulateParallel(sorted, assignments, durations, config)

  // 5. Critical path (uses actual contended timeline, not just durations)
  const criticalPath = computeCriticalPath(sorted, durations, timeline)

  // 6. Conflict prediction
  const conflicts = predictConflicts(sorted, assignments, graph)

  // 7. Risk analysis
  const risks = analyzeRisks(sorted, codebaseMap, graph, assignments)

  // 8. Agent utilization
  const utilization = computeUtilization(timeline, totalDuration, config)

  // 9. Build task assignments with enriched data
  const criticalPathSet = new Set(criticalPath)
  const taskAssignments: SimulatedTask[] = sorted.map((task) => {
    const assignedAgent = assignments.get(task.id) || config.roster[0]?.id || ''
    const dur = durations.get(task.id) || task.estimatedMinutes
    const slot = timeline.find((s) => s.taskId === task.id)
    const historicalData = graph ? getTaskDurationEstimates(graph, task.likelyFiles) : null
    const isCritical = criticalPathSet.has(task.id)

    // Real confidence score: base 50, adjust by multiple factors
    let confidence = 50
    if (historicalData !== null) confidence += 20
    if (task.complexity === 'low') confidence += 15
    else if (task.complexity === 'high') confidence -= 15
    if (task.likelyFiles.length <= 1) confidence += 10
    else if (task.likelyFiles.length > 5) confidence -= 10
    if (task.dependencies.length === 0) confidence += 5
    if (isCritical) confidence -= 10
    // Penalize divergence between historical and predicted
    if (historicalData !== null && dur > 0) {
      const divergence = Math.abs(historicalData - dur) / dur
      if (divergence > 0.5) confidence -= 10
    }
    confidence = Math.max(10, Math.min(95, confidence))

    return {
      taskId: task.id,
      assignedAgent,
      predictedDuration: dur,
      predictedStart: slot?.start || 0,
      predictedEnd: slot?.end || dur,
      isCriticalPath: isCritical,
      confidenceScore: confidence,
    }
  })

  return {
    predictedDuration: totalDuration,
    criticalPath,
    taskAssignments,
    timeline,
    conflicts,
    risks,
    utilization,
    simulatedAt: Date.now(),
  }
}

// ─── 1. Topological Sort ────────────────────────────────────

function topologicalSort(tasks: MissionTask[]): MissionTask[] {
  const taskMap = new Map(tasks.map((t) => [t.id, t]))
  const visited = new Set<string>()
  const result: MissionTask[] = []
  const visiting = new Set<string>() // cycle detection

  function visit(taskId: string) {
    if (visited.has(taskId)) return
    if (visiting.has(taskId)) {
      // Cycle detected — break it by skipping
      console.warn(`[simulator] Cycle detected at task ${taskId}, breaking dependency`)
      return
    }
    visiting.add(taskId)
    const task = taskMap.get(taskId)
    if (!task) return
    for (const depId of task.dependencies) {
      visit(depId)
    }
    visiting.delete(taskId)
    visited.add(taskId)
    result.push(task)
  }

  for (const task of tasks) {
    visit(task.id)
  }

  return result
}

// ─── 2. Agent Assignment ────────────────────────────────────

function assignAgents(
  tasks: MissionTask[],
  config: SwarmConfig,
  codebaseMap: CodebaseMap | null,
  graph: KnowledgeGraph | null,
): Map<string, string> {
  const assignments = new Map<string, string>()
  const agentLoad = new Map<string, number>() // rosterId → number of tasks
  for (const agent of config.roster) {
    agentLoad.set(agent.id, 0)
  }

  for (const task of tasks) {
    let bestAgent = ''
    let bestScore = -1

    for (const agent of config.roster) {
      // Role match (40%)
      const roleMatch = task.suggestedRole === agent.role ? 1 : 0.3
      const roleScore = roleMatch * 0.4

      // Provider score (20%)
      const providerMatrix = PROVIDER_ROLE_MATRIX[agent.cliProvider]
      const providerRoleScore = providerMatrix?.[agent.role]?.score || 5
      const providerScore = (providerRoleScore / 10) * 0.2

      // Expertise match (20%)
      let expertiseScore = 0.5
      if (agent.personaId) {
        const persona = getPersonaById(agent.personaId)
        if (persona) {
          const expertise = persona.expertise.map((e) => e.toLowerCase())
          const fileMatch = task.likelyFiles.some((f) =>
            expertise.some((e) => f.toLowerCase().includes(e)),
          )
          expertiseScore = fileMatch ? 0.9 : 0.4
        }
      }
      expertiseScore *= 0.2

      // Historical fit (20%) — from knowledge graph
      let historicalScore = 0.5
      if (graph && task.likelyFiles.length > 0) {
        const historicalDuration = getTaskDurationEstimates(graph, task.likelyFiles)
        historicalScore = historicalDuration !== null ? 0.7 : 0.5
      }
      historicalScore *= 0.2

      // Load balancing penalty: prefer less-loaded agents
      const currentLoad = agentLoad.get(agent.id) || 0
      const loadPenalty = currentLoad * 0.05

      const totalScore = roleScore + providerScore + expertiseScore + historicalScore - loadPenalty

      if (totalScore > bestScore) {
        bestScore = totalScore
        bestAgent = agent.id
      }
    }

    assignments.set(task.id, bestAgent)
    agentLoad.set(bestAgent, (agentLoad.get(bestAgent) || 0) + 1)
  }

  return assignments
}

// ─── 3. Duration Prediction ─────────────────────────────────

function predictDurations(
  tasks: MissionTask[],
  config: SwarmConfig,
  codebaseMap: CodebaseMap | null,
  graph: KnowledgeGraph | null,
  assignments: Map<string, string>,
): Map<string, number> {
  const durations = new Map<string, number>()
  const rosterMap = new Map(config.roster.map((a) => [a.id, a]))

  for (const task of tasks) {
    let base = task.estimatedMinutes || 10

    // Complexity multiplier
    const complexityMult =
      task.complexity === 'low' ? 0.8 :
      task.complexity === 'high' ? 1.5 : 1.0

    // Persona speed factor — use the ACTUALLY assigned agent, not first by role
    const assignedRosterId = assignments.get(task.id)
    const assignedAgent = assignedRosterId ? rosterMap.get(assignedRosterId) : undefined
    let speedFactor = 1.0
    if (assignedAgent?.personaId) {
      const persona = getPersonaById(assignedAgent.personaId)
      if (persona) {
        speedFactor =
          persona.riskTolerance === 'aggressive' ? 0.7 :
          persona.riskTolerance === 'conservative' ? 1.3 : 1.0
      }
    }

    // Historical adjustment
    let predicted = base * complexityMult * speedFactor
    if (graph) {
      const historical = getTaskDurationEstimates(graph, task.likelyFiles)
      if (historical !== null) {
        predicted = predicted * 0.6 + historical * 0.4
      }
    }

    // File complexity bonus
    if (codebaseMap && task.likelyFiles.length > 0) {
      const highComplexityFiles = task.likelyFiles.filter((f) => {
        const node = codebaseMap.nodes.find((n) => n.path === f)
        return node?.complexity === 'high'
      })
      if (highComplexityFiles.length > 0) {
        predicted *= 1.2
      }
    }

    durations.set(task.id, Math.round(predicted * 10) / 10)
  }

  return durations
}

// ─── 4. Parallel Execution Simulation ───────────────────────

function simulateParallel(
  tasks: MissionTask[],
  assignments: Map<string, string>,
  durations: Map<string, number>,
  config: SwarmConfig,
): { timeline: SimulatedTimelineSlot[]; totalDuration: number } {
  const timeline: SimulatedTimelineSlot[] = []
  const agentFreeAt = new Map<string, number>()
  const taskEndAt = new Map<string, number>()

  for (const agent of config.roster) {
    agentFreeAt.set(agent.id, 0)
  }

  for (const task of tasks) {
    const agentId = assignments.get(task.id) || config.roster[0]?.id || ''
    const duration = durations.get(task.id) || task.estimatedMinutes

    // Earliest start: max(agent free, all dependencies complete)
    const agentFree = agentFreeAt.get(agentId) || 0
    let depsComplete = 0
    for (const depId of task.dependencies) {
      const depEnd = taskEndAt.get(depId) || 0
      if (depEnd > depsComplete) depsComplete = depEnd
    }

    const start = Math.max(agentFree, depsComplete)
    const end = start + duration

    timeline.push({ agentRosterId: agentId, taskId: task.id, start, end })
    agentFreeAt.set(agentId, end)
    taskEndAt.set(task.id, end)
  }

  const totalDuration = Math.max(...[...taskEndAt.values()], 0)
  return { timeline, totalDuration }
}

// ─── 5. Critical Path (contention-aware) ────────────────────
//
// Uses the actual simulated timeline (which includes agent contention)
// instead of just dependency-chain durations. This finds the true
// bottleneck path through the contended schedule.

function computeCriticalPath(
  tasks: MissionTask[],
  durations: Map<string, number>,
  timeline: SimulatedTimelineSlot[],
): string[] {
  if (tasks.length === 0 || timeline.length === 0) return []

  // Build lookup: taskId → actual simulated slot
  const slotMap = new Map<string, SimulatedTimelineSlot>()
  for (const slot of timeline) {
    slotMap.set(slot.taskId, slot)
  }

  const taskMap = new Map(tasks.map((t) => [t.id, t]))

  // Find the task that finishes last — that's the end of the critical path
  let lastTask = ''
  let lastEnd = 0
  for (const slot of timeline) {
    if (slot.end > lastEnd) {
      lastEnd = slot.end
      lastTask = slot.taskId
    }
  }

  if (!lastTask) return []

  // Trace backward: for each task, find which predecessor (dependency or
  // agent-contention predecessor) determined its start time with zero slack.
  // Slack = task.start - max(dep.end, prev_on_same_agent.end)
  // A task is on the critical path if it has zero slack.
  const path: string[] = []
  let current: string | null = lastTask

  while (current) {
    path.unshift(current)
    const slot = slotMap.get(current)
    const task = taskMap.get(current)
    if (!slot || !task) break

    // Find which predecessor determined this task's start
    let bestPred: string | null = null
    let bestPredEnd = -1

    // Check dependency predecessors
    for (const depId of task.dependencies) {
      const depSlot = slotMap.get(depId)
      if (depSlot && depSlot.end > bestPredEnd) {
        bestPredEnd = depSlot.end
        bestPred = depId
      }
    }

    // Check agent-contention predecessor (task that ran just before this on same agent)
    const sameAgentSlots = timeline
      .filter((s) => s.agentRosterId === slot.agentRosterId && s.end <= slot.start)
      .sort((a, b) => b.end - a.end)

    if (sameAgentSlots.length > 0 && sameAgentSlots[0].end > bestPredEnd) {
      bestPredEnd = sameAgentSlots[0].end
      bestPred = sameAgentSlots[0].taskId
    }

    // Only follow the predecessor if it determined the start (zero/near-zero slack)
    if (bestPred && Math.abs(bestPredEnd - slot.start) < 0.1) {
      current = bestPred
    } else {
      current = null
    }
  }

  return path
}

// ─── 6. Conflict Prediction ─────────────────────────────────

function predictConflicts(
  tasks: MissionTask[],
  assignments: Map<string, string>,
  graph: KnowledgeGraph | null,
): SimulatedConflict[] {
  const fileToTasks = new Map<string, { taskId: string; agentId: string }[]>()

  for (const task of tasks) {
    const agentId = assignments.get(task.id) || ''
    for (const file of task.likelyFiles) {
      if (!fileToTasks.has(file)) fileToTasks.set(file, [])
      fileToTasks.get(file)!.push({ taskId: task.id, agentId })
    }
  }

  const conflicts: SimulatedConflict[] = []

  for (const [filePath, entries] of fileToTasks) {
    // Only files touched by 2+ different agents
    const uniqueAgents = new Set(entries.map((e) => e.agentId))
    if (uniqueAgents.size < 2) continue

    const historicalFreq = graph
      ? getConflictHistory(graph, filePath).frequency
      : 0

    conflicts.push({
      filePath,
      agents: [...uniqueAgents],
      taskIds: entries.map((e) => e.taskId),
      severity: uniqueAgents.size >= 3 || historicalFreq > 2 ? 'critical' : 'warning',
      historicalFrequency: historicalFreq,
    })
  }

  return conflicts.sort((a, b) => {
    const sevOrder = { critical: 0, warning: 1 }
    return sevOrder[a.severity] - sevOrder[b.severity]
  })
}

// ─── 7. Risk Analysis ───────────────────────────────────────

function analyzeRisks(
  tasks: MissionTask[],
  codebaseMap: CodebaseMap | null,
  graph: KnowledgeGraph | null,
  assignments: Map<string, string>,
): SimulatedRisk[] {
  const risks: SimulatedRisk[] = []

  for (const task of tasks) {
    // High complexity + hot files
    if (task.complexity === 'high' && codebaseMap) {
      const hotFiles = task.likelyFiles.filter((f) => {
        const node = codebaseMap.nodes.find((n) => n.path === f)
        return node && node.gitHotness > 70
      })
      if (hotFiles.length > 0) {
        risks.push({
          type: 'complexity',
          severity: 'high',
          description: `Tarea "${task.title}" modifica archivos complejos con alto trafico git`,
          affectedFiles: hotFiles,
          affectedTasks: [task.id],
        })
      }
    }

    // Files not in codebase map = unknown territory
    if (codebaseMap) {
      const knownPaths = new Set(codebaseMap.nodes.map((n) => n.path))
      const unknown = task.likelyFiles.filter((f) => !knownPaths.has(f))
      if (unknown.length > 0) {
        risks.push({
          type: 'unknown_territory',
          severity: 'medium',
          description: `Tarea "${task.title}" referencia ${unknown.length} archivo(s) no encontrado(s) en el mapa del codebase`,
          affectedFiles: unknown,
          affectedTasks: [task.id],
        })
      }
    }

    // Cross-module: tasks spanning 3+ modules
    if (codebaseMap) {
      const modules = new Set<string>()
      for (const file of task.likelyFiles) {
        const parts = file.split('/')
        if (parts.length >= 2) modules.add(parts.slice(0, 2).join('/'))
      }
      if (modules.size >= 3) {
        risks.push({
          type: 'cross_module',
          severity: 'medium',
          description: `Tarea "${task.title}" cruza ${modules.size} modulos — mayor riesgo de efectos secundarios`,
          affectedTasks: [task.id],
        })
      }
    }

    // Historical conflict-prone files
    if (graph) {
      for (const file of task.likelyFiles) {
        const history = getConflictHistory(graph, file)
        if (history.frequency >= 3) {
          risks.push({
            type: 'historical_conflict',
            severity: 'high',
            description: `Archivo "${file}" tiene ${history.frequency} conflictos previos registrados`,
            affectedFiles: [file],
            affectedTasks: [task.id],
          })
        }
      }
    }
  }

  // Bottleneck: agent with >90% of tasks
  const agentTaskCount = new Map<string, number>()
  for (const [, agentId] of assignments) {
    agentTaskCount.set(agentId, (agentTaskCount.get(agentId) || 0) + 1)
  }
  for (const [agentId, count] of agentTaskCount) {
    if (count / tasks.length > 0.5 && tasks.length >= 4) {
      risks.push({
        type: 'bottleneck',
        severity: 'high',
        description: `Agente ${agentId} tiene ${count}/${tasks.length} tareas asignadas — posible cuello de botella`,
        affectedTasks: [...assignments.entries()]
          .filter(([, a]) => a === agentId)
          .map(([t]) => t),
      })
    }
  }

  // Deduplicate by description
  const seen = new Set<string>()
  return risks.filter((r) => {
    if (seen.has(r.description)) return false
    seen.add(r.description)
    return true
  })
}

// ─── 8. Agent Utilization ───────────────────────────────────

function computeUtilization(
  timeline: SimulatedTimelineSlot[],
  totalDuration: number,
  config: SwarmConfig,
): AgentUtilization[] {
  if (totalDuration === 0) return []

  const agentBusy = new Map<string, number>()
  const agentTasks = new Map<string, number>()

  for (const slot of timeline) {
    const busy = (agentBusy.get(slot.agentRosterId) || 0) + (slot.end - slot.start)
    agentBusy.set(slot.agentRosterId, busy)
    agentTasks.set(slot.agentRosterId, (agentTasks.get(slot.agentRosterId) || 0) + 1)
  }

  return config.roster.map((agent) => {
    const busyMinutes = agentBusy.get(agent.id) || 0
    const util = totalDuration > 0 ? busyMinutes / totalDuration : 0
    return {
      rosterId: agent.id,
      predictedBusyMinutes: Math.round(busyMinutes * 10) / 10,
      utilization: Math.round(util * 100) / 100,
      taskCount: agentTasks.get(agent.id) || 0,
      isBottleneck: util > 0.9,
      isUnderutilized: util < 0.3,
    }
  })
}

// ─── 9. Optional LLM Analysis ───────────────────────────────
//
// Spawns a CLI agent with -p flag to analyze the simulation results
// and provide higher-level insights. Same pattern as mission-planner.ts.

export async function runLLMAnalysis(
  config: SwarmConfig,
  result: SimulationResult,
): Promise<string[]> {
  if (typeof window === 'undefined' || !window.ghostshell?.ptyCreate) return []

  const taskSummary = result.taskAssignments.map((t) => ({
    id: t.taskId,
    agent: t.assignedAgent,
    duration: t.predictedDuration,
    critical: t.isCriticalPath,
    confidence: t.confidenceScore,
  }))

  const prompt = `Analyze this GhostSwarm simulation and return ONLY a fenced JSON block with insights.

Mission: ${config.mission.slice(0, 500)}
Roster: ${config.roster.length} agents (${config.roster.map((r) => r.role).join(', ')})
Predicted Duration: ${Math.round(result.predictedDuration)}m
Critical Path: ${result.criticalPath.join(' → ')}
Conflicts: ${result.conflicts.length} predicted
Risks: ${result.risks.length} detected

Tasks:
${JSON.stringify(taskSummary, null, 2).slice(0, 2000)}

Return ONLY:
\`\`\`json
{
  "insights": [
    "insight 1: actionable recommendation",
    "insight 2: risk mitigation",
    "insight 3: optimization opportunity"
  ]
}
\`\`\`
`

  const dir = config.directory || '.'
  const promptFile = `${dir}/.ghostswarm/sim-analysis-prompt.md`

  try {
    await window.ghostshell.fsCreateDir(`${dir}/.ghostswarm`)
    await window.ghostshell.fsCreateFile(promptFile, prompt)

    // Spawn CLI with -p flag
    const isWin = navigator.userAgent.includes('Windows') || navigator.platform === 'Win32'
    const catCmd = isWin
      ? `Get-Content "${promptFile}" | claude -p --output-format json`
      : `cat "${promptFile}" | claude -p --output-format json`

    const ptyId = `sim-llm-${Date.now()}`
    await window.ghostshell.ptyCreate({
      id: ptyId,
      cwd: dir,
      cols: 200,
      rows: 50,
      provider: 'claude',
    })

    // Collect output
    let output = ''
    const cleanup = window.ghostshell.ptyOnData(ptyId, (data: string) => {
      output += data
    })

    // Write command
    const shell = isWin ? 'powershell' : 'bash'
    await window.ghostshell.ptyWrite(ptyId, catCmd + '\r')

    // Wait up to 60s for response
    const insights = await new Promise<string[]>((resolve) => {
      const timeout = setTimeout(() => resolve([]), 60_000)

      const exitCleanup = window.ghostshell.ptyOnExit(ptyId, () => {
        clearTimeout(timeout)
        exitCleanup?.()
        const parsed = extractInsights(output)
        resolve(parsed)
      })

      // Also try parsing periodically in case PTY doesn't exit cleanly
      const pollInterval = setInterval(() => {
        const parsed = extractInsights(output)
        if (parsed.length > 0) {
          clearInterval(pollInterval)
          clearTimeout(timeout)
          exitCleanup?.()
          resolve(parsed)
        }
      }, 5000)
    })

    cleanup?.()
    return insights
  } catch (err) {
    console.warn('[simulator] LLM analysis failed:', err)
    return []
  }
}

function extractInsights(output: string): string[] {
  try {
    // Try to find a JSON block in the output
    const jsonMatch = output.match(/```json\s*([\s\S]*?)```/)
    const jsonStr = jsonMatch ? jsonMatch[1] : output

    // Try direct parse
    const parsed = JSON.parse(jsonStr.trim())
    if (Array.isArray(parsed.insights)) return parsed.insights
    return []
  } catch {
    // Try to find any JSON object in the output
    const braceMatch = output.match(/\{[\s\S]*"insights"[\s\S]*\}/)
    if (braceMatch) {
      try {
        const parsed = JSON.parse(braceMatch[0])
        if (Array.isArray(parsed.insights)) return parsed.insights
      } catch { /* give up */ }
    }
    return []
  }
}

// ─── Helpers ────────────────────────────────────────────────

function emptyResult(): SimulationResult {
  return {
    predictedDuration: 0,
    criticalPath: [],
    taskAssignments: [],
    timeline: [],
    conflicts: [],
    risks: [],
    utilization: [],
    simulatedAt: Date.now(),
  }
}
