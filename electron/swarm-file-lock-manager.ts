// Swarm File Lock Manager — atomic file ownership for GhostSwarm tasks
// Prevents concurrent writes by different agents to the same file

import { promises as fs } from 'fs'
import { join } from 'path'

// ─── Types ───────────────────────────────────────────────────────

export interface FileLock {
  taskId: string
  agentName: string
  acquiredAt: number
  exclusive: boolean
}

export interface FileLockHistory {
  taskId: string
  agentName: string
  files: string[]
  acquiredAt: number
  releasedAt: number
}

export interface FileLockRegistry {
  locks: Record<string, FileLock>
  lockHistory: FileLockHistory[]
}

export interface AcquireResult {
  success: boolean
  conflict?: string
}

// ─── File Operations ─────────────────────────────────────────────

async function readLockFile(swarmRoot: string): Promise<FileLockRegistry> {
  const lockPath = join(swarmRoot, 'bin', 'file-locks.json')

  try {
    const content = await fs.readFile(lockPath, 'utf-8')
    return JSON.parse(content)
  } catch (error: unknown) {
    // File doesn't exist yet — return empty registry
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return { locks: {}, lockHistory: [] }
    }
    // Other errors (permission, disk, corrupted JSON) — re-throw
    throw error
  }
}

async function writeLockFileAtomic(swarmRoot: string, registry: FileLockRegistry): Promise<void> {
  const lockPath = join(swarmRoot, 'bin', 'file-locks.json')
  const tmpPath = lockPath + '.tmp'
  await fs.writeFile(tmpPath, JSON.stringify(registry, null, 2), 'utf-8')
  await fs.rename(tmpPath, lockPath)
}

// ─── Public API ──────────────────────────────────────────────────

/**
 * Acquire exclusive locks on multiple files atomically.
 * If ANY file is already locked, the entire operation fails (no partial locks).
 * Uses atomic write (tmp + rename) to prevent TOCTOU race conditions.
 */
export async function acquireLocks(
  swarmRoot: string,
  taskId: string,
  agentName: string,
  files: string[],
): Promise<AcquireResult> {
  const registry = await readLockFile(swarmRoot)

  // Check for conflicts
  for (const file of files) {
    if (registry.locks[file]) {
      return {
        success: false,
        conflict: file,
      }
    }
  }

  // No conflicts — acquire all locks
  const acquiredAt = Date.now()
  for (const file of files) {
    registry.locks[file] = {
      taskId,
      agentName,
      acquiredAt,
      exclusive: true,
    }
  }

  await writeLockFileAtomic(swarmRoot, registry)

  return { success: true }
}

/**
 * Release all locks for a given task.
 * Moves locks to history for auditing.
 */
export async function releaseLocks(
  swarmRoot: string,
  taskId: string,
): Promise<void> {
  const registry = await readLockFile(swarmRoot)

  // Find all files locked by this task
  const lockedFiles: string[] = []
  let agentName = ''
  let acquiredAt = 0

  for (const [file, lock] of Object.entries(registry.locks)) {
    if (lock.taskId === taskId) {
      lockedFiles.push(file)
      agentName = lock.agentName
      acquiredAt = lock.acquiredAt
      delete registry.locks[file]
    }
  }

  // Add to history
  if (lockedFiles.length > 0) {
    registry.lockHistory.push({
      taskId,
      agentName,
      files: lockedFiles,
      acquiredAt,
      releasedAt: Date.now(),
    })

    // Keep only last 100 history entries
    if (registry.lockHistory.length > 100) {
      registry.lockHistory = registry.lockHistory.slice(-100)
    }
  }

  await writeLockFileAtomic(swarmRoot, registry)
}

/**
 * Check if a file is locked and return lock info.
 */
export async function checkLock(
  swarmRoot: string,
  filePath: string,
): Promise<FileLock | null> {
  const registry = await readLockFile(swarmRoot)
  return registry.locks[filePath] || null
}

/**
 * Get all currently locked files for a swarm.
 */
export async function getAllLocks(swarmRoot: string): Promise<Record<string, FileLock>> {
  const registry = await readLockFile(swarmRoot)
  return registry.locks
}
