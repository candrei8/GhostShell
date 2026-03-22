// Swarm Interview Manager — send questions to agents mid-task via gs-mail IPC
// Uses the existing inbox/nudge infrastructure. The message injector's normal
// poll cycle picks up the message and injects `gs-mail check --inject` into
// the agent's terminal, so we never write raw PTY commands here.
//
// Response detection: watches swarmStore.messages for replies with
// meta.interviewId matching the sent interview.

import { useSwarmStore } from '../stores/swarmStore'
import type { SwarmInterview, SwarmBatchInterview } from './swarm-types'
import { getAgentLabels } from './swarm-operator'

// ─── Constants ──────────────────────────────────────────────

const INTERVIEW_TIMEOUT_MS = 120_000 // 2 minutes

// ─── Pending Interview Tracking ─────────────────────────────

/** In-flight interview IDs → unsubscribe callbacks for store watchers */
const activePollers = new Map<string, () => void>()

// ─── Helpers ────────────────────────────────────────────────

function genId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function sanitizeLabel(label: string): string {
  return label.replace(/[/\\:*?"<>|.\s]/g, '_')
}

function getSwarmOrThrow(swarmId: string) {
  const swarm = useSwarmStore.getState().getSwarm(swarmId)
  if (!swarm) throw new Error(`Swarm ${swarmId} not found`)
  if (!swarm.swarmRoot) throw new Error(`Swarm ${swarmId} has no swarmRoot`)
  return swarm
}

// ─── Write Interview Question to Agent Inbox ────────────────

async function writeInterviewToInbox(
  swarmRoot: string,
  agentLabel: string,
  interviewId: string,
  question: string,
): Promise<void> {
  const sanitized = sanitizeLabel(agentLabel)
  const inboxPath = `${swarmRoot}/inbox/${sanitized}`
  const nudgePath = `${swarmRoot}/nudges`

  // Ensure directories exist
  try {
    await window.ghostshell.fsCreateDir(inboxPath)
  } catch {
    // May already exist
  }
  try {
    await window.ghostshell.fsCreateDir(nudgePath)
  } catch {
    // May already exist
  }

  const msgId = genId(`interview-${sanitized}`)
  const payload = {
    id: msgId,
    from: '@operator',
    to: agentLabel,
    body: `OPERATOR INTERVIEW: ${question}\n\nRespond by sending a gs-mail to @operator with type "interview_response" and include --meta '{"interviewId":"${interviewId}"}' in your reply. Be concise and factual about your current work.`,
    type: 'interview',
    meta: {
      source: 'operator',
      priority: 'high',
      interviewId,
    },
    timestamp: Date.now().toString(),
  }

  await window.ghostshell.fsCreateFile(
    `${inboxPath}/${msgId}.json`,
    JSON.stringify(payload, null, 2),
  )

  // Write nudge so the message injector picks it up promptly
  try {
    await window.ghostshell.fsCreateFile(
      `${nudgePath}/${sanitized}.txt`,
      `Interview from @operator\n`,
    )
  } catch {
    // Non-critical
  }
}

// ─── Response Watcher ───────────────────────────────────────

/**
 * Watch swarmStore.messages for an interview_response matching the given
 * interviewId. Also polls the @operator inbox on the filesystem as a
 * fallback (agents send responses to @operator which lands in inbox/@operator/).
 */
function watchForResponse(
  swarmId: string,
  interviewId: string,
  targetAgent: string,
): void {
  const store = useSwarmStore

  // Set up a store subscription to watch for new messages
  const unsubscribe = store.subscribe((state, prevState) => {
    const swarm = state.swarms.find(s => s.id === swarmId)
    if (!swarm) return

    // Check all messages for a matching interview response
    const response = swarm.messages.find(
      (m) =>
        m.type === 'interview_response' &&
        m.from === targetAgent &&
        m.meta?.interviewId === interviewId,
    )

    if (response) {
      store.getState().updateInterview(interviewId, {
        status: 'answered',
        answer: response.body,
        answeredAt: Date.now(),
      })
      cleanup()
    }
  })

  // Also check operator messages (escalations to @operator)
  const operatorUnsub = store.subscribe((state, prevState) => {
    // Check operator messages for interview responses
    const opResponse = state.operatorMessages.find(
      (m) =>
        m.meta?.interviewId === interviewId &&
        m.from === targetAgent,
    )

    if (opResponse) {
      store.getState().updateInterview(interviewId, {
        status: 'answered',
        answer: opResponse.body,
        answeredAt: Date.now(),
      })
      cleanup()
    }
  })

  // Filesystem polling fallback — check @operator inbox periodically
  const pollInterval = setInterval(async () => {
    try {
      const swarm = store.getState().getSwarm(swarmId)
      if (!swarm?.swarmRoot) return

      const operatorInboxPath = `${swarm.swarmRoot}/inbox/@operator`
      let entries: Array<{ name: string; isDirectory: boolean; path: string }>
      try {
        entries = await window.ghostshell.fsReadDir(operatorInboxPath)
      } catch {
        return // Inbox directory may not exist yet
      }

      if (!entries || entries.length === 0) return

      for (const entry of entries) {
        if (!entry.name.endsWith('.json')) continue
        try {
          const fileResult = await window.ghostshell.fsReadFile(
            `${operatorInboxPath}/${entry.name}`,
          )
          if (!fileResult.success || !fileResult.content) continue
          const parsed = JSON.parse(fileResult.content)

          if (
            parsed.meta?.interviewId === interviewId &&
            (parsed.type === 'interview_response' || parsed.type === 'message')
          ) {
            store.getState().updateInterview(interviewId, {
              status: 'answered',
              answer: parsed.body || '(empty response)',
              answeredAt: Date.now(),
            })

            // Log response as a swarm message for visibility
            store.getState().addMessage(swarmId, {
              id: genId('iv-resp'),
              from: parsed.from || targetAgent,
              to: '@operator',
              body: parsed.body || '',
              type: 'interview_response',
              meta: { interviewId },
              timestamp: Date.now(),
            })

            // Remove the file after processing
            try {
              await window.ghostshell.fsDelete(`${operatorInboxPath}/${entry.name}`)
            } catch {
              // Non-critical
            }

            cleanup()
            return
          }
        } catch {
          // Malformed file — skip
        }
      }
    } catch {
      // Unexpected error — ignore
    }
  }, 5_000) // Poll every 5 seconds

  // Timeout handler
  const timeoutId = setTimeout(() => {
    const interview = store.getState().interviews.find(iv => iv.id === interviewId)
    if (interview && interview.status !== 'answered') {
      store.getState().updateInterview(interviewId, { status: 'timeout' })
    }
    cleanup()
  }, INTERVIEW_TIMEOUT_MS)

  function cleanup() {
    unsubscribe()
    operatorUnsub()
    clearInterval(pollInterval)
    clearTimeout(timeoutId)
    activePollers.delete(interviewId)
  }

  activePollers.set(interviewId, cleanup)
}

// ─── Public API ─────────────────────────────────────────────

/**
 * Send an interview question to a specific agent.
 * Writes a special "interview" message to the agent's inbox via gs-mail format.
 * The agent's system prompt instructs it to respond to @operator messages.
 */
export async function interviewAgent(
  swarmId: string,
  agentLabel: string,
  question: string,
): Promise<SwarmInterview> {
  const swarm = getSwarmOrThrow(swarmId)
  const swarmRoot = swarm.swarmRoot!

  const interviewId = genId('iv')

  // Find the terminal ID for this agent
  let terminalId: string | undefined
  for (const rosterAgent of swarm.config.roster) {
    const label = _resolveAgentLabel(swarm, rosterAgent.id)
    if (label === agentLabel) {
      const agentState = swarm.agents.find(a => a.rosterId === rosterAgent.id)
      terminalId = agentState?.terminalId
      break
    }
  }

  const interview: SwarmInterview = {
    id: interviewId,
    question,
    targetAgent: agentLabel,
    targetTerminalId: terminalId,
    status: 'sent',
    sentAt: Date.now(),
  }

  // Write to inbox
  await writeInterviewToInbox(swarmRoot, agentLabel, interviewId, question)

  // Track in store
  useSwarmStore.getState().addInterview(interview)

  // Log to swarm messages for visibility
  useSwarmStore.getState().addMessage(swarmId, {
    id: genId('iv-log'),
    from: '@operator',
    to: agentLabel,
    body: `[Interview] ${question}`,
    type: 'interview',
    meta: { interviewId },
    timestamp: Date.now(),
  })

  // Start watching for response
  watchForResponse(swarmId, interviewId, agentLabel)

  return interview
}

/**
 * Send the same question to multiple agents simultaneously.
 */
export async function batchInterview(
  swarmId: string,
  question: string,
  targets?: string[],
): Promise<SwarmBatchInterview> {
  const allLabels = getAgentLabels(swarmId)
  const resolvedTargets = targets && targets.length > 0
    ? targets.filter(t => allLabels.includes(t))
    : allLabels

  const batchId = genId('batch-iv')
  const interviews: SwarmInterview[] = []

  for (const agentLabel of resolvedTargets) {
    try {
      const interview = await interviewAgent(swarmId, agentLabel, question)
      interviews.push(interview)
    } catch (err) {
      console.error(`[InterviewManager] Failed to interview ${agentLabel}:`, err)
    }
  }

  const batch: SwarmBatchInterview = {
    id: batchId,
    question,
    targets: resolvedTargets,
    interviews,
    createdAt: Date.now(),
  }

  return batch
}

/**
 * Check the current status of an interview. Returns the latest state from the store.
 */
export function getInterviewStatus(interviewId: string): SwarmInterview | undefined {
  return useSwarmStore.getState().interviews.find(iv => iv.id === interviewId)
}

/**
 * Cancel all active interview pollers (e.g. when swarm is stopped).
 */
export function cancelAllInterviews(): void {
  for (const [, cleanup] of activePollers) {
    cleanup()
  }
  activePollers.clear()
}

// ─── Internal label resolver (avoids circular import with swarm-operator) ──

function _resolveAgentLabel(
  swarm: { config: { roster: Array<{ id: string; role: string; customName?: string }> } },
  rosterId: string,
): string | null {
  const rosterAgent = swarm.config.roster.find(r => r.id === rosterId)
  if (!rosterAgent) return null

  if (rosterAgent.customName) return rosterAgent.customName

  const roleLabels: Record<string, string> = {
    coordinator: 'Coordinator',
    builder: 'Builder',
    scout: 'Scout',
    reviewer: 'Reviewer',
    analyst: 'Analyst',
    custom: 'Agent',
  }

  const globalIndex = swarm.config.roster.indexOf(rosterAgent)
  let roleIndex = 0
  for (let i = 0; i < globalIndex; i++) {
    if (swarm.config.roster[i].role === rosterAgent.role) roleIndex++
  }

  const roleLabel = roleLabels[rosterAgent.role] || 'Agent'
  return `${roleLabel} ${roleIndex + 1}`
}
