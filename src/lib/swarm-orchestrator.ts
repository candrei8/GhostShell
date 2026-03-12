// Swarm Orchestrator — spawns agents into terminals when a swarm launches.
//
// Flow: setupSwarmDirectory → writeAgentsJson → generateSwarmBoard →
//       stageKnowledge → spawnSwarmAgents

import { useAgentStore } from '../stores/agentStore'
import { useTerminalStore } from '../stores/terminalStore'
import { useSwarmStore } from '../stores/swarmStore'
import {
  Swarm,
  SwarmRosterAgent,
  SwarmContextFile,
  SWARM_ROLES,
  SWARM_CLI_PROVIDERS,
} from './swarm-types'
import type { ClaudeConfig, GeminiConfig, CodexConfig, Provider } from './types'
import { buildPromptContext, buildSwarmPrompt } from './swarm-prompts'
import { buildClaudeCommand, buildGeminiCommand, buildCodexCommand } from './providers'
import { BS_MAIL_CJS, BS_MAIL_SH, BS_MAIL_CMD } from './bs-mail-template'

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
  ]

  for (const dir of dirs) {
    await window.ghostshell.fsCreateDir(dir)
  }

  // Write bs-mail scripts
  await window.ghostshell.fsCreateFile(`${swarmRoot}/bin/bs-mail.cjs`, BS_MAIL_CJS)
  await window.ghostshell.fsCreateFile(`${swarmRoot}/bin/bs-mail`, BS_MAIL_SH)
  await window.ghostshell.fsCreateFile(`${swarmRoot}/bin/bs-mail.cmd`, BS_MAIL_CMD)
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

    // Build provider-specific configs
    let claudeConfig: ClaudeConfig | undefined
    let geminiConfig: GeminiConfig | undefined
    let codexConfig: CodexConfig | undefined

    if (provider === 'claude') {
      claudeConfig = {
        systemPrompt,
        dangerouslySkipPermissions: rosterAgent.autoApprove,
      }
    } else if (provider === 'gemini') {
      geminiConfig = {
        yolo: rosterAgent.autoApprove,
      }
    } else if (provider === 'codex') {
      codexConfig = {
        fullAuto: rosterAgent.autoApprove,
      }
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

    // Immediately mark session as skipAutoLaunch — we'll launch manually
    // with the env var set first. This is safe because React hasn't re-rendered
    // yet (TerminalPane hasn't mounted), so usePty hasn't read the session.
    useTerminalStore.getState().updateSession(result.sessionId, {
      skipAutoLaunch: true,
    })

    // Link the agent to the swarm store
    useSwarmStore.getState().linkAgentToStore(
      swarm.id,
      rosterAgent.id,
      result.agent.id,
      result.sessionId,
    )

    // Schedule env var export + CLI launch after PTY initializes.
    // PTY creation is deferred in usePty (React StrictMode safety), so we
    // wait long enough for the PTY process to be ready.
    const cmd = buildLaunchCommandForSwarm(provider, claudeConfig, geminiConfig, codexConfig, systemPrompt)
    const sessionId = result.sessionId
    const agentId = result.agent.id

    setTimeout(() => {
      try {
        // Set SWARM_AGENT_NAME so bs-mail knows who this agent is
        window.ghostshell.ptyWrite(sessionId, `export SWARM_AGENT_NAME="${label}"\r`)
      } catch {
        // PTY not ready
      }
    }, 800)

    setTimeout(() => {
      // Verify the agent still owns this session
      const currentAgent = useAgentStore.getState().getAgent(agentId)
      if (currentAgent?.terminalId !== sessionId) return

      try {
        window.ghostshell.ptyWrite(sessionId, cmd + '\r')
        useAgentStore.getState().setAgentStatus(agentId, 'working')
        useSwarmStore.getState().setAgentStatus(swarm.id, rosterAgent.id, 'planning')
      } catch {
        // PTY not ready — user can launch manually
      }
    }, 1500)
  }
}

/**
 * Build the CLI launch command for a swarm agent.
 * For Claude, the system prompt is in ClaudeConfig and handled by buildClaudeCommand.
 * For Gemini/Codex, we pass the system prompt via custom flags if the prompt is short
 * enough, otherwise we rely on the SWARM_BOARD.md for context.
 */
function buildLaunchCommandForSwarm(
  provider: Provider,
  claudeConfig?: ClaudeConfig,
  geminiConfig?: GeminiConfig,
  codexConfig?: CodexConfig,
  systemPrompt?: string,
): string {
  if (provider === 'claude' && claudeConfig) {
    return buildClaudeCommand(claudeConfig)
  }
  if (provider === 'gemini') {
    const config: GeminiConfig = { ...geminiConfig }
    if (systemPrompt) {
      // Gemini CLI doesn't have a native --system-prompt flag.
      // We pass the initial instruction via the prompt after launch.
      // The agent will read SWARM_BOARD.md as instructed in the prompt.
    }
    return buildGeminiCommand(config)
  }
  if (provider === 'codex') {
    const config: CodexConfig = { ...codexConfig }
    if (systemPrompt) {
      // Codex supports --instructions for system-level prompts
      const escaped = systemPrompt.replace(/"/g, '\\"').replace(/\n/g, '\\n')
      config.customFlags = [...(config.customFlags || []), '--instructions', `"${escaped}"`]
    }
    return buildCodexCommand(config)
  }
  // Fallback: treat as Claude
  return buildClaudeCommand(claudeConfig || {})
}

// ─── Main Entry Point ────────────────────────────────────────

export async function orchestrateSwarm(
  swarm: Swarm,
  paneId: string,
  createAgent: CreateAgentFn,
): Promise<void> {
  const { setSwarmStatus } = useSwarmStore.getState()
  const swarmRoot = `${swarm.config.directory}/.bridgespace/swarms/${paneId}`

  try {
    setSwarmStatus(swarm.id, 'launching')

    // 1. Set up directory structure + install bs-mail
    await setupSwarmDirectory(swarmRoot)

    // 2. Write agents.json roster
    await writeAgentsJson(swarmRoot, swarm.config.roster)

    // 3. Generate initial SWARM_BOARD.md
    await generateSwarmBoard(swarmRoot, swarm)

    // 4. Stage knowledge files (if any)
    const hasKnowledge = await stageKnowledge(swarmRoot, swarm.config.contextFiles)

    // 5. Spawn all agents into terminals
    await spawnSwarmAgents(swarm, swarmRoot, createAgent, hasKnowledge)

    setSwarmStatus(swarm.id, 'running')
  } catch (err) {
    console.error('Swarm orchestration failed:', err)
    setSwarmStatus(swarm.id, 'error')
  }
}
