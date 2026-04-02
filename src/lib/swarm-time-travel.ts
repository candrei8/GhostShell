// swarm-time-travel — Snapshot recording system for swarm execution replay
// Auto-captures state every 30s and on major events (task status change, conflict, error)
// Enables "rewind" to understand what happened at any point during execution

import type { SwarmAgentState, SwarmTaskItem, SwarmMessage, SwarmFileConflict } from './swarm-types'

// ─── Types ──────────────────────────────────────────────────

export interface SwarmSnapshot {
  id: string
  timestamp: number
  trigger: string              // what caused this snapshot: 'interval' | 'task_change' | 'conflict' | 'error' | 'manual'
  agentStates: Array<{
    rosterId: string
    status: string
    currentTask: string | null
    filesOwned: number
  }>
  taskStates: Array<{
    id: string
    title: string
    status: string
    owner: string
  }>
  messageCount: number
  conflictCount: number
  metadata: {
    totalTokens: number
    activeAgents: number
    completedTasks: number
    elapsedMinutes: number
  }
}

export interface SnapshotDiff {
  addedTasks: string[]
  completedTasks: string[]
  statusChanges: Array<{ taskId: string; from: string; to: string }>
  newMessages: number
  newConflicts: number
  agentStatusChanges: Array<{ rosterId: string; from: string; to: string }>
}

// ─── Snapshot Store (in-memory, volatile) ───────────────────

const MAX_SNAPSHOTS = 200
let snapshots: SwarmSnapshot[] = []

export function getSnapshots(): SwarmSnapshot[] {
  return snapshots
}

export function clearSnapshots(): void {
  snapshots = []
}

// ─── Create Snapshot ────────────────────────────────────────

export function createSnapshot(
  trigger: string,
  agents: SwarmAgentState[],
  tasks: SwarmTaskItem[],
  messages: SwarmMessage[],
  conflicts: SwarmFileConflict[],
  swarmStartedAt?: number,
): SwarmSnapshot {
  const now = Date.now()
  const elapsedMin = swarmStartedAt ? (now - swarmStartedAt) / 60000 : 0

  let totalTokens = 0
  for (const agent of agents) {
    const metrics = (agent as unknown as { metrics?: { totalTokens?: number } }).metrics
    totalTokens += metrics?.totalTokens || 0
  }

  const snapshot: SwarmSnapshot = {
    id: `snap-${now}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: now,
    trigger,
    agentStates: agents.map((a) => ({
      rosterId: a.rosterId,
      status: a.status,
      currentTask: a.currentTask || null,
      filesOwned: a.filesOwned.length,
    })),
    taskStates: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      owner: t.owner,
    })),
    messageCount: messages.length,
    conflictCount: conflicts.filter((c) => c.status === 'active').length,
    metadata: {
      totalTokens,
      activeAgents: agents.filter((a) => ['building', 'planning', 'review'].includes(a.status)).length,
      completedTasks: tasks.filter((t) => t.status === 'done').length,
      elapsedMinutes: Math.round(elapsedMin * 10) / 10,
    },
  }

  // Store with LRU eviction
  if (snapshots.length >= MAX_SNAPSHOTS) {
    snapshots = snapshots.slice(-(MAX_SNAPSHOTS - 1))
  }
  snapshots.push(snapshot)

  return snapshot
}

// ─── Compute Diff Between Two Snapshots ─────────────────────

export function computeSnapshotDiff(
  before: SwarmSnapshot,
  after: SwarmSnapshot,
): SnapshotDiff {
  const beforeTaskIds = new Set(before.taskStates.map((t) => t.id))
  const afterTaskIds = new Set(after.taskStates.map((t) => t.id))

  const addedTasks = after.taskStates
    .filter((t) => !beforeTaskIds.has(t.id))
    .map((t) => t.title)

  const completedTasks = after.taskStates
    .filter((t) => t.status === 'done' && before.taskStates.find((bt) => bt.id === t.id)?.status !== 'done')
    .map((t) => t.title)

  const statusChanges: SnapshotDiff['statusChanges'] = []
  for (const at of after.taskStates) {
    const bt = before.taskStates.find((t) => t.id === at.id)
    if (bt && bt.status !== at.status) {
      statusChanges.push({ taskId: at.id, from: bt.status, to: at.status })
    }
  }

  const agentStatusChanges: SnapshotDiff['agentStatusChanges'] = []
  for (const aa of after.agentStates) {
    const ba = before.agentStates.find((a) => a.rosterId === aa.rosterId)
    if (ba && ba.status !== aa.status) {
      agentStatusChanges.push({ rosterId: aa.rosterId, from: ba.status, to: aa.status })
    }
  }

  return {
    addedTasks,
    completedTasks,
    statusChanges,
    newMessages: after.messageCount - before.messageCount,
    newConflicts: Math.max(0, after.conflictCount - before.conflictCount),
    agentStatusChanges,
  }
}

// ─── Snapshot at Index ──────────────────────────────────────

export function getSnapshotAt(index: number): SwarmSnapshot | null {
  return snapshots[index] || null
}

export function getSnapshotCount(): number {
  return snapshots.length
}
