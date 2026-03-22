// Swarm Performance Tracker — per-agent performance metrics and intelligent task routing.
//
// Tracks task completion rates, domain expertise, and speed across swarm sessions.
// Uses performance history to suggest the best agent for new tasks.
// Persists profiles to {swarmRoot}/.ghostswarm/performance-profiles.json.

import type { SwarmTaskItem, SwarmAgentRole } from './swarm-types'
import { readFileSafe, writeFileSafe, mkdirSafe } from './ghostshell'

// ─── Types ──────────────────────────────────────────────────

export interface AgentPerformanceProfile {
  agentLabel: string
  role: SwarmAgentRole
  tasksCompleted: number
  tasksFailed: number
  avgTaskDurationMs: number
  /** Domain name → success rate 0-100 */
  domainScores: Record<string, number>
  lastUpdated: number
}

export interface RoutingSuggestion {
  taskId: string
  taskTitle: string
  suggestedAgent: string
  confidence: number // 0-100
  reason: string
}

// ─── Domain Detection ───────────────────────────────────────

/** Domain categories derived from file path prefixes. */
const DOMAIN_RULES: Array<{ domain: string; patterns: string[] }> = [
  { domain: 'ui', patterns: ['src/components/', 'components/', 'src/pages/', 'pages/'] },
  { domain: 'logic', patterns: ['src/lib/', 'lib/', 'src/utils/', 'utils/'] },
  { domain: 'state', patterns: ['src/stores/', 'stores/', 'src/store/', 'store/'] },
  { domain: 'hooks', patterns: ['src/hooks/', 'hooks/'] },
  { domain: 'backend', patterns: ['electron/', 'server/', 'api/', 'src/api/', 'backend/'] },
  { domain: 'testing', patterns: ['tests/', 'test/', '__tests__/', 'spec/', 'e2e/', 'cypress/'] },
  { domain: 'config', patterns: ['.github/', '.config/', 'scripts/', 'config/'] },
  { domain: 'styles', patterns: ['src/styles/', 'styles/', 'css/', 'src/css/'] },
  { domain: 'types', patterns: ['src/types/', 'types/', '@types/'] },
  { domain: 'docs', patterns: ['docs/', 'documentation/', 'doc/'] },
]

/**
 * Detect the primary domain of a set of file paths.
 * Returns the domain that appears most frequently, or 'general' as fallback.
 */
export function detectDomain(files: string[]): string {
  if (files.length === 0) return 'general'

  const domainCounts: Record<string, number> = {}

  for (const file of files) {
    const normalized = file.replace(/\\/g, '/')
    let matched = false
    for (const rule of DOMAIN_RULES) {
      for (const pattern of rule.patterns) {
        if (normalized.includes(pattern)) {
          domainCounts[rule.domain] = (domainCounts[rule.domain] || 0) + 1
          matched = true
          break
        }
      }
      if (matched) break
    }
    if (!matched) {
      domainCounts['general'] = (domainCounts['general'] || 0) + 1
    }
  }

  // Return the domain with the highest count
  let bestDomain = 'general'
  let bestCount = 0
  for (const [domain, count] of Object.entries(domainCounts)) {
    if (count > bestCount) {
      bestDomain = domain
      bestCount = count
    }
  }

  return bestDomain
}

/**
 * Detect all domains represented in a set of file paths.
 * Returns a Set of domain strings.
 */
function detectAllDomains(files: string[]): Set<string> {
  const domains = new Set<string>()
  if (files.length === 0) {
    domains.add('general')
    return domains
  }

  for (const file of files) {
    const normalized = file.replace(/\\/g, '/')
    let matched = false
    for (const rule of DOMAIN_RULES) {
      for (const pattern of rule.patterns) {
        if (normalized.includes(pattern)) {
          domains.add(rule.domain)
          matched = true
          break
        }
      }
      if (matched) break
    }
    if (!matched) {
      domains.add('general')
    }
  }

  return domains
}

// ─── In-Memory Storage ──────────────────────────────────────

/** swarmId → Map<agentLabel, AgentPerformanceProfile> */
const profileStore = new Map<string, Map<string, AgentPerformanceProfile>>()

// ─── Tracking ───────────────────────────────────────────────

/**
 * Update performance profile when a task completes or fails.
 * Maintains running averages for task duration and per-domain success rates.
 */
export function trackTaskCompletion(
  swarmId: string,
  agentLabel: string,
  task: SwarmTaskItem,
  durationMs: number,
  success: boolean,
): void {
  if (!profileStore.has(swarmId)) {
    profileStore.set(swarmId, new Map())
  }
  const swarmProfiles = profileStore.get(swarmId)!

  // Get or create profile
  let profile = swarmProfiles.get(agentLabel)
  if (!profile) {
    // Infer role from agent label (e.g., "Builder 1" → "builder")
    const role = inferRoleFromLabel(agentLabel)
    profile = {
      agentLabel,
      role,
      tasksCompleted: 0,
      tasksFailed: 0,
      avgTaskDurationMs: 0,
      domainScores: {},
      lastUpdated: Date.now(),
    }
  }

  // Update success/failure counters
  if (success) {
    // Running average for duration
    const totalCompleted = profile.tasksCompleted
    profile.avgTaskDurationMs = totalCompleted === 0
      ? durationMs
      : Math.round((profile.avgTaskDurationMs * totalCompleted + durationMs) / (totalCompleted + 1))
    profile.tasksCompleted += 1
  } else {
    profile.tasksFailed += 1
  }

  // Update domain scores
  const domains = detectAllDomains(task.ownedFiles)
  for (const domain of domains) {
    const existingScore = profile.domainScores[domain]
    if (existingScore === undefined) {
      profile.domainScores[domain] = success ? 100 : 0
    } else {
      // Weighted running average: new score has 30% weight, existing has 70%
      const newScore = success ? 100 : 0
      profile.domainScores[domain] = Math.round(existingScore * 0.7 + newScore * 0.3)
    }
  }

  profile.lastUpdated = Date.now()
  swarmProfiles.set(agentLabel, profile)
}

/**
 * Suggest the best agent for a task based on performance history.
 * Scoring weights: domain match (60%), success rate (25%), speed (15%).
 */
export function suggestRouting(
  swarmId: string,
  task: { title: string; ownedFiles: string[]; description?: string },
): RoutingSuggestion | null {
  const swarmProfiles = profileStore.get(swarmId)
  if (!swarmProfiles || swarmProfiles.size === 0) return null

  const taskDomain = detectDomain(task.ownedFiles)
  const profiles = Array.from(swarmProfiles.values())

  // Only consider agents that have completed at least 1 task
  const candidates = profiles.filter(p => p.tasksCompleted > 0)
  if (candidates.length === 0) return null

  // Compute scores
  let bestScore = -1
  let bestAgent: AgentPerformanceProfile | null = null
  let bestReason = ''

  // Compute normalization bounds for speed
  const durations = candidates.map(p => p.avgTaskDurationMs).filter(d => d > 0)
  const maxDuration = durations.length > 0 ? Math.max(...durations) : 1
  const minDuration = durations.length > 0 ? Math.min(...durations) : 0

  for (const profile of candidates) {
    // Domain score (0-100): how well this agent performs in the task's domain
    const domainScore = profile.domainScores[taskDomain] ?? 50 // Default to 50 for unknown domains

    // Success rate (0-100)
    const totalTasks = profile.tasksCompleted + profile.tasksFailed
    const successRate = totalTasks > 0
      ? Math.round((profile.tasksCompleted / totalTasks) * 100)
      : 50

    // Speed score (0-100): inversely proportional to duration
    let speedScore = 50
    if (profile.avgTaskDurationMs > 0 && maxDuration > minDuration) {
      // Faster agents get higher scores
      speedScore = Math.round(
        ((maxDuration - profile.avgTaskDurationMs) / (maxDuration - minDuration)) * 100,
      )
    }

    // Weighted combination
    const totalScore = domainScore * 0.6 + successRate * 0.25 + speedScore * 0.15

    if (totalScore > bestScore) {
      bestScore = totalScore
      bestAgent = profile

      // Build reason
      const reasons: string[] = []
      if (domainScore >= 70) reasons.push(`strong in ${taskDomain} domain (${domainScore}%)`)
      if (successRate >= 80) reasons.push(`${successRate}% success rate`)
      if (speedScore >= 70) reasons.push('fast task completion')
      bestReason = reasons.length > 0
        ? reasons.join(', ')
        : `best overall score among ${candidates.length} candidates`
    }
  }

  if (!bestAgent) return null

  return {
    taskId: `routing-${Date.now()}`,
    taskTitle: task.title,
    suggestedAgent: bestAgent.agentLabel,
    confidence: Math.round(Math.min(bestScore, 100)),
    reason: bestReason,
  }
}

/**
 * Get all performance profiles for a swarm.
 * Returns profiles sorted by success rate descending.
 */
export function getPerformanceProfiles(swarmId: string): AgentPerformanceProfile[] {
  const swarmProfiles = profileStore.get(swarmId)
  if (!swarmProfiles) return []

  return Array.from(swarmProfiles.values()).sort((a, b) => {
    const aRate = a.tasksCompleted + a.tasksFailed > 0
      ? a.tasksCompleted / (a.tasksCompleted + a.tasksFailed)
      : 0
    const bRate = b.tasksCompleted + b.tasksFailed > 0
      ? b.tasksCompleted / (b.tasksCompleted + b.tasksFailed)
      : 0
    return bRate - aRate
  })
}

// ─── Persistence ────────────────────────────────────────────

const PERF_FILENAME = 'performance-profiles.json'

/**
 * Load performance data from persistent storage.
 * Reads from `{directory}/.ghostswarm/performance-profiles.json`.
 */
export async function loadPerformanceData(directory: string): Promise<void> {
  try {
    const filePath = `${directory}/.ghostswarm/${PERF_FILENAME}`
    const content = await readFileSafe(filePath)
    if (!content) return

    const data = JSON.parse(content) as Record<string, AgentPerformanceProfile[]>
    for (const [swarmId, profiles] of Object.entries(data)) {
      if (!Array.isArray(profiles)) continue
      const map = new Map<string, AgentPerformanceProfile>()
      for (const profile of profiles) {
        if (profile && profile.agentLabel) {
          map.set(profile.agentLabel, profile)
        }
      }
      profileStore.set(swarmId, map)
    }
  } catch {
    // Non-fatal — performance data may not exist yet
  }
}

/**
 * Save performance data to persistent storage.
 * Writes to `{directory}/.ghostswarm/performance-profiles.json`.
 */
export async function savePerformanceData(directory: string): Promise<void> {
  try {
    const dirPath = `${directory}/.ghostswarm`
    await mkdirSafe(dirPath)

    const data: Record<string, AgentPerformanceProfile[]> = {}
    for (const [swarmId, profiles] of profileStore.entries()) {
      data[swarmId] = Array.from(profiles.values())
    }

    await writeFileSafe(
      `${dirPath}/${PERF_FILENAME}`,
      JSON.stringify(data, null, 2),
    )
  } catch (err) {
    console.error('[perf-tracker] Failed to save performance data:', err)
  }
}

/**
 * Initialize a profile for an agent when the swarm launches.
 * This ensures all agents appear in the leaderboard even before they complete tasks.
 */
export function initializeProfile(
  swarmId: string,
  agentLabel: string,
  role: SwarmAgentRole,
): void {
  if (!profileStore.has(swarmId)) {
    profileStore.set(swarmId, new Map())
  }
  const swarmProfiles = profileStore.get(swarmId)!

  if (!swarmProfiles.has(agentLabel)) {
    swarmProfiles.set(agentLabel, {
      agentLabel,
      role,
      tasksCompleted: 0,
      tasksFailed: 0,
      avgTaskDurationMs: 0,
      domainScores: {},
      lastUpdated: Date.now(),
    })
  }
}

// ─── Helpers ────────────────────────────────────────────────

function inferRoleFromLabel(label: string): SwarmAgentRole {
  const lower = label.toLowerCase()
  if (lower.startsWith('coordinator')) return 'coordinator'
  if (lower.startsWith('builder')) return 'builder'
  if (lower.startsWith('scout')) return 'scout'
  if (lower.startsWith('reviewer')) return 'reviewer'
  if (lower.startsWith('analyst')) return 'analyst'
  return 'custom'
}

/**
 * Compute the success rate percentage for a profile.
 */
export function getSuccessRate(profile: AgentPerformanceProfile): number {
  const total = profile.tasksCompleted + profile.tasksFailed
  return total > 0 ? Math.round((profile.tasksCompleted / total) * 100) : 0
}

/**
 * Format a duration in ms to a human-readable string.
 */
export function formatDurationMs(ms: number): string {
  if (ms === 0) return '--'
  const secs = Math.floor(ms / 1000)
  if (secs < 60) return `${secs}s`
  const mins = Math.floor(secs / 60)
  const remainSecs = secs % 60
  if (mins < 60) return `${mins}m ${remainSecs}s`
  const hours = Math.floor(mins / 60)
  const remainMins = mins % 60
  return `${hours}h ${remainMins}m`
}
