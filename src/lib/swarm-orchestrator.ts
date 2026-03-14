// Swarm Orchestrator — spawns agents into terminals when a swarm launches.
//
// Flow: setupSwarmDirectory → writeAgentsJson → generateSwarmBoard →
//       stageKnowledge → spawnSwarmAgents

import { useTerminalStore } from '../stores/terminalStore'
import { useSwarmStore } from '../stores/swarmStore'
import { setSwarmRuntime } from '../stores/swarmStore'
import { useActivityStore } from '../stores/activityStore'
import {
  Swarm,
  SwarmRosterAgent,
  SwarmContextFile,
  SWARM_ROLES,
  SWARM_CLI_PROVIDERS,
  getRoleDef,
} from './swarm-types'
import type { ClaudeConfig, GeminiConfig, CodexConfig, Provider } from './types'
import { buildPromptContext, buildSwarmPrompt } from './swarm-prompts'
import { BS_MAIL_CJS, BS_MAIL_SH, BS_MAIL_CMD } from './bs-mail-template'
import { BS_TASK_CJS, BS_TASK_SH, BS_TASK_CMD } from './bs-task-template'
import { BS_LOCK_CJS, BS_LOCK_SH, BS_LOCK_CMD } from './bs-lock-template'
import { startMessageInjector } from './swarm-message-injector'

// ─── Helpers ─────────────────────────────────────────────────

function agentLabel(agent: SwarmRosterAgent, index: number): string {
  if (agent.customName) return agent.customName
  const roleDef = SWARM_ROLES.find((r) => r.id === agent.role)
  return `${roleDef?.label ?? 'Agent'} ${index + 1}`
}

function mapProvider(cliProvider: string): Provider {
  const def = SWARM_CLI_PROVIDERS.find((p) => p.id === cliProvider)
  return (def?.coreProvider as Provider) || 'claude'
}

function roleColor(role: string): string {
  const def = SWARM_ROLES.find((r) => r.id === role)
  return def?.color ?? '#6b7280'
}

// ─── Directory Setup ─────────────────────────────────────────

async function setupSwarmDirectory(swarmRoot: string): Promise<void> {
  const dirs = [
    swarmRoot,
    `${swarmRoot}/bin`,
    `${swarmRoot}/inbox`,
    `${swarmRoot}/nudges`,
    `${swarmRoot}/knowledge`,
    `${swarmRoot}/heartbeats`,
    `${swarmRoot}/reports`,
  ]

  for (const dir of dirs) {
    await window.ghostshell.fsCreateDir(dir)
  }

  // Write bs-mail scripts
  await window.ghostshell.fsCreateFile(`${swarmRoot}/bin/bs-mail.cjs`, BS_MAIL_CJS)
  await window.ghostshell.fsCreateFile(`${swarmRoot}/bin/bs-mail`, BS_MAIL_SH)
  await window.ghostshell.fsCreateFile(`${swarmRoot}/bin/bs-mail.cmd`, BS_MAIL_CMD)

  // Write bs-task scripts
  await window.ghostshell.fsCreateFile(`${swarmRoot}/bin/bs-task.cjs`, BS_TASK_CJS)
  await window.ghostshell.fsCreateFile(`${swarmRoot}/bin/bs-task`, BS_TASK_SH)
  await window.ghostshell.fsCreateFile(`${swarmRoot}/bin/bs-task.cmd`, BS_TASK_CMD)

  // Write bs-lock scripts
  await window.ghostshell.fsCreateFile(`${swarmRoot}/bin/bs-lock.cjs`, BS_LOCK_CJS)
  await window.ghostshell.fsCreateFile(`${swarmRoot}/bin/bs-lock`, BS_LOCK_SH)
  await window.ghostshell.fsCreateFile(`${swarmRoot}/bin/bs-lock.cmd`, BS_LOCK_CMD)
}

// ─── agents.json ─────────────────────────────────────────────

async function writeAgentsJson(
  swarmRoot: string,
  roster: SwarmRosterAgent[],
): Promise<void> {
  const agents = roster.map((agent, i) => ({
    label: agentLabel(agent, i),
    role: agent.role,
  }))
  await window.ghostshell.fsCreateFile(
    `${swarmRoot}/agents.json`,
    JSON.stringify(agents, null, 2) + '\n',
  )
}

// ─── SWARM_BOARD.md ──────────────────────────────────────────

async function generateSwarmBoard(swarmRoot: string, swarm: Swarm): Promise<void> {
  const { config } = swarm
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ')

  const agentRows = config.roster
    .map((agent, i) => {
      const label = agentLabel(agent, i)
      const roleDef = SWARM_ROLES.find((r) => r.id === agent.role)
      return `| ${i + 1} | ${label} | ${roleDef?.label ?? agent.role} | WAITING | — |`
    })
    .join('\n')

  const board = `# SWARM_BOARD.md

## ${config.name}

**Mission:** ${config.mission}
**Started:** ${now}
**Status:** LAUNCHING

---

## Agents

| # | Agent | Role | Status | Current Task |
|---|-------|------|--------|-------------|
${agentRows}

---

## Task Breakdown

| # | Task | Owner | Owned Files | Depends On | Status |
|---|------|-------|-------------|------------|--------|
| — | (Coordinator will fill this section) | — | — | — | — |

---

## Completed Work Log

(Empty — agents will log completed work here)
`

  await window.ghostshell.fsCreateFile(`${swarmRoot}/SWARM_BOARD.md`, board)
}

// ─── Knowledge Staging ───────────────────────────────────────

async function stageKnowledge(
  swarmRoot: string,
  contextFiles: SwarmContextFile[],
): Promise<boolean> {
  if (contextFiles.length === 0) return false

  const manifest: Array<{ name: string; originalPath: string; stagedPath: string }> = []

  for (const file of contextFiles) {
    const stagedPath = `${swarmRoot}/knowledge/${file.name}`
    try {
      await window.ghostshell.fsCopy(file.path, stagedPath)
      manifest.push({
        name: file.name,
        originalPath: file.path,
        stagedPath,
      })
    } catch {
      // Skip files that fail to copy
    }
  }

  if (manifest.length === 0) return false

  // Write KNOWLEDGE.md index
  const knowledgeMd = `# Knowledge Files

The following files have been staged for this swarm:

${manifest.map((f) => `- **${f.name}** — \`${f.stagedPath}\` (from \`${f.originalPath}\`)`).join('\n')}
`
  await window.ghostshell.fsCreateFile(`${swarmRoot}/knowledge/KNOWLEDGE.md`, knowledgeMd)

  // Write manifest JSON
  await window.ghostshell.fsCreateFile(
    `${swarmRoot}/knowledge/knowledge-manifest.json`,
    JSON.stringify(manifest, null, 2) + '\n',
  )

  return true
}

// ─── PTY Readiness Retry Loop ────────────────────────────────

// ─── Helpers: Prompt File + Platform-Aware Launch ─────────────

function slugify(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function isWindows(): boolean {
  return navigator.userAgent.includes('Windows') || navigator.platform === 'Win32'
}

/**
 * Build a single-line launch command that reads the system prompt from a file.
 * This avoids embedding multi-line text in the PTY (which splits on newlines).
 */
function buildFileBasedLaunchCommand(
  provider: Provider,
  promptFilePath: string,
  autoApprove: boolean,
  agentLabel: string,
): string {
  // Normalize path separators for the target platform
  const p = isWindows() ? promptFilePath.replace(/\//g, '\\') : promptFilePath
  // Env var prefix — bs-mail uses SWARM_AGENT_NAME to identify who's sending/receiving
  const envPrefix = isWindows()
    ? `$env:SWARM_AGENT_NAME='${agentLabel}';`
    : `export SWARM_AGENT_NAME='${agentLabel}' &&`

  if (provider === 'claude') {
    if (isWindows()) {
      const cmd = `${envPrefix} $p = Get-Content -Raw '${p}'; claude --system-prompt $p`
      return autoApprove ? `${cmd} --dangerously-skip-permissions` : cmd
    }
    const cmd = `${envPrefix} claude --system-prompt "$(cat '${p}')"`
    return autoApprove ? `${cmd} --dangerously-skip-permissions` : cmd
  }

  if (provider === 'gemini') {
    // Gemini reads GEMINI.md from the working directory automatically
    // The prompt file is written as GEMINI.md by spawnSwarmAgents
    return `${envPrefix} gemini${autoApprove ? ' --approval-mode=yolo' : ''}`
  }

  if (provider === 'codex') {
    // Codex reads AGENTS.md from the working directory automatically
    // The prompt file is written as AGENTS.md by spawnSwarmAgents
    if (isWindows()) {
      return `${envPrefix} codex${autoApprove ? ' --full-auto' : ''}`
    }
    return `${envPrefix} codex${autoApprove ? ' --full-auto' : ''}`
  }

  // Fallback: Claude
  if (isWindows()) {
    return `${envPrefix} $p = Get-Content -Raw '${p}'; claude --system-prompt $p`
  }
  return `${envPrefix} claude --system-prompt "$(cat '${p}')"`
}

// ─── Agent Spawning ──────────────────────────────────────────

interface CreateAgentFn {
  (
    name: string,
    avatar: undefined,
    color: string,
    claudeConfig: ClaudeConfig | undefined,
    cwd: string,
    templateId: undefined,
    threadId: undefined,
    launchClaude: boolean,
    provider: Provider,
    geminiConfig: GeminiConfig | undefined,
    codexConfig: CodexConfig | undefined,
  ): { agent: { id: string }; sessionId: string }
}

async function spawnSwarmAgents(
  swarm: Swarm,
  swarmRoot: string,
  createAgent: CreateAgentFn,
  hasKnowledge: boolean,
): Promise<void> {
  const { config } = swarm
  const { roster } = config

  // Create prompts directory
  await window.ghostshell.fsCreateDir(`${swarmRoot}/prompts`)

  for (let i = 0; i < roster.length; i++) {
    const rosterAgent = roster[i]
    const label = agentLabel(rosterAgent, i)
    const provider = mapProvider(rosterAgent.cliProvider)
    const color = roleColor(rosterAgent.role)

    // Build prompt context and system prompt
    const ctx = buildPromptContext(config, rosterAgent, swarmRoot, i, roster, hasKnowledge)
    const systemPrompt = buildSwarmPrompt(rosterAgent.role, ctx)

    // Write system prompt to a file (avoids multi-line command in PTY)
    const promptSlug = slugify(label)
    const promptFilePath = `${swarmRoot}/prompts/${promptSlug}.md`
    await window.ghostshell.fsCreateFile(promptFilePath, systemPrompt)

    // Gemini/Codex: write prompt as auto-read markdown in working directory
    if (provider === 'gemini') {
      await window.ghostshell.fsCreateFile(`${config.directory}/GEMINI.md`, systemPrompt)
    } else if (provider === 'codex') {
      await window.ghostshell.fsCreateFile(`${config.directory}/AGENTS.md`, systemPrompt)
    }

    // Build provider-specific configs (for agent store, not for launch command)
    let claudeConfig: ClaudeConfig | undefined
    let geminiConfig: GeminiConfig | undefined
    let codexConfig: CodexConfig | undefined

    if (provider === 'claude') {
      claudeConfig = {
        systemPrompt,
        dangerouslySkipPermissions: rosterAgent.autoApprove,
      }
    } else if (provider === 'gemini') {
      geminiConfig = { yolo: rosterAgent.autoApprove }
    } else if (provider === 'codex') {
      codexConfig = { fullAuto: rosterAgent.autoApprove }
    }

    // Create the agent (adds Agent to store + creates a terminal session)
    const result = createAgent(
      label,
      undefined,
      color,
      claudeConfig,
      config.directory,
      undefined,
      undefined,
      true,
      provider,
      geminiConfig,
      codexConfig,
    )

    // Build the launch command that reads prompt from file (single-line, PTY-safe)
    const launchCommand = buildFileBasedLaunchCommand(provider, promptFilePath, rosterAgent.autoApprove, label)

    // Store launch command on the session — usePty will auto-launch with it
    // after ptyCreate succeeds (proper timing, no race condition).
    useTerminalStore.getState().updateSession(result.sessionId, {
      sessionType: 'ghostswarm',
      launchCommand,
    })

    // Link the agent to the swarm store
    useSwarmStore.getState().linkAgentToStore(
      swarm.id,
      rosterAgent.id,
      result.agent.id,
      result.sessionId,
    )
  }
}

// ─── Main Entry Point ────────────────────────────────────────

export async function orchestrateSwarm(
  swarm: Swarm,
  paneId: string,
  createAgent: CreateAgentFn,
): Promise<void> {
  const { setSwarmStatus, setSwarmRoot } = useSwarmStore.getState()
  const swarmRoot = `${swarm.config.directory}/.bridgespace/swarms/${paneId}`

  try {
    setSwarmStatus(swarm.id, 'launching')

    // 1. Set up directory structure + install bs-mail
    await setupSwarmDirectory(swarmRoot)

    // 2. Initialize task-graph.json
    await window.ghostshell.fsCreateFile(
      `${swarmRoot}/bin/task-graph.json`,
      JSON.stringify({ tasks: {}, dependencies: [] }, null, 2)
    )

    // 3. Initialize file-locks.json
    await window.ghostshell.fsCreateFile(
      `${swarmRoot}/bin/file-locks.json`,
      JSON.stringify({ locks: {}, lockHistory: [] }, null, 2)
    )

    // 4. Write agents.json roster
    await writeAgentsJson(swarmRoot, swarm.config.roster)

    // 5. Generate initial SWARM_BOARD.md
    await generateSwarmBoard(swarmRoot, swarm)

    // 6. Stage knowledge files (if any)
    const hasKnowledge = await stageKnowledge(swarmRoot, swarm.config.contextFiles)

    // 7. Spawn all agents into terminals
    await spawnSwarmAgents(swarm, swarmRoot, createAgent, hasKnowledge)

    // 8. Group all swarm sessions into a single tab group
    const updatedSwarm = useSwarmStore.getState().getSwarm(swarm.id)
    if (updatedSwarm) {
      const sessionIds = updatedSwarm.agents
        .map((a) => a.terminalId)
        .filter((id): id is string => !!id)

      if (sessionIds.length > 1) {
        useTerminalStore.getState().addGroup({
          id: `swarm-${swarm.id}`,
          name: swarm.config.name,
          sessionIds,
          createdAt: Date.now(),
        })
      }

      // Activate the first session
      if (sessionIds.length > 0) {
        useTerminalStore.getState().setActiveSession(sessionIds[0])
      }
    }

    // 9. Store swarmRoot in swarmStore
    setSwarmRoot(swarm.id, swarmRoot)

    // 10. Start message injector (filesystem watcher)
    const stopInjector = startMessageInjector(swarm.id, swarmRoot)

    // 11. Start task sync polling (every 3 seconds for tight coordination)
    const taskSyncInterval = setInterval(() => {
      void syncTasksFromFile(swarm.id, swarmRoot)
    }, 3000)

    // Store runtime state outside Zustand (not persisted)
    setSwarmRuntime(swarm.id, {
      injectorCleanup: stopInjector,
      taskSyncInterval: taskSyncInterval as unknown as number,
    })

    setSwarmStatus(swarm.id, 'running')
  } catch (err) {
    console.error('Swarm orchestration failed:', err)
    setSwarmStatus(swarm.id, 'error')
  }
}

// ─── Resume Runtime ─────────────────────────────────────────────

/**
 * Restart runtime services (message injector + task sync) for a paused swarm.
 * Called when the user clicks Resume in SwarmHeader.
 */
export function resumeSwarmRuntime(swarmId: string): void {
  const swarm = useSwarmStore.getState().getSwarm(swarmId)
  if (!swarm?.swarmRoot) return

  const swarmRoot = swarm.swarmRoot

  // Restart message injector
  const stopInjector = startMessageInjector(swarmId, swarmRoot)

  // Restart task sync polling
  const taskSyncInterval = setInterval(() => {
    void syncTasksFromFile(swarmId, swarmRoot)
  }, 5000)

  setSwarmRuntime(swarmId, {
    injectorCleanup: stopInjector,
    taskSyncInterval: taskSyncInterval as unknown as number,
  })
}

// ─── Task Sync ──────────────────────────────────────────────────

function mapFileTaskStatus(status: string): 'open' | 'assigned' | 'planning' | 'building' | 'review' | 'done' {
  const validStatuses = ['open', 'assigned', 'planning', 'building', 'review', 'done']
  if (validStatuses.includes(status)) return status as 'open' | 'assigned' | 'planning' | 'building' | 'review' | 'done'
  // Map common aliases
  if (status === 'queued' || status === 'ready') return 'open'
  if (status === 'in_progress') return 'building'
  if (status === 'completed') return 'done'
  return 'open'
}

async function syncTasksFromFile(swarmId: string, swarmRoot: string): Promise<void> {
  try {
    // Guard: skip if swarm was stopped/completed/removed
    const currentSwarm = useSwarmStore.getState().getSwarm(swarmId)
    if (!currentSwarm || currentSwarm.status === 'completed' || currentSwarm.status === 'paused') return

    const result = await window.ghostshell.fsReadFile(`${swarmRoot}/bin/task-graph.json`)
    if (!result.success || !result.content) return

    const graph = JSON.parse(result.content)
    if (!graph.tasks) return

    const tasks = Object.values(graph.tasks).map((t: any) => ({
      id: t.id,
      title: t.title || '',
      owner: t.owner || t.assignedTo || '',
      ownedFiles: t.ownedFiles || [],
      dependsOn: t.dependsOn || [],
      status: mapFileTaskStatus(t.status),
      reviewer: t.reviewer || undefined,
      verdict: t.verdict || undefined,
      acceptanceCriteria: t.acceptanceCriteria || undefined,
      description: t.description || undefined,
    }))

    useSwarmStore.getState().setTasks(swarmId, tasks)

    // Phase 7: Mirror tasks to activityStore for enriched UI
    const swarm = useSwarmStore.getState().getSwarm(swarmId)
    if (!swarm) return

    for (const task of tasks) {
      const agentState = swarm.agents.find(a => {
        const rosterAgent = swarm.config.roster.find(r => r.id === a.rosterId)
        if (!rosterAgent) return false
        const idx = swarm.config.roster.indexOf(rosterAgent)
        const label = rosterAgent.customName || `${getRoleDef(rosterAgent.role).label} ${idx + 1}`
        return label === task.owner || rosterAgent.id === task.owner
      })

      if (agentState?.agentId) {
        useActivityStore.getState().addTask(agentState.agentId, {
          agentId: agentState.agentId,
          subject: task.title,
          status: task.status === 'done' ? 'completed' : task.status === 'building' ? 'in_progress' : 'pending',
        })

        // Update agent swarm status from their task status
        const taskToAgentStatus: Record<string, 'planning' | 'building' | 'review' | 'done'> = {
          assigned: 'planning',
          planning: 'planning',
          building: 'building',
          review: 'review',
          done: 'done',
        }
        const newStatus = taskToAgentStatus[task.status]
        if (newStatus && agentState.status !== newStatus) {
          useSwarmStore.getState().setAgentStatus(swarmId, agentState.rosterId, newStatus)
        }
      }
    }
  } catch {
    // File not ready yet or parse error — expected during early setup
  }
}
