// Swarm Message Injector — filesystem watcher that pushes gs-mail messages into agent terminals
// Monitors .ghostswarm/swarms/{paneId}/inbox for new messages and injects check commands
// Also: heartbeat tracking, real watchdog (PTY isAlive), delivery acknowledgment,
//       coordinator verification, deadlock detection, smart task assignment nudges

import { useSwarmStore } from '../stores/swarmStore'
import { useNotificationStore } from '../stores/notificationStore'
import { detectBlockedTasks } from './swarm-task-manager'

// ─── Types ───────────────────────────────────────────────────

interface MessageWatcher {
  cleanup: () => void
  swarmId: string
  swarmRoot: string
}

interface PendingDelivery {
  agentName: string
  terminalId: string
  swarmRoot: string
  attempts: number
  firstAttempt: number
}

// ─── Active Watchers ─────────────────────────────────────────

const activeWatchers = new Map<string, MessageWatcher>()

// ─── Agent Output Tracking (renderer-side) ───────────────────

/** Updated from usePty when terminal data arrives */
const lastOutputTimes = new Map<string, number>()

export function reportAgentOutput(terminalId: string): void {
  if (!terminalId) return
  lastOutputTimes.set(terminalId, Date.now())
}

// ─── Delivery Tracking (Tier 2.3 — ACK-based) ───────────────

const pendingDeliveries = new Map<string, PendingDelivery>()
const MAX_DELIVERY_ATTEMPTS = 3
const DELIVERY_RETRY_MS = 30_000

/** Tracks known ack files to avoid re-processing */
const knownAcks = new Map<string, Set<string>>()

// ─── Coordinator Verification (Tier 2.2) ────────────────────

/** Tracks coordinator task creation verification per swarm */
const coordVerification = new Map<string, {
  startedAt: number
  nudged: boolean
  escalated: boolean
}>()

/** Sanitize a label for use in filesystem paths — prevents directory traversal */
function sanitizeLabel(label: string): string {
  return label.replace(/[/\\:*?"<>|.]/g, '_')
}

function isMissionCompleteOperatorMessage(message: { type?: string; body?: string }): boolean {
  if (message.type !== 'worker_done') return false
  return /\bswarm mission complete\b/i.test(message.body || '')
}

function notifySwarmCompletion(swarmId: string): void {
  const swarm = useSwarmStore.getState().getSwarm(swarmId)
  if (!swarm) return

  const appFocused = typeof document !== 'undefined' ? document.hasFocus() : false
  const tier = appFocused ? 'toast' : 'full'

  useNotificationStore.getState().addNotification({
    type: 'success',
    title: `${swarm.config.name} finished`,
    message: 'Swarm mission completed.',
    source: 'Swarm',
    duration: 6000,
    tier,
    dedupeKey: `swarm-complete:${swarmId}`,
    dedupeWindowMs: 60000,
  })
}

// ─── Helper Functions ────────────────────────────────────────

function getAgentLabel(swarmId: string, rosterId: string): string | null {
  const swarm = useSwarmStore.getState().getSwarm(swarmId)
  if (!swarm) return null

  const rosterAgent = swarm.config.roster.find(r => r.id === rosterId)
  if (!rosterAgent) return null

  if (rosterAgent.customName) return rosterAgent.customName

  // Per-role index: count how many agents of the same role come before this one
  const globalIndex = swarm.config.roster.indexOf(rosterAgent)
  let roleIndex = 0
  for (let i = 0; i < globalIndex; i++) {
    if (swarm.config.roster[i].role === rosterAgent.role) roleIndex++
  }

  const roleLabels: Record<string, string> = {
    coordinator: 'Coordinator',
    builder: 'Builder',
    scout: 'Scout',
    reviewer: 'Reviewer',
    analyst: 'Analyst',
    custom: 'Agent',
  }

  const roleLabel = roleLabels[rosterAgent.role] || 'Agent'
  return `${roleLabel} ${roleIndex + 1}`
}

function getCoordinatorLabels(swarmId: string): string[] {
  const swarm = useSwarmStore.getState().getSwarm(swarmId)
  if (!swarm) return []

  return swarm.config.roster
    .filter((rosterAgent) => rosterAgent.role === 'coordinator')
    .map((rosterAgent) => getAgentLabel(swarmId, rosterAgent.id))
    .filter((label): label is string => !!label)
}

function findTerminalId(swarmId: string, agentName: string): string | null {
  const swarm = useSwarmStore.getState().getSwarm(swarmId)
  if (!swarm) return null

  for (let i = 0; i < swarm.config.roster.length; i++) {
    const rosterAgent = swarm.config.roster[i]
    const label = getAgentLabel(swarmId, rosterAgent.id)

    if (label === agentName) {
      const agentState = swarm.agents.find(a => a.rosterId === rosterAgent.id)
      return agentState?.terminalId || null
    }
  }

  return null
}

function injectMessageCheck(
  swarmRoot: string,
  terminalId: string
): void {
  try {
    window.ghostshell.ptyWrite(
      terminalId,
      `node "${swarmRoot}/bin/gs-mail.cjs" check --inject\r`
    )
  } catch (err) {
    console.error('[MessageInjector] Failed to inject command:', err)
  }
}

// ─── Message to Coordinator Inbox ───────────────────────────

async function writeToCoordinatorInbox(
  swarmId: string,
  swarmRoot: string,
  body: string,
  type: string = 'escalation',
  meta?: Record<string, unknown>,
): Promise<void> {
  const coordinatorLabels = getCoordinatorLabels(swarmId)
  if (coordinatorLabels.length === 0) return

  for (const coordLabel of coordinatorLabels) {
    const msgId = `${Date.now().toString()}-${coordLabel.replace(/\s+/g, '-').toLowerCase()}-system`
    const inboxPath = `${swarmRoot}/inbox/${sanitizeLabel(coordLabel)}`

    try {
      await window.ghostshell.fsCreateDir(inboxPath)
      await window.ghostshell.fsCreateFile(
        `${inboxPath}/${msgId}.json`,
        JSON.stringify({
          id: msgId,
          from: '@system',
          to: coordLabel,
          body,
          type,
          meta: meta || undefined,
          timestamp: Math.floor(Date.now() / 1000).toString(),
        }),
      )
    } catch {
      console.error(`[MessageInjector] Failed to write to ${coordLabel} inbox`)
    }
  }
}

// ─── Inbox Polling with Delivery Tracking ───────────────────

async function pollInbox(
  swarmId: string,
  swarmRoot: string,
  knownMessages: Set<string>,
): Promise<void> {
  try {
    const inboxPath = `${swarmRoot}/inbox`
    const agents = await window.ghostshell.fsReadDir(inboxPath)

    const agentsToNotify = new Set<string>()

    for (const agent of agents) {
      if (!agent.isDirectory) continue

      // Skip delivered folder
      if (agent.name === 'delivered') continue

      // Check for @operator messages
      if (agent.name === '@operator') {
        await pollOperatorInbox(swarmId, `${inboxPath}/@operator`, knownMessages)
        continue
      }

      const agentInboxPath = `${inboxPath}/${agent.name}`
      const messages = await window.ghostshell.fsReadDir(agentInboxPath)

      for (const msg of messages) {
        if (!msg.name.endsWith('.json')) continue

        const msgKey = `${agent.name}/${msg.name}`
        if (knownMessages.has(msgKey)) continue

        knownMessages.add(msgKey)
        agentsToNotify.add(agent.name)

        try {
          const msgResult = await window.ghostshell.fsReadFile(`${agentInboxPath}/${msg.name}`)
          if (msgResult.success && msgResult.content) {
            const parsed = JSON.parse(msgResult.content)
            if (parsed.from && parsed.to && parsed.body) {
              useSwarmStore.getState().addMessage(swarmId, {
                id: msgKey,
                from: parsed.from || 'unknown',
                to: parsed.to || agent.name,
                body: parsed.body || '',
                type: parsed.type || 'message',
                meta: parsed.meta || undefined,
                timestamp: parsed.timestamp || Date.now(),
              })
            }
          }
        } catch {
          // Message file might not be valid JSON yet
        }
      }
    }

    // Batch injection: collect all agents that need notification, inject once per agent
    // This avoids injecting multiple check commands if several messages arrive simultaneously
    if (agentsToNotify.size > 0) {
      const batchAgents: Array<{ name: string; terminalId: string }> = []

      for (const agentName of agentsToNotify) {
        const terminalId = findTerminalId(swarmId, agentName)
        if (!terminalId) {
          console.warn(`[MessageInjector] No terminal found for agent "${agentName}"`)
          continue
        }

        // Check if agent's PTY is alive before queuing for batch injection
        const alive = await window.ghostshell.ptyIsAlive(terminalId).catch(() => false)
        if (!alive) {
          console.warn(`[MessageInjector] Agent "${agentName}" PTY is dead, skipping injection`)
          continue
        }

        batchAgents.push({ name: agentName, terminalId })
      }

      // Batch inject: one gs-mail check --inject per agent (groups multiple messages)
      for (const agent of batchAgents) {
        injectMessageCheck(swarmRoot, agent.terminalId)

        // Track delivery — verified via ACK files on next poll
        const deliveryKey = `${swarmId}:${agent.name}`
        if (!pendingDeliveries.has(deliveryKey)) {
          pendingDeliveries.set(deliveryKey, {
            agentName: agent.name,
            terminalId: agent.terminalId,
            swarmRoot,
            attempts: 1,
            firstAttempt: Date.now(),
          })
        }
      }
    }

    // Verify deliveries via ACK files and retry/DLQ as needed
    await verifyAndRetryDeliveries(swarmId, swarmRoot)
  } catch (err) {
    // Inbox might not exist yet, permission error, or a malformed swarmRoot
    // path. Logging is essential here — silent failures left the dashboard
    // stuck on placeholder text with no diagnostic trail.
    console.error(`[MessageInjector] pollInbox failed for ${swarmId} (${swarmRoot}):`, err)
  }
}

// ─── Delivery Verification & Retry (Tier 2.3 — ACK-based + DLQ) ──

async function verifyAndRetryDeliveries(
  swarmId: string,
  swarmRoot: string,
): Promise<void> {
  const now = Date.now()

  // First, scan for new ACK files to confirm deliveries
  await scanAckFiles(swarmId, swarmRoot)

  for (const [key, delivery] of pendingDeliveries.entries()) {
    if (!key.startsWith(`${swarmId}:`)) continue

    // Give the agent time to process (check --inject deletes files + writes ack)
    if (now - delivery.firstAttempt < 5_000) continue

    // Check if ACK file exists for this agent (delivery confirmed)
    const hasAck = await checkAgentAck(swarmRoot, delivery.agentName)
    if (hasAck) {
      pendingDeliveries.delete(key)
      continue
    }

    // Also check inbox — if empty, messages were consumed even without ack
    let inboxEmpty = false
    try {
      const agentInboxPath = `${swarmRoot}/inbox/${delivery.agentName}`
      const files = await window.ghostshell.fsReadDir(agentInboxPath)
      const jsonFiles = files.filter((f: { name: string }) => f.name.endsWith('.json'))
      inboxEmpty = jsonFiles.length === 0
    } catch {
      inboxEmpty = true
    }

    if (inboxEmpty) {
      pendingDeliveries.delete(key)
      continue
    }

    // Inbox still has messages — delivery may have failed
    if (now - delivery.firstAttempt < DELIVERY_RETRY_MS) continue

    if (delivery.attempts >= MAX_DELIVERY_ATTEMPTS) {
      // Move undelivered messages to dead-letter queue
      console.error(`[MessageInjector] Failed to deliver to "${delivery.agentName}" after ${MAX_DELIVERY_ATTEMPTS} attempts — moving to dead-letter queue`)
      await moveToDeadLetterQueue(swarmRoot, delivery.agentName)

      useSwarmStore.getState().addOperatorMessage({
        id: `delivery-fail-${now}`,
        from: '@system',
        to: '@operator',
        body: `Message delivery to "${delivery.agentName}" failed after ${MAX_DELIVERY_ATTEMPTS} attempts. Messages moved to dead-letter queue. Agent may be unresponsive.`,
        type: 'escalation',
        timestamp: now,
      })
      pendingDeliveries.delete(key)
      continue
    }

    // Check if PTY still alive before retrying
    const alive = await window.ghostshell.ptyIsAlive(delivery.terminalId).catch(() => false)
    if (!alive) {
      pendingDeliveries.delete(key)
      continue
    }

    // Retry injection
    delivery.attempts++
    injectMessageCheck(delivery.swarmRoot, delivery.terminalId)
  }
}

// ─── ACK File Scanner ────────────────────────────────────────

async function scanAckFiles(
  swarmId: string,
  swarmRoot: string,
): Promise<void> {
  try {
    const acksPath = `${swarmRoot}/acks`
    const files = await window.ghostshell.fsReadDir(acksPath)

    let swarmAcks = knownAcks.get(swarmId)
    if (!swarmAcks) {
      swarmAcks = new Set()
      knownAcks.set(swarmId, swarmAcks)
    }

    for (const file of files) {
      if (!file.name.endsWith('.json')) continue
      if (swarmAcks.has(file.name)) continue

      swarmAcks.add(file.name)

      // Clean up old ack files (older than 5 minutes)
      try {
        const ackResult = await window.ghostshell.fsReadFile(`${acksPath}/${file.name}`)
        if (ackResult.success && ackResult.content) {
          const ack = JSON.parse(ackResult.content)
          if (ack.ackedAt && Date.now() - ack.ackedAt > 300_000) {
            await window.ghostshell.fsDelete(`${acksPath}/${file.name}`)
            swarmAcks.delete(file.name)
          }
        }
      } catch {
        // Non-critical
      }
    }
  } catch {
    // acks/ directory may not exist yet
  }
}

async function checkAgentAck(
  swarmRoot: string,
  agentName: string,
): Promise<boolean> {
  try {
    const acksPath = `${swarmRoot}/acks`
    const files = await window.ghostshell.fsReadDir(acksPath)
    // ACK files are named: {agentName}-{timestamp}.json
    const agentPrefix = `${agentName}-`
    return files.some((f: { name: string }) =>
      f.name.startsWith(agentPrefix) && f.name.endsWith('.json')
    )
  } catch {
    return false
  }
}

// ─── Dead-Letter Queue ───────────────────────────────────────

async function moveToDeadLetterQueue(
  swarmRoot: string,
  agentName: string,
): Promise<void> {
  try {
    const agentInboxPath = `${swarmRoot}/inbox/${agentName}`
    const dlqPath = `${swarmRoot}/inbox/dead-letter/${sanitizeLabel(agentName)}`

    const files = await window.ghostshell.fsReadDir(agentInboxPath)
    const jsonFiles = files.filter((f: { name: string }) => f.name.endsWith('.json'))

    if (jsonFiles.length === 0) return

    // Ensure DLQ directory exists
    await window.ghostshell.fsCreateDir(dlqPath)

    for (const file of jsonFiles) {
      try {
        // Read the message
        const result = await window.ghostshell.fsReadFile(`${agentInboxPath}/${file.name}`)
        if (result.success && result.content) {
          // Write to DLQ with metadata about the failure
          const original = JSON.parse(result.content)
          const dlqEntry = {
            ...original,
            _dlq: {
              movedAt: Date.now(),
              targetAgent: agentName,
              reason: 'max_delivery_attempts_exceeded',
            },
          }
          await window.ghostshell.fsCreateFile(
            `${dlqPath}/${file.name}`,
            JSON.stringify(dlqEntry),
          )
        }
        // Remove from inbox
        await window.ghostshell.fsDelete(`${agentInboxPath}/${file.name}`)
      } catch {
        // Individual file move failure — continue with others
      }
    }
  } catch {
    console.error(`[MessageInjector] Failed to move messages to DLQ for "${agentName}"`)
  }
}

// ─── Operator Inbox Polling ─────────────────────────────────

async function pollOperatorInbox(
  swarmId: string,
  operatorInboxPath: string,
  knownMessages: Set<string>,
): Promise<void> {
  try {
    const messages = await window.ghostshell.fsReadDir(operatorInboxPath)

    for (const msg of messages) {
      if (!msg.name.endsWith('.json')) continue

      const msgKey = `@operator/${msg.name}`
      if (knownMessages.has(msgKey)) continue

      knownMessages.add(msgKey)

      try {
        const msgResult = await window.ghostshell.fsReadFile(`${operatorInboxPath}/${msg.name}`)
        if (msgResult.success && msgResult.content) {
          const parsed = JSON.parse(msgResult.content)
          if (parsed.from && parsed.body) {
            if (isMissionCompleteOperatorMessage(parsed)) {
              useSwarmStore.getState().markSwarmCompleted(swarmId)
              notifySwarmCompletion(swarmId)
            }

            useSwarmStore.getState().addOperatorMessage({
              id: msgKey,
              from: parsed.from || 'unknown',
              to: '@operator',
              body: parsed.body || '',
              type: parsed.type || 'escalation',
              meta: parsed.meta || undefined,
              timestamp: parsed.timestamp || Date.now(),
            })
          }
        }
      } catch {
        // Message file might not be valid JSON yet
      }
    }
  } catch {
    // Operator inbox might not exist yet
  }
}

// ─── Structured Handoff: Scout Findings & Review Reports ────

const knownReportsBySwarm = new Map<string, Set<string>>()

/**
 * Watches the reports/ directory for structured handoff data:
 * - scout-findings-*.json  (scout → builders handoff)
 * - review-report-*.json   (reviewer → coordinator handoff)
 * Notifies relevant agents when new reports appear.
 */
async function pollReportsDirectory(
  swarmId: string,
  swarmRoot: string,
): Promise<void> {
  const swarm = useSwarmStore.getState().getSwarm(swarmId)
  if (!swarm || swarm.status !== 'running') return

  try {
    const reportsPath = `${swarmRoot}/reports`
    const files = await window.ghostshell.fsReadDir(reportsPath)

    for (const file of files) {
      if (!file.name.endsWith('.json')) continue
      let swarmReports = knownReportsBySwarm.get(swarmId)
      if (!swarmReports) {
        swarmReports = new Set()
        knownReportsBySwarm.set(swarmId, swarmReports)
      }
      if (swarmReports.has(file.name)) continue

      swarmReports.add(file.name)

      try {
        const result = await window.ghostshell.fsReadFile(`${reportsPath}/${file.name}`)
        if (!result.success || !result.content) continue

        const report = JSON.parse(result.content)
        const reportType = report.type || ''

        // Scout findings → notify all builders + coordinator
        if (reportType === 'scout-findings' || file.name.startsWith('scout-findings')) {
          const targets = swarm.config.roster
            .map((r) => ({ role: r.role, label: getAgentLabel(swarmId, r.id) }))
            .filter(a => a.role === 'builder' || a.role === 'coordinator')

          for (const target of targets) {
            if (!target.label) continue
            const terminalId = findTerminalId(swarmId, target.label)
            if (!terminalId) continue

            const alive = await window.ghostshell.ptyIsAlive(terminalId).catch(() => false)
            if (!alive) continue

            // Write a notification to their inbox
            await writeToAgentInbox(swarmRoot, target.label,
              `[SCOUT REPORT] New findings available: ${reportsPath}/${file.name}. ` +
              `Summary: ${report.summary || 'Check the report file for details.'}`,
              'message',
              { reportFile: file.name, reportType, from: report.author || 'Scout' },
            )
          }
        }

        // Analyst report → notify coordinator
        if (reportType === 'analyst-report' || file.name.startsWith('analyst-report')) {
          for (const coordLabel of getCoordinatorLabels(swarmId)) {
            await writeToAgentInbox(swarmRoot, coordLabel,
              `[ANALYST REPORT] Progress update available: ${reportsPath}/${file.name}. ` +
              `Summary: ${report.summary || 'Check the report file for details.'}` +
              (report.velocityTrend ? ` Velocity: ${report.velocityTrend}.` : '') +
              (report.bottlenecks?.length ? ` Bottlenecks: ${report.bottlenecks.length}.` : ''),
              'message',
              { reportFile: file.name, reportType, from: report.author || 'Analyst' },
            )
          }
        }

        // Review report → notify coordinator + builder
        if (reportType === 'review-report' || file.name.startsWith('review-report')) {
          for (const coordLabel of getCoordinatorLabels(swarmId)) {
            await writeToAgentInbox(swarmRoot, coordLabel,
              `[REVIEW REPORT] ${report.taskId || 'Unknown task'}: verdict=${report.verdict || 'pending'}. ` +
              `Report: ${reportsPath}/${file.name}`,
              'review_complete',
              { reportFile: file.name, taskId: report.taskId, verdict: report.verdict },
            )
          }
        }

        // Track in swarm store for UI
        useSwarmStore.getState().addMessage(swarmId, {
          id: `report-${file.name}`,
          from: report.author || '@system',
          to: reportType === 'scout-findings' ? '@builders' : '@coordinator',
          body: `Structured ${reportType} report: ${report.summary || file.name}`,
          type: 'message',
          meta: { reportFile: file.name, reportType },
          timestamp: report.timestamp || Date.now(),
        })
      } catch {
        // Report file might not be valid JSON yet
      }
    }

    // Also scan reports/analyst/ subdirectory for analyst reports
    try {
      const analystPath = `${reportsPath}/analyst`
      const analystFiles = await window.ghostshell.fsReadDir(analystPath)

      for (const file of analystFiles) {
        if (!file.name.endsWith('.json')) continue
        const fullKey = `analyst/${file.name}`

        let swarmReports = knownReportsBySwarm.get(swarmId)
        if (!swarmReports) {
          swarmReports = new Set()
          knownReportsBySwarm.set(swarmId, swarmReports)
        }
        if (swarmReports.has(fullKey)) continue

        swarmReports.add(fullKey)

        try {
          const result = await window.ghostshell.fsReadFile(`${analystPath}/${file.name}`)
          if (!result.success || !result.content) continue

          const report = JSON.parse(result.content)
          const reportType = report.type || ''

          if (reportType === 'analyst-report' || file.name.startsWith('analyst-report')) {
            for (const coordLabel of getCoordinatorLabels(swarmId)) {
              await writeToAgentInbox(swarmRoot, coordLabel,
                `[ANALYST REPORT] Progress update available: ${analystPath}/${file.name}. ` +
                `Summary: ${report.summary || 'Check the report file for details.'}` +
                (report.velocityTrend ? ` Velocity: ${report.velocityTrend}.` : '') +
                (report.bottlenecks?.length ? ` Bottlenecks: ${report.bottlenecks.length}.` : ''),
                'message',
                { reportFile: `analyst/${file.name}`, reportType, from: report.author || 'Analyst' },
              )
            }

            // Track in swarm store for UI
            useSwarmStore.getState().addMessage(swarmId, {
              id: `report-analyst-${file.name}`,
              from: report.author || '@system',
              to: '@coordinator',
              body: `Analyst report: ${report.summary || file.name}`,
              type: 'message',
              meta: { reportFile: `analyst/${file.name}`, reportType: 'analyst-report' },
              timestamp: report.timestamp || Date.now(),
            })
          }
        } catch {
          // Analyst report file might not be valid JSON yet
        }
      }
    } catch {
      // reports/analyst/ directory might not exist yet
    }
  } catch {
    // Reports directory might not exist yet
  }
}

/** Write a message directly to an agent's inbox (bypasses gs-mail CLI) */
async function writeToAgentInbox(
  swarmRoot: string,
  agentName: string,
  body: string,
  type: string = 'message',
  meta?: Record<string, unknown>,
): Promise<void> {
  const msgId = Date.now().toString() + '-injector'
  const inboxPath = `${swarmRoot}/inbox/${sanitizeLabel(agentName)}`

  try {
    await window.ghostshell.fsCreateDir(inboxPath)
    await window.ghostshell.fsCreateFile(
      `${inboxPath}/${msgId}.json`,
      JSON.stringify({
        id: msgId,
        from: '@system',
        to: agentName,
        body,
        type,
        meta: meta || undefined,
        timestamp: Math.floor(Date.now() / 1000).toString(),
      }),
    )
  } catch {
    console.error(`[MessageInjector] Failed to write to ${agentName} inbox`)
  }
}

// ─── Real Watchdog (Tier 1.2 — PTY-aware) ──────────────────

const STALE_THRESHOLD_MS = 120_000   // 2 minutes — no output
const NUDGE_THRESHOLD_MS = 120_000   // 2 minutes — process alive but silent with task

/** Tracks whether we already sent a watchdog alert per agent (avoid spam) */
const watchdogAlerted = new Map<string, number>()

async function runHeartbeatAndWatchdog(
  swarmId: string,
  swarmRoot: string,
): Promise<void> {
  const swarm = useSwarmStore.getState().getSwarm(swarmId)
  if (!swarm || swarm.status !== 'running') return

  const now = Date.now()

  // Ensure heartbeats directory exists
  try {
    await window.ghostshell.fsCreateDir(`${swarmRoot}/heartbeats`)
  } catch { /* may already exist */ }

  for (const agentState of swarm.agents) {
    if (!agentState.terminalId || !agentState.agentId) continue

    const label = getAgentLabel(swarmId, agentState.rosterId)
    if (!label) continue

    const lastOutput = lastOutputTimes.get(agentState.terminalId) || now
    const elapsed = now - lastOutput

    // REAL check: is the PTY process actually alive?
    const processAlive = await window.ghostshell.ptyIsAlive(agentState.terminalId).catch(() => false)

    // Determine health status based on process state + output timing
    let healthStatus: 'healthy' | 'stale' | 'dead' = 'healthy'

    if (!processAlive) {
      // Process is actually dead — mark immediately, don't wait 10 minutes
      healthStatus = 'dead'
    } else if (elapsed > STALE_THRESHOLD_MS) {
      // Process alive but no output for 2+ minutes
      healthStatus = 'stale'
    }

    // Update store
    useSwarmStore.getState().updateAgentHealth(swarmId, label, {
      lastSeen: processAlive ? now : lastOutput,
      status: healthStatus,
    })

    // Write heartbeat file (for coordinator to read)
    try {
      await window.ghostshell.fsCreateFile(
        `${swarmRoot}/heartbeats/${label.replace(/\s+/g, '_')}.json`,
        JSON.stringify({
          agent: label,
          lastSeen: lastOutput,
          lastOutput: lastOutput,
          processAlive,
          status: healthStatus,
        }, null, 2),
      )
    } catch { /* non-critical */ }

    // Dead agent: alert immediately (don't wait 10 minutes)
    if (healthStatus === 'dead' && agentState.currentTask) {
      const alertKey = `${swarmId}:dead-${label}`
      const lastAlert = watchdogAlerted.get(alertKey) || 0

      if (now - lastAlert > 60_000) {  // Rate limit: once per minute
        watchdogAlerted.set(alertKey, now)
        await writeToCoordinatorInbox(swarmId, swarmRoot,
          `[WATCHDOG] ${label} process is DEAD. Task ${agentState.currentTask} needs reassignment. Agent should be restarted.`,
          'escalation',
          { agentName: label, taskId: agentState.currentTask, dead: true, processAlive: false },
        )
      }
    }

    // Stuck agent: process alive but no output + has task → nudge
    if (processAlive && elapsed > NUDGE_THRESHOLD_MS && agentState.currentTask) {
      const alertKey = `${swarmId}:stuck-${label}-${agentState.currentTask}`
      const lastAlert = watchdogAlerted.get(alertKey) || 0

      if (now - lastAlert > 300_000) {  // Rate limit: once per 5 minutes
        watchdogAlerted.set(alertKey, now)

        // Nudge the agent directly
        try {
          window.ghostshell.ptyWrite(
            agentState.terminalId,
            `\r# [SYSTEM NUDGE] Are you stuck? No output for ${Math.round(elapsed / 60_000)}m. If blocked, escalate to Coordinator.\r`
          )
        } catch { /* agent might not accept input */ }

        // Also alert coordinator
        await writeToCoordinatorInbox(swarmId, swarmRoot,
          `[WATCHDOG] ${label} appears stuck on task ${agentState.currentTask} (no output for ${Math.round(elapsed / 60_000)}m, process alive). Consider checking in.`,
          'escalation',
          { agentName: label, taskId: agentState.currentTask, elapsedMs: elapsed },
        )
      }
    }
  }
}

// ─── Coordinator Verification Loop (Tier 2.2) ──────────────

async function runCoordinatorVerification(
  swarmId: string,
  swarmRoot: string,
): Promise<void> {
  const swarm = useSwarmStore.getState().getSwarm(swarmId)
  if (!swarm || swarm.status !== 'running') return

  const now = Date.now()

  if (!coordVerification.has(swarmId)) {
    coordVerification.set(swarmId, {
      startedAt: now,
      nudged: false,
      escalated: false,
    })
  }

  const verification = coordVerification.get(swarmId)
  if (!verification) return

  // Check if tasks exist in task-graph.json
  try {
    const result = await window.ghostshell.fsReadFile(`${swarmRoot}/bin/task-graph.json`)
    if (result.success && result.content) {
      const graph = JSON.parse(result.content)
      const taskCount = Object.keys(graph.tasks || {}).length

      if (taskCount > 0) {
        // Tasks created — verification complete
        coordVerification.delete(swarmId)
        return
      }
    }
  } catch {
    // File not ready yet
  }

  const elapsed = now - verification.startedAt

  // 60s: First nudge to coordinator
  if (elapsed > 60_000 && !verification.nudged) {
    verification.nudged = true

    for (const coordLabel of getCoordinatorLabels(swarmId)) {
      const coordTerminalId = findTerminalId(swarmId, coordLabel)
      if (coordTerminalId) {
        try {
          window.ghostshell.ptyWrite(
            coordTerminalId,
            `\r# [SYSTEM] No tasks detected after 60s. Create tasks NOW using: node "${swarmRoot}/bin/gs-task.cjs" create --id t1 --title "..." --files "..."\r`
          )
        } catch { /* */ }
      }
    }
  }

  // 120s: Escalate to operator
  if (elapsed > 120_000 && !verification.escalated) {
    verification.escalated = true

    useSwarmStore.getState().addOperatorMessage({
      id: `coord-verify-${now}`,
      from: '@system',
      to: '@operator',
      body: `Coordinator has not created any tasks after 2 minutes. The swarm may be stuck. Consider checking the Coordinator terminal or restarting the swarm.`,
      type: 'escalation',
      timestamp: now,
    })
  }
}

// ─── Deadlock Detection (Tier 3.4) ─────────────────────────

const lastDeadlockAlert = new Map<string, number>()

async function runDeadlockDetection(
  swarmId: string,
  swarmRoot: string,
): Promise<void> {
  const swarm = useSwarmStore.getState().getSwarm(swarmId)
  if (!swarm || swarm.status !== 'running') return

  const now = Date.now()

  try {
    const { blockedTasks, cycles } = await detectBlockedTasks(swarmRoot)

    // Alert about circular dependencies
    if (cycles.length > 0) {
      const alertKey = `${swarmId}:cycles`
      const lastAlert = lastDeadlockAlert.get(alertKey) || 0

      if (now - lastAlert > 300_000) {
        lastDeadlockAlert.set(alertKey, now)

        await writeToCoordinatorInbox(swarmId, swarmRoot,
          `[DEADLOCK DETECTOR] Circular dependencies detected:\n${cycles.join('\n')}\nTasks will never complete. Fix the dependency graph.`,
          'escalation',
          { cycles },
        )

        useSwarmStore.getState().addOperatorMessage({
          id: `deadlock-${now}`,
          from: '@system',
          to: '@operator',
          body: `Circular dependency detected in swarm task graph: ${cycles[0]}`,
          type: 'escalation',
          timestamp: now,
        })
      }
    }

    // Alert about blocked tasks
    if (blockedTasks.length > 0) {
      for (const bt of blockedTasks) {
        const alertKey = `${swarmId}:blocked-${bt.taskId}`
        const lastAlert = lastDeadlockAlert.get(alertKey) || 0

        if (now - lastAlert > 120_000) {  // Every 2 minutes
          lastDeadlockAlert.set(alertKey, now)

          await writeToCoordinatorInbox(swarmId, swarmRoot,
            `[BLOCKED] Task ${bt.taskId} ("${bt.title}") is ${bt.status} but blocked by incomplete deps: ${bt.blockedBy.join(', ')}. Agent ${bt.assignedTo || 'unknown'} is waiting.`,
            'escalation',
            { taskId: bt.taskId, blockedBy: bt.blockedBy },
          )
        }
      }
    }
  } catch {
    // Task graph might not be ready
  }
}

// ─── Smart Task Assignment Nudge (Tier 3.2) ────────────────

const lastAssignmentNudge = new Map<string, number>()

async function runSmartAssignmentCheck(
  swarmId: string,
  swarmRoot: string,
): Promise<void> {
  const swarm = useSwarmStore.getState().getSwarm(swarmId)
  if (!swarm || swarm.status !== 'running') return

  const now = Date.now()
  const alertKey = `${swarmId}:assign-nudge`
  const lastNudge = lastAssignmentNudge.get(alertKey) || 0

  // Rate limit: every 60 seconds
  if (now - lastNudge < 60_000) return

  try {
    // Check for ready tasks
    const result = await window.ghostshell.fsReadFile(`${swarmRoot}/bin/task-graph.json`)
    if (!result.success || !result.content) return

    const graph = JSON.parse(result.content)
    const tasks = Object.values(graph.tasks || {}) as Array<{
      id: string; status: string; dependsOn?: string[]
    }>

    const readyTasks = tasks.filter(t => {
      if (t.status !== 'open') return false
      const deps = t.dependsOn || []
      return deps.every(depId => {
        const dep = (graph.tasks || {})[depId]
        return dep && dep.status === 'done'
      })
    })

    if (readyTasks.length === 0) return

    // Check for idle builders (no current task, healthy status)
    const idleBuilders = swarm.agents.filter(a => {
      const roster = swarm.config.roster.find(r => r.id === a.rosterId)
      if (!roster || roster.role !== 'builder') return false
      return !a.currentTask && a.status !== 'error'
    })

    if (idleBuilders.length === 0) return

    // There are ready tasks AND idle builders — nudge the coordinator
    lastAssignmentNudge.set(alertKey, now)

    await writeToCoordinatorInbox(swarmId, swarmRoot,
      `[SMART ASSIGN] ${readyTasks.length} task(s) ready + ${idleBuilders.length} builder(s) idle. Assign now:\n` +
      readyTasks.slice(0, 3).map(t => `  - ${t.id}`).join('\n') +
      `\nRun: node ${swarmRoot}/bin/gs-task.cjs ready`,
      'message',
      { readyTasks: readyTasks.length, idleBuilders: idleBuilders.length },
    )
  } catch {
    // Task graph not ready
  }
}

// ─── Coordinator Heartbeat (Phase 1.3) ──────────────────────

/**
 * Checks if the coordinator has pending actions and injects gs-mail check if so.
 * Pending actions: tasks in review without reviewer, ready tasks + idle builders,
 * or unread messages in the coordinator inbox.
 */
async function runCoordinatorHeartbeat(
  swarmId: string,
  swarmRoot: string,
): Promise<void> {
  const swarm = useSwarmStore.getState().getSwarm(swarmId)
  if (!swarm || swarm.status !== 'running') return

  const coordLabels = getCoordinatorLabels(swarmId)
  if (coordLabels.length === 0) return

  for (const coordLabel of coordLabels) {
    const coordTerminalId = findTerminalId(swarmId, coordLabel)
    if (!coordTerminalId) continue

    const alive = await window.ghostshell.ptyIsAlive(coordTerminalId).catch(() => false)
    if (!alive) continue

    let hasPendingAction = false

    // Check 1: unread messages in coordinator inbox
    if (!hasPendingAction) {
      try {
        const inboxPath = `${swarmRoot}/inbox/${sanitizeLabel(coordLabel)}`
        const files = await window.ghostshell.fsReadDir(inboxPath)
        const jsonFiles = files.filter((f: { name: string }) => f.name.endsWith('.json'))
        if (jsonFiles.length > 0) hasPendingAction = true
      } catch {
        // Inbox might not exist yet
      }
    }

    // Check 2: tasks in review without reviewer assigned, or open tasks with deps done + idle builders
    if (!hasPendingAction) {
      try {
        const result = await window.ghostshell.fsReadFile(`${swarmRoot}/bin/task-graph.json`)
        if (result.success && result.content) {
          const graph = JSON.parse(result.content)
          const tasks = Object.values(graph.tasks || {}) as Array<{
            id: string; status: string; assignedTo?: string; dependsOn?: string[]
          }>

          // Any tasks in 'review' without a reviewer?
          const needsReview = tasks.some(t => t.status === 'review')
          if (needsReview) hasPendingAction = true

          // Any open tasks with all deps done + any idle builders?
          if (!hasPendingAction) {
            const readyTasks = tasks.filter(t => {
              if (t.status !== 'open') return false
              const deps = t.dependsOn || []
              return deps.every(depId => {
                const dep = (graph.tasks || {})[depId] as { status: string } | undefined
                return dep && dep.status === 'done'
              })
            })
            if (readyTasks.length > 0) {
              const idleBuilders = swarm.agents.filter(a => {
                const roster = swarm.config.roster.find(r => r.id === a.rosterId)
                if (!roster || roster.role !== 'builder') return false
                return !a.currentTask && a.status !== 'error'
              })
              if (idleBuilders.length > 0) hasPendingAction = true
            }
          }
        }
      } catch {
        // Task graph not ready yet
      }
    }

    if (hasPendingAction) {
      injectMessageCheck(swarmRoot, coordTerminalId)
    }
  }
}

// ─── Builder Assignment Push (Phase 1.3) ────────────────────

/**
 * For each builder with unread inbox messages, inject gs-mail check
 * so they pick up assignments without relying on self-polling.
 */
async function runBuilderAssignmentPush(
  swarmId: string,
  swarmRoot: string,
): Promise<void> {
  const swarm = useSwarmStore.getState().getSwarm(swarmId)
  if (!swarm || swarm.status !== 'running') return

  for (const agentState of swarm.agents) {
    const roster = swarm.config.roster.find(r => r.id === agentState.rosterId)
    if (!roster || roster.role !== 'builder') continue

    const label = getAgentLabel(swarmId, agentState.rosterId)
    if (!label || !agentState.terminalId) continue

    // Check if builder inbox has unread messages
    try {
      const inboxPath = `${swarmRoot}/inbox/${sanitizeLabel(label)}`
      const files = await window.ghostshell.fsReadDir(inboxPath)
      const jsonFiles = files.filter((f: { name: string }) => f.name.endsWith('.json'))
      if (jsonFiles.length === 0) continue
    } catch {
      continue // Inbox doesn't exist yet
    }

    // Inbox has messages — check PTY and inject
    const alive = await window.ghostshell.ptyIsAlive(agentState.terminalId).catch(() => false)
    if (!alive) continue

    injectMessageCheck(swarmRoot, agentState.terminalId)
  }
}

// ─── Public API ──────────────────────────────────────────────

export function startMessageInjector(
  swarmId: string,
  swarmRoot: string
): () => void {
  stopMessageInjector(swarmId)

  const knownMessages = new Set<string>()
  let isPolling = false
  let tickCounter = 0

  // Poll every 1.5 seconds with overlap guard
  const intervalId = setInterval(async () => {
    if (isPolling) return
    isPolling = true
    try {
      await pollInbox(swarmId, swarmRoot, knownMessages)

      tickCounter++

      // Every ~30 seconds (20 ticks): heartbeat + watchdog
      if (tickCounter % 20 === 0) {
        await runHeartbeatAndWatchdog(swarmId, swarmRoot)
      }

      // Every ~15 seconds (10 ticks): coordinator verification (first 3 minutes only)
      if (tickCounter % 10 === 0 && coordVerification.has(swarmId)) {
        await runCoordinatorVerification(swarmId, swarmRoot)
      }

      // Every ~45 seconds (30 ticks): deadlock detection
      if (tickCounter % 30 === 0) {
        await runDeadlockDetection(swarmId, swarmRoot)
      }

      // Every ~60 seconds (40 ticks): smart assignment check
      if (tickCounter % 40 === 0) {
        await runSmartAssignmentCheck(swarmId, swarmRoot)
      }

      // Every ~30 seconds (20 ticks, offset by 10): structured report handoffs
      if (tickCounter % 20 === 10) {
        await pollReportsDirectory(swarmId, swarmRoot)
      }

      // Every ~30s (offset 5): coordinator heartbeat — push gs-mail check if pending actions
      if (tickCounter % 20 === 5) {
        await runCoordinatorHeartbeat(swarmId, swarmRoot)
      }

      // Every ~9s (offset 3): builder assignment push — inject gs-mail check if inbox has messages
      if (tickCounter % 6 === 3) {
        await runBuilderAssignmentPush(swarmId, swarmRoot)
      }

      // Periodic GC every ~5 minutes (200 ticks, offset 100): purge stale rate-limit entries
      if (tickCounter % 200 === 100) {
        const gcNow = Date.now()
        for (const map of [watchdogAlerted, lastDeadlockAlert, lastAssignmentNudge]) {
          for (const [key, ts] of map.entries()) {
            if (gcNow - ts > 600_000) map.delete(key)
          }
        }
      }
    } catch (err) {
      console.error('[MessageInjector] Poll cycle failed:', err)
    } finally {
      isPolling = false
    }
  }, 1500)

  // Initial poll
  void pollInbox(swarmId, swarmRoot, knownMessages)

  // Start coordinator verification tracking
  coordVerification.set(swarmId, {
    startedAt: Date.now(),
    nudged: false,
    escalated: false,
  })

  const cleanup = () => {
    clearInterval(intervalId)
    activeWatchers.delete(swarmId)
    coordVerification.delete(swarmId)
    knownReportsBySwarm.delete(swarmId)
    // Clean up delivery tracking for this swarm
    for (const key of pendingDeliveries.keys()) {
      if (key.startsWith(`${swarmId}:`)) pendingDeliveries.delete(key)
    }
    // Clean up output tracking for this swarm's agents
    const swarm = useSwarmStore.getState().getSwarm(swarmId)
    if (swarm) {
      for (const a of swarm.agents) {
        if (a.terminalId) lastOutputTimes.delete(a.terminalId)
      }
    }
    // Clean up ACK tracking for this swarm
    knownAcks.delete(swarmId)
    // Clean up rate-limiting maps — all keys are now prefixed with `${swarmId}:`
    for (const map of [watchdogAlerted, lastDeadlockAlert, lastAssignmentNudge]) {
      for (const key of map.keys()) {
        if (key.startsWith(`${swarmId}:`)) map.delete(key)
      }
    }
  }

  const watcher: MessageWatcher = {
    cleanup,
    swarmId,
    swarmRoot,
  }

  activeWatchers.set(swarmId, watcher)

  return cleanup
}

export function stopMessageInjector(swarmId: string): void {
  const watcher = activeWatchers.get(swarmId)
  if (watcher) {
    watcher.cleanup()
  }
}

export function stopAllMessageInjectors(): void {
  for (const watcher of activeWatchers.values()) {
    watcher.cleanup()
  }
  activeWatchers.clear()
}

export function getActiveWatcherCount(): number {
  return activeWatchers.size
}
