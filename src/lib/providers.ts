import { Agent, ClaudeConfig, GeminiConfig, Provider } from './types'

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

export function getModelsForProvider(provider: Provider): ModelDef[] {
  return provider === 'gemini' ? GEMINI_MODELS : CLAUDE_MODELS
}

export function getDefaultModel(provider: Provider): string {
  return provider === 'gemini' ? 'flash' : 'claude-opus-4-6'
}

/**
 * Get the install command for a CLI provider.
 * These are meant to be run once from Settings, not on every launch.
 */
export function getInstallCommand(provider: Provider): string {
  if (provider === 'gemini') return 'npm install -g @google/gemini-cli'
  return 'npm install -g @anthropic-ai/claude-code'
}

/**
 * Get the update command (reinstall latest) for a CLI provider.
 */
export function getUpdateCommand(provider: Provider): string {
  if (provider === 'gemini') return 'npm install -g @google/gemini-cli@latest'
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

export function buildCommand(agent: Agent, resume?: boolean): string {
  const provider = resolveProvider(agent)
  if (provider === 'gemini') {
    return buildGeminiCommand(agent.geminiConfig || {}, resume)
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
  return provider === 'gemini' ? 'Gemini' : 'Claude'
}

export function getProviderColor(provider: Provider): string {
  return provider === 'gemini' ? '#4285f4' : '#a855f7'
}

export function getProviderEmoji(provider: Provider): string {
  return provider === 'gemini' ? '\u2726' : '\uD83D\uDC7B'
}
