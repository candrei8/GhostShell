// swarm-contract-planner — Contract-first task decomposition
// Generates interface contracts between tasks to prevent file conflicts
// Inspired by Microsoft Swarm Diaries: "the plan isn't just a plan, the plan is the product"

import type { SwarmTaskItem, SwarmRosterAgent } from './swarm-types'
import type { MissionTask } from './mission-planner'

// ─── Types ──────────────────────────────────────────────────

export interface TaskContract {
  taskId: string
  taskTitle: string
  owner: string               // roster agent id
  ownerLabel: string
  inputFiles: string[]         // files this task reads
  outputFiles: string[]        // files this task creates/modifies
  sharedFiles: string[]        // files used by other tasks too (overlap)
  dependsOn: string[]          // task IDs this depends on
  dependedBy: string[]         // task IDs that depend on this
}

export interface FileOverlap {
  filePath: string
  tasks: Array<{
    taskId: string
    taskTitle: string
    operation: 'read' | 'write'
  }>
  severity: 'safe' | 'warning' | 'critical'
  // safe = all reads, warning = 1 write + reads, critical = 2+ writes
}

export interface ContractAnalysis {
  contracts: TaskContract[]
  fileOverlaps: FileOverlap[]
  criticalOverlaps: number
  warningOverlaps: number
  safeOverlaps: number
  allFiles: string[]           // sorted unique list of all files across all tasks
  circularDeps: string[][]     // groups of tasks with circular dependencies
}

// ─── Main Function ──────────────────────────────────────────

export function analyzeContracts(
  tasks: SwarmTaskItem[],
  roster: SwarmRosterAgent[],
): ContractAnalysis {
  const rosterMap = new Map(roster.map((r) => [r.id, r]))

  // Build file → task mapping
  const fileToTasks = new Map<string, Array<{ taskId: string; taskTitle: string; operation: 'read' | 'write' }>>()

  for (const task of tasks) {
    for (const file of task.ownedFiles) {
      const arr = fileToTasks.get(file) || []
      // Tasks that OWN a file are considered writers
      arr.push({ taskId: task.id, taskTitle: task.title, operation: 'write' })
      fileToTasks.set(file, arr)
    }
  }

  // Build dependency reverse map (who depends on me)
  const dependedByMap = new Map<string, string[]>()
  for (const task of tasks) {
    for (const depId of task.dependsOn) {
      const arr = dependedByMap.get(depId) || []
      arr.push(task.id)
      dependedByMap.set(depId, arr)
    }
  }

  // Build contracts
  const contracts: TaskContract[] = tasks.map((task) => {
    const rosterAgent = rosterMap.get(task.owner)
    const roleDef = rosterAgent ? rosterAgent.role : 'custom'
    const label = rosterAgent?.customName || `${roleDef} ${task.owner}`

    // Input files = files from tasks this one depends on
    const inputFiles: string[] = []
    for (const depId of task.dependsOn) {
      const depTask = tasks.find((t) => t.id === depId)
      if (depTask) inputFiles.push(...depTask.ownedFiles)
    }

    // Shared files = owned files that appear in other tasks too
    const sharedFiles = task.ownedFiles.filter((f) => {
      const users = fileToTasks.get(f) || []
      return users.length > 1
    })

    return {
      taskId: task.id,
      taskTitle: task.title,
      owner: task.owner,
      ownerLabel: label,
      inputFiles: [...new Set(inputFiles)],
      outputFiles: task.ownedFiles,
      sharedFiles,
      dependsOn: task.dependsOn,
      dependedBy: dependedByMap.get(task.id) || [],
    }
  })

  // Compute file overlaps
  const fileOverlaps: FileOverlap[] = []
  for (const [filePath, taskEntries] of fileToTasks) {
    if (taskEntries.length < 2) continue

    const writeCount = taskEntries.filter((t) => t.operation === 'write').length
    const severity: FileOverlap['severity'] =
      writeCount >= 2 ? 'critical' : writeCount === 1 ? 'warning' : 'safe'

    fileOverlaps.push({
      filePath,
      tasks: taskEntries,
      severity,
    })
  }

  fileOverlaps.sort((a, b) => {
    const order = { critical: 0, warning: 1, safe: 2 }
    return order[a.severity] - order[b.severity]
  })

  // Detect circular dependencies
  const circularDeps = detectCircularDeps(tasks)

  // Collect all files
  const allFilesSet = new Set<string>()
  for (const task of tasks) {
    for (const f of task.ownedFiles) allFilesSet.add(f)
  }
  const allFiles = [...allFilesSet].sort()

  return {
    contracts,
    fileOverlaps,
    criticalOverlaps: fileOverlaps.filter((o) => o.severity === 'critical').length,
    warningOverlaps: fileOverlaps.filter((o) => o.severity === 'warning').length,
    safeOverlaps: fileOverlaps.filter((o) => o.severity === 'safe').length,
    allFiles,
    circularDeps,
  }
}

// ─── From MissionTasks (pre-launch analysis) ────────────────

export function analyzeContractsFromMission(
  missionTasks: MissionTask[],
  roster: SwarmRosterAgent[],
): ContractAnalysis {
  // Convert MissionTask → SwarmTaskItem shape
  const taskItems: SwarmTaskItem[] = missionTasks.map((mt) => ({
    id: mt.id,
    title: mt.title,
    owner: '',
    ownedFiles: mt.likelyFiles,
    dependsOn: mt.dependencies,
    status: 'open' as const,
    description: mt.description,
  }))

  return analyzeContracts(taskItems, roster)
}

// ─── Circular Dependency Detection ──────────────────────────

function detectCircularDeps(tasks: SwarmTaskItem[]): string[][] {
  const graph = new Map<string, string[]>()
  for (const task of tasks) {
    graph.set(task.id, task.dependsOn.filter((d) => tasks.some((t) => t.id === d)))
  }

  const visited = new Set<string>()
  const inStack = new Set<string>()
  const cycles: string[][] = []

  function dfs(node: string, path: string[]): void {
    if (inStack.has(node)) {
      const cycleStart = path.indexOf(node)
      if (cycleStart !== -1) {
        cycles.push(path.slice(cycleStart))
      }
      return
    }
    if (visited.has(node)) return

    visited.add(node)
    inStack.add(node)
    path.push(node)

    for (const dep of graph.get(node) || []) {
      dfs(dep, [...path])
    }

    inStack.delete(node)
  }

  for (const task of tasks) {
    if (!visited.has(task.id)) {
      dfs(task.id, [])
    }
  }

  return cycles
}
