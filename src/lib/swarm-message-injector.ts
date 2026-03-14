// Swarm Message Injector — filesystem watcher that pushes bs-mail messages into agent terminals
// Monitors .bridgespace/swarms/{paneId}/inbox for new messages and injects check commands
// Also: heartbeat tracking, watchdog, operator inbox polling

import { useSwarmStore } from '../stores/swarmStore'

// ─── Types ───────────────────────────────────────────────────

interface MessageWatcher {
  cleanup: () => void
  swarmId: string
  swarmRoot: string
}

// ─── Active Watchers ─────────────────────────────────────────

const activeWatchers = new Map<string, MessageWatcher>()

// ─── Agent Output Tracking (renderer-side) ───────────────────

/** Updated from usePty when terminal data arrives */
const lastOutputTimes = new Map<string, number>()

export function reportAgentOutput(terminalId: string): void {
  lastOutputTimes.set(terminalId, Date.now())
}

// ─── Helper Functions ────────────────────────────────────────

function getAgentLabel(swarmId: string, rosterId: string): string | null {
  const swarm = useSwarmStore.getState().getSwarm(swarmId)
  if (!swarm) return null

  const rosterAgent = swarm.config.roster.find(r => r.id === rosterId)
  if (!rosterAgent) return null

  const rosterIndex = swarm.config.roster.indexOf(rosterAgent)

  if (rosterAgent.customName) return rosterAgent.customName

  const roleLabels: Record<string, string> = {
    coordinator: 'Coordinator',
    builder: 'Builder',
    scout: 'Scout',
    reviewer: 'Reviewer',
    custom: 'Agent',
  }

  const roleLabel = roleLabels[rosterAgent.role] || 'Agent'
  return `${roleLabel} ${rosterIndex + 1}`
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
      `node ${swarmRoot}/bin/bs-mail.cjs check --inject\r`
    )
  } catch (err) {
    console.error('[MessageInjector] Failed to inject command:', err)
  }
}

// ─── Inbox Polling ──────────────────────────────────────────

async function pollInbox(
  swarmId: string,
  swarmRoot: string,
  knownMessages: Set<string>
): Promise<void> {
  try {
    const inboxPath = `${swarmRoot}/inbox`
    const agents = await window.ghostshell.fsReadDir(inboxPath)

    const agentsToNotify = new Set<string>()

    for (const agent of agents) {
      if (!agent.isDirectory) continue

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

    for (const agentName of agentsToNotify) {
      const terminalId = findTerminalId(swarmId, agentName)
      if (!terminalId) {
        console.warn(`[MessageInjector] No terminal found for agent "${agentName}"`)
        continue
      }
      injectMessageCheck(swarmRoot, terminalId)
    }
  } catch {
    // Inbox might not exist yet or permission error
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

// ─── Heartbeat & Watchdog ────────────────────────────────────

const STALE_THRESHOLD_MS = 120_000   // 2 minutes
const STUCK_THRESHOLD_MS = 180_000   // 3 minutes
const DEAD_THRESHOLD_MS = 600_000    // 10 minutes

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

    // Determine health status
    let healthStatus: 'healthy' | 'stale' | 'dead' = 'healthy'
    if (elapsed > DEAD_THRESHOLD_MS) {
      healthStatus = 'dead'
    } else if (elapsed > STALE_THRESHOLD_MS) {
      healthStatus = 'stale'
    }

    // Update store
    useSwarmStore.getState().updateAgentHealth(swarmId, label, {
      lastSeen: lastOutput,
      status: healthStatus,
    })

    // Write heartbeat file (for coordinator to read)
    try {
      await window.ghostshell.fsCreateFile(
        `${swarmRoot}/heartbeats/${label.replace(/\s+/g, '_')}.json`,
        JSON.stringify({ agent: label, lastSeen: lastOutput, lastOutput: lastOutput, status: healthStatus }, null, 2),
      )
    } catch { /* non-critical */ }

    // Watchdog: check for stuck agents
    if (elapsed > STUCK_THRESHOLD_MS && agentState.currentTask) {
      const alertKey = `${label}-${agentState.currentTask}`
      const lastAlert = watchdogAlerted.get(alertKey) || 0

      // Only alert once per 5 minutes per agent-task combo
      if (now - lastAlert > 300_000) {
        watchdogAlerted.set(alertKey, now)
        await sendWatchdogAlert(swarmId, swarmRoot, label, agentState.currentTask, elapsed)
      }
    }

    // Dead agent: mark task back to open if applicable
    if (healthStatus === 'dead' && agentState.currentTask) {
      const alertKey = `dead-${label}`
      const lastAlert = watchdogAlerted.get(alertKey) || 0

      if (now - lastAlert > 600_000) {
        watchdogAlerted.set(alertKey, now)
        await sendDeadAgentAlert(swarmId, swarmRoot, label, agentState.currentTask)
      }
    }
  }
}

async function sendWatchdogAlert(
  swarmId: string,
  swarmRoot: string,
  agentName: string,
  taskId: string,
  elapsedMs: number,
): Promise<void> {
  // Find the coordinator
  const swarm = useSwarmStore.getState().getSwarm(swarmId)
  if (!swarm) return

  const coordRoster = swarm.config.roster.find(r => r.role === 'coordinator')
  if (!coordRoster) return

  const coordLabel = getAgentLabel(swarmId, coordRoster.id)
  if (!coordLabel) return

  const minutes = Math.round(elapsedMs / 60_000)
  const body = `[WATCHDOG] ${agentName} appears stuck on task ${taskId} (no output for ${minutes}m). Consider reassigning.`

  // Write directly to coordinator's inbox
  const msgId = Date.now().toString() + '-watchdog'
  const inboxPath = `${swarmRoot}/inbox/${coordLabel}`

  try {
    await window.ghostshell.fsCreateDir(inboxPath)
    await window.ghostshell.fsCreateFile(
      `${inboxPath}/${msgId}.json`,
      JSON.stringify({
        id: msgId,
        from: '@watchdog',
        to: coordLabel,
        body,
        type: 'escalation',
        meta: { agentName, taskId, elapsedMs },
        timestamp: Math.floor(Date.now() / 1000).toString(),
      }),
    )
  } catch {
    console.error('[Watchdog] Failed to send alert')
  }
}

async function sendDeadAgentAlert(
  swarmId: string,
  swarmRoot: string,
  agentName: string,
  taskId: string,
): Promise<void> {
  const swarm = useSwarmStore.getState().getSwarm(swarmId)
  if (!swarm) return

  const coordRoster = swarm.config.roster.find(r => r.role === 'coordinator')
  if (!coordRoster) return

  const coordLabel = getAgentLabel(swarmId, coordRoster.id)
  if (!coordLabel) return

  const body = `[WATCHDOG] ${agentName} appears DEAD (no output for 10+ min). Task ${taskId} may need reassignment.`

  const msgId = Date.now().toString() + '-dead'
  const inboxPath = `${swarmRoot}/inbox/${coordLabel}`

  try {
    await window.ghostshell.fsCreateDir(inboxPath)
    await window.ghostshell.fsCreateFile(
      `${inboxPath}/${msgId}.json`,
      JSON.stringify({
        id: msgId,
        from: '@watchdog',
        to: coordLabel,
        body,
        type: 'escalation',
        meta: { agentName, taskId, dead: true },
        timestamp: Math.floor(Date.now() / 1000).toString(),
      }),
    )
  } catch {
    console.error('[Watchdog] Failed to send dead alert')
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
  let watchdogCounter = 0

  // Poll every 1.5 seconds with overlap guard
  const intervalId = setInterval(async () => {
    if (isPolling) return
    isPolling = true
    try {
      await pollInbox(swarmId, swarmRoot, knownMessages)

      // Run heartbeat + watchdog every ~30 seconds (every 20th poll cycle)
      watchdogCounter++
      if (watchdogCounter >= 20) {
        watchdogCounter = 0
        await runHeartbeatAndWatchdog(swarmId, swarmRoot)
      }
    } finally {
      isPolling = false
    }
  }, 1500)

  // Initial poll
  void pollInbox(swarmId, swarmRoot, knownMessages)

  const cleanup = () => {
    clearInterval(intervalId)
    activeWatchers.delete(swarmId)
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
