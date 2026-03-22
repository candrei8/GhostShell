// Swarm Knowledge Base — persistent history of swarm sessions.
//
// Stores a lightweight index of completed swarms via Electron's storage IPC
// (same mechanism as Zustand persistence). Full reports are kept in each
// swarm's {swarmRoot}/archive/summary-report.json.
//
// The knowledge base enables:
//   - Viewing history of past swarms from the UI
//   - Pre-loading context for future swarms targeting the same directory
//   - Pruning old entries to prevent unbounded growth

import type { SwarmSummaryReport } from './swarm-report-generator'

// ─── Types ──────────────────────────────────────────────────

export interface SwarmHistoryEntry {
  swarmId: string
  swarmName: string
  mission: string
  directory: string
  status: string
  agentCount: number
  duration: number
  tasksCompleted: number
  tasksTotal: number
  filesChanged: number
  completedAt: string
  summaryPath?: string // path to full summary report on disk
}

export interface SwarmKnowledgeBase {
  version: 1
  entries: SwarmHistoryEntry[]
}

// ─── Storage Key ────────────────────────────────────────────

const KB_STORAGE_KEY = 'swarm-history'
const MAX_ENTRIES = 20

// ─── Core Functions ─────────────────────────────────────────

/**
 * Load the knowledge base index from persistent storage.
 * Returns an empty knowledge base if none exists or on error.
 */
export async function loadKnowledgeBase(): Promise<SwarmKnowledgeBase> {
  try {
    if (typeof window === 'undefined' || !window.ghostshell?.storageGet) {
      return { version: 1, entries: [] }
    }

    const data = await window.ghostshell.storageGet(KB_STORAGE_KEY)
    if (!data || typeof data !== 'object') {
      return { version: 1, entries: [] }
    }

    const kb = data as SwarmKnowledgeBase
    // Validate shape
    if (kb.version !== 1 || !Array.isArray(kb.entries)) {
      return { version: 1, entries: [] }
    }

    return kb
  } catch (err) {
    console.warn('[swarm-kb] Failed to load knowledge base:', err)
    return { version: 1, entries: [] }
  }
}

/**
 * Save a swarm's summary to the persistent knowledge base.
 * Creates a lightweight entry in the index from the full report data.
 * Automatically prunes old entries beyond the MAX_ENTRIES limit.
 */
export async function saveToKnowledgeBase(report: SwarmSummaryReport): Promise<void> {
  try {
    if (typeof window === 'undefined' || !window.ghostshell?.storageSet) {
      console.warn('[swarm-kb] Storage not available')
      return
    }

    const kb = await loadKnowledgeBase()

    // Check for duplicate (same swarmId)
    const existingIdx = kb.entries.findIndex((e) => e.swarmId === report.swarmId)
    if (existingIdx >= 0) {
      // Update existing entry
      kb.entries[existingIdx] = buildEntry(report)
    } else {
      // Add new entry at the beginning (most recent first)
      kb.entries.unshift(buildEntry(report))
    }

    // Prune: keep only the most recent MAX_ENTRIES
    if (kb.entries.length > MAX_ENTRIES) {
      kb.entries = kb.entries.slice(0, MAX_ENTRIES)
    }

    await window.ghostshell.storageSet(KB_STORAGE_KEY, kb)
    console.log(`[swarm-kb] Saved entry for ${report.swarmId} (${kb.entries.length} total)`)
  } catch (err) {
    console.error('[swarm-kb] Failed to save to knowledge base:', err)
  }
}

/**
 * Get knowledge base entries relevant to a specific directory.
 * Returns entries where the directory matches exactly or is a parent/child.
 */
export async function getHistoryForDirectory(directory: string): Promise<SwarmHistoryEntry[]> {
  try {
    const kb = await loadKnowledgeBase()
    const normalized = normalizeDir(directory)

    return kb.entries.filter((entry) => {
      const entryDir = normalizeDir(entry.directory)
      return (
        entryDir === normalized ||
        entryDir.startsWith(normalized + '/') ||
        normalized.startsWith(entryDir + '/')
      )
    })
  } catch {
    return []
  }
}

/**
 * Clean up old entries — keeps only the most recent MAX_ENTRIES.
 * Call this periodically or on app startup.
 */
export async function pruneKnowledgeBase(): Promise<void> {
  try {
    if (typeof window === 'undefined' || !window.ghostshell?.storageSet) return

    const kb = await loadKnowledgeBase()
    if (kb.entries.length <= MAX_ENTRIES) return

    kb.entries = kb.entries.slice(0, MAX_ENTRIES)
    await window.ghostshell.storageSet(KB_STORAGE_KEY, kb)
    console.log(`[swarm-kb] Pruned to ${kb.entries.length} entries`)
  } catch (err) {
    console.warn('[swarm-kb] Prune failed:', err)
  }
}

/**
 * Remove a specific entry from the knowledge base by swarmId.
 */
export async function removeFromKnowledgeBase(swarmId: string): Promise<void> {
  try {
    if (typeof window === 'undefined' || !window.ghostshell?.storageSet) return

    const kb = await loadKnowledgeBase()
    const before = kb.entries.length
    kb.entries = kb.entries.filter((e) => e.swarmId !== swarmId)

    if (kb.entries.length < before) {
      await window.ghostshell.storageSet(KB_STORAGE_KEY, kb)
    }
  } catch (err) {
    console.warn('[swarm-kb] Remove failed:', err)
  }
}

// ─── Internal Helpers ───────────────────────────────────────

/** Build a lightweight history entry from a full summary report. */
function buildEntry(report: SwarmSummaryReport): SwarmHistoryEntry {
  return {
    swarmId: report.swarmId,
    swarmName: report.swarmName,
    mission: report.mission,
    directory: report.directory,
    status: 'completed',
    agentCount: report.agentCount,
    duration: report.duration,
    tasksCompleted: report.tasks.completed,
    tasksTotal: report.tasks.total,
    filesChanged: report.filesChanged.length,
    completedAt: report.generatedAt,
    summaryPath: undefined, // Set by the caller if needed
  }
}

/** Normalize a directory path for comparison — lowercase, forward slashes, no trailing slash. */
function normalizeDir(dir: string): string {
  return dir.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}
