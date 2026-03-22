import { useSwarmStore } from '../stores/swarmStore'
import { useTerminalStore } from '../stores/terminalStore'
import type { ParseResult } from './claude-output-parser'
import type { SwarmActivityEventType, SwarmActivityEvent, SwarmAgentRole } from './swarm-types'

// ─── Set-based deduplication cache ─────────────────────────────
// Prevents near-duplicate events (same agent, same type, same detail within a short window)

const recentEvents = new Map<string, number>() // key -> timestamp
const DEDUP_WINDOW_MS = 500

function deduplicateKey(type: string, agentLabel: string, detail: string): string {
  return `${type}:${agentLabel}:${detail}`
}

function isDuplicate(key: string): boolean {
  const lastSeen = recentEvents.get(key)
  if (lastSeen && Date.now() - lastSeen < DEDUP_WINDOW_MS) return true
  recentEvents.set(key, Date.now())
  // Prune old entries periodically to prevent unbounded growth
  if (recentEvents.size > 200) {
    const cutoff = Date.now() - DEDUP_WINDOW_MS * 2
    for (const [k, t] of recentEvents) {
      if (t < cutoff) recentEvents.delete(k)
    }
  }
  return false
}

// Track last event type per agent to debounce consecutive 'thinking' events
const lastEventTypePerAgent = new Map<string, SwarmActivityEventType>()

/**
 * Emit swarm activity events from parsed terminal output.
 * Called from usePty's batch parser callback for ghostswarm sessions.
 *
 * Collects all events first, deduplicates, then pushes to store in a single batch
 * to minimize re-renders (MiroFish batch-buffering pattern).
 */
export function emitSwarmActivity(sessionId: string, results: ParseResult[]): void {
  // 1. Check if session belongs to a swarm
  const session = useTerminalStore.getState().getSession(sessionId)
  if (!session || session.sessionType !== 'ghostswarm') return

  // 2. Find the swarm and roster agent for this session
  const swarmState = useSwarmStore.getState()
  let swarmId: string | undefined
  let agentLabel = 'Unknown'
  let agentRole: SwarmAgentRole = 'custom'

  for (const swarm of swarmState.swarms) {
    const agentState = swarm.agents.find((a) => a.terminalId === sessionId)
    if (agentState) {
      swarmId = swarm.id
      const rosterAgent = swarm.config.roster.find((r) => r.id === agentState.rosterId)
      if (rosterAgent) {
        agentRole = rosterAgent.role
        // Compute label — same logic as orchestrator (role + 1-based index)
        const sameRole = swarm.config.roster.filter((r) => r.role === rosterAgent.role)
        const roleIdx = sameRole.indexOf(rosterAgent)
        agentLabel =
          rosterAgent.customName ||
          `${rosterAgent.role.charAt(0).toUpperCase() + rosterAgent.role.slice(1)} ${roleIdx + 1}`
      }
      break
    }
  }

  if (!swarmId) return

  // 3. Map ParseResults to SwarmActivityEvents — collect batch first, then push once
  const batch: SwarmActivityEvent[] = []

  for (const result of results) {
    const event = mapResultToEvent(result, swarmId, agentLabel, agentRole)
    if (!event) continue

    // Dedup: skip if same agent+type+detail within the window
    const key = deduplicateKey(event.type, event.agentLabel, event.detail)
    if (isDuplicate(key)) continue

    // Debounce consecutive 'thinking' events for the same agent
    if (event.type === 'thinking') {
      const lastType = lastEventTypePerAgent.get(event.agentLabel)
      if (lastType === 'thinking') continue
    }
    lastEventTypePerAgent.set(event.agentLabel, event.type)

    batch.push(event)
  }

  // 4. Push all events to the store in a single update (avoids N re-renders per batch)
  if (batch.length > 0) {
    swarmState.addActivityEvents(batch)

    // 5. Check autonomy gates (B11) — non-blocking, notification-only
    checkBatchForAutonomyGates(swarmId, batch)
  }
}

function mapResultToEvent(
  result: ParseResult,
  swarmId: string,
  agentLabel: string,
  agentRole: SwarmAgentRole,
): SwarmActivityEvent | null {
  let type: SwarmActivityEventType | null = null
  let detail = result.detail || ''

  // Map activity + tool to event type
  if (result.fileTouch) {
    type =
      result.fileTouch.operation === 'read'
        ? 'file_read'
        : result.fileTouch.operation === 'write'
          ? 'file_write'
          : 'file_edit'
    detail = result.fileTouch.path
  } else if (result.tool === 'Bash' || result.tool === 'ShellTool' || result.tool === 'shell') {
    type = 'command_run'
  } else if (
    result.tool === 'Grep' ||
    result.tool === 'Glob' ||
    result.tool === 'GrepTool' ||
    result.tool === 'GlobTool' ||
    result.tool === 'search' ||
    result.activity === 'searching'
  ) {
    type = 'search'
  } else if (result.subAgent) {
    type = 'subagent_spawn'
    detail = result.subAgent.description
  } else if (result.subAgentCompleted) {
    type = 'subagent_complete'
  } else if (result.taskAction?.action === 'create') {
    type = 'task_created'
    detail = result.taskAction.subject || ''
  } else if (result.taskAction?.action === 'update') {
    type = 'task_status_change'
    detail = `${result.taskAction.taskId}: ${result.taskAction.status}`
  } else if (result.activity === 'thinking' || result.activity === 'planning') {
    type = 'thinking'
  } else if (result.tool) {
    type = 'tool_call'
    detail = `${result.tool}: ${detail}`
  }

  // Skip idle/spinner-only/context-only events
  if (!type) return null

  return {
    id: `sae-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: Date.now(),
    agentLabel,
    agentRole,
    swarmId,
    type,
    detail,
    metadata: result.tool ? { tool: result.tool } : undefined,
  }
}

// ─── Autonomy Gate Checks (B11) ──────────────────────────────
// Check activity events against configured autonomy rules.
// This is notification-only — we cannot block CLI actions, but we
// alert the operator by creating approval requests in the store.

// Track recently checked actions to avoid duplicate approvals
const recentAutonomyChecks = new Map<string, number>()
const AUTONOMY_DEDUP_WINDOW_MS = 10_000

function checkBatchForAutonomyGates(swarmId: string, events: SwarmActivityEvent[]): void {
  // Lazy import to avoid circular dependency
  import('./swarm-autonomy').then(({ checkActivityForApproval }) => {
    for (const event of events) {
      // Only check action types that could trigger gates
      if (
        event.type !== 'command_run' &&
        event.type !== 'file_write' &&
        event.type !== 'file_edit' &&
        event.type !== 'tool_call'
      ) {
        continue
      }

      // Map event type to action string
      const action = event.type === 'command_run'
        ? 'command'
        : event.type === 'file_write'
          ? 'file write'
          : event.type === 'file_edit'
            ? 'file edit'
            : 'tool call'

      // Dedup key
      const dedupKey = `${event.agentLabel}:${event.type}:${event.detail}`
      const lastChecked = recentAutonomyChecks.get(dedupKey)
      if (lastChecked && Date.now() - lastChecked < AUTONOMY_DEDUP_WINDOW_MS) continue
      recentAutonomyChecks.set(dedupKey, Date.now())

      // Prune old entries
      if (recentAutonomyChecks.size > 100) {
        const cutoff = Date.now() - AUTONOMY_DEDUP_WINDOW_MS * 2
        for (const [k, t] of recentAutonomyChecks) {
          if (t < cutoff) recentAutonomyChecks.delete(k)
        }
      }

      checkActivityForApproval(swarmId, event.agentLabel, action, event.detail)
    }
  }).catch(() => {
    // Module load failure — non-critical
  })
}
