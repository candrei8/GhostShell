// Swarm Report Generator — generates a structured summary report when a swarm completes.
//
// Reads artifacts from the swarm root directory (task-graph.json, FINDINGS.md,
// analyst reports) and combines them with swarm store data to produce a
// SwarmSummaryReport that gets persisted to {swarmRoot}/archive/summary-report.json.

import { useSwarmStore } from '../stores/swarmStore'
import { readFileSafe, writeFileSafe, mkdirSafe } from './ghostshell'
import { swarmBinPath, swarmKnowledgePath, swarmReportsPath } from './ghostshell'

// ─── Types ──────────────────────────────────────────────────

export interface SwarmSummaryReport {
  swarmId: string
  swarmName: string
  mission: string
  directory: string
  duration: number // ms
  agentCount: number
  roster: Array<{ label: string; role: string; provider: string }>
  tasks: {
    total: number
    completed: number
    failed: number
    breakdown: Array<{ id: string; title: string; status: string; owner: string }>
  }
  filesChanged: Array<{ path: string; status: string }>
  messagesExchanged: number
  metrics: {
    avgTaskDuration: number
    totalMessages: number
    bottlenecksDetected: number
  }
  scoutFindings: string[]
  analystRecommendations: string[]
  generatedAt: string
}

// ─── Helpers ────────────────────────────────────────────────

/** Extract scout findings summaries from FINDINGS.md (up to 500 chars per section). */
async function extractScoutFindings(swarmRoot: string): Promise<string[]> {
  const findings: string[] = []

  try {
    const findingsPath = `${swarmKnowledgePath(swarmRoot)}/FINDINGS.md`
    const content = await readFileSafe(findingsPath)
    if (!content) return findings

    // Split by heading lines to get individual sections
    const sections = content.split(/^#{1,3}\s+/m).filter((s) => s.trim().length > 0)

    for (const section of sections) {
      const trimmed = section.trim()
      if (trimmed.length === 0) continue
      // Skip the consolidated index header/boilerplate
      if (trimmed.startsWith('Scout Findings — Consolidated Index')) continue
      if (trimmed.includes('will be populated by') && trimmed.includes('Pending')) continue

      // Extract first meaningful paragraph (up to 500 chars)
      const lines = trimmed.split('\n').filter((l) => {
        const lt = l.trim()
        return lt.length > 0 && !lt.startsWith('---') && !lt.startsWith('**Status:** Pending')
      })
      const summary = lines.join(' ').slice(0, 500).trim()
      if (summary.length > 10) {
        findings.push(summary)
      }
    }
  } catch {
    // Non-fatal — findings may not exist
  }

  return findings.slice(0, 10) // Cap at 10 findings
}

/** Extract recommendations from the latest analyst report. */
async function extractAnalystRecommendations(swarmRoot: string): Promise<{
  recommendations: string[]
  bottlenecksDetected: number
}> {
  const result = { recommendations: [] as string[], bottlenecksDetected: 0 }

  try {
    const analystDir = `${swarmReportsPath(swarmRoot)}/analyst`
    const files = await window.ghostshell.fsReadDir(analystDir)
    const jsonFiles = files
      .filter((f: { name: string }) => f.name.endsWith('.json') && f.name.startsWith('analyst-report-'))
      .sort((a: { name: string }, b: { name: string }) => b.name.localeCompare(a.name))

    if (jsonFiles.length === 0) return result

    // Read the latest analyst report
    const latest = jsonFiles[0]
    const content = await readFileSafe(`${analystDir}/${latest.name}`)
    if (!content) return result

    const report = JSON.parse(content)
    if (report.type === 'analyst-report') {
      result.recommendations = Array.isArray(report.recommendations)
        ? report.recommendations.slice(0, 10)
        : []
      result.bottlenecksDetected = Array.isArray(report.bottlenecks)
        ? report.bottlenecks.length
        : 0
    }
  } catch {
    // Non-fatal — analyst reports may not exist
  }

  return result
}

/** Read task breakdown from task-graph.json. */
async function readTaskGraph(swarmRoot: string): Promise<{
  total: number
  completed: number
  failed: number
  breakdown: Array<{ id: string; title: string; status: string; owner: string }>
}> {
  const result = { total: 0, completed: 0, failed: 0, breakdown: [] as Array<{ id: string; title: string; status: string; owner: string }> }

  try {
    const taskGraphPath = `${swarmBinPath(swarmRoot)}/task-graph.json`
    const content = await readFileSafe(taskGraphPath)
    if (!content) return result

    const graph = JSON.parse(content)
    if (!graph.tasks) return result

    const tasks = Object.values(graph.tasks) as Array<{
      id: string
      title?: string
      status?: string
      owner?: string
      assignedTo?: string
    }>

    result.total = tasks.length
    result.breakdown = tasks.map((t) => ({
      id: t.id || 'unknown',
      title: t.title || '(untitled)',
      status: t.status || 'open',
      owner: t.owner || t.assignedTo || '(unassigned)',
    }))
    result.completed = tasks.filter((t) => t.status === 'done' || t.status === 'completed').length
    result.failed = tasks.filter((t) => t.status === 'failed' || t.status === 'error').length
  } catch {
    // Non-fatal — task graph may not be ready
  }

  return result
}

/** Get files changed in the project directory via git status. */
async function getFilesChanged(directory: string): Promise<Array<{ path: string; status: string }>> {
  const changed: Array<{ path: string; status: string }> = []

  try {
    const gitResult = await window.ghostshell.gitStatus(directory)
    if (!gitResult || !gitResult.fileStatuses) return changed

    const statusMap: Record<string, string> = gitResult.fileStatuses
    for (const [filePath, status] of Object.entries(statusMap)) {
      changed.push({ path: filePath, status: status || 'M' })
    }
  } catch {
    // Non-fatal — git may not be available
  }

  // Cap at 200 files to prevent report bloat
  return changed.slice(0, 200)
}

/** Build the roster label list from the swarm config. */
function buildRosterLabels(
  roster: Array<{ id: string; role: string; cliProvider: string; customName?: string }>,
): Array<{ label: string; role: string; provider: string }> {
  const roleCounts: Record<string, number> = {}

  return roster.map((agent) => {
    roleCounts[agent.role] = (roleCounts[agent.role] || 0) + 1
    const roleLabel = agent.role.charAt(0).toUpperCase() + agent.role.slice(1)
    const label = agent.customName || `${roleLabel} ${roleCounts[agent.role]}`
    return {
      label,
      role: agent.role,
      provider: agent.cliProvider,
    }
  })
}

// ─── Main ───────────────────────────────────────────────────

/**
 * Generate a summary report from a completed swarm.
 * Reads artifacts from the swarm root directory, computes metrics,
 * and persists the report to {swarmRoot}/archive/summary-report.json.
 *
 * Returns the report on success, null on failure.
 * This function is designed to never throw — all errors are caught and logged.
 */
export async function generateSwarmReport(swarmId: string): Promise<SwarmSummaryReport | null> {
  try {
    const swarm = useSwarmStore.getState().getSwarm(swarmId)
    if (!swarm) {
      console.warn('[swarm-report] Swarm not found:', swarmId)
      return null
    }

    const swarmRoot = swarm.swarmRoot
    if (!swarmRoot) {
      console.warn('[swarm-report] No swarmRoot for:', swarmId)
      return null
    }

    // Gather data in parallel where possible
    const [taskData, filesChanged, scoutFindings, analystData] = await Promise.all([
      readTaskGraph(swarmRoot),
      getFilesChanged(swarm.config.directory),
      extractScoutFindings(swarmRoot),
      extractAnalystRecommendations(swarmRoot),
    ])

    // Compute duration
    const startedAt = swarm.startedAt || swarm.config.createdAt
    const completedAt = swarm.completedAt || Date.now()
    const duration = completedAt - startedAt

    // Compute average task duration (rough estimate from total duration / completed tasks)
    const avgTaskDuration =
      taskData.completed > 0 ? Math.round(duration / taskData.completed) : 0

    // Use task-graph data, falling back to swarm store tasks
    const tasks = taskData.total > 0
      ? taskData
      : {
          total: swarm.tasks.length,
          completed: swarm.tasks.filter((t) => t.status === 'done').length,
          failed: 0,
          breakdown: swarm.tasks.map((t) => ({
            id: t.id,
            title: t.title,
            status: t.status,
            owner: t.owner,
          })),
        }

    const roster = buildRosterLabels(swarm.config.roster)

    const report: SwarmSummaryReport = {
      swarmId,
      swarmName: swarm.config.name,
      mission: swarm.config.mission,
      directory: swarm.config.directory,
      duration,
      agentCount: swarm.agents.length,
      roster,
      tasks,
      filesChanged,
      messagesExchanged: swarm.messages.length,
      metrics: {
        avgTaskDuration,
        totalMessages: swarm.messages.length,
        bottlenecksDetected: analystData.bottlenecksDetected,
      },
      scoutFindings,
      analystRecommendations: analystData.recommendations,
      generatedAt: new Date().toISOString(),
    }

    // Persist report to archive directory
    const archiveDir = `${swarmRoot}/archive`
    await mkdirSafe(archiveDir)

    const reportJson = JSON.stringify(report, null, 2)

    // Guard against oversized reports (100KB limit)
    if (reportJson.length > 100_000) {
      // Trim the breakdown and filesChanged to fit
      const trimmedReport = {
        ...report,
        tasks: {
          ...report.tasks,
          breakdown: report.tasks.breakdown.slice(0, 50),
        },
        filesChanged: report.filesChanged.slice(0, 50),
        scoutFindings: report.scoutFindings.slice(0, 5),
      }
      await writeFileSafe(`${archiveDir}/summary-report.json`, JSON.stringify(trimmedReport, null, 2))
    } else {
      await writeFileSafe(`${archiveDir}/summary-report.json`, reportJson)
    }

    console.log(`[swarm-report] Report generated for ${swarmId} (${reportJson.length} bytes)`)

    // Save to knowledge base (non-blocking)
    import('./swarm-knowledge-base').then(({ saveToKnowledgeBase }) => {
      saveToKnowledgeBase(report).catch((err) =>
        console.warn('[swarm-report] Failed to save to knowledge base:', err),
      )
    }).catch(() => {})

    return report
  } catch (err) {
    console.error('[swarm-report] Report generation failed:', err)
    return null
  }
}

/**
 * Load a previously generated report from the archive directory.
 * Returns null if not found or invalid.
 */
export async function loadSwarmReport(swarmRoot: string): Promise<SwarmSummaryReport | null> {
  try {
    const content = await readFileSafe(`${swarmRoot}/archive/summary-report.json`)
    if (!content) return null

    const report = JSON.parse(content) as SwarmSummaryReport
    // Basic shape validation
    if (!report.swarmId || !report.swarmName || !report.generatedAt) return null
    return report
  } catch {
    return null
  }
}
