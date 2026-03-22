// Swarm Self-Heal — automatic detection and recovery of crashed, frozen,
// context-limited, or error-looping swarm agents.
//
// Detection (runs every 5 seconds):
//   1. Crash: PTY process dead + agent status not 'done'
//   2. Freeze: No output for >120s while agent is 'building'/'planning'
//   3. Context limit: Terminal output matches token/context exhaustion patterns
//   4. Error loop: Same error message repeated 3+ times in 60 seconds
//
// Recovery:
//   1. Capture current task + owned files from swarmStore
//   2. Build compressed context summary
//   3. Kill old PTY + agent
//   4. Create new terminal + agent reusing same swarmStore slot
//   5. Write recovery-context.md to nudges/{agent-label}/
//   6. Launch new agent with instructions to continue
//   7. Max 3 attempts per agent; after that, mark 'error' + notify operator

import { useSwarmStore } from '../stores/swarmStore'
import { useAgentStore } from '../stores/agentStore'
import { useTerminalStore } from '../stores/terminalStore'
import { useNotificationStore } from '../stores/notificationStore'
import type { SwarmAgentState, SwarmRosterAgent } from './swarm-types'
import { SWARM_ROLES, SWARM_CLI_PROVIDERS } from './swarm-types'
import type { Provider, ClaudeConfig, GeminiConfig, CodexConfig } from './types'
import { buildPromptContext, buildSwarmPrompt } from './swarm-prompts'
import { swarmPromptsPath } from './ghostshell'

// ─── Types ───────────────────────────────────────────────────

export type AgentHealthIssue = 'crash' | 'freeze' | 'context_limit' | 'error_loop'

export interface AgentRecoveryEvent {
  agentLabel: string
  rosterId: string
  issue: AgentHealthIssue
  detectedAt: number
  recoveredAt?: number
  attempt: number
  maxAttempts: number
  contextSummary?: string
}

// ─── Constants ───────────────────────────────────────────────

const POLL_INTERVAL_MS = 5_000
const FREEZE_THRESHOLD_MS = 120_000
const ERROR_LOOP_WINDOW_MS = 60_000
const ERROR_LOOP_THRESHOLD = 3
const MAX_RECOVERY_ATTEMPTS = 3

// ─── Module-Level State ─────────────────────────────────────

/** Per-agent recovery attempt counter: key = `${swarmId}:${rosterId}` */
const recoveryAttempts = new Map<string, number>()

/** Per-agent debounce: avoid multiple recoveries triggering in the same cycle */
const recoveryInProgress = new Set<string>()

/** Track error occurrences: key = `${swarmId}:${rosterId}`, value = { msg, timestamps[] } */
const errorTracker = new Map<string, { message: string; timestamps: number[] }[]>()

/** Track last output times per terminal (mirrored from swarm-message-injector) */
const lastOutputTimes = new Map<string, number>()

/** Patterns that indicate context window exhaustion */
const CONTEXT_LIMIT_PATTERNS = [
  /context window/i,
  /token limit/i,
  /conversation too long/i,
  /maximum context/i,
  /context length exceeded/i,
  /exceeds.*token/i,
  /max.*tokens.*reached/i,
  /context.*exhausted/i,
  /too many tokens/i,
  /context.*capacity/i,
]

/** Patterns that indicate error output (used for error-loop detection) */
const ERROR_OUTPUT_PATTERNS = [
  /(?:^|\n)error[\s:]/im,
  /(?:^|\n)Error[\s:]/m,
  /(?:^|\n)fatal[\s:]/im,
  /(?:^|\n)FATAL[\s:]/m,
  /panic:/i,
  /Traceback.*most recent call/i,
  /Unhandled.*exception/i,
  /ENOENT/,
  /EACCES/,
  /EPERM/,
]

// ─── Output Buffer (for context-limit and error-loop detection) ──

/**
 * Circular buffer of recent terminal output per agent.
 * Updated externally via `feedAgentOutput()`.
 */
const outputBuffers = new Map<string, { lines: string[]; maxLines: number }>()
const OUTPUT_BUFFER_MAX_LINES = 50

/**
 * Called from usePty to feed terminal output for self-heal analysis.
 * Also updates lastOutputTimes.
 */
export function feedAgentOutput(terminalId: string, data: string): void {
  if (!terminalId || !data) return

  lastOutputTimes.set(terminalId, Date.now())

  // Strip ANSI codes for pattern matching
  const clean = data.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').replace(/\r/g, '')
  const lines = clean.split('\n').filter(l => l.trim().length > 0)
  if (lines.length === 0) return

  let buffer = outputBuffers.get(terminalId)
  if (!buffer) {
    buffer = { lines: [], maxLines: OUTPUT_BUFFER_MAX_LINES }
    outputBuffers.set(terminalId, buffer)
  }

  buffer.lines.push(...lines)
  if (buffer.lines.length > buffer.maxLines) {
    buffer.lines = buffer.lines.slice(-buffer.maxLines)
  }
}

// ─── Helpers ─────────────────────────────────────────────────

function getAgentLabel(roster: SwarmRosterAgent[], globalIndex: number): string {
  const agent = roster[globalIndex]
  if (agent.customName) return agent.customName
  const roleDef = SWARM_ROLES.find(r => r.id === agent.role)
  let roleIndex = 0
  for (let i = 0; i < globalIndex; i++) {
    if (roster[i].role === agent.role) roleIndex++
  }
  return `${roleDef?.label ?? 'Agent'} ${roleIndex + 1}`
}

function getRoleIndex(roster: SwarmRosterAgent[], globalIndex: number): number {
  const role = roster[globalIndex].role
  let idx = 0
  for (let i = 0; i < globalIndex; i++) {
    if (roster[i].role === role) idx++
  }
  return idx
}

function slugify(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 64)
}

function isWindows(): boolean {
  return navigator.userAgent.includes('Windows') || navigator.platform === 'Win32'
}

function mapProvider(cliProvider: string): Provider {
  const def = SWARM_CLI_PROVIDERS.find(p => p.id === cliProvider)
  return (def?.coreProvider as Provider) || 'claude'
}

function roleColor(role: string): string {
  const def = SWARM_ROLES.find(r => r.id === role)
  return def?.color ?? '#6b7280'
}

function buildFileBasedLaunchCommand(
  provider: Provider,
  promptFilePath: string,
  autoApprove: boolean,
  label: string,
): string {
  const p = isWindows() ? promptFilePath.replace(/\//g, '\\') : promptFilePath
  const envPrefix = isWindows()
    ? `$env:SWARM_AGENT_NAME='${label}';`
    : `export SWARM_AGENT_NAME='${label}' &&`

  if (provider === 'claude') {
    if (isWindows()) {
      const cmd = `${envPrefix} $p = Get-Content -Raw '${p}'; claude --system-prompt $p`
      return autoApprove ? `${cmd} --dangerously-skip-permissions` : cmd
    }
    const cmd = `${envPrefix} claude --system-prompt "$(cat '${p}')"`
    return autoApprove ? `${cmd} --dangerously-skip-permissions` : cmd
  }

  if (provider === 'gemini') {
    // Gemini reads GEMINI.md from working directory — no CLI flag for system prompt
    const cmd = `${envPrefix} gemini`
    return autoApprove ? `${cmd} --yolo` : cmd
  }

  if (provider === 'codex') {
    // Codex reads AGENTS.md from working directory — no CLI flag for system prompt
    const cmd = `${envPrefix} codex`
    return autoApprove ? `${cmd} --full-auto` : cmd
  }

  // Fallback: Claude
  if (isWindows()) {
    return `${envPrefix} $p = Get-Content -Raw '${p}'; claude --system-prompt $p`
  }
  return `${envPrefix} claude --system-prompt "$(cat '${p}')"`
}

// ─── Detection Logic ─────────────────────────────────────────

interface DetectionResult {
  issue: AgentHealthIssue | null
  detail?: string
}

async function detectIssue(
  swarmId: string,
  agentState: SwarmAgentState,
  rosterAgent: SwarmRosterAgent,
): Promise<DetectionResult> {
  const { terminalId, status } = agentState
  if (!terminalId) return { issue: null }

  // Skip agents that are already done or in error state
  if (status === 'done' || status === 'error') return { issue: null }

  // 1. Crash detection: PTY process dead
  const processAlive = await window.ghostshell.ptyIsAlive(terminalId).catch(() => false)
  if (!processAlive) {
    return { issue: 'crash', detail: 'PTY process is dead' }
  }

  // 2. Freeze detection: no output for FREEZE_THRESHOLD_MS while actively working
  const lastOutput = lastOutputTimes.get(terminalId) || Date.now()
  const outputAge = Date.now() - lastOutput
  if (outputAge > FREEZE_THRESHOLD_MS && (status === 'building' || status === 'planning')) {
    return {
      issue: 'freeze',
      detail: `No output for ${Math.round(outputAge / 1000)}s while ${status}`,
    }
  }

  // 3. Context limit detection: check recent output for token exhaustion patterns
  const buffer = outputBuffers.get(terminalId)
  if (buffer && buffer.lines.length > 0) {
    const recentOutput = buffer.lines.slice(-10).join('\n')
    for (const pattern of CONTEXT_LIMIT_PATTERNS) {
      if (pattern.test(recentOutput)) {
        return {
          issue: 'context_limit',
          detail: `Matched pattern: ${pattern.source}`,
        }
      }
    }

    // 4. Error loop detection: same error repeated 3+ times in 60 seconds
    const key = `${swarmId}:${agentState.rosterId}`
    const now = Date.now()

    for (const line of buffer.lines.slice(-20)) {
      for (const pattern of ERROR_OUTPUT_PATTERNS) {
        if (!pattern.test(line)) continue

        // Normalize the error line (first 80 chars) for deduplication
        const normalized = line.trim().slice(0, 80)
        if (!normalized) continue

        let entries = errorTracker.get(key)
        if (!entries) {
          entries = []
          errorTracker.set(key, entries)
        }

        // Find existing entry with similar message
        let entry = entries.find(e => e.message === normalized)
        if (!entry) {
          entry = { message: normalized, timestamps: [] }
          entries.push(entry)
          // Cap entries per agent
          if (entries.length > 10) entries.shift()
        }

        entry.timestamps.push(now)
        // Prune old timestamps
        entry.timestamps = entry.timestamps.filter(t => now - t < ERROR_LOOP_WINDOW_MS)

        if (entry.timestamps.length >= ERROR_LOOP_THRESHOLD) {
          return {
            issue: 'error_loop',
            detail: `Error repeated ${entry.timestamps.length}x in ${ERROR_LOOP_WINDOW_MS / 1000}s: ${normalized}`,
          }
        }
      }
    }
  }

  return { issue: null }
}

// ─── Recovery Logic ──────────────────────────────────────────

/**
 * Attempt to recover a crashed/frozen agent.
 * Returns true if recovery was initiated, false if max attempts reached.
 */
export async function recoverAgent(
  swarmId: string,
  rosterId: string,
  issue: AgentHealthIssue,
): Promise<boolean> {
  const recoveryKey = `${swarmId}:${rosterId}`

  // Check if recovery is already in progress
  if (recoveryInProgress.has(recoveryKey)) return false

  // Check attempt count
  const attempts = recoveryAttempts.get(recoveryKey) || 0
  if (attempts >= MAX_RECOVERY_ATTEMPTS) {
    console.warn(`[SelfHeal] Max recovery attempts (${MAX_RECOVERY_ATTEMPTS}) reached for ${recoveryKey}`)
    return false
  }

  recoveryInProgress.add(recoveryKey)

  try {
    const swarm = useSwarmStore.getState().getSwarm(swarmId)
    if (!swarm || !swarm.swarmRoot) return false

    const agentState = swarm.agents.find(a => a.rosterId === rosterId)
    if (!agentState) return false

    const rosterAgent = swarm.config.roster.find(r => r.id === rosterId)
    if (!rosterAgent) return false

    const globalIndex = swarm.config.roster.indexOf(rosterAgent)
    const label = getAgentLabel(swarm.config.roster, globalIndex)
    const swarmRoot = swarm.swarmRoot
    const attempt = attempts + 1

    console.log(`[SelfHeal] Recovering ${label} (${issue}), attempt ${attempt}/${MAX_RECOVERY_ATTEMPTS}`)

    // 1. Capture context from the current agent state
    const currentTask = agentState.currentTask
    const filesOwned = [...(agentState.filesOwned || [])]
    const taskInfo = currentTask
      ? swarm.tasks.find(t => t.id === currentTask)
      : null

    // 2. Read last N lines of terminal output for context
    const buffer = outputBuffers.get(agentState.terminalId || '')
    const lastLines = buffer ? buffer.lines.slice(-20) : []

    // 3. Build compressed context summary
    const contextSummary = buildContextSummary(label, issue, currentTask, taskInfo?.title, filesOwned, lastLines)

    // 4. Write recovery context to nudges/{agent-label}/recovery-context.md
    const labelSlug = slugify(label)
    const nudgePath = `${swarmRoot}/nudges/${labelSlug}`
    await window.ghostshell.fsCreateDir(nudgePath).catch(() => {})
    await window.ghostshell.fsCreateFile(
      `${nudgePath}/recovery-context.md`,
      contextSummary,
    ).catch(() => {})

    // 5. Kill old PTY session
    if (agentState.terminalId) {
      try { window.ghostshell.ptyKill(agentState.terminalId) } catch {}
    }

    // 6. Remove old terminal session
    if (agentState.terminalId) {
      const oldTerminalId = agentState.terminalId
      // Also clean up output tracking
      lastOutputTimes.delete(oldTerminalId)
      outputBuffers.delete(oldTerminalId)
      errorTracker.delete(recoveryKey)

      // Remove old agent from agent store
      if (agentState.agentId) {
        try { useAgentStore.getState().removeAgent(agentState.agentId) } catch {}
      }
      // Remove old session
      try { useTerminalStore.getState().removeSession(oldTerminalId) } catch {}
    }

    // 7. Create new agent + terminal session (reuse the same swarm store slot)
    const provider = mapProvider(rosterAgent.cliProvider)
    const color = roleColor(rosterAgent.role)

    // Build prompt with recovery context appended
    const { analyzeCodebase, generateCodebaseContext } = await import('./codebase-analyzer').catch(() => ({
      analyzeCodebase: null,
      generateCodebaseContext: null,
    }))

    let codebaseContext: string | undefined
    try {
      if (analyzeCodebase && generateCodebaseContext) {
        const map = await analyzeCodebase(swarm.config.directory)
        codebaseContext = generateCodebaseContext(map)
      }
    } catch {}

    const hasKnowledge = swarm.config.contextFiles.length > 0
    const ctx = buildPromptContext(
      swarm.config,
      rosterAgent,
      swarmRoot,
      globalIndex,
      swarm.config.roster,
      hasKnowledge,
      codebaseContext,
    )
    const basePrompt = buildSwarmPrompt(rosterAgent.role, ctx)

    // Append recovery directive
    const recoveryDirective = `

# RECOVERY MODE

You are being restarted after a ${issue.replace('_', ' ')}. This is recovery attempt ${attempt}/${MAX_RECOVERY_ATTEMPTS}.

**Read your recovery context immediately:**
\`cat "${nudgePath}/recovery-context.md"\`

${currentTask ? `**Your assigned task:** ${currentTask} — "${taskInfo?.title || 'unknown'}"` : '**No task was assigned yet.**'}
${filesOwned.length > 0 ? `**Files you owned:** ${filesOwned.join(', ')}` : ''}

**CRITICAL INSTRUCTIONS:**
1. Read your recovery context file FIRST
2. Check your task status: \`node "${swarmRoot}/bin/gs-task.cjs" status ${currentTask || ''}\`
3. Check your inbox: \`node "${swarmRoot}/bin/gs-mail.cjs" check\`
4. Continue from where you left off — do NOT restart from scratch
5. If your previous work was partially done, verify what's on disk before continuing
`

    const fullPrompt = basePrompt + recoveryDirective

    // Write prompt to file
    const promptSlug = slugify(label)
    const promptFilePath = `${swarmPromptsPath(swarmRoot)}/${promptSlug}.md`
    await window.ghostshell.fsCreateFile(promptFilePath, fullPrompt)

    // Build provider-specific configs
    let claudeConfig: ClaudeConfig | undefined
    let geminiConfig: GeminiConfig | undefined
    let codexConfig: CodexConfig | undefined

    if (provider === 'claude') {
      claudeConfig = {
        systemPrompt: fullPrompt,
        dangerouslySkipPermissions: rosterAgent.autoApprove,
      }
    } else if (provider === 'gemini') {
      geminiConfig = { yolo: rosterAgent.autoApprove }
    } else if (provider === 'codex') {
      codexConfig = { fullAuto: rosterAgent.autoApprove }
    }

    // Create new agent in agentStore
    const newAgent = useAgentStore.getState().addAgent(
      label,
      undefined,
      color,
      claudeConfig,
      swarm.config.directory,
      undefined,
      provider,
      geminiConfig,
      codexConfig,
    )

    // Create new terminal session
    const newSessionId = `term-${newAgent.id}`
    useTerminalStore.getState().addSession({
      id: newSessionId,
      agentId: newAgent.id,
      title: label,
      cwd: swarm.config.directory,
    })

    useAgentStore.getState().updateAgent(newAgent.id, { terminalId: newSessionId })

    // Build launch command
    const launchCommand = buildFileBasedLaunchCommand(
      provider,
      promptFilePath,
      rosterAgent.autoApprove,
      label,
    )

    // Set launch command and session type
    useTerminalStore.getState().updateSession(newSessionId, {
      sessionType: 'ghostswarm',
      launchCommand,
    })

    // 8. Relink the agent in swarmStore (reuse the same roster slot)
    useSwarmStore.getState().linkAgentToStore(swarmId, rosterId, newAgent.id, newSessionId)

    // Preserve task assignment
    if (currentTask) {
      useSwarmStore.getState().updateAgentState(swarmId, rosterId, {
        currentTask,
        filesOwned,
        status: 'waiting',
      })
    } else {
      useSwarmStore.getState().setAgentStatus(swarmId, rosterId, 'waiting')
    }

    // 9. Add the new session to the swarm's tab group
    const groupId = `swarm-${swarmId}`
    try {
      useTerminalStore.getState().addSessionToGroup(groupId, newSessionId)
    } catch {}

    // 10. Update recovery tracking
    recoveryAttempts.set(recoveryKey, attempt)

    // Record recovery event in store
    useSwarmStore.getState().addRecoveryEvent({
      agentLabel: label,
      rosterId,
      issue,
      detectedAt: Date.now(),
      recoveredAt: Date.now(),
      attempt,
      maxAttempts: MAX_RECOVERY_ATTEMPTS,
      contextSummary,
    })

    // Notify operator
    useNotificationStore.getState().addNotification({
      type: 'info',
      title: `Agent recovered: ${label}`,
      message: `${issue.replace('_', ' ')} detected. Recovery attempt ${attempt}/${MAX_RECOVERY_ATTEMPTS}.`,
      source: 'Self-Heal',
      duration: 5000,
      tier: 'toast',
      dedupeKey: `self-heal:${recoveryKey}`,
      dedupeWindowMs: 10000,
    })

    console.log(`[SelfHeal] Recovery initiated for ${label} (new session: ${newSessionId})`)
    return true
  } catch (err) {
    console.error(`[SelfHeal] Recovery failed for ${recoveryKey}:`, err)
    return false
  } finally {
    recoveryInProgress.delete(recoveryKey)
  }
}

function buildContextSummary(
  label: string,
  issue: AgentHealthIssue,
  taskId?: string,
  taskTitle?: string,
  filesOwned?: string[],
  lastLines?: string[],
): string {
  const issueLabel = issue.replace('_', ' ')
  const now = new Date().toISOString()

  let summary = `# Recovery Context for ${label}

**Recovered at:** ${now}
**Issue:** ${issueLabel}
`

  if (taskId) {
    summary += `\n## Assigned Task\n\n- **Task ID:** ${taskId}\n`
    if (taskTitle) {
      summary += `- **Title:** ${taskTitle}\n`
    }
  }

  if (filesOwned && filesOwned.length > 0) {
    summary += `\n## Files Owned\n\n${filesOwned.map(f => `- \`${f}\``).join('\n')}\n`
  }

  if (lastLines && lastLines.length > 0) {
    summary += `\n## Last Activity (before ${issueLabel})\n\n\`\`\`\n${lastLines.join('\n')}\n\`\`\`\n`
  }

  summary += `\n## Recovery Instructions\n
1. Check which files were modified on disk — your previous work may be partially saved
2. Re-read your task assignment from the task graph
3. Check your inbox for any messages you missed
4. Continue the task from where you left off
5. Do NOT start over unless the previous work is clearly broken
`

  return summary
}

// ─── Monitor Loop ────────────────────────────────────────────

/**
 * Start monitoring a swarm's agents for health issues.
 * Returns cleanup function.
 */
export function startSelfHealMonitor(
  swarmId: string,
  swarmRoot: string,
): () => void {
  let stopped = false

  console.log(`[SelfHeal] Starting monitor for swarm ${swarmId}`)

  const intervalId = setInterval(async () => {
    if (stopped) return

    const swarm = useSwarmStore.getState().getSwarm(swarmId)
    if (!swarm || swarm.status !== 'running') return

    for (const agentState of swarm.agents) {
      if (stopped) return
      if (!agentState.terminalId || !agentState.agentId) continue

      const rosterAgent = swarm.config.roster.find(r => r.id === agentState.rosterId)
      if (!rosterAgent) continue

      const recoveryKey = `${swarmId}:${agentState.rosterId}`

      // Skip if recovery already in progress
      if (recoveryInProgress.has(recoveryKey)) continue

      // Skip if max attempts reached — mark as error instead
      const attempts = recoveryAttempts.get(recoveryKey) || 0
      if (attempts >= MAX_RECOVERY_ATTEMPTS) {
        // Only mark once
        if (agentState.status !== 'error') {
          const globalIndex = swarm.config.roster.indexOf(rosterAgent)
          const label = getAgentLabel(swarm.config.roster, globalIndex)

          useSwarmStore.getState().setAgentStatus(swarmId, agentState.rosterId, 'error')

          useNotificationStore.getState().addNotification({
            type: 'error',
            title: `Agent failed: ${label}`,
            message: `Max recovery attempts (${MAX_RECOVERY_ATTEMPTS}) exhausted. Manual intervention required.`,
            source: 'Self-Heal',
            duration: 8000,
            tier: 'full',
            dedupeKey: `self-heal-fail:${recoveryKey}`,
            dedupeWindowMs: 60000,
          })

          // Record final failure event
          useSwarmStore.getState().addRecoveryEvent({
            agentLabel: label,
            rosterId: agentState.rosterId,
            issue: 'crash',
            detectedAt: Date.now(),
            attempt: MAX_RECOVERY_ATTEMPTS,
            maxAttempts: MAX_RECOVERY_ATTEMPTS,
          })
        }
        continue
      }

      // Detect issues
      try {
        const result = await detectIssue(swarmId, agentState, rosterAgent)
        if (result.issue) {
          const globalIndex = swarm.config.roster.indexOf(rosterAgent)
          const label = getAgentLabel(swarm.config.roster, globalIndex)

          console.warn(`[SelfHeal] Detected ${result.issue} for ${label}: ${result.detail}`)

          // Attempt recovery
          const recovered = await recoverAgent(swarmId, agentState.rosterId, result.issue)
          if (!recovered) {
            console.error(`[SelfHeal] Recovery failed for ${label}`)
          }
        }
      } catch (err) {
        console.error(`[SelfHeal] Detection error for agent ${agentState.rosterId}:`, err)
      }
    }
  }, POLL_INTERVAL_MS)

  const cleanup = () => {
    stopped = true
    clearInterval(intervalId)

    // Clean up module state for this swarm
    for (const key of recoveryAttempts.keys()) {
      if (key.startsWith(`${swarmId}:`)) recoveryAttempts.delete(key)
    }
    for (const key of recoveryInProgress) {
      if (key.startsWith(`${swarmId}:`)) recoveryInProgress.delete(key)
    }
    for (const key of errorTracker.keys()) {
      if (key.startsWith(`${swarmId}:`)) errorTracker.delete(key)
    }

    // Clean up output buffers for this swarm's agents
    const swarm = useSwarmStore.getState().getSwarm(swarmId)
    if (swarm) {
      for (const a of swarm.agents) {
        if (a.terminalId) {
          outputBuffers.delete(a.terminalId)
          lastOutputTimes.delete(a.terminalId)
        }
      }
    }

    console.log(`[SelfHeal] Stopped monitor for swarm ${swarmId}`)
  }

  return cleanup
}
