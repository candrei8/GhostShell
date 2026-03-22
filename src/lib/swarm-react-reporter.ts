// Swarm ReACT Report Agent — post-swarm report generator using a structured
// Reason-Act-Observe loop. Produces a comprehensive markdown report by analyzing
// git changes, scout findings, analyst reports, and swarm messages.
//
// The report is written to {swarmRoot}/archive/react-report.md and can be
// viewed live in the SwarmArchivePanel via the SwarmReACTReportView component.

import { useSwarmStore } from '../stores/swarmStore'
import { readFileSafe, writeFileSafe, mkdirSafe } from './ghostshell'
import { swarmBinPath, swarmKnowledgePath, swarmReportsPath } from './ghostshell'

// ─── Types ──────────────────────────────────────────────────

export interface ReACTReportSection {
  title: string
  content: string
  toolsUsed: string[]
  generatedAt: string
}

export interface ReACTReport {
  swarmId: string
  swarmName: string
  sections: ReACTReportSection[]
  status: 'planning' | 'generating' | 'complete' | 'error'
  startedAt: number
  completedAt?: number
}

export type ReACTReportStatus = ReACTReport['status']

// ─── Helpers ────────────────────────────────────────────────

/** Read the task-graph.json and compute a summary. */
async function analyzeTaskGraph(swarmRoot: string): Promise<string> {
  try {
    const content = await readFileSafe(`${swarmBinPath(swarmRoot)}/task-graph.json`)
    if (!content) return 'No task graph found.'

    const graph = JSON.parse(content)
    if (!graph.tasks || typeof graph.tasks !== 'object') return 'Empty task graph.'

    const tasks = Object.values(graph.tasks) as Array<{
      id: string
      title?: string
      status?: string
      owner?: string
      assignedTo?: string
      description?: string
      ownedFiles?: string[]
      completedAt?: number
      createdAt?: number
    }>

    const total = tasks.length
    const done = tasks.filter(t => t.status === 'done' || t.status === 'completed').length
    const failed = tasks.filter(t => t.status === 'failed' || t.status === 'error').length
    const inProgress = tasks.filter(t => t.status === 'building' || t.status === 'assigned' || t.status === 'planning').length
    const inReview = tasks.filter(t => t.status === 'review').length
    const open = tasks.filter(t => t.status === 'open').length

    const lines: string[] = [
      `**Total Tasks:** ${total}`,
      `**Completed:** ${done} | **In Progress:** ${inProgress} | **In Review:** ${inReview} | **Open:** ${open} | **Failed:** ${failed}`,
      `**Completion Rate:** ${total > 0 ? Math.round((done / total) * 100) : 0}%`,
      '',
      '| Task | Owner | Status | Files |',
      '|------|-------|--------|-------|',
    ]

    for (const task of tasks) {
      const owner = task.owner || task.assignedTo || '--'
      const files = (task.ownedFiles || []).slice(0, 3).join(', ')
      const filesSuffix = (task.ownedFiles?.length || 0) > 3
        ? ` (+${(task.ownedFiles?.length || 0) - 3} more)`
        : ''
      lines.push(
        `| ${task.title || task.id} | ${owner} | ${task.status || 'unknown'} | ${files}${filesSuffix} |`,
      )
    }

    return lines.join('\n')
  } catch (err) {
    return `Error reading task graph: ${err}`
  }
}

/** Read git diff --stat equivalent from the filesystem. */
async function analyzeGitChanges(directory: string): Promise<string> {
  try {
    const gitResult = await window.ghostshell.gitStatus(directory)
    if (!gitResult || !gitResult.fileStatuses) return 'No git changes detected.'

    const statuses: Record<string, string> = gitResult.fileStatuses
    const entries = Object.entries(statuses)

    if (entries.length === 0) return 'No files changed.'

    const statusLabels: Record<string, string> = {
      M: 'Modified',
      A: 'Added',
      D: 'Deleted',
      R: 'Renamed',
      C: 'Copied',
      '?': 'Untracked',
      '??': 'Untracked',
    }

    const grouped: Record<string, string[]> = {}
    for (const [path, status] of entries) {
      const cleanStatus = status.trim().charAt(0).toUpperCase()
      const label = statusLabels[cleanStatus] || cleanStatus
      if (!grouped[label]) grouped[label] = []
      grouped[label].push(path)
    }

    const lines: string[] = [`**Total files changed:** ${entries.length}`, '']
    for (const [label, files] of Object.entries(grouped)) {
      lines.push(`### ${label} (${files.length})`)
      for (const file of files.slice(0, 20)) {
        lines.push(`- \`${file}\``)
      }
      if (files.length > 20) {
        lines.push(`- _...and ${files.length - 20} more_`)
      }
      lines.push('')
    }

    return lines.join('\n')
  } catch {
    return 'Unable to analyze git changes (git may not be available).'
  }
}

/** Read scout FINDINGS.md and per-scout findings. */
async function readScoutFindings(swarmRoot: string): Promise<string> {
  try {
    const findingsPath = `${swarmKnowledgePath(swarmRoot)}/FINDINGS.md`
    const content = await readFileSafe(findingsPath)
    if (!content) return 'No scout findings available.'

    // Truncate if too long
    if (content.length > 5000) {
      return content.slice(0, 5000) + '\n\n_...findings truncated at 5000 chars..._'
    }
    return content
  } catch {
    return 'Error reading scout findings.'
  }
}

/** Read analyst reports from reports/analyst/ directory. */
async function readAnalystReports(swarmRoot: string): Promise<string> {
  try {
    const analystDir = `${swarmReportsPath(swarmRoot)}/analyst`
    const files = await window.ghostshell.fsReadDir(analystDir)
    const jsonFiles = files
      .filter((f: { name: string }) => f.name.endsWith('.json') && f.name.startsWith('analyst-report-'))
      .sort((a: { name: string }, b: { name: string }) => b.name.localeCompare(a.name))

    if (jsonFiles.length === 0) return 'No analyst reports generated during this swarm.'

    const reports: string[] = []
    for (const file of jsonFiles.slice(0, 3)) {
      const content = await readFileSafe(`${analystDir}/${file.name}`)
      if (!content) continue

      try {
        const report = JSON.parse(content)
        const lines: string[] = [
          `**Report:** ${file.name}`,
          `**Summary:** ${report.summary || 'N/A'}`,
          `**Velocity:** ${report.velocityTrend || 'N/A'}`,
        ]

        if (report.bottlenecks?.length > 0) {
          lines.push('', '**Bottlenecks:**')
          for (const b of report.bottlenecks) {
            lines.push(`- [${b.severity}] ${b.agentLabel}: ${b.issue} → ${b.suggestedAction}`)
          }
        }

        if (report.recommendations?.length > 0) {
          lines.push('', '**Recommendations:**')
          for (const rec of report.recommendations) {
            lines.push(`- ${rec}`)
          }
        }

        reports.push(lines.join('\n'))
      } catch {
        reports.push(`**Report:** ${file.name} (parse error)`)
      }
    }

    return reports.join('\n\n---\n\n')
  } catch {
    return 'No analyst directory found.'
  }
}

/** Read swarm messages and summarize agent communications. */
function summarizeMessages(swarmId: string): string {
  const swarm = useSwarmStore.getState().getSwarm(swarmId)
  if (!swarm) return 'Swarm not found.'

  const messages = swarm.messages
  if (messages.length === 0) return 'No inter-agent messages recorded.'

  // Count by type
  const typeCounts: Record<string, number> = {}
  const agentMessageCounts: Record<string, number> = {}

  for (const msg of messages) {
    typeCounts[msg.type] = (typeCounts[msg.type] || 0) + 1
    agentMessageCounts[msg.from] = (agentMessageCounts[msg.from] || 0) + 1
  }

  const lines: string[] = [
    `**Total Messages:** ${messages.length}`,
    '',
    '**By Type:**',
  ]

  for (const [type, count] of Object.entries(typeCounts).sort((a, b) => b[1] - a[1])) {
    lines.push(`- ${type}: ${count}`)
  }

  lines.push('', '**By Agent (sent):**')
  for (const [agent, count] of Object.entries(agentMessageCounts).sort((a, b) => b[1] - a[1])) {
    lines.push(`- ${agent}: ${count}`)
  }

  // Include last 10 escalations for context
  const escalations = messages.filter(m => m.type === 'escalation')
  if (escalations.length > 0) {
    lines.push('', '**Recent Escalations:**')
    for (const esc of escalations.slice(-10)) {
      lines.push(`- [${new Date(esc.timestamp).toLocaleTimeString()}] ${esc.from} → ${esc.to}: ${esc.body.slice(0, 150)}`)
    }
  }

  return lines.join('\n')
}

// ─── Section Generators ─────────────────────────────────────

async function generateExecutiveSummary(
  swarmId: string,
  swarmRoot: string,
  directory: string,
): Promise<ReACTReportSection> {
  const swarm = useSwarmStore.getState().getSwarm(swarmId)
  const startedAt = swarm?.startedAt || swarm?.config.createdAt || 0
  const completedAt = swarm?.completedAt || Date.now()
  const duration = completedAt - startedAt
  const durationStr = formatMs(duration)

  const taskSummary = await analyzeTaskGraph(swarmRoot)
  const totalTasks = swarm?.tasks.length ?? 0
  const doneTasks = swarm?.tasks.filter(t => t.status === 'done').length ?? 0
  const agentCount = swarm?.agents.length ?? 0
  const messageCount = swarm?.messages.length ?? 0

  const content = [
    `## Executive Summary`,
    '',
    `**Swarm:** ${swarm?.config.name || 'Unknown'}`,
    `**Mission:** ${swarm?.config.mission || 'N/A'}`,
    `**Duration:** ${durationStr}`,
    `**Agents:** ${agentCount}`,
    `**Tasks:** ${doneTasks}/${totalTasks} completed`,
    `**Messages:** ${messageCount} exchanged`,
    '',
    `### Outcome`,
    '',
    totalTasks > 0 && doneTasks === totalTasks
      ? 'All tasks completed successfully. The swarm achieved its mission objectives.'
      : totalTasks > 0
        ? `${doneTasks} of ${totalTasks} tasks completed (${Math.round((doneTasks / totalTasks) * 100)}% completion rate). Some tasks may require follow-up.`
        : 'No formal tasks were tracked. Review the changes below for actual work output.',
    '',
    `### Task Overview`,
    '',
    taskSummary,
  ].join('\n')

  return {
    title: 'Executive Summary',
    content,
    toolsUsed: ['task-graph-analysis'],
    generatedAt: new Date().toISOString(),
  }
}

async function generateChangesSection(
  _swarmId: string,
  _swarmRoot: string,
  directory: string,
): Promise<ReACTReportSection> {
  const changes = await analyzeGitChanges(directory)

  const content = [
    `## Changes Made`,
    '',
    changes,
  ].join('\n')

  return {
    title: 'Changes Made',
    content,
    toolsUsed: ['git-status'],
    generatedAt: new Date().toISOString(),
  }
}

async function generateArchitectureSection(
  swarmId: string,
  swarmRoot: string,
  _directory: string,
): Promise<ReACTReportSection> {
  const scoutFindings = await readScoutFindings(swarmRoot)
  const swarm = useSwarmStore.getState().getSwarm(swarmId)

  // Read codebase map if available
  let codebaseMapSummary = ''
  try {
    const mapContent = await readFileSafe(`${swarmKnowledgePath(swarmRoot)}/codebase-map.json`)
    if (mapContent) {
      const map = JSON.parse(mapContent)
      if (map.totalFiles || map.languages) {
        const langSummary = map.languages
          ? Object.entries(map.languages as Record<string, number>)
              .sort((a, b) => (b[1] as number) - (a[1] as number))
              .slice(0, 5)
              .map(([lang, count]) => `${lang}: ${count}`)
              .join(', ')
          : 'N/A'
        codebaseMapSummary = `\n**Codebase:** ${map.totalFiles || 'unknown'} files | Languages: ${langSummary}\n`
      }
    }
  } catch {
    // Non-fatal
  }

  const content = [
    `## Architecture & Decisions`,
    '',
    codebaseMapSummary,
    '### Scout Intelligence',
    '',
    scoutFindings,
    '',
    '### Key Decisions',
    '',
    swarm?.messages
      .filter(m => m.type === 'escalation' || m.type === 'review_complete')
      .slice(-5)
      .map(m => `- **${m.from}:** ${m.body.slice(0, 200)}`)
      .join('\n') || '_No significant architectural decisions recorded in message log._',
  ].join('\n')

  return {
    title: 'Architecture & Decisions',
    content,
    toolsUsed: ['scout-findings', 'codebase-map', 'message-log'],
    generatedAt: new Date().toISOString(),
  }
}

async function generateQualitySection(
  _swarmId: string,
  swarmRoot: string,
  _directory: string,
): Promise<ReACTReportSection> {
  const analystReports = await readAnalystReports(swarmRoot)

  // Read review reports
  let reviewSummary = ''
  try {
    const reportsDir = swarmReportsPath(swarmRoot)
    const files = await window.ghostshell.fsReadDir(reportsDir)
    const reviewFiles = files.filter((f: { name: string }) =>
      f.name.startsWith('review-report-') && f.name.endsWith('.json'),
    )

    if (reviewFiles.length > 0) {
      let approved = 0
      let changesRequested = 0
      let approvedWithNotes = 0
      const issues: Array<{ severity: string; file: string; desc: string }> = []

      for (const file of reviewFiles) {
        const content = await readFileSafe(`${reportsDir}/${file.name}`)
        if (!content) continue
        try {
          const review = JSON.parse(content)
          if (review.verdict === 'approved') approved++
          else if (review.verdict === 'changes_requested') changesRequested++
          else if (review.verdict === 'approved_with_notes') approvedWithNotes++

          if (Array.isArray(review.issues)) {
            for (const issue of review.issues.slice(0, 5)) {
              issues.push({
                severity: issue.severity || 'unknown',
                file: issue.file || 'N/A',
                desc: issue.description || '',
              })
            }
          }
        } catch {
          // Skip malformed review files
        }
      }

      const reviewLines = [
        `**Reviews:** ${reviewFiles.length} total`,
        `**Verdicts:** ${approved} approved, ${approvedWithNotes} approved with notes, ${changesRequested} changes requested`,
      ]

      if (issues.length > 0) {
        reviewLines.push('', '**Notable Issues:**')
        for (const issue of issues.slice(0, 10)) {
          reviewLines.push(`- [${issue.severity}] \`${issue.file}\`: ${issue.desc.slice(0, 150)}`)
        }
      }

      reviewSummary = reviewLines.join('\n')
    } else {
      reviewSummary = '_No code review reports found._'
    }
  } catch {
    reviewSummary = '_Could not read review reports._'
  }

  const content = [
    `## Quality Assessment`,
    '',
    '### Code Reviews',
    '',
    reviewSummary,
    '',
    '### Analyst Reports',
    '',
    analystReports,
  ].join('\n')

  return {
    title: 'Quality Assessment',
    content,
    toolsUsed: ['review-reports', 'analyst-reports'],
    generatedAt: new Date().toISOString(),
  }
}

async function generateRecommendationsSection(
  swarmId: string,
  swarmRoot: string,
  _directory: string,
): Promise<ReACTReportSection> {
  const swarm = useSwarmStore.getState().getSwarm(swarmId)

  // Gather unresolved items
  const openTasks: string[] = []
  try {
    const content = await readFileSafe(`${swarmBinPath(swarmRoot)}/task-graph.json`)
    if (content) {
      const graph = JSON.parse(content)
      const tasks = Object.values(graph.tasks || {}) as Array<{ title?: string; status?: string; id: string }>
      for (const task of tasks) {
        if (task.status !== 'done' && task.status !== 'completed') {
          openTasks.push(task.title || task.id)
        }
      }
    }
  } catch {
    // Non-fatal
  }

  // Read failed tasks
  const failedTasks = swarm?.tasks.filter(t => t.status === 'open' || t.status === 'assigned') || []

  const lines: string[] = [
    `## Recommendations & Next Steps`,
    '',
  ]

  if (openTasks.length > 0) {
    lines.push('### Unresolved Tasks', '')
    lines.push('The following tasks were not completed and may require follow-up:', '')
    for (const task of openTasks.slice(0, 20)) {
      lines.push(`- ${task}`)
    }
    if (openTasks.length > 20) {
      lines.push(`- _...and ${openTasks.length - 20} more_`)
    }
    lines.push('')
  }

  // General recommendations
  lines.push('### Suggested Follow-up', '')
  lines.push('- Review all modified files for consistency with the broader codebase')
  lines.push('- Run the full test suite to verify no regressions')
  lines.push('- Check for any TODO/FIXME comments added during the swarm')

  if (failedTasks.length > 0) {
    lines.push(`- ${failedTasks.length} task(s) remained in non-completed state — consider manual review`)
  }

  if (swarm && swarm.messages.filter(m => m.type === 'escalation').length > 3) {
    lines.push('- Multiple escalations detected — consider splitting the mission into smaller swarms next time')
  }

  const content = lines.join('\n')

  return {
    title: 'Recommendations',
    content,
    toolsUsed: ['task-graph-analysis', 'message-log'],
    generatedAt: new Date().toISOString(),
  }
}

// ─── Main Entry Point ───────────────────────────────────────

/**
 * Launch the ReACT report generator. Produces a comprehensive post-swarm report
 * by analyzing git changes, task graphs, scout findings, analyst reports, and
 * swarm messages. The report is structured as a series of sections, each generated
 * by a specialized analysis function.
 *
 * Calls `onProgress` after each section is generated so the UI can render
 * sections incrementally.
 *
 * The final report is written to `{swarmRoot}/archive/react-report.md`.
 */
export async function launchReACTReporter(
  swarmId: string,
  swarmRoot: string,
  directory: string,
  onProgress?: (report: Partial<ReACTReport>) => void,
): Promise<ReACTReport | null> {
  const swarm = useSwarmStore.getState().getSwarm(swarmId)
  if (!swarm) {
    console.warn('[react-reporter] Swarm not found:', swarmId)
    return null
  }

  const report: ReACTReport = {
    swarmId,
    swarmName: swarm.config.name,
    sections: [],
    status: 'planning',
    startedAt: Date.now(),
  }

  // Notify: planning
  onProgress?.({ ...report })

  try {
    // Transition to generating
    report.status = 'generating'
    onProgress?.({ ...report })

    // Generate sections in order
    const sectionGenerators = [
      generateExecutiveSummary,
      generateChangesSection,
      generateArchitectureSection,
      generateQualitySection,
      generateRecommendationsSection,
    ]

    for (const generator of sectionGenerators) {
      try {
        const section = await generator(swarmId, swarmRoot, directory)
        report.sections.push(section)
        // Notify after each section
        onProgress?.({ ...report, sections: [...report.sections] })
      } catch (err) {
        console.warn(`[react-reporter] Section generation failed:`, err)
        report.sections.push({
          title: 'Error',
          content: `Failed to generate this section: ${err}`,
          toolsUsed: [],
          generatedAt: new Date().toISOString(),
        })
        onProgress?.({ ...report, sections: [...report.sections] })
      }
    }

    // Mark complete
    report.status = 'complete'
    report.completedAt = Date.now()
    onProgress?.({ ...report })

    // Write the full report as markdown
    await persistReportAsMarkdown(report, swarmRoot)

    return report
  } catch (err) {
    console.error('[react-reporter] Report generation failed:', err)
    report.status = 'error'
    onProgress?.({ ...report })
    return report
  }
}

/** Write the completed report to {swarmRoot}/archive/react-report.md */
async function persistReportAsMarkdown(
  report: ReACTReport,
  swarmRoot: string,
): Promise<void> {
  try {
    const archiveDir = `${swarmRoot}/archive`
    await mkdirSafe(archiveDir)

    const lines: string[] = [
      `# ReACT Report: ${report.swarmName}`,
      '',
      `_Generated at ${new Date(report.completedAt || Date.now()).toLocaleString()}_`,
      `_Duration: ${formatMs((report.completedAt || Date.now()) - report.startedAt)}_`,
      '',
      '---',
      '',
    ]

    for (const section of report.sections) {
      lines.push(section.content)
      lines.push('')
      lines.push(`_Tools used: ${section.toolsUsed.join(', ') || 'none'}_`)
      lines.push('')
      lines.push('---')
      lines.push('')
    }

    const markdown = lines.join('\n')
    await writeFileSafe(`${archiveDir}/react-report.md`, markdown)

    // Also save the structured JSON for programmatic access
    await writeFileSafe(
      `${archiveDir}/react-report.json`,
      JSON.stringify(report, null, 2),
    )
  } catch (err) {
    console.error('[react-reporter] Failed to persist report:', err)
  }
}

// ─── Helpers ────────────────────────────────────────────────

function formatMs(ms: number): string {
  const totalSecs = Math.floor(ms / 1000)
  const hours = Math.floor(totalSecs / 3600)
  const mins = Math.floor((totalSecs % 3600) / 60)
  const secs = totalSecs % 60

  if (hours > 0) return `${hours}h ${mins}m ${secs}s`
  if (mins > 0) return `${mins}m ${secs}s`
  return `${secs}s`
}

/**
 * Load a previously generated ReACT report from disk.
 * Returns null if not found.
 */
export async function loadReACTReport(swarmRoot: string): Promise<ReACTReport | null> {
  try {
    const content = await readFileSafe(`${swarmRoot}/archive/react-report.json`)
    if (!content) return null

    const report = JSON.parse(content) as ReACTReport
    if (!report.swarmId || !report.swarmName) return null
    return report
  } catch {
    return null
  }
}
