// Swarm Orchestrator — spawns agents into terminals when a swarm launches.
//
// Flow: computeLayoutMeta → setupSwarmDirectory → writeSwarmMeta →
//       writeAgentsJson → generateSwarmBoard → stageKnowledge →
//       scaffoldFindings → spawnSwarmAgents

import { useTerminalStore } from '../stores/terminalStore'
import { useSwarmStore } from '../stores/swarmStore'
import { setSwarmRuntime } from '../stores/swarmStore'
import { useActivityStore } from '../stores/activityStore'
import {
  Swarm,
  SwarmRosterAgent,
  SwarmContextFile,
  SwarmAgentRole,
  SWARM_ROLES,
  SWARM_CLI_PROVIDERS,
  ROSTER_PRESETS,
  getRoleDef,
} from './swarm-types'
import type { SwarmLayoutPresetId } from './swarm-types'
import type { ClaudeConfig, GeminiConfig, CodexConfig, Provider } from './types'
import { buildPromptContext, buildSwarmPrompt } from './swarm-prompts'
import { GS_MAIL_CJS, GS_MAIL_SH, GS_MAIL_CMD } from './bs-mail-template'
import { GS_TASK_CJS, GS_TASK_SH, GS_TASK_CMD } from './bs-task-template'
import { GS_LOCK_CJS, GS_LOCK_SH, GS_LOCK_CMD } from './bs-lock-template'
import { startMessageInjector } from './swarm-message-injector'
import {
  buildSwarmRoot,
  swarmBinPath,
  swarmKnowledgePath,
  swarmReportsPath,
  swarmPromptsPath,
} from './ghostshell'

// ─── Constants ──────────────────────────────────────────────

/** Task sync polling interval (ms) — consistent for both launch and resume. */
const TASK_SYNC_INTERVAL_MS = 3000

// ─── Layout Metadata ────────────────────────────────────────

/**
 * Runtime metadata computed at launch time from the roster composition.
 * Written to `swarm-meta.json` and available for prompts, UI, and monitoring.
 */
export interface SwarmLayoutMeta {
  /** Matched preset ID or 'custom' if no standard preset matches. */
  layoutPreset: SwarmLayoutPresetId
  /** Human-readable tier label (DUO / SQUAD / TEAM / PLATOON / CUSTOM). */
  tierLabel: string
  /** Total agent count in the swarm. */
  totalAgents: number
  /** Per-role counts for the roster. */
  roleCounts: Record<SwarmAgentRole, number>
  /** Labels of scout agents (ordered). Used for per-scout scaffolding. */
  scoutLabels: string[]
  /** Labels of builder agents (ordered). */
  builderLabels: string[]
  /** Labels of coordinator agents (ordered). */
  coordinatorLabels: string[]
  /** Labels of reviewer agents (ordered). */
  reviewerLabels: string[]
  /** Timestamp (ISO) when the swarm was launched. */
  launchedAt: string
}

/**
 * Compute layout metadata from the roster composition.
 * Matches against known presets; falls back to 'custom'.
 */
export function computeLayoutMeta(
  roster: SwarmRosterAgent[],
): SwarmLayoutMeta {
  // Count roles
  const roleCounts: Record<SwarmAgentRole, number> = {
    coordinator: 0,
    builder: 0,
    scout: 0,
    reviewer: 0,
    custom: 0,
  }
  for (const agent of roster) {
    roleCounts[agent.role] = (roleCounts[agent.role] || 0) + 1
  }

  // Match against presets
  let layoutPreset: SwarmLayoutPresetId = 'custom'
  for (const preset of ROSTER_PRESETS) {
    const match = Object.entries(preset.composition).every(
      ([role, count]) => roleCounts[role as SwarmAgentRole] === count,
    )
    if (match) {
      layoutPreset = preset.id as SwarmLayoutPresetId
      break
    }
  }

  const tierLabel = layoutPreset === 'custom'
    ? 'CUSTOM'
    : layoutPreset.toUpperCase()

  // Collect ordered labels per role
  const labelsByRole = (role: SwarmAgentRole): string[] =>
    roster
      .map((agent, i) => ({ agent, i }))
      .filter(({ agent }) => agent.role === role)
      .map(({ agent, i }) => agentLabel(agent, i))

  return {
    layoutPreset,
    tierLabel,
    totalAgents: roster.length,
    roleCounts,
    scoutLabels: labelsByRole('scout'),
    builderLabels: labelsByRole('builder'),
    coordinatorLabels: labelsByRole('coordinator'),
    reviewerLabels: labelsByRole('reviewer'),
    launchedAt: new Date().toISOString(),
  }
}

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

function slugify(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function isWindows(): boolean {
  return navigator.userAgent.includes('Windows') || navigator.platform === 'Win32'
}

// ─── Directory Setup ─────────────────────────────────────────

async function setupSwarmDirectory(swarmRoot: string): Promise<void> {
  const dirs = [
    swarmRoot,
    swarmBinPath(swarmRoot),
    `${swarmRoot}/inbox`,
    `${swarmRoot}/nudges`,
    swarmKnowledgePath(swarmRoot),
    `${swarmRoot}/heartbeats`,
    swarmReportsPath(swarmRoot),
    swarmPromptsPath(swarmRoot),
  ]

  for (const dir of dirs) {
    await window.ghostshell.fsCreateDir(dir)
  }

  const bin = swarmBinPath(swarmRoot)

  // Write gs-mail scripts
  await window.ghostshell.fsCreateFile(`${bin}/gs-mail.cjs`, GS_MAIL_CJS)
  await window.ghostshell.fsCreateFile(`${bin}/gs-mail`, GS_MAIL_SH)
  await window.ghostshell.fsCreateFile(`${bin}/gs-mail.cmd`, GS_MAIL_CMD)

  // Write gs-task scripts
  await window.ghostshell.fsCreateFile(`${bin}/gs-task.cjs`, GS_TASK_CJS)
  await window.ghostshell.fsCreateFile(`${bin}/gs-task`, GS_TASK_SH)
  await window.ghostshell.fsCreateFile(`${bin}/gs-task.cmd`, GS_TASK_CMD)

  // Write gs-lock scripts
  await window.ghostshell.fsCreateFile(`${bin}/gs-lock.cjs`, GS_LOCK_CJS)
  await window.ghostshell.fsCreateFile(`${bin}/gs-lock`, GS_LOCK_SH)
  await window.ghostshell.fsCreateFile(`${bin}/gs-lock.cmd`, GS_LOCK_CMD)
}

// ─── swarm-meta.json ────────────────────────────────────────

/**
 * Persist layout metadata to `swarm-meta.json` at the swarm root.
 * This file is the single source of truth for layout/tier info
 * and is consumed by prompts, monitoring, and the UI.
 */
async function writeSwarmMeta(
  swarmRoot: string,
  meta: SwarmLayoutMeta,
  swarm: Swarm,
): Promise<void> {
  const payload = {
    ...meta,
    swarmId: swarm.id,
    swarmName: swarm.config.name,
    mission: swarm.config.mission,
    directory: swarm.config.directory,
    swarmRoot,
    skills: swarm.config.skills,
  }
  await window.ghostshell.fsCreateFile(
    `${swarmRoot}/swarm-meta.json`,
    JSON.stringify(payload, null, 2) + '\n',
  )
}

// ─── agents.json ─────────────────────────────────────────────

async function writeAgentsJson(
  swarmRoot: string,
  roster: SwarmRosterAgent[],
  meta: SwarmLayoutMeta,
): Promise<void> {
  const agents = roster.map((agent, i) => ({
    label: agentLabel(agent, i),
    role: agent.role,
    provider: agent.cliProvider,
  }))
  await window.ghostshell.fsCreateFile(
    `${swarmRoot}/agents.json`,
    JSON.stringify({ agents, layout: meta.layoutPreset, tier: meta.tierLabel }, null, 2) + '\n',
  )
}

// ─── SWARM_BOARD.md ──────────────────────────────────────────

async function generateSwarmBoard(
  swarmRoot: string,
  swarm: Swarm,
  meta: SwarmLayoutMeta,
): Promise<void> {
  const { config } = swarm

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
**Layout:** ${meta.tierLabel} (${meta.totalAgents} agents)
**Started:** ${meta.launchedAt.slice(0, 19).replace('T', ' ')}
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

  const knowledgeDir = swarmKnowledgePath(swarmRoot)
  const manifest: Array<{ name: string; originalPath: string; stagedPath: string }> = []

  for (const file of contextFiles) {
    const stagedPath = `${knowledgeDir}/${file.name}`
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
  await window.ghostshell.fsCreateFile(`${knowledgeDir}/KNOWLEDGE.md`, knowledgeMd)

  // Write manifest JSON
  await window.ghostshell.fsCreateFile(
    `${knowledgeDir}/knowledge-manifest.json`,
    JSON.stringify(manifest, null, 2) + '\n',
  )

  return true
}

// ─── Scout Findings Scaffolding ─────────────────────────────

/**
 * Create FINDINGS.md scaffolding that supports multi-scout coordination.
 *
 * Single scout  → one FINDINGS.md for the scout to fill directly.
 * Multi-scout   → per-scout section files (FINDINGS-scout-N.md) + a consolidated
 *                  FINDINGS.md index that references each section.
 *
 * Builders are directed to read the consolidated FINDINGS.md.
 */
async function scaffoldFindings(
  swarmRoot: string,
  meta: SwarmLayoutMeta,
): Promise<void> {
  const knowledgeDir = swarmKnowledgePath(swarmRoot)
  const scoutCount = meta.scoutLabels.length

  if (scoutCount === 0) {
    // No scouts — write a minimal placeholder so builders don't error on read
    await window.ghostshell.fsCreateFile(
      `${knowledgeDir}/FINDINGS.md`,
      `# Scout Findings\n\n_No scout agents in this swarm. Builders: explore the codebase directly._\n`,
    )
    return
  }

  if (scoutCount === 1) {
    // Single scout — one file, scout writes directly
    const scoutLabel = meta.scoutLabels[0]
    await window.ghostshell.fsCreateFile(
      `${knowledgeDir}/FINDINGS.md`,
      `# Scout Findings\n\n**Scout:** ${scoutLabel}\n**Status:** Pending\n\n---\n\n_This file will be populated by ${scoutLabel} during reconnaissance._\n_Builders: check this file before exploring the codebase on your own._\n`,
    )
    return
  }

  // Multi-scout — per-scout section files + consolidated index
  const sectionFiles: string[] = []

  for (let i = 0; i < scoutCount; i++) {
    const scoutLabel = meta.scoutLabels[i]
    const scoutSlug = slugify(scoutLabel)
    const sectionFile = `FINDINGS-${scoutSlug}.md`
    sectionFiles.push(sectionFile)

    await window.ghostshell.fsCreateFile(
      `${knowledgeDir}/${sectionFile}`,
      `# Scout Findings — ${scoutLabel}\n\n**Scout:** ${scoutLabel}\n**Status:** Pending\n\n---\n\n_This section will be populated by ${scoutLabel} during reconnaissance._\n`,
    )
  }

  // Consolidated index
  const scoutFileList = meta.scoutLabels
    .map((label, i) => `- **${label}** — \`${knowledgeDir}/${sectionFiles[i]}\``)
    .join('\n')

  await window.ghostshell.fsCreateFile(
    `${knowledgeDir}/FINDINGS.md`,
    `# Scout Findings — Consolidated Index

**Scouts:** ${scoutCount}
**Layout:** ${meta.tierLabel}

---

## Section Files

${scoutFileList}

---

_Each scout writes to their own section file above._
_Builders: read all section files listed here for complete codebase intelligence._
_Coordinator: verify all scouts have reported before assigning builder tasks._
`,
  )
}

// ─── Report Scaffolding ─────────────────────────────────────

/**
 * Create per-scout report directories so scouts have dedicated output space.
 */
async function scaffoldReports(
  swarmRoot: string,
  meta: SwarmLayoutMeta,
): Promise<void> {
  const reportsDir = swarmReportsPath(swarmRoot)

  for (const scoutLabel of meta.scoutLabels) {
    const scoutSlug = slugify(scoutLabel)
    await window.ghostshell.fsCreateDir(`${reportsDir}/${scoutSlug}`)
  }
}

// ─── Helpers: Platform-Aware Launch ─────────────────────────

/**
 * Build a single-line launch command that reads the system prompt from a file.
 * This avoids embedding multi-line text in the PTY (which splits on newlines).
 */
function buildFileBasedLaunchCommand(
  provider: Provider,
  promptFilePath: string,
  autoApprove: boolean,
  label: string,
): string {
  // Normalize path separators for the target platform
  const p = isWindows() ? promptFilePath.replace(/\//g, '\\') : promptFilePath
  // Env var prefix — gs-mail uses SWARM_AGENT_NAME to identify who's sending/receiving
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
    // Gemini reads GEMINI.md from the working directory automatically
    return `${envPrefix} gemini${autoApprove ? ' --approval-mode=yolo' : ''}`
  }

  if (provider === 'codex') {
    // Codex reads AGENTS.md from the working directory automatically
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
    const promptFilePath = `${swarmPromptsPath(swarmRoot)}/${promptSlug}.md`
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
  const swarmRoot = buildSwarmRoot(swarm.config.directory, paneId)

  try {
    setSwarmStatus(swarm.id, 'launching')

    // 0. Compute layout metadata from roster composition
    const layoutMeta = computeLayoutMeta(swarm.config.roster)

    // 1. Set up directory structure + install gs-mail/gs-task/gs-lock
    await setupSwarmDirectory(swarmRoot)

    // 2. Persist runtime metadata (single source of truth for layout/tier)
    await writeSwarmMeta(swarmRoot, layoutMeta, swarm)

    // 3. Initialize task-graph.json
    const bin = swarmBinPath(swarmRoot)
    await window.ghostshell.fsCreateFile(
      `${bin}/task-graph.json`,
      JSON.stringify({ tasks: {}, dependencies: [] }, null, 2),
    )

    // 4. Initialize file-locks.json
    await window.ghostshell.fsCreateFile(
      `${bin}/file-locks.json`,
      JSON.stringify({ locks: {}, lockHistory: [] }, null, 2),
    )

    // 5. Write agents.json roster (enriched with layout data)
    await writeAgentsJson(swarmRoot, swarm.config.roster, layoutMeta)

    // 6. Generate initial SWARM_BOARD.md (includes layout/tier context)
    await generateSwarmBoard(swarmRoot, swarm, layoutMeta)

    // 7. Stage knowledge files (if any)
    const hasKnowledge = await stageKnowledge(swarmRoot, swarm.config.contextFiles)

    // 8. Scaffold FINDINGS.md for scouts (multi-scout safe)
    await scaffoldFindings(swarmRoot, layoutMeta)

    // 9. Scaffold per-scout report directories
    await scaffoldReports(swarmRoot, layoutMeta)

    // 10. Spawn all agents into terminals
    await spawnSwarmAgents(swarm, swarmRoot, createAgent, hasKnowledge)

    // 11. Group all swarm sessions into a single tab group
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

    // 12. Store swarmRoot in swarmStore
    setSwarmRoot(swarm.id, swarmRoot)

    // 13. Start message injector (filesystem watcher)
    const stopInjector = startMessageInjector(swarm.id, swarmRoot)

    // 14. Start task sync polling
    const taskSyncInterval = setInterval(() => {
      void syncTasksFromFile(swarm.id, swarmRoot)
    }, TASK_SYNC_INTERVAL_MS)

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

  // Restart task sync polling (same interval as launch)
  const taskSyncInterval = setInterval(() => {
    void syncTasksFromFile(swarmId, swarmRoot)
  }, TASK_SYNC_INTERVAL_MS)

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

    const result = await window.ghostshell.fsReadFile(`${swarmBinPath(swarmRoot)}/task-graph.json`)
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

    // Mirror tasks to activityStore for enriched UI
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
