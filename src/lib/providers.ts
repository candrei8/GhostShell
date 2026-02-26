import { Agent, ClaudeConfig, GeminiConfig, CodexConfig, Provider } from './types'

export interface ModelDef {
  id: string
  name: string
  badge: string
  color: string
}

export const CLAUDE_MODELS: ModelDef[] = [
  { id: 'claude-opus-4-6', name: 'Opus 4.6', badge: 'Recommended', color: '#f59e0b' },
  { id: 'claude-sonnet-4-6', name: 'Sonnet 4.6', badge: 'Fast & Capable', color: '#a855f7' },
  { id: 'claude-haiku-4-5-20251001', name: 'Haiku 4.5', badge: 'Fastest', color: '#22d3ee' },
]

export const GEMINI_MODELS: ModelDef[] = [
  { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro', badge: 'Most Capable', color: '#1a73e8' },
  { id: 'pro', name: 'Gemini 3 Pro', badge: 'Stable', color: '#4285f4' },
  { id: 'flash', name: 'Gemini 3 Flash', badge: 'Recommended', color: '#34a853' },
  { id: 'flash-lite', name: 'Flash Lite', badge: 'Fastest', color: '#fbbc04' },
]

export const CODEX_MODELS: ModelDef[] = [
  { id: 'gpt-5.3-codex', name: 'GPT-5.3 Codex', badge: 'Recommended', color: '#10a37f' },
  { id: 'gpt-5.3-codex-spark', name: 'Codex Spark', badge: 'Fastest', color: '#19c37d' },
  { id: 'gpt-5.2-codex', name: 'GPT-5.2 Codex', badge: 'Stable', color: '#0d8c6d' },
  { id: 'o3', name: 'o3', badge: 'Reasoning', color: '#6e44ff' },
]

export function getModelsForProvider(provider: Provider): ModelDef[] {
  if (provider === 'gemini') return GEMINI_MODELS
  if (provider === 'codex') return CODEX_MODELS
  return CLAUDE_MODELS
}

export function getDefaultModel(provider: Provider): string {
  if (provider === 'gemini') return 'flash'
  if (provider === 'codex') return 'gpt-5.3-codex'
  return 'claude-opus-4-6'
}

/**
 * Get the install command for a CLI provider.
 * These are meant to be run once from Settings, not on every launch.
 */
export function getInstallCommand(provider: Provider): string {
  if (provider === 'gemini') return 'npm install -g @google/gemini-cli'
  if (provider === 'codex') return 'npm install -g @openai/codex'
  return 'npm install -g @anthropic-ai/claude-code'
}

/**
 * Get the update command (reinstall latest) for a CLI provider.
 */
export function getUpdateCommand(provider: Provider): string {
  if (provider === 'gemini') return 'npm install -g @google/gemini-cli@latest'
  if (provider === 'codex') return 'npm install -g @openai/codex@latest'
  return 'npm install -g @anthropic-ai/claude-code@latest'
}

export function buildClaudeCommand(config: ClaudeConfig, resume?: boolean): string {
  const parts = ['claude']

  if (resume) {
    parts.push('--continue')
  }

  if (config.dangerouslySkipPermissions) {
    parts.push('--dangerously-skip-permissions')
  }

  if (config.model) {
    parts.push('--model', config.model)
  }

  if (config.systemPrompt && !resume) {
    const escaped = config.systemPrompt.replace(/"/g, '\\"')
    parts.push('--system-prompt', `"${escaped}"`)
  }

  if (config.allowedTools && config.allowedTools.length > 0) {
    parts.push('--allowed-tools', config.allowedTools.join(','))
  }

  if (config.maxTurns) {
    parts.push('--max-turns', String(config.maxTurns))
  }

  if (config.customFlags) {
    parts.push(...config.customFlags)
  }

  return parts.join(' ')
}

export function buildGeminiCommand(config: GeminiConfig, resume?: boolean): string {
  const parts = ['gemini']

  if (resume) {
    parts.push('--resume', 'latest')
  }

  if (config.model) {
    parts.push('-m', config.model)
  }

  if (config.yolo) {
    parts.push('--approval-mode=yolo')
  }

  if (config.sandbox) {
    parts.push('--sandbox')
  }

  if (config.debug) {
    parts.push('--debug')
  }

  if (config.customFlags) {
    parts.push(...config.customFlags)
  }

  return parts.join(' ')
}

export function buildCodexCommand(config: CodexConfig, resume?: boolean): string {
  if (resume) {
    return 'codex resume --last'
  }

  const parts = ['codex']

  if (config.model) {
    parts.push('--model', config.model)
  }

  if (config.fullAuto) {
    parts.push('--full-auto')
  }

  if (config.sandbox) {
    parts.push('--sandbox', config.sandbox)
  }

  if (config.customFlags) {
    parts.push(...config.customFlags)
  }

  return parts.join(' ')
}

export function buildCommand(agent: Agent, resume?: boolean): string {
  const provider = resolveProvider(agent)
  if (provider === 'gemini') {
    return buildGeminiCommand(agent.geminiConfig || {}, resume)
  }
  if (provider === 'codex') {
    return buildCodexCommand(agent.codexConfig || {}, resume)
  }
  return buildClaudeCommand(agent.claudeConfig, resume)
}

/**
 * Build the launch command string — bare CLI command, no install wrappers.
 * Install/update is a separate one-time action from Settings.
 */
export function buildLaunchCommand(agent: Agent, resume?: boolean): string {
  return buildCommand(agent, resume)
}

export function resolveProvider(agent: Agent): Provider {
  return agent.provider || 'claude'
}

export function getProviderLabel(provider: Provider): string {
  if (provider === 'gemini') return 'Gemini'
  if (provider === 'codex') return 'Codex'
  return 'Claude'
}

export function getProviderColor(provider: Provider): string {
  if (provider === 'gemini') return '#4285f4'
  if (provider === 'codex') return '#10a37f'
  return '#a855f7'
}

export function getProviderEmoji(provider: Provider): string {
  if (provider === 'gemini') return '\u2726'
  if (provider === 'codex') return '\uD83E\uDD16'
  return '\uD83D\uDC7B'
}
