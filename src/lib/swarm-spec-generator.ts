// Swarm Spec Generator — produces structured specification documents
// (requirements.md, architecture.md, tasks.md) from mission analysis data.
//
// These specs are written to {swarmRoot}/knowledge/ and serve as the
// work contract for all agents throughout the swarm session.
//
// No additional LLM calls — all content is derived from existing data:
// - Mission text + MissionAnalysis.riskAssessment -> requirements.md
// - MissionAnalysis.affectedModules + codebaseContext -> architecture.md
// - MissionAnalysis.tasks -> tasks.md

import type { MissionAnalysis, MissionTask } from './mission-planner'
import { swarmKnowledgePath } from './ghostshell'

// ─── Types ──────────────────────────────────────────────────────

export interface SwarmSpec {
  /** Markdown content for requirements.md */
  requirements: string
  /** Markdown content for architecture.md */
  architecture: string
  /** Markdown content for tasks.md */
  tasks: string
  /** ISO timestamp of generation */
  generatedAt: string
}

// ─── Priority Assignment ────────────────────────────────────────

type Priority = 'P0' | 'P1' | 'P2'

/**
 * Assign priority to a task based on complexity, dependencies, and position.
 *
 * P0 — Critical path: high complexity OR no dependencies (foundational)
 * P1 — Standard: medium complexity with dependencies
 * P2 — Nice-to-have: low complexity or late in the dependency chain
 */
function assignPriority(task: MissionTask, allTasks: MissionTask[]): Priority {
  // Tasks with no dependencies that other tasks depend on are foundational -> P0
  const isDependedOn = allTasks.some((t) => t.dependencies.includes(task.id))
  if (task.dependencies.length === 0 && isDependedOn) return 'P0'

  // High complexity tasks are critical path
  if (task.complexity === 'high') return 'P0'

  // Medium complexity or tasks that others depend on
  if (task.complexity === 'medium' || isDependedOn) return 'P1'

  // Everything else
  return 'P2'
}

/**
 * Derive acceptance criteria from a task. If the task has no explicit
 * criteria in the description, generate reasonable defaults from the
 * task title and metadata.
 */
function deriveAcceptanceCriteria(task: MissionTask): string[] {
  const criteria: string[] = []

  // Parse description for bullet-like criteria
  if (task.description) {
    const lines = task.description.split(/[.;]/).map((s) => s.trim()).filter(Boolean)
    for (const line of lines) {
      if (line.length > 10 && line.length < 200) {
        criteria.push(line)
      }
    }
  }

  // If no criteria extracted, generate from metadata
  if (criteria.length === 0) {
    criteria.push(`Implementation matches task description: "${task.title}"`)
    if (task.likelyFiles.length > 0) {
      criteria.push(`Changes are contained to: ${task.likelyFiles.join(', ')}`)
    }
    criteria.push('No regressions introduced')
    criteria.push('Code follows existing project conventions')
  }

  return criteria
}

// ─── Requirements Document ──────────────────────────────────────

function generateRequirements(
  mission: string,
  analysis: MissionAnalysis | null,
): string {
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ')
  const lines: string[] = []

  lines.push('# Requirements Specification')
  lines.push('')
  lines.push(`**Generated:** ${now}`)
  lines.push(`**Mission:** ${mission}`)
  lines.push('')
  lines.push('---')
  lines.push('')

  if (!analysis || analysis.tasks.length === 0) {
    lines.push('## Requirements')
    lines.push('')
    lines.push('_No mission analysis available. The coordinator will define requirements during execution._')
    lines.push('')
    lines.push('### Mission Statement')
    lines.push('')
    lines.push(`> ${mission}`)
    lines.push('')
    return lines.join('\n')
  }

  // Group tasks by priority
  const prioritized = analysis.tasks.map((task) => ({
    task,
    priority: assignPriority(task, analysis.tasks),
    criteria: deriveAcceptanceCriteria(task),
  }))

  const byPriority: Record<Priority, typeof prioritized> = { P0: [], P1: [], P2: [] }
  for (const item of prioritized) {
    byPriority[item.priority].push(item)
  }

  lines.push('## Functional Requirements')
  lines.push('')

  let reqNum = 1
  for (const priority of ['P0', 'P1', 'P2'] as Priority[]) {
    const items = byPriority[priority]
    if (items.length === 0) continue

    const priorityLabel = {
      P0: 'P0 - Critical Path',
      P1: 'P1 - Standard',
      P2: 'P2 - Nice-to-Have',
    }[priority]

    lines.push(`### ${priorityLabel}`)
    lines.push('')

    for (const { task, criteria } of items) {
      lines.push(`**REQ-${String(reqNum).padStart(2, '0')}:** ${task.title}`)
      lines.push(`- **Priority:** ${priority}`)
      lines.push(`- **Complexity:** ${task.complexity.toUpperCase()}`)
      lines.push(`- **Estimated Time:** ${task.estimatedMinutes} minutes`)
      if (task.description) {
        lines.push(`- **Description:** ${task.description}`)
      }
      lines.push(`- **Acceptance Criteria:**`)
      for (const c of criteria) {
        lines.push(`  - [ ] ${c}`)
      }
      lines.push('')
      reqNum++
    }
  }

  // Risk section
  if (analysis.riskAssessment.length > 0) {
    lines.push('---')
    lines.push('')
    lines.push('## Risk Assessment')
    lines.push('')
    for (let i = 0; i < analysis.riskAssessment.length; i++) {
      lines.push(`${i + 1}. ${analysis.riskAssessment[i]}`)
    }
    lines.push('')
  }

  // Duration estimate
  if (analysis.estimatedDuration) {
    lines.push('---')
    lines.push('')
    lines.push('## Estimated Duration')
    lines.push('')
    lines.push(`**Total:** ${analysis.estimatedDuration}`)
    const totalMinutes = analysis.tasks.reduce((sum, t) => sum + t.estimatedMinutes, 0)
    lines.push(`**Sum of Task Estimates:** ${totalMinutes} minutes`)
    lines.push('')
  }

  return lines.join('\n')
}

// ─── Architecture Document ──────────────────────────────────────

function generateArchitecture(
  mission: string,
  analysis: MissionAnalysis | null,
  codebaseContext: string | undefined,
): string {
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ')
  const lines: string[] = []

  lines.push('# Architecture Overview')
  lines.push('')
  lines.push(`**Generated:** ${now}`)
  lines.push(`**Mission:** ${mission}`)
  lines.push('')
  lines.push('---')
  lines.push('')

  // Codebase context section (from codebase-analyzer)
  if (codebaseContext) {
    lines.push('## Codebase Structure')
    lines.push('')
    lines.push(codebaseContext)
    lines.push('')
    lines.push('---')
    lines.push('')
  }

  if (!analysis) {
    lines.push('## Proposed Changes')
    lines.push('')
    lines.push('_No mission analysis available. Architecture decisions will be made during execution._')
    lines.push('')
    return lines.join('\n')
  }

  // Affected modules
  if (analysis.affectedModules.length > 0) {
    lines.push('## Affected Modules')
    lines.push('')
    lines.push('The following modules will be modified or created:')
    lines.push('')
    for (const mod of analysis.affectedModules) {
      lines.push(`- \`${mod}\``)
    }
    lines.push('')
    lines.push('---')
    lines.push('')
  }

  // Proposed changes — derived from tasks and their files
  lines.push('## Proposed Changes')
  lines.push('')

  // Group tasks by their likely module (first directory segment of likelyFiles)
  const moduleMap = new Map<string, MissionTask[]>()
  for (const task of analysis.tasks) {
    const modules = new Set<string>()
    for (const file of task.likelyFiles) {
      // Extract module from file path (e.g., "src/lib/foo.ts" -> "src/lib")
      const parts = file.replace(/\\/g, '/').split('/')
      if (parts.length >= 2) {
        modules.add(parts.slice(0, Math.min(parts.length - 1, 3)).join('/'))
      } else {
        modules.add('(root)')
      }
    }
    if (modules.size === 0) modules.add('(unspecified)')
    for (const mod of modules) {
      if (!moduleMap.has(mod)) moduleMap.set(mod, [])
      moduleMap.get(mod)!.push(task)
    }
  }

  if (moduleMap.size > 0) {
    for (const [mod, tasks] of moduleMap) {
      lines.push(`### \`${mod}\``)
      lines.push('')
      for (const task of tasks) {
        lines.push(`- **${task.title}** (${task.complexity})`)
        if (task.likelyFiles.length > 0) {
          lines.push(`  - Files: ${task.likelyFiles.map((f) => `\`${f}\``).join(', ')}`)
        }
      }
      lines.push('')
    }
  } else {
    lines.push('_No specific file changes identified. Refer to task breakdown for scope._')
    lines.push('')
  }

  // Dependency impacts
  const tasksWithDeps = analysis.tasks.filter((t) => t.dependencies.length > 0)
  if (tasksWithDeps.length > 0) {
    lines.push('---')
    lines.push('')
    lines.push('## Dependency Impacts')
    lines.push('')
    lines.push('Tasks with cross-cutting dependencies that require sequencing:')
    lines.push('')
    for (const task of tasksWithDeps) {
      lines.push(`- **${task.id}** (${task.title}) depends on: ${task.dependencies.join(', ')}`)
    }
    lines.push('')
  }

  // Risk factors that affect architecture
  if (analysis.riskAssessment.length > 0) {
    lines.push('---')
    lines.push('')
    lines.push('## Architectural Risks')
    lines.push('')
    for (const risk of analysis.riskAssessment) {
      lines.push(`- ${risk}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

// ─── Tasks Document ─────────────────────────────────────────────

function generateTasks(
  mission: string,
  analysis: MissionAnalysis | null,
): string {
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ')
  const lines: string[] = []

  lines.push('# Task Breakdown')
  lines.push('')
  lines.push(`**Generated:** ${now}`)
  lines.push(`**Mission:** ${mission}`)
  lines.push('')
  lines.push('---')
  lines.push('')

  if (!analysis || analysis.tasks.length === 0) {
    lines.push('## Tasks')
    lines.push('')
    lines.push('_No pre-seeded tasks. The coordinator will decompose the mission during execution._')
    lines.push('')
    return lines.join('\n')
  }

  // Summary
  const totalMinutes = analysis.tasks.reduce((sum, t) => sum + t.estimatedMinutes, 0)
  const complexityCounts = { low: 0, medium: 0, high: 0 }
  for (const t of analysis.tasks) complexityCounts[t.complexity]++

  lines.push('## Summary')
  lines.push('')
  lines.push(`- **Total Tasks:** ${analysis.tasks.length}`)
  lines.push(`- **Total Estimated Time:** ${totalMinutes} minutes`)
  lines.push(`- **Complexity Distribution:** ${complexityCounts.high} high, ${complexityCounts.medium} medium, ${complexityCounts.low} low`)
  lines.push('')
  lines.push('---')
  lines.push('')

  // Task table
  lines.push('## Task Table')
  lines.push('')
  lines.push('| ID | Title | Priority | Role | Dependencies | Est. Time | Complexity |')
  lines.push('|----|-------|----------|------|-------------|-----------|------------|')

  for (const task of analysis.tasks) {
    const priority = assignPriority(task, analysis.tasks)
    const deps = task.dependencies.length > 0 ? task.dependencies.join(', ') : 'none'
    const role = task.suggestedRole.charAt(0).toUpperCase() + task.suggestedRole.slice(1)
    lines.push(`| ${task.id} | ${task.title} | ${priority} | ${role} | ${deps} | ${task.estimatedMinutes}m | ${task.complexity} |`)
  }

  lines.push('')
  lines.push('---')
  lines.push('')

  // Detailed task cards
  lines.push('## Task Details')
  lines.push('')

  for (const task of analysis.tasks) {
    const priority = assignPriority(task, analysis.tasks)
    const criteria = deriveAcceptanceCriteria(task)

    lines.push(`### ${task.id}: ${task.title}`)
    lines.push('')
    lines.push(`- **Priority:** ${priority}`)
    lines.push(`- **Suggested Role:** ${task.suggestedRole}`)
    lines.push(`- **Complexity:** ${task.complexity}`)
    lines.push(`- **Estimated Time:** ${task.estimatedMinutes} minutes`)
    if (task.description) {
      lines.push(`- **Description:** ${task.description}`)
    }
    if (task.likelyFiles.length > 0) {
      lines.push(`- **Likely Files:** ${task.likelyFiles.map((f) => `\`${f}\``).join(', ')}`)
    }
    if (task.dependencies.length > 0) {
      lines.push(`- **Dependencies:** ${task.dependencies.join(', ')}`)
    }
    lines.push('- **Acceptance Criteria:**')
    for (const c of criteria) {
      lines.push(`  - [ ] ${c}`)
    }
    lines.push('')
  }

  // Dependency graph (text-based)
  const tasksWithDeps = analysis.tasks.filter((t) => t.dependencies.length > 0)
  if (tasksWithDeps.length > 0) {
    lines.push('---')
    lines.push('')
    lines.push('## Dependency Graph')
    lines.push('')
    lines.push('```')
    // Show tasks without deps first (roots)
    const roots = analysis.tasks.filter((t) => t.dependencies.length === 0)
    for (const root of roots) {
      lines.push(`[${root.id}] ${root.title}`)
      // Find direct dependents
      const dependents = analysis.tasks.filter((t) => t.dependencies.includes(root.id))
      for (const dep of dependents) {
        lines.push(`  └── [${dep.id}] ${dep.title}`)
        // Second level
        const subDeps = analysis.tasks.filter((t) => t.dependencies.includes(dep.id))
        for (const sub of subDeps) {
          lines.push(`        └── [${sub.id}] ${sub.title}`)
        }
      }
    }
    lines.push('```')
    lines.push('')
  }

  return lines.join('\n')
}

// ─── Preview (no file writes) ───────────────────────────────────

/**
 * Generate spec document content for preview purposes (wizard UI).
 * Returns the same markdown as generateSpecs but does NOT write files.
 */
export function previewSpecs(
  mission: string,
  missionAnalysis: MissionAnalysis | null,
): SwarmSpec {
  return {
    requirements: generateRequirements(mission, missionAnalysis),
    architecture: generateArchitecture(mission, missionAnalysis, undefined),
    tasks: generateTasks(mission, missionAnalysis),
    generatedAt: new Date().toISOString(),
  }
}

// ─── Main Entry Point ───────────────────────────────────────────

/**
 * Generate spec documents from mission analysis and codebase context.
 * Writes requirements.md, architecture.md, tasks.md to {swarmRoot}/knowledge/.
 *
 * This function is non-fatal — errors are caught by the caller.
 * No LLM calls; all content is derived from existing data structures.
 */
export async function generateSpecs(
  mission: string,
  missionAnalysis: MissionAnalysis | null,
  codebaseContext: string | undefined,
  swarmRoot: string,
): Promise<SwarmSpec> {
  const generatedAt = new Date().toISOString()
  const knowledgeDir = swarmKnowledgePath(swarmRoot)

  const requirements = generateRequirements(mission, missionAnalysis)
  const architecture = generateArchitecture(mission, missionAnalysis, codebaseContext)
  const tasks = generateTasks(mission, missionAnalysis)

  // Write all three spec documents
  await window.ghostshell.fsCreateFile(`${knowledgeDir}/requirements.md`, requirements)
  await window.ghostshell.fsCreateFile(`${knowledgeDir}/architecture.md`, architecture)
  await window.ghostshell.fsCreateFile(`${knowledgeDir}/tasks.md`, tasks)

  // Write a spec manifest for easy discovery
  const manifest = {
    generatedAt,
    mission,
    hasAnalysis: missionAnalysis !== null,
    taskCount: missionAnalysis?.tasks?.length ?? 0,
    files: {
      requirements: `${knowledgeDir}/requirements.md`,
      architecture: `${knowledgeDir}/architecture.md`,
      tasks: `${knowledgeDir}/tasks.md`,
    },
  }
  await window.ghostshell.fsCreateFile(
    `${knowledgeDir}/spec-manifest.json`,
    JSON.stringify(manifest, null, 2) + '\n',
  )

  return { requirements, architecture, tasks, generatedAt }
}
