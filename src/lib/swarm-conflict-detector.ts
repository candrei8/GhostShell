// Swarm Conflict Detector — watches the activity feed for overlapping file
// operations and raises alerts when two agents touch the same file.
//
// The detector runs as a polling loop alongside the message injector and task
// sync. It consumes SwarmActivityEvent entries (file_read, file_write,
// file_edit) and cross-references with the existing gs-lock file-locks.json.
// When two agents have write operations on the same file within CONFLICT_WINDOW_MS,
// a critical conflict is raised. A read+write overlap produces a warning.

import { useSwarmStore } from '../stores/swarmStore'
import type {
  SwarmFileConflict,
  SwarmActivityEvent,
  SwarmAgentRole,
} from './swarm-types'
import { operatorBroadcast } from './swarm-operator'

// ─── Constants ────────────────────────────────────────────────

/** Time window (ms) in which overlapping operations count as a conflict. */
const CONFLICT_WINDOW_MS = 5 * 60 * 1000 // 5 minutes

/** How often the detector re-scans the activity feed (ms). */
const SCAN_INTERVAL_MS = 4_000

/** Maximum conflicts tracked per swarm before oldest are evicted. */
const MAX_CONFLICTS = 100

// ─── Module-Level State ──────────────────────────────────────

export interface FileConflict {
  id: string
  filePath: string
  agents: Array<{
    label: string
    role: string
    operation: 'read' | 'write' | 'edit'
    detectedAt: number
  }>
  severity: 'warning' | 'critical'
  status: 'active' | 'resolved'
  detectedAt: number
  resolvedAt?: number
}

export interface ConflictMatrix {
  /** Map of filePath -> agents touching it */
  fileMap: Map<string, Set<string>>
  /** Active conflicts */
  conflicts: FileConflict[]
  /** Stats */
  totalFilesTouched: number
  sharedFiles: number
  activeConflicts: number
}

/** Per-swarm conflict state. */
interface SwarmConflictState {
  /** filePath -> agent operations within the window */
  fileOps: Map<string, AgentFileOp[]>
  /** IDs of conflicts we've already broadcast to coordinators */
  alertedConflicts: Set<string>
  /** Last activity feed index we processed */
  lastProcessedIndex: number
}

interface AgentFileOp {
  agentLabel: string
  agentRole: SwarmAgentRole
  operation: 'read' | 'write' | 'edit'
  timestamp: number
}

const stateBySwarm = new Map<string, SwarmConflictState>()

// ─── Helpers ──────────────────────────────────────────────────

function conflictId(filePath: string): string {
  return `conflict-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${filePath.replace(/[^a-zA-Z0-9]/g, '').slice(-20)}`
}

function eventToOperation(type: string): 'read' | 'write' | 'edit' | null {
  if (type === 'file_write') return 'write'
  if (type === 'file_edit') return 'edit'
  if (type === 'file_read') return 'read'
  return null
}

/**
 * Extract the file path from an activity event's detail string.
 * Activity events have detail like "Write src/foo/bar.ts" or "Edit electron/main.ts (5 edits)"
 */
function extractFilePath(detail: string): string | null {
  if (!detail) return null
  // Common patterns:
  //   "Write src/foo.ts"
  //   "Edit src/foo.ts (3 edits)"
  //   "Read src/foo.ts"
  //   "src/foo.ts" (bare path)
  const stripped = detail
    .replace(/^(Write|Edit|Read|Create|Update|Delete)\s+/i, '')
    .replace(/\s*\(.*\)\s*$/, '')
    .trim()

  // Must look like a file path (has a dot extension or a slash)
  if (stripped.includes('.') || stripped.includes('/') || stripped.includes('\\')) {
    return stripped
  }
  return null
}

/** Prune operations older than the conflict window from the map. */
function pruneStaleOps(state: SwarmConflictState): void {
  const cutoff = Date.now() - CONFLICT_WINDOW_MS
  for (const [filePath, ops] of state.fileOps) {
    const fresh = ops.filter((op) => op.timestamp > cutoff)
    if (fresh.length === 0) {
      state.fileOps.delete(filePath)
    } else {
      state.fileOps.set(filePath, fresh)
    }
  }
}

/** Determine severity from a set of operations on the same file by different agents. */
function computeSeverity(
  ops: AgentFileOp[],
): 'warning' | 'critical' | null {
  // Group by agent
  const byAgent = new Map<string, Set<string>>()
  for (const op of ops) {
    if (!byAgent.has(op.agentLabel)) byAgent.set(op.agentLabel, new Set())
    byAgent.get(op.agentLabel)!.add(op.operation)
  }

  // Need 2+ distinct agents to have a conflict
  if (byAgent.size < 2) return null

  // Check if multiple agents have write/edit operations
  const writers: string[] = []
  const readers: string[] = []
  for (const [agent, operations] of byAgent) {
    if (operations.has('write') || operations.has('edit')) {
      writers.push(agent)
    } else if (operations.has('read')) {
      readers.push(agent)
    }
  }

  if (writers.length >= 2) return 'critical'
  if (writers.length >= 1 && readers.length >= 1) return 'warning'
  return null
}

// ─── Core Scan Logic ──────────────────────────────────────────

function scanActivityFeed(swarmId: string): void {
  const store = useSwarmStore.getState()
  const swarm = store.getSwarm(swarmId)
  if (!swarm || (swarm.status !== 'running' && swarm.status !== 'launching')) return

  let state = stateBySwarm.get(swarmId)
  if (!state) {
    state = {
      fileOps: new Map(),
      alertedConflicts: new Set(),
      lastProcessedIndex: 0,
    }
    stateBySwarm.set(swarmId, state)
  }

  // Get events for this swarm from the activity feed
  const events = store.activityFeed.filter((e) => e.swarmId === swarmId)

  // Process only new events since last scan
  const newEvents = events.slice(state.lastProcessedIndex)
  state.lastProcessedIndex = events.length

  // Record file operations
  for (const event of newEvents) {
    const operation = eventToOperation(event.type)
    if (!operation) continue

    const filePath = extractFilePath(event.detail)
      || (event.metadata?.file as string)
      || (event.metadata?.filePath as string)
    if (!filePath) continue

    if (!state.fileOps.has(filePath)) {
      state.fileOps.set(filePath, [])
    }
    state.fileOps.get(filePath)!.push({
      agentLabel: event.agentLabel,
      agentRole: event.agentRole,
      operation,
      timestamp: event.timestamp,
    })
  }

  // Also incorporate file-lock data (if available via IPC)
  incorporateLockData(swarmId, state, swarm.swarmRoot)

  // Prune stale operations
  pruneStaleOps(state)

  // Detect conflicts
  detectConflicts(swarmId, state)
}

/**
 * Incorporate the existing file-locks.json data into the conflict detector.
 * This catches locks that were acquired before the detector started.
 */
async function incorporateLockData(
  swarmId: string,
  state: SwarmConflictState,
  swarmRoot?: string,
): Promise<void> {
  if (!swarmRoot || !window.ghostshell?.swarmGetAllLocks) return

  try {
    const locks = await window.ghostshell.swarmGetAllLocks(swarmRoot)
    if (!locks) return

    const now = Date.now()
    for (const [filePath, lock] of Object.entries(locks)) {
      // If the lock is within the conflict window, record it as a write
      if (now - lock.acquiredAt < CONFLICT_WINDOW_MS) {
        const existingOps = state.fileOps.get(filePath) || []
        // Don't duplicate if we already have an op from this agent on this file at ~this time
        const hasEntry = existingOps.some(
          (op) =>
            op.agentLabel === lock.agentName &&
            Math.abs(op.timestamp - lock.acquiredAt) < 2000,
        )
        if (!hasEntry) {
          existingOps.push({
            agentLabel: lock.agentName,
            agentRole: 'builder', // file locks are typically builder operations
            operation: 'write',
            timestamp: lock.acquiredAt,
          })
          state.fileOps.set(filePath, existingOps)
        }
      }
    }
  } catch {
    // Non-fatal — lock file may not exist yet
  }
}

function detectConflicts(swarmId: string, state: SwarmConflictState): void {
  const store = useSwarmStore.getState()

  for (const [filePath, ops] of state.fileOps) {
    const severity = computeSeverity(ops)
    if (!severity) continue

    // Build the agents list (unique by label, pick latest operation)
    const agentMap = new Map<string, AgentFileOp>()
    for (const op of ops) {
      const existing = agentMap.get(op.agentLabel)
      if (!existing || op.timestamp > existing.timestamp) {
        agentMap.set(op.agentLabel, op)
      }
    }

    const agents = Array.from(agentMap.values()).map((op) => ({
      label: op.agentLabel,
      role: op.agentRole as SwarmAgentRole,
      operation: op.operation,
      detectedAt: op.timestamp,
    }))

    // Check if this conflict already exists in the store
    const existingConflict = store.conflicts.find(
      (c) => c.filePath === filePath && c.status === 'active',
    )

    if (existingConflict) {
      // Update if severity escalated
      if (existingConflict.severity === 'warning' && severity === 'critical') {
        const updated: SwarmFileConflict = {
          ...existingConflict,
          agents,
          severity,
          detectedAt: Date.now(),
        }
        store.addConflict(updated)
        broadcastConflictAlert(swarmId, updated, state)
      }
      continue
    }

    // Create new conflict
    const conflict: SwarmFileConflict = {
      id: conflictId(filePath),
      swarmId,
      filePath,
      agents,
      severity,
      status: 'active',
      detectedAt: Date.now(),
    }

    store.addConflict(conflict)

    // Broadcast alert for critical conflicts
    if (severity === 'critical') {
      broadcastConflictAlert(swarmId, conflict, state)
    }
  }

  // Auto-resolve: check active conflicts where one agent's task on the file is done
  autoResolveConflicts(swarmId)
}

function autoResolveConflicts(swarmId: string): void {
  const store = useSwarmStore.getState()
  const swarm = store.getSwarm(swarmId)
  if (!swarm) return

  const state = stateBySwarm.get(swarmId)
  if (!state) return

  for (const conflict of store.conflicts) {
    if (conflict.status !== 'active') continue

    // Check if the file still has overlapping operations within the window
    const ops = state.fileOps.get(conflict.filePath)
    if (!ops) {
      store.resolveConflict(conflict.id)
      continue
    }

    const severity = computeSeverity(ops)
    if (!severity) {
      store.resolveConflict(conflict.id)
      continue
    }

    // Check if any agent involved has their task marked 'done'
    for (const agent of conflict.agents) {
      if (agent.operation === 'write' || agent.operation === 'edit') {
        const task = swarm.tasks.find(
          (t) => t.owner === agent.label && t.status === 'done',
        )
        if (task) {
          // Remove this agent's ops from the file map
          const remaining = ops.filter((op) => op.agentLabel !== agent.label)
          if (remaining.length === 0) {
            state.fileOps.delete(conflict.filePath)
          } else {
            state.fileOps.set(conflict.filePath, remaining)
          }

          // Re-check severity
          const newSeverity = remaining.length > 0 ? computeSeverity(remaining) : null
          if (!newSeverity) {
            store.resolveConflict(conflict.id)
          }
          break
        }
      }
    }
  }
}

function broadcastConflictAlert(
  swarmId: string,
  conflict: SwarmFileConflict,
  state: SwarmConflictState,
): void {
  // Don't re-alert for the same conflict
  if (state.alertedConflicts.has(conflict.id)) return
  state.alertedConflicts.add(conflict.id)

  const agentNames = conflict.agents
    .filter((a) => a.operation === 'write' || a.operation === 'edit')
    .map((a) => a.label)
    .join(' and ')

  const message = `CONFLICT ALERT: ${conflict.filePath} is being modified by both ${agentNames}. Coordinate to avoid merge conflicts.`

  // Send via operator broadcast to coordinators
  const store = useSwarmStore.getState()
  const swarm = store.getSwarm(swarmId)
  if (!swarm) return

  const coordinatorLabels = swarm.config.roster
    .map((r, i) => {
      if (r.role !== 'coordinator') return null
      if (r.customName) return r.customName
      let roleIdx = 0
      for (let j = 0; j < i; j++) {
        if (swarm.config.roster[j].role === 'coordinator') roleIdx++
      }
      return `Coordinator ${roleIdx + 1}`
    })
    .filter((l): l is string => !!l)

  // Use the operatorBroadcast to send to coordinators
  operatorBroadcast(swarmId, message, coordinatorLabels, 'escalation').catch((err) => {
    console.error('[ConflictDetector] Failed to broadcast alert:', err)
  })

  // Also log to store as a message
  store.addMessage(swarmId, {
    id: `conflict-alert-${conflict.id}`,
    from: '@conflict-detector',
    to: coordinatorLabels.join(', ') || 'all',
    body: message,
    type: 'escalation',
    meta: {
      conflictId: conflict.id,
      filePath: conflict.filePath,
      severity: conflict.severity,
    },
    timestamp: Date.now(),
  })
}

// ─── Public API ──────────────────────────────────────────────

/**
 * Start conflict detection for a swarm.
 * Returns a cleanup function to stop the detector.
 */
export function startConflictDetector(swarmId: string): () => void {
  // Initialize state
  stateBySwarm.set(swarmId, {
    fileOps: new Map(),
    alertedConflicts: new Set(),
    lastProcessedIndex: 0,
  })

  // Run initial scan
  scanActivityFeed(swarmId)

  // Set up polling interval
  const interval = setInterval(() => {
    scanActivityFeed(swarmId)
  }, SCAN_INTERVAL_MS)

  // Return cleanup function
  return () => {
    clearInterval(interval)
    stateBySwarm.delete(swarmId)
  }
}

/**
 * Get the current conflict matrix for display.
 */
export function getConflictMatrix(swarmId: string): ConflictMatrix {
  const state = stateBySwarm.get(swarmId)
  const store = useSwarmStore.getState()

  const fileMap = new Map<string, Set<string>>()

  if (state) {
    for (const [filePath, ops] of state.fileOps) {
      const agents = new Set<string>()
      for (const op of ops) {
        agents.add(op.agentLabel)
      }
      if (agents.size > 0) {
        fileMap.set(filePath, agents)
      }
    }
  }

  const activeConflicts = store.conflicts.filter((c) => c.status === 'active')
  const sharedFiles = Array.from(fileMap.values()).filter((agents) => agents.size > 1).length

  return {
    fileMap,
    conflicts: activeConflicts,
    totalFilesTouched: fileMap.size,
    sharedFiles,
    activeConflicts: activeConflicts.length,
  }
}

/**
 * Check if a specific file has an active conflict.
 */
export function checkFileConflict(
  swarmId: string,
  filePath: string,
): FileConflict | null {
  const store = useSwarmStore.getState()
  const conflict = store.conflicts.find(
    (c) => c.filePath === filePath && c.status === 'active',
  )
  return conflict ? { ...conflict } : null
}
