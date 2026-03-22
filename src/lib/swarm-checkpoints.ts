// Swarm Checkpoints — Conversation-Aware Rollback (B10)
//
// Automatic git snapshots at key moments during swarm execution.
// Uses `git stash create` for non-destructive state capture:
//   - Creates a commit object that captures the full working tree + index
//   - Does NOT modify the working tree or index (unlike `git stash push`)
//   - The returned hash can later be applied with `git stash apply <hash>`
//
// If the working tree is clean, falls back to `git rev-parse HEAD`.

import { useSwarmStore } from '../stores/swarmStore'
import type { SwarmTaskItem } from './swarm-types'

// ─── Types ──────────────────────────────────────────────────

export interface SwarmGitCheckpoint {
  id: string
  swarmId: string
  label: string          // e.g., "task-1-start", "task-1-complete", "pre-merge"
  gitRef: string         // git stash/commit ref hash
  createdAt: number
  agentLabel?: string
  taskId?: string
  isClean: boolean       // true if working tree was clean at capture time
  metadata?: {
    filesModified: string[]
    taskTitle?: string
  }
}

// ─── Module-level State ─────────────────────────────────────

/** In-memory checkpoint storage keyed by swarmId */
const checkpointStore = new Map<string, SwarmGitCheckpoint[]>()

/** Previous task status cache for transition detection (swarmId → taskId → status) */
const prevTaskStatusCache = new Map<string, Map<string, string>>()

/** Active monitors — returns cleanup function */
const activeMonitors = new Map<string, ReturnType<typeof setInterval>>()

// ─── Git Operations (via IPC) ───────────────────────────────

/**
 * Run a git command in the specified directory via the main process.
 * Uses the existing IPC bridge — we create a hidden PTY, run the command,
 * and capture output. For simplicity, we use fsReadFile + fsCreateFile
 * to pipe through a temp script approach. But actually the simplest way
 * is to add dedicated IPC handlers.
 *
 * Since we can't add IPC handlers at runtime, we use the existing
 * `window.ghostshell` bridge. We'll create temporary script files
 * and read their output. But that's complex.
 *
 * Simpler: we already have `git:status` and `git:fileHotspots` IPC handlers
 * that call `runCommand`. We need `git:createCheckpoint` and `git:rollback`.
 * These are added to main.ts and preload.ts as part of this feature.
 */

async function gitStashCreate(cwd: string): Promise<{ hash: string; isClean: boolean }> {
  try {
    const result = await window.ghostshell.gitCreateCheckpoint(cwd)
    return { hash: result.hash, isClean: result.clean }
  } catch (err) {
    console.error('[checkpoints] git stash create failed:', err)
    throw err
  }
}

async function gitGetModifiedFiles(cwd: string): Promise<string[]> {
  try {
    const status = await window.ghostshell.gitStatus(cwd)
    if (!status.isRepo || !status.fileStatuses) return []
    return Object.keys(status.fileStatuses)
  } catch {
    return []
  }
}

// ─── Public API ─────────────────────────────────────────────

/**
 * Create a git checkpoint (non-destructive state snapshot).
 *
 * Uses `git stash create` which creates a stash-like commit object
 * without modifying the working tree. If the tree is clean, falls
 * back to recording the current HEAD hash.
 */
export async function createCheckpoint(
  swarmId: string,
  directory: string,
  label: string,
  metadata?: SwarmGitCheckpoint['metadata'],
): Promise<SwarmGitCheckpoint | null> {
  try {
    const { hash, isClean } = await gitStashCreate(directory)
    if (!hash) return null

    // Get list of modified files for metadata enrichment
    let filesModified = metadata?.filesModified
    if (!filesModified) {
      filesModified = await gitGetModifiedFiles(directory)
    }

    const checkpoint: SwarmGitCheckpoint = {
      id: `cp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      swarmId,
      label,
      gitRef: hash,
      createdAt: Date.now(),
      isClean,
      metadata: {
        filesModified: filesModified || [],
        taskTitle: metadata?.taskTitle,
      },
    }

    // Store in memory
    if (!checkpointStore.has(swarmId)) {
      checkpointStore.set(swarmId, [])
    }
    const list = checkpointStore.get(swarmId)!

    // Cap at 50 checkpoints per swarm to limit memory
    if (list.length >= 50) {
      list.shift()
    }
    list.push(checkpoint)

    // Also persist to the swarm store for UI access
    useSwarmStore.getState().addGitCheckpoint(checkpoint)

    console.log(`[checkpoints] Created: "${label}" → ${hash.slice(0, 8)} (${isClean ? 'clean' : 'dirty'})`)
    return checkpoint
  } catch (err) {
    console.error('[checkpoints] Failed to create checkpoint:', err)
    return null
  }
}

/**
 * Rollback to a specific checkpoint.
 *
 * Strategy:
 * - If checkpoint captured dirty state (isClean=false): `git stash apply <hash>`
 *   restores the exact working tree state at that point.
 * - If checkpoint captured clean state (isClean=true): `git checkout <hash> -- .`
 *   restores all tracked files to that commit's state.
 *
 * WARNING: This is destructive to current uncommitted changes.
 */
export async function rollbackToCheckpoint(
  directory: string,
  checkpoint: SwarmGitCheckpoint,
): Promise<boolean> {
  try {
    const result = await window.ghostshell.gitRollback(directory, checkpoint.gitRef, checkpoint.isClean)
    if (result.success) {
      console.log(`[checkpoints] Rolled back to "${checkpoint.label}" (${checkpoint.gitRef.slice(0, 8)})`)
    }
    return result.success
  } catch (err) {
    console.error('[checkpoints] Rollback failed:', err)
    return false
  }
}

/**
 * List all checkpoints for a swarm (most recent first).
 */
export function getCheckpoints(swarmId: string): SwarmGitCheckpoint[] {
  return [...(checkpointStore.get(swarmId) || [])].reverse()
}

/**
 * Start a checkpoint monitor that watches task transitions and
 * auto-creates checkpoints at key moments:
 *
 * - Task transitions to 'building' → "task-{id}-start"
 * - Task transitions to 'done' → "task-{id}-complete"
 * - Task transitions to 'review' → "task-{id}-review"
 *
 * Returns a cleanup function to stop monitoring.
 */
export function startCheckpointMonitor(swarmId: string, directory: string): () => void {
  // Clean up existing monitor if any
  const existing = activeMonitors.get(swarmId)
  if (existing) {
    clearInterval(existing)
  }

  if (!prevTaskStatusCache.has(swarmId)) {
    prevTaskStatusCache.set(swarmId, new Map())
  }
  const prevStatuses = prevTaskStatusCache.get(swarmId)!

  // Poll task state every 5 seconds
  const interval = setInterval(() => {
    const swarm = useSwarmStore.getState().getSwarm(swarmId)
    if (!swarm || swarm.status === 'completed' || swarm.status === 'paused') {
      return
    }

    for (const task of swarm.tasks) {
      const prev = prevStatuses.get(task.id)

      if (prev !== task.status) {
        // Detect significant transitions
        if (task.status === 'building' && prev !== 'building') {
          void createCheckpointForTask(swarmId, directory, task, 'start')
        } else if (task.status === 'done' && prev !== 'done') {
          void createCheckpointForTask(swarmId, directory, task, 'complete')
        } else if (task.status === 'review' && prev !== 'review') {
          void createCheckpointForTask(swarmId, directory, task, 'review')
        }

        prevStatuses.set(task.id, task.status)
      }
    }
  }, 5000)

  activeMonitors.set(swarmId, interval)

  return () => {
    clearInterval(interval)
    activeMonitors.delete(swarmId)
    prevTaskStatusCache.delete(swarmId)
  }
}

/**
 * Create a checkpoint for a specific task transition.
 */
async function createCheckpointForTask(
  swarmId: string,
  directory: string,
  task: SwarmTaskItem,
  phase: 'start' | 'complete' | 'review',
): Promise<void> {
  const label = `task-${task.id}-${phase}`
  await createCheckpoint(swarmId, directory, label, {
    filesModified: task.ownedFiles,
    taskTitle: task.title,
  })
}

/**
 * Clean up all state for a swarm (call on swarm complete/remove).
 */
export function cleanupCheckpoints(swarmId: string): void {
  const interval = activeMonitors.get(swarmId)
  if (interval) {
    clearInterval(interval)
    activeMonitors.delete(swarmId)
  }
  prevTaskStatusCache.delete(swarmId)
  // Don't clear checkpointStore — keep for rollback access after completion
}
