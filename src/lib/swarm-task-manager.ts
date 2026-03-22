// Swarm Task Manager — DAG manipulation for GhostSwarm task coordination
// Manages task dependencies, status transitions, validation,
// injection scheduling, and delivery confirmation tracking

import { SwarmTaskItem, SwarmMessagePriority } from './swarm-types'

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
    const parsed = JSON.parse(result.content)
    // Basic shape validation
    if (!parsed || typeof parsed !== 'object' || typeof parsed.tasks !== 'object') {
      console.warn('[TaskManager] task-graph.json has unexpected shape, treating as empty')
      return { tasks: {}, dependencies: [] }
    }
    return parsed
  } catch (err) {
    console.warn('[TaskManager] Failed to read/parse task-graph.json:', err)
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

  // Validate no circular dependencies before writing
  const errors = validateDependencies(graph.tasks)
  if (errors.length > 0) {
    // Roll back — remove the task we just added
    delete graph.tasks[task.id]
    graph.dependencies = graph.dependencies.filter(d => d.to !== task.id)
    throw new Error(`Cannot create task — dependency errors:\n${errors.join('\n')}`)
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

  const previousTask = { ...graph.tasks[taskId] }
  const previousDeps = [...graph.dependencies]

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

  // Validate no circular dependencies when deps change
  if (updates.dependsOn) {
    const errors = validateDependencies(graph.tasks)
    if (errors.length > 0) {
      // Roll back
      graph.tasks[taskId] = previousTask
      graph.dependencies = previousDeps
      throw new Error(`Cannot update task — dependency errors:\n${errors.join('\n')}`)
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

// ─── Deadlock & Blocked Task Detection (Tier 3.4) ────────────

export interface BlockedTaskInfo {
  taskId: string
  title: string
  assignedTo?: string
  blockedBy: string[]   // dep IDs that aren't done
  status: string
}

/**
 * Detect tasks that are assigned/building but blocked because their
 * dependencies aren't all completed.  Also detects circular deps.
 */
export async function detectBlockedTasks(swarmRoot: string): Promise<{
  blockedTasks: BlockedTaskInfo[]
  cycles: string[]
}> {
  const graph = await readTaskGraph(swarmRoot)
  const cycles = validateDependencies(graph.tasks)
  const blockedTasks: BlockedTaskInfo[] = []

  for (const task of Object.values(graph.tasks)) {
    // Only care about tasks that are actively in-flight
    if (!['assigned', 'building', 'planning', 'review'].includes(task.status)) continue

    const deps = task.dependsOn || []
    const unblockedDeps = deps.filter(depId => {
      const dep = graph.tasks[depId]
      return !dep || dep.status !== 'done'
    })

    if (unblockedDeps.length > 0) {
      blockedTasks.push({
        taskId: task.id,
        title: task.title || task.id,
        assignedTo: task.assignedTo || task.owner,
        blockedBy: unblockedDeps,
        status: task.status,
      })
    }
  }

  return { blockedTasks, cycles }
}

// ─── Swarm Metrics (Tier 3.1) ──────────────────────────────────

export interface SwarmTaskMetrics {
  total: number
  open: number
  assigned: number
  planning: number
  building: number
  review: number
  done: number
  progressPercent: number
  blockedCount: number
}

export async function getSwarmTaskMetrics(swarmRoot: string): Promise<SwarmTaskMetrics> {
  const graph = await readTaskGraph(swarmRoot)
  const tasks = Object.values(graph.tasks)
  const total = tasks.length

  const counts: Record<string, number> = {
    open: 0, assigned: 0, planning: 0, building: 0, review: 0, done: 0,
  }

  for (const t of tasks) {
    counts[t.status] = (counts[t.status] || 0) + 1
  }

  // Count blocked (assigned/building/review with unresolved deps)
  let blockedCount = 0
  for (const t of tasks) {
    if (!['assigned', 'building', 'planning', 'review'].includes(t.status)) continue
    const deps = t.dependsOn || []
    const allDepsDone = deps.every(depId => {
      const dep = graph.tasks[depId]
      return dep && dep.status === 'done'
    })
    if (!allDepsDone) blockedCount++
  }

  return {
    total,
    open: counts.open,
    assigned: counts.assigned,
    planning: counts.planning,
    building: counts.building,
    review: counts.review,
    done: counts.done,
    progressPercent: total > 0 ? Math.round((counts.done / total) * 100) : 0,
    blockedCount,
  }
}

// ─── Injection Priority System (t4) ─────────────────────────────
//
// Maps message types to injection urgency levels so the message
// injector can schedule delivery appropriately.  Urgent messages
// (escalations, review feedback) are injected immediately, while
// low-priority messages (heartbeats, status) are batched/deferred.

/** Injection urgency derived from message type + explicit priority */
export type InjectionUrgency = 'immediate' | 'high' | 'normal' | 'low' | 'batch'

/**
 * Default urgency mapping for each message type.
 * 'escalation' and 'review_feedback' are time-sensitive and get injected
 * immediately.  'heartbeat' and 'status' are low-value and can be batched.
 */
const MESSAGE_TYPE_URGENCY: Record<string, InjectionUrgency> = {
  escalation: 'immediate',
  review_feedback: 'immediate',
  assignment: 'high',
  review_request: 'high',
  review_complete: 'high',
  interview: 'high',
  worker_done: 'high',
  message: 'normal',
  interview_response: 'normal',
  status: 'low',
  heartbeat: 'batch',
}

/**
 * Minimum delay (ms) before injecting a message at each urgency level.
 * Immediate messages bypass all deferral; batch messages accumulate.
 */
const URGENCY_DELAY_MS: Record<InjectionUrgency, number> = {
  immediate: 0,
  high: 500,
  normal: 1500,
  low: 5000,
  batch: 15000,
}

/**
 * Resolve the injection urgency for a message based on its type
 * and optional explicit priority field.
 *
 * An explicit `priority: 'urgent'` escalates any message type to
 * 'immediate'.  A `priority: 'low'` downgrades to at most 'low'.
 */
export function getInjectionUrgency(
  messageType: string,
  priority?: SwarmMessagePriority,
): InjectionUrgency {
  // Start with the type-based default
  let urgency = MESSAGE_TYPE_URGENCY[messageType] || 'normal'

  // Apply explicit priority override
  if (priority === 'urgent') {
    urgency = 'immediate'
  } else if (priority === 'low' && urgency !== 'immediate' && urgency !== 'high') {
    urgency = 'low'
  }

  return urgency
}

/**
 * Get the minimum delay (ms) before a message should be injected.
 */
export function getInjectionDelay(urgency: InjectionUrgency): number {
  return URGENCY_DELAY_MS[urgency] ?? URGENCY_DELAY_MS.normal
}

// ─── Context-Aware Injection Deferral (t4) ──────────────────────
//
// Detects whether an agent is in the middle of active work (tool call,
// output stream, thinking block) and defers injection to avoid
// interrupting the agent's flow.

/** Reasons why injection might be deferred */
export type DeferralReason =
  | 'tool_call_active'
  | 'output_streaming'
  | 'thinking_block'
  | 'recent_activity'
  | 'none'

export interface DeferralCheck {
  /** Whether injection should be deferred */
  shouldDefer: boolean
  /** Why injection is being deferred */
  reason: DeferralReason
  /** How long to wait before retrying (ms) */
  retryAfterMs: number
}

/** Thresholds for agent activity detection (ms) */
const ACTIVITY_THRESHOLDS = {
  /** If agent produced output within this window, consider it streaming */
  outputStreamingMs: 2000,
  /** If a tool call started within this window, consider it active */
  toolCallActiveMs: 5000,
  /** Minimum gap between last output and injection */
  recentActivityMs: 1000,
} as const

/**
 * Check whether injection should be deferred for a specific agent.
 *
 * @param lastOutputAt  - timestamp of the agent's last terminal output
 * @param lastToolCallAt - timestamp of the agent's last detected tool call start
 * @param isThinking    - whether the agent is in a thinking/reasoning block
 * @param urgency       - injection urgency (immediate bypasses deferral)
 */
export function shouldDeferInjection(
  lastOutputAt: number | null,
  lastToolCallAt: number | null,
  isThinking: boolean,
  urgency: InjectionUrgency,
): DeferralCheck {
  // Immediate urgency bypasses all deferral
  if (urgency === 'immediate') {
    return { shouldDefer: false, reason: 'none', retryAfterMs: 0 }
  }

  const now = Date.now()

  // Agent is in a thinking block — defer to avoid breaking reasoning
  if (isThinking) {
    return {
      shouldDefer: true,
      reason: 'thinking_block',
      retryAfterMs: 3000,
    }
  }

  // Agent has an active tool call — defer to avoid corrupting tool output
  if (lastToolCallAt && (now - lastToolCallAt) < ACTIVITY_THRESHOLDS.toolCallActiveMs) {
    return {
      shouldDefer: true,
      reason: 'tool_call_active',
      retryAfterMs: Math.max(1000, ACTIVITY_THRESHOLDS.toolCallActiveMs - (now - lastToolCallAt)),
    }
  }

  // Agent is actively streaming output — defer to avoid mid-stream injection
  if (lastOutputAt && (now - lastOutputAt) < ACTIVITY_THRESHOLDS.outputStreamingMs) {
    return {
      shouldDefer: true,
      reason: 'output_streaming',
      retryAfterMs: Math.max(500, ACTIVITY_THRESHOLDS.outputStreamingMs - (now - lastOutputAt)),
    }
  }

  // Agent had very recent activity — short defer for clean injection point
  if (lastOutputAt && (now - lastOutputAt) < ACTIVITY_THRESHOLDS.recentActivityMs) {
    return {
      shouldDefer: true,
      reason: 'recent_activity',
      retryAfterMs: Math.max(200, ACTIVITY_THRESHOLDS.recentActivityMs - (now - lastOutputAt)),
    }
  }

  return { shouldDefer: false, reason: 'none', retryAfterMs: 0 }
}

// ─── Delivery Confirmation Tracking (t4) ────────────────────────
//
// Tracks whether injected messages were actually acknowledged by
// the receiving agent.  The message injector calls these functions
// to manage delivery state.

export type DeliveryStatus = 'pending' | 'injected' | 'confirmed' | 'failed'

export interface DeliveryRecord {
  /** Message ID */
  messageId: string
  /** Target agent label */
  agentLabel: string
  /** Terminal ID for the target agent */
  terminalId: string
  /** Current delivery status */
  status: DeliveryStatus
  /** Injection urgency */
  urgency: InjectionUrgency
  /** Number of injection attempts */
  attempts: number
  /** Timestamp of first injection attempt */
  firstAttemptAt: number
  /** Timestamp of last injection attempt */
  lastAttemptAt: number
  /** Timestamp of confirmation (if confirmed) */
  confirmedAt?: number
  /** Reason for failure (if failed) */
  failureReason?: string
}

/** Maximum injection attempts before marking delivery as failed */
const MAX_DELIVERY_ATTEMPTS = 3

/** Time window (ms) after injection to wait for confirmation */
const CONFIRMATION_WINDOW_MS = 30_000

/**
 * In-memory delivery tracking store.
 * Keyed by `{swarmId}:{messageId}` for uniqueness.
 */
const deliveryRecords = new Map<string, DeliveryRecord>()

/**
 * Register a new delivery attempt.
 */
export function trackDelivery(
  swarmId: string,
  messageId: string,
  agentLabel: string,
  terminalId: string,
  urgency: InjectionUrgency,
): DeliveryRecord {
  const key = `${swarmId}:${messageId}`
  const existing = deliveryRecords.get(key)

  if (existing) {
    existing.attempts += 1
    existing.lastAttemptAt = Date.now()
    existing.status = 'injected'
    deliveryRecords.set(key, existing)
    return existing
  }

  const record: DeliveryRecord = {
    messageId,
    agentLabel,
    terminalId,
    status: 'injected',
    urgency,
    attempts: 1,
    firstAttemptAt: Date.now(),
    lastAttemptAt: Date.now(),
  }

  deliveryRecords.set(key, record)
  return record
}

/**
 * Confirm delivery of a message (called when inbox is verified empty
 * for the agent or when agent output acknowledges the message).
 */
export function confirmDelivery(swarmId: string, messageId: string): boolean {
  const key = `${swarmId}:${messageId}`
  const record = deliveryRecords.get(key)
  if (!record) return false

  record.status = 'confirmed'
  record.confirmedAt = Date.now()
  deliveryRecords.set(key, record)
  return true
}

/**
 * Mark a delivery as failed after exceeding retry attempts.
 */
export function failDelivery(
  swarmId: string,
  messageId: string,
  reason: string,
): boolean {
  const key = `${swarmId}:${messageId}`
  const record = deliveryRecords.get(key)
  if (!record) return false

  record.status = 'failed'
  record.failureReason = reason
  deliveryRecords.set(key, record)
  return true
}

/**
 * Get all pending deliveries for a swarm that need retry.
 * Returns records that have been injected but not confirmed within
 * the confirmation window and haven't exceeded max attempts.
 */
export function getPendingRetries(swarmId: string): DeliveryRecord[] {
  const now = Date.now()
  const results: DeliveryRecord[] = []

  for (const [key, record] of deliveryRecords.entries()) {
    if (!key.startsWith(`${swarmId}:`)) continue
    if (record.status !== 'injected') continue
    if (record.attempts >= MAX_DELIVERY_ATTEMPTS) {
      // Auto-fail after max attempts
      record.status = 'failed'
      record.failureReason = `Exceeded ${MAX_DELIVERY_ATTEMPTS} delivery attempts`
      continue
    }

    // Check if enough time has passed since last attempt
    if ((now - record.lastAttemptAt) >= CONFIRMATION_WINDOW_MS) {
      results.push(record)
    }
  }

  return results
}

/**
 * Get delivery stats for a swarm (for coordinator dashboards).
 */
export function getDeliveryStats(swarmId: string): {
  pending: number
  confirmed: number
  failed: number
  total: number
} {
  let pending = 0
  let confirmed = 0
  let failed = 0

  for (const [key, record] of deliveryRecords.entries()) {
    if (!key.startsWith(`${swarmId}:`)) continue
    switch (record.status) {
      case 'pending':
      case 'injected':
        pending++
        break
      case 'confirmed':
        confirmed++
        break
      case 'failed':
        failed++
        break
    }
  }

  return { pending, confirmed, failed, total: pending + confirmed + failed }
}

/**
 * Purge old delivery records to prevent memory leaks.
 * Removes confirmed records older than maxAgeMs and failed records
 * older than failedMaxAgeMs.
 */
export function purgeDeliveryRecords(
  swarmId: string,
  maxAgeMs: number = 300_000,
  failedMaxAgeMs: number = 600_000,
): number {
  const now = Date.now()
  let purged = 0

  for (const [key, record] of deliveryRecords.entries()) {
    if (!key.startsWith(`${swarmId}:`)) continue

    const age = now - record.firstAttemptAt
    if (record.status === 'confirmed' && age > maxAgeMs) {
      deliveryRecords.delete(key)
      purged++
    } else if (record.status === 'failed' && age > failedMaxAgeMs) {
      deliveryRecords.delete(key)
      purged++
    }
  }

  return purged
}

// ─── Injection Batch Scheduler (t4) ─────────────────────────────
//
// Groups pending messages by agent and urgency level so the message
// injector can deliver them efficiently.  Instead of injecting
// `gs-mail check --inject` once per message, the batch scheduler
// accumulates messages and triggers a single injection per agent.

export interface InjectionBatchEntry {
  messageId: string
  agentLabel: string
  terminalId: string
  urgency: InjectionUrgency
  queuedAt: number
}

export interface InjectionBatch {
  agentLabel: string
  terminalId: string
  /** Highest urgency in this batch (determines when to inject) */
  maxUrgency: InjectionUrgency
  entries: InjectionBatchEntry[]
}

/** Urgency ordering for comparisons (lower index = higher urgency) */
const URGENCY_ORDER: InjectionUrgency[] = [
  'immediate', 'high', 'normal', 'low', 'batch',
]

/**
 * Compare two urgency levels.
 * Returns negative if `a` is more urgent, positive if `b` is, 0 if equal.
 */
export function compareUrgency(a: InjectionUrgency, b: InjectionUrgency): number {
  return URGENCY_ORDER.indexOf(a) - URGENCY_ORDER.indexOf(b)
}

/**
 * Group pending injection entries into per-agent batches.
 * Each batch has the highest urgency of its entries, which determines
 * when injection should be triggered.
 */
export function buildInjectionBatches(
  entries: InjectionBatchEntry[],
): InjectionBatch[] {
  const byAgent = new Map<string, InjectionBatchEntry[]>()

  for (const entry of entries) {
    const existing = byAgent.get(entry.agentLabel) || []
    existing.push(entry)
    byAgent.set(entry.agentLabel, existing)
  }

  const batches: InjectionBatch[] = []

  for (const [agentLabel, agentEntries] of byAgent.entries()) {
    // Determine the highest urgency in the batch
    let maxUrgency: InjectionUrgency = 'batch'
    let terminalId = ''

    for (const entry of agentEntries) {
      if (compareUrgency(entry.urgency, maxUrgency) < 0) {
        maxUrgency = entry.urgency
      }
      if (!terminalId) terminalId = entry.terminalId
    }

    batches.push({
      agentLabel,
      terminalId,
      maxUrgency,
      entries: agentEntries,
    })
  }

  // Sort batches by urgency — most urgent agents first
  batches.sort((a, b) => compareUrgency(a.maxUrgency, b.maxUrgency))

  return batches
}
