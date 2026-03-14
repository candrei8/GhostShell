// Swarm Task Manager — DAG manipulation for GhostSwarm task coordination
// Manages task dependencies, status transitions, and validation

import { SwarmTaskItem } from './swarm-types'

// ─── Types ───────────────────────────────────────────────────────

export interface TaskGraphNode extends SwarmTaskItem {
  assignedTo?: string
  createdAt?: number
  completedAt?: number
  reviewer?: string
  verdict?: 'approved' | 'changes_requested' | 'approved_with_notes'
  acceptanceCriteria?: string[]
  description?: string
}

export interface TaskGraph {
  tasks: Record<string, TaskGraphNode>
  dependencies: Array<{ from: string; to: string }>
}

// ─── File Operations ─────────────────────────────────────────────

async function readTaskGraph(swarmRoot: string): Promise<TaskGraph> {
  try {
    const result = await window.ghostshell.fsReadFile(
      `${swarmRoot}/bin/task-graph.json`
    )
    if (!result.success || !result.content) return { tasks: {}, dependencies: [] }
    return JSON.parse(result.content)
  } catch {
    return { tasks: {}, dependencies: [] }
  }
}

async function writeTaskGraph(swarmRoot: string, graph: TaskGraph): Promise<void> {
  await window.ghostshell.fsCreateFile(
    `${swarmRoot}/bin/task-graph.json`,
    JSON.stringify(graph, null, 2)
  )
}

// ─── Task Creation ───────────────────────────────────────────────

export async function createTask(
  swarmRoot: string,
  task: TaskGraphNode
): Promise<void> {
  const graph = await readTaskGraph(swarmRoot)

  graph.tasks[task.id] = {
    ...task,
    createdAt: task.createdAt || Date.now(),
  }

  // Update dependencies array
  const deps = task.dependsOn || []
  for (const depId of deps) {
    if (!graph.dependencies.find(d => d.from === depId && d.to === task.id)) {
      graph.dependencies.push({ from: depId, to: task.id })
    }
  }

  await writeTaskGraph(swarmRoot, graph)
}

// ─── Task Updates ────────────────────────────────────────────────

export async function updateTaskStatus(
  swarmRoot: string,
  taskId: string,
  status: SwarmTaskItem['status']
): Promise<void> {
  const graph = await readTaskGraph(swarmRoot)

  if (!graph.tasks[taskId]) {
    throw new Error(`Task ${taskId} not found`)
  }

  graph.tasks[taskId].status = status

  if (status === 'done') {
    graph.tasks[taskId].completedAt = Date.now()
  }

  await writeTaskGraph(swarmRoot, graph)
}

export async function assignTask(
  swarmRoot: string,
  taskId: string,
  agentName: string
): Promise<void> {
  const graph = await readTaskGraph(swarmRoot)

  if (!graph.tasks[taskId]) {
    throw new Error(`Task ${taskId} not found`)
  }

  graph.tasks[taskId].assignedTo = agentName
  graph.tasks[taskId].status = 'assigned'

  await writeTaskGraph(swarmRoot, graph)
}

export async function updateTask(
  swarmRoot: string,
  taskId: string,
  updates: Partial<TaskGraphNode>
): Promise<void> {
  const graph = await readTaskGraph(swarmRoot)

  if (!graph.tasks[taskId]) {
    throw new Error(`Task ${taskId} not found`)
  }

  graph.tasks[taskId] = {
    ...graph.tasks[taskId],
    ...updates,
  }

  // If dependencies changed, update dependency array
  if (updates.dependsOn) {
    // Remove old dependencies for this task
    graph.dependencies = graph.dependencies.filter(d => d.to !== taskId)

    // Add new dependencies
    for (const depId of updates.dependsOn) {
      graph.dependencies.push({ from: depId, to: taskId })
    }
  }

  await writeTaskGraph(swarmRoot, graph)
}

// ─── Task Queries ────────────────────────────────────────────────

export async function getTask(
  swarmRoot: string,
  taskId: string
): Promise<TaskGraphNode | null> {
  const graph = await readTaskGraph(swarmRoot)
  return graph.tasks[taskId] || null
}

export async function getAllTasks(swarmRoot: string): Promise<TaskGraphNode[]> {
  const graph = await readTaskGraph(swarmRoot)
  return Object.values(graph.tasks)
}

export async function getReadyTasks(swarmRoot: string): Promise<TaskGraphNode[]> {
  const graph = await readTaskGraph(swarmRoot)

  return Object.values(graph.tasks).filter(task => {
    // Must be in 'open' status (not yet assigned)
    if (task.status !== 'open') return false

    // All dependencies must be completed
    const deps = task.dependsOn || []
    return deps.every(depId => {
      const dep = graph.tasks[depId]
      return dep && dep.status === 'done'
    })
  })
}

export async function getTasksByStatus(
  swarmRoot: string,
  status: SwarmTaskItem['status']
): Promise<TaskGraphNode[]> {
  const graph = await readTaskGraph(swarmRoot)
  return Object.values(graph.tasks).filter(t => t.status === status)
}

export async function getTasksByOwner(
  swarmRoot: string,
  rosterId: string
): Promise<TaskGraphNode[]> {
  const graph = await readTaskGraph(swarmRoot)
  return Object.values(graph.tasks).filter(t => t.owner === rosterId)
}

// ─── Dependency Validation ───────────────────────────────────────

/**
 * Detect circular dependencies using DFS
 * Returns array of error messages (empty if valid)
 */
export function validateDependencies(tasks: Record<string, TaskGraphNode>): string[] {
  const errors: string[] = []
  const visited = new Set<string>()
  const recursionStack = new Set<string>()

  function dfs(taskId: string, path: string[]): boolean {
    if (recursionStack.has(taskId)) {
      const cycle = [...path, taskId].join(' → ')
      errors.push(`Circular dependency detected: ${cycle}`)
      return false
    }

    if (visited.has(taskId)) {
      return true
    }

    visited.add(taskId)
    recursionStack.add(taskId)

    const task = tasks[taskId]
    if (task) {
      for (const depId of (task.dependsOn || [])) {
        if (!tasks[depId]) {
          errors.push(`Task ${taskId} depends on non-existent task ${depId}`)
          continue
        }

        if (!dfs(depId, [...path, taskId])) {
          return false
        }
      }
    }

    recursionStack.delete(taskId)
    return true
  }

  // Check all tasks
  for (const taskId of Object.keys(tasks)) {
    if (!visited.has(taskId)) {
      dfs(taskId, [])
    }
  }

  return errors
}

export async function validateTaskGraph(swarmRoot: string): Promise<string[]> {
  const graph = await readTaskGraph(swarmRoot)
  return validateDependencies(graph.tasks)
}

// ─── Task Deletion ───────────────────────────────────────────────

export async function deleteTask(swarmRoot: string, taskId: string): Promise<void> {
  const graph = await readTaskGraph(swarmRoot)

  // Check if any task depends on this one
  const dependents = Object.values(graph.tasks).filter(t =>
    (t.dependsOn || []).includes(taskId)
  )

  if (dependents.length > 0) {
    throw new Error(
      `Cannot delete task ${taskId}: ${dependents.length} task(s) depend on it`
    )
  }

  delete graph.tasks[taskId]

  // Remove from dependencies array
  graph.dependencies = graph.dependencies.filter(
    d => d.from !== taskId && d.to !== taskId
  )

  await writeTaskGraph(swarmRoot, graph)
}

// ─── Batch Operations ────────────────────────────────────────────

export async function createTaskBatch(
  swarmRoot: string,
  tasks: TaskGraphNode[]
): Promise<void> {
  const graph = await readTaskGraph(swarmRoot)

  for (const task of tasks) {
    graph.tasks[task.id] = {
      ...task,
      createdAt: task.createdAt || Date.now(),
    }

    // Update dependencies
    for (const depId of (task.dependsOn || [])) {
      if (!graph.dependencies.find(d => d.from === depId && d.to === task.id)) {
        graph.dependencies.push({ from: depId, to: task.id })
      }
    }
  }

  // Validate before writing
  const errors = validateDependencies(graph.tasks)
  if (errors.length > 0) {
    throw new Error(`Invalid task graph:\n${errors.join('\n')}`)
  }

  await writeTaskGraph(swarmRoot, graph)
}
