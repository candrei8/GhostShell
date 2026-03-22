// Swarm Operator — command center helpers for mid-run operator interventions
// All actions use existing filesystem IPC (inbox, nudges, SWARM_BOARD.md, task-graph.json)
// Non-destructive: every action is logged to swarmStore.messages

import { useSwarmStore } from '../stores/swarmStore'
import type { SwarmMessage, SwarmAgentRole } from './swarm-types'
import { getRoleDef } from './swarm-types'

// ─── Helpers ────────────────────────────────────────────────────

/** Sanitize a label for use in filesystem paths — prevents directory traversal */
function sanitizeLabel(label: string): string {
  return label.replace(/[/\\:*?"<>|.\s]/g, '_')
}

/** Generate a unique message ID */
function msgId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

/** Get swarm from store or throw */
function getSwarmOrThrow(swarmId: string) {
  const swarm = useSwarmStore.getState().getSwarm(swarmId)
  if (!swarm) throw new Error(`Swarm ${swarmId} not found`)
  if (!swarm.swarmRoot) throw new Error(`Swarm ${swarmId} has no swarmRoot`)
  return swarm
}

/** Resolve agent label from roster */
export function getAgentLabel(swarmId: string, rosterId: string): string | null {
  const swarm = useSwarmStore.getState().getSwarm(swarmId)
  if (!swarm) return null

  const rosterAgent = swarm.config.roster.find(r => r.id === rosterId)
  if (!rosterAgent) return null

  if (rosterAgent.customName) return rosterAgent.customName

  const globalIndex = swarm.config.roster.indexOf(rosterAgent)
  let roleIndex = 0
  for (let i = 0; i < globalIndex; i++) {
    if (swarm.config.roster[i].role === rosterAgent.role) roleIndex++
  }

  const roleDef = getRoleDef(rosterAgent.role)
  return `${roleDef.label} ${roleIndex + 1}`
}

/** Get all agent labels for a swarm, optionally filtered by role */
export function getAgentLabels(swarmId: string, roleFilter?: SwarmAgentRole): string[] {
  const swarm = useSwarmStore.getState().getSwarm(swarmId)
  if (!swarm) return []

  return swarm.config.roster
    .filter(r => !roleFilter || r.role === roleFilter)
    .map(r => getAgentLabel(swarmId, r.id))
    .filter((label): label is string => !!label)
}

/** Find terminalId for a given agent label */
function findTerminalId(swarmId: string, agentLabel: string): string | null {
  const swarm = useSwarmStore.getState().getSwarm(swarmId)
  if (!swarm) return null

  for (const rosterAgent of swarm.config.roster) {
    const label = getAgentLabel(swarmId, rosterAgent.id)
    if (label === agentLabel) {
      const agentState = swarm.agents.find(a => a.rosterId === rosterAgent.id)
      return agentState?.terminalId || null
    }
  }

  return null
}

/** Write a JSON message file to an agent's inbox directory */
async function writeToInbox(
  swarmRoot: string,
  agentLabel: string,
  message: {
    from: string
    to: string
    body: string
    type: SwarmMessage['type']
    meta?: Record<string, unknown>
  },
): Promise<void> {
  const sanitized = sanitizeLabel(agentLabel)
  const inboxPath = `${swarmRoot}/inbox/${sanitized}`

  // Ensure the agent inbox directory exists
  try {
    await window.ghostshell.fsCreateDir(inboxPath)
  } catch {
    // Directory may already exist
  }

  const id = msgId(`operator-${sanitized}`)
  const payload = {
    id,
    from: message.from,
    to: message.to,
    body: message.body,
    type: message.type,
    meta: message.meta || { source: 'operator', priority: 'high' },
    timestamp: Date.now().toString(),
  }

  await window.ghostshell.fsCreateFile(
    `${inboxPath}/${id}.json`,
    JSON.stringify(payload, null, 2),
  )
}

/** Log an operator action to the swarm message store */
function logToStore(
  swarmId: string,
  to: string,
  body: string,
  type: SwarmMessage['type'] = 'message',
  meta?: Record<string, unknown>,
): void {
  useSwarmStore.getState().addMessage(swarmId, {
    id: msgId('op-log'),
    from: '@operator',
    to,
    body,
    type,
    meta,
    timestamp: Date.now(),
  })
}

// ─── Operator Actions ───────────────────────────────────────────

/**
 * Broadcast a message to all agents or specific targets in the swarm.
 * Writes message files to each target's inbox directory.
 */
export async function operatorBroadcast(
  swarmId: string,
  message: string,
  targets?: string[],
  messageType: SwarmMessage['type'] = 'message',
): Promise<void> {
  const swarm = getSwarmOrThrow(swarmId)
  const swarmRoot = swarm.swarmRoot!

  // Resolve target labels
  const allLabels = getAgentLabels(swarmId)
  const resolvedTargets = targets && targets.length > 0
    ? targets.filter(t => allLabels.includes(t))
    : allLabels

  if (resolvedTargets.length === 0) {
    console.warn('[Operator] No valid targets for broadcast')
    return
  }

  const errors: string[] = []

  for (const label of resolvedTargets) {
    try {
      await writeToInbox(swarmRoot, label, {
        from: '@operator',
        to: label,
        body: message,
        type: messageType,
        meta: { source: 'operator', priority: 'high', broadcast: true },
      })
    } catch (err) {
      errors.push(`Failed to send to ${label}: ${err}`)
    }
  }

  // Log to store
  const targetDesc = targets && targets.length > 0
    ? targets.join(', ')
    : 'all agents'
  logToStore(swarmId, targetDesc, message, messageType, {
    source: 'operator',
    broadcast: true,
    targetCount: resolvedTargets.length,
  })

  if (errors.length > 0) {
    console.error('[Operator] Broadcast errors:', errors)
  }
}

/**
 * Send a message to a specific agent by writing to their inbox.
 */
export async function operatorMessageAgent(
  swarmId: string,
  agentLabel: string,
  message: string,
  type: SwarmMessage['type'] = 'message',
): Promise<void> {
  const swarm = getSwarmOrThrow(swarmId)
  const swarmRoot = swarm.swarmRoot!

  await writeToInbox(swarmRoot, agentLabel, {
    from: '@operator',
    to: agentLabel,
    body: message,
    type,
    meta: { source: 'operator', priority: 'high' },
  })

  logToStore(swarmId, agentLabel, message, type, { source: 'operator' })
}

/**
 * Amend the swarm mission — appends to SWARM_BOARD.md and broadcasts to all agents.
 */
export async function operatorAmendMission(
  swarmId: string,
  amendment: string,
): Promise<void> {
  const swarm = getSwarmOrThrow(swarmId)
  const swarmRoot = swarm.swarmRoot!
  const boardPath = `${swarmRoot}/SWARM_BOARD.md`

  // Read current SWARM_BOARD.md
  let currentContent = ''
  try {
    const result = await window.ghostshell.fsReadFile(boardPath)
    if (result.success && result.content) {
      currentContent = result.content
    }
  } catch {
    // Board may not exist yet
  }

  // Append amendment
  const timestamp = new Date().toISOString().slice(0, 19)
  const amendmentBlock = `\n\n## Mission Amendment (${timestamp})\n\n${amendment}\n`
  const updatedContent = currentContent + amendmentBlock

  await window.ghostshell.fsCreateFile(boardPath, updatedContent)

  // Update the in-memory mission in swarmStore so the UI reflects the amendment
  useSwarmStore.setState(state => ({
    swarms: state.swarms.map(s =>
      s.id === swarmId
        ? { ...s, config: { ...s.config, mission: s.config.mission + `\n\n[Amendment ${timestamp}] ${amendment}` } }
        : s
    )
  }))

  // Broadcast to all agents telling them to re-read the board
  const broadcastMsg = `MISSION AMENDMENT: Re-read SWARM_BOARD.md for updated mission directives. Amendment: ${amendment}`
  await operatorBroadcast(swarmId, broadcastMsg)

  // Log to store
  logToStore(swarmId, 'all agents', `Mission amended: ${amendment}`, 'message', {
    source: 'operator',
    amendment: true,
  })
}

/**
 * Redirect an agent to a new task — creates task in task-graph.json and sends assignment.
 */
export async function operatorRedirectAgent(
  swarmId: string,
  agentLabel: string,
  newTaskTitle: string,
  newTaskDescription: string,
): Promise<void> {
  const swarm = getSwarmOrThrow(swarmId)
  const swarmRoot = swarm.swarmRoot!

  // Read current task graph
  const graphPath = `${swarmRoot}/bin/task-graph.json`
  let graph: { tasks: Record<string, unknown>; dependencies: unknown[] } = { tasks: {}, dependencies: [] }

  try {
    const result = await window.ghostshell.fsReadFile(graphPath)
    if (result.success && result.content) {
      const parsed = JSON.parse(result.content)
      if (parsed && typeof parsed === 'object' && typeof parsed.tasks === 'object') {
        graph = parsed
      }
    }
  } catch {
    // Graph may not exist yet
  }

  // Create new task
  const taskId = `op-task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const newTask = {
    id: taskId,
    title: newTaskTitle,
    description: newTaskDescription,
    owner: agentLabel,
    assignedTo: agentLabel,
    ownedFiles: [],
    dependsOn: [],
    status: 'assigned',
    createdAt: Date.now(),
  }

  graph.tasks[taskId] = newTask
  await window.ghostshell.fsCreateFile(graphPath, JSON.stringify(graph, null, 2))

  // Also update swarmStore tasks
  useSwarmStore.getState().addTask(swarmId, {
    id: taskId,
    title: newTaskTitle,
    description: newTaskDescription,
    owner: agentLabel,
    ownedFiles: [],
    dependsOn: [],
    status: 'assigned',
  })

  // Send assignment message to the agent
  const assignmentBody = `OPERATOR REDIRECT: You are being reassigned. New task: "${newTaskTitle}"\n\nDescription: ${newTaskDescription}\n\nDrop your current work and focus on this task immediately. Task ID: ${taskId}`
  await writeToInbox(swarmRoot, agentLabel, {
    from: '@operator',
    to: agentLabel,
    body: assignmentBody,
    type: 'assignment',
    meta: { source: 'operator', priority: 'high', taskId, redirect: true },
  })

  // Notify coordinator(s) about the override
  const coordinatorLabels = getAgentLabels(swarmId, 'coordinator')
  for (const coordLabel of coordinatorLabels) {
    try {
      await writeToInbox(swarmRoot, coordLabel, {
        from: '@operator',
        to: coordLabel,
        body: `OPERATOR OVERRIDE: ${agentLabel} has been redirected to new task "${newTaskTitle}" (${taskId}). Adjust your planning accordingly.`,
        type: 'message',
        meta: { source: 'operator', priority: 'high', override: true, taskId, redirectedAgent: agentLabel },
      })
    } catch {
      // Non-critical — coordinator notification
    }
  }

  logToStore(swarmId, agentLabel, `Redirected to new task: "${newTaskTitle}"`, 'assignment', {
    source: 'operator',
    taskId,
    redirect: true,
  })
}

/**
 * Inject context into an agent — writes to nudges directory and sends a gs-mail message
 * telling the agent to read the context file.
 */
export async function operatorInjectContext(
  swarmId: string,
  agentLabel: string,
  context: string,
): Promise<void> {
  const swarm = getSwarmOrThrow(swarmId)
  const swarmRoot = swarm.swarmRoot!

  const sanitized = sanitizeLabel(agentLabel)
  const nudgeDirPath = `${swarmRoot}/nudges/${sanitized}`
  const timestamp = Date.now()
  const fileName = `operator-context-${timestamp}.md`
  const filePath = `${nudgeDirPath}/${fileName}`

  // Create nudge directory if needed
  try {
    await window.ghostshell.fsCreateDir(nudgeDirPath)
  } catch {
    // May already exist
  }

  // Write context file
  await window.ghostshell.fsCreateFile(filePath, context)

  // Send a gs-mail message telling the agent to read the context file
  const messageBody = `OPERATOR CONTEXT INJECTION: New context available. Read the file at nudges/${sanitized}/${fileName} — it contains important operator-provided information for your current task.`
  await writeToInbox(swarmRoot, agentLabel, {
    from: '@operator',
    to: agentLabel,
    body: messageBody,
    type: 'message',
    meta: {
      source: 'operator',
      priority: 'high',
      contextFile: `nudges/${sanitized}/${fileName}`,
      contextInjection: true,
    },
  })

  logToStore(swarmId, agentLabel, `Context injected (${context.length} chars) → nudges/${sanitized}/${fileName}`, 'message', {
    source: 'operator',
    contextInjection: true,
    contextFile: filePath,
  })
}

/**
 * Update task priority/status/owner in the task graph.
 */
export async function operatorUpdateTask(
  swarmId: string,
  taskId: string,
  updates: { status?: string; owner?: string; priority?: number },
): Promise<void> {
  const swarm = getSwarmOrThrow(swarmId)
  const swarmRoot = swarm.swarmRoot!

  const graphPath = `${swarmRoot}/bin/task-graph.json`
  let graph: { tasks: Record<string, Record<string, unknown>>; dependencies: unknown[] } = { tasks: {}, dependencies: [] }

  try {
    const result = await window.ghostshell.fsReadFile(graphPath)
    if (result.success && result.content) {
      const parsed = JSON.parse(result.content)
      if (parsed && typeof parsed === 'object' && typeof parsed.tasks === 'object') {
        graph = parsed
      }
    }
  } catch {
    // Graph may not exist yet
  }

  if (!graph.tasks[taskId]) {
    throw new Error(`Task ${taskId} not found in task graph`)
  }

  // Apply updates
  if (updates.status) {
    graph.tasks[taskId].status = updates.status
    if (updates.status === 'done') {
      graph.tasks[taskId].completedAt = Date.now()
    }
  }
  if (updates.owner) {
    graph.tasks[taskId].owner = updates.owner
    graph.tasks[taskId].assignedTo = updates.owner
  }
  if (updates.priority !== undefined) {
    graph.tasks[taskId].priority = updates.priority
  }

  await window.ghostshell.fsCreateFile(graphPath, JSON.stringify(graph, null, 2))

  // Sync with swarmStore
  const storeUpdates: Partial<Pick<import('./swarm-types').SwarmTaskItem, 'status' | 'owner'>> = {}
  if (updates.status) storeUpdates.status = updates.status as import('./swarm-types').SwarmTaskItem['status']
  if (updates.owner) storeUpdates.owner = updates.owner
  useSwarmStore.getState().updateTask(swarmId, taskId, storeUpdates)

  // If owner changed, notify the new owner
  if (updates.owner) {
    const taskTitle = (graph.tasks[taskId].title as string) || taskId
    try {
      await writeToInbox(swarmRoot, updates.owner, {
        from: '@operator',
        to: updates.owner,
        body: `TASK REASSIGNMENT: You have been assigned task "${taskTitle}" (${taskId}) by the operator.`,
        type: 'assignment',
        meta: { source: 'operator', taskId, reassignment: true },
      })
    } catch {
      // Non-critical
    }
  }

  const changeDesc = Object.entries(updates)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${v}`)
    .join(', ')

  logToStore(swarmId, updates.owner || 'system', `Task ${taskId} updated: ${changeDesc}`, 'message', {
    source: 'operator',
    taskUpdate: true,
    taskId,
  })
}
