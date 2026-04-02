import { Agent, ClaudeConfig, GeminiConfig, CodexConfig, Provider } from './types'
import { useSettingsStore } from '../stores/settingsStore'

export interface ModelDef {
  id: string
  name: string
  badge: string
  color: string
}

export const CODEX_CLI_DEFAULT_MODEL_ID = 'codex-cli-default'

export const CLAUDE_MODELS: ModelDef[] = [
  { id: 'claude-opus-4-6', name: 'Opus 4.6', badge: 'Latest Known', color: '#f59e0b' },
  { id: 'claude-sonnet-4-6', name: 'Sonnet 4.6', badge: 'Stable', color: '#a855f7' },
  { id: 'claude-haiku-4-5-20251001', name: 'Haiku 4.5', badge: 'Fastest', color: '#22d3ee' },
]

export const GEMINI_MODELS: ModelDef[] = [
  { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash', badge: 'Latest Known', color: '#1a73e8' },
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', badge: 'Most Capable', color: '#4285f4' },
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', badge: 'Recommended', color: '#34a853' },
  { id: 'gemini-2.5-flash-lite', name: 'Flash Lite', badge: 'Fastest', color: '#fbbc04' },
]

export const CODEX_MODELS: ModelDef[] = [
  { id: CODEX_CLI_DEFAULT_MODEL_ID, name: 'Latest (CLI Default)', badge: 'Recommended', color: '#10a37f' },
  { id: 'gpt-5.3-codex', name: 'GPT-5.3 Codex', badge: 'Legacy', color: '#0d8c6d' },
  { id: 'gpt-5.3-codex-spark', name: 'Codex Spark', badge: 'Fastest', color: '#19c37d' },
  { id: 'codex-mini-latest', name: 'Codex Mini', badge: 'Mini', color: '#0d8c6d' },
  { id: 'o3', name: 'o3', badge: 'Reasoning', color: '#6e44ff' },
]

export function isCodexCliDefaultModel(modelId?: string): boolean {
  if (!modelId) return false
  const normalized = modelId.trim().toLowerCase()
  return (
    normalized === CODEX_CLI_DEFAULT_MODEL_ID
    || normalized === 'auto'
    || normalized === 'latest'
  )
}

export function getModelsForProvider(provider: Provider): ModelDef[] {
  if (provider === 'gemini') return GEMINI_MODELS
  if (provider === 'codex') return CODEX_MODELS
  return CLAUDE_MODELS
}

export function resolveModelsForProvider(
  provider: Provider,
  discoveredModels?: ModelDef[] | null,
  selectedModelId?: string,
): ModelDef[] {
  const baseModels =
    Array.isArray(discoveredModels) && discoveredModels.length > 0
      ? discoveredModels
      : getModelsForProvider(provider)

  const trimmedSelectedModel = selectedModelId?.trim()
  if (!trimmedSelectedModel) return baseModels
  if (baseModels.some((model) => model.id === trimmedSelectedModel)) return baseModels

  if (provider === 'codex' && isCodexCliDefaultModel(trimmedSelectedModel)) {
    return [
      {
        id: CODEX_CLI_DEFAULT_MODEL_ID,
        name: 'Latest (CLI Default)',
        badge: 'Recommended',
        color: getProviderColor(provider),
      },
      ...baseModels,
    ]
  }

  return [
    {
      id: trimmedSelectedModel,
      name: trimmedSelectedModel,
      badge: 'Custom',
      color: getProviderColor(provider),
    },
    ...baseModels,
  ]
}

export function getDefaultModel(provider: Provider): string {
  if (provider === 'gemini') return 'gemini-3-flash-preview'
  if (provider === 'codex') return CODEX_CLI_DEFAULT_MODEL_ID
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

function quoteCliToken(command: string): string {
  const trimmed = command.trim()
  if (!trimmed) return trimmed
  return /\s/.test(trimmed) ? `"${trimmed}"` : trimmed
}

function resolveCliCommand(provider: Provider): string {
  const settings = useSettingsStore.getState()
  if (provider === 'gemini') return settings.geminiCliPath.trim() || 'gemini'
  if (provider === 'codex') return settings.codexCliPath.trim() || 'codex'
  return settings.claudeCliPath.trim() || 'claude'
}

export function buildClaudeCommand(config: ClaudeConfig, resume?: boolean): string {
  const parts = [quoteCliToken(resolveCliCommand('claude'))]

  if (resume) {
    parts.push('--continue')
  }

  if (config.dangerouslySkipPermissions) {
    parts.push('--dangerously-skip-permissions')
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
  const parts = [quoteCliToken(resolveCliCommand('gemini'))]

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
    return `${quoteCliToken(resolveCliCommand('codex'))} resume --last`
  }

  const parts = [quoteCliToken(resolveCliCommand('codex'))]
  // Always let Codex CLI pick its default/latest model unless the user explicitly
  // passes --model through customFlags.

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
  if (provider === 'gemini') return '#3b82f6' // Lighter, sleeker blue
  if (provider === 'codex') return '#10b981' // More vibrant, modern emerald green
  return '#a855f7' // Purple
}

/**
 * Known provider context windows used for UI ratios when the CLI does not expose one directly.
 * Return 0 when the provider limit is unknown so the UI does not invent a percentage.
 */
export function getKnownContextWindow(provider: Provider): number {
  if (provider === 'claude') return 200000
  return 0
}

export function getProviderEmoji(provider: Provider): string {
  if (provider === 'gemini') return '\u2726'
  if (provider === 'codex') return '\uD83E\uDD16'
  return '\uD83D\uDC7B'
}

/**
 * Parse raw CLI output into ModelDef[] for a given provider.
 * Each CLI has different output formats — we try common patterns.
 * Returns empty array if parsing fails (caller falls back to hardcoded).
 */
export function parseDiscoveredModels(provider: Provider, raw: string): ModelDef[] {
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean)
  if (lines.length === 0) return []

  const models: ModelDef[] = []
  const seen = new Set<string>()

  if (provider === 'claude') {
    // Claude CLI `claude models` may output model IDs, one per line or in a table
    // Patterns: "claude-opus-4-6", "claude-sonnet-4-6  (recommended)", table rows, etc.
    for (const line of lines) {
      const match = line.match(/(claude-[\w.-]+)/i)
      if (match && !seen.has(match[1])) {
        const id = match[1]
        seen.add(id)
        models.push({
          id,
          name: formatModelName(id, 'claude'),
          badge: detectBadge(line),
          color: guessModelColor(id, 'claude'),
        })
      }
    }
  } else if (provider === 'gemini') {
    // Gemini CLI may list models like "gemini-2.5-pro", "gemini-2.5-flash", etc.
    for (const line of lines) {
      const match = line.match(/(gemini[\w.-]*(?:pro|flash|ultra|lite|nano|exp)[\w.-]*|(?:pro|flash|flash-lite)\b)/i)
      if (match && !seen.has(match[1])) {
        const id = match[1]
        seen.add(id)
        models.push({
          id,
          name: formatModelName(id, 'gemini'),
          badge: detectBadge(line),
          color: guessModelColor(id, 'gemini'),
        })
      }
    }
  } else if (provider === 'codex') {
    // Codex CLI may list "gpt-5.3-codex", "o3", etc.
    for (const line of lines) {
      const match = line.match(/(gpt-[\w.-]+|o[1-9][\w.-]*|codex[\w.-]*)/i)
      if (match && !seen.has(match[1])) {
        const id = match[1]
        seen.add(id)
        models.push({
          id,
          name: formatModelName(id, 'codex'),
          badge: detectBadge(line),
          color: guessModelColor(id, 'codex'),
        })
      }
    }
  }

  return models
}

/** Format a raw model ID into a readable name */
function formatModelName(id: string, provider: Provider): string {
  if (provider === 'claude') {
    // "claude-opus-4-6" → "Opus 4.6"
    const m = id.match(/claude-(opus|sonnet|haiku)-([\d]+)(?:-([\d]+))?/i)
    if (m) {
      const family = m[1].charAt(0).toUpperCase() + m[1].slice(1)
      const ver = m[3] ? `${m[2]}.${m[3]}` : m[2]
      return `${family} ${ver}`
    }
    return id.replace(/^claude-/, '').replace(/-/g, ' ')
  }
  if (provider === 'gemini') {
    // "gemini-3.1-pro-preview" → "Gemini 3.1 Pro"
    return id
      .replace(/^gemini-?/i, 'Gemini ')
      .replace(/-preview$/, '')
      .replace(/-/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim()
  }
  if (provider === 'codex') {
    return id
      .replace(/-/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim()
  }
  return id
}

/** Detect a badge/label hint from the CLI output line */
function detectBadge(line: string): string {
  const lower = line.toLowerCase()
  if (lower.includes('recommend')) return 'Recommended'
  if (lower.includes('default')) return 'Default'
  if (lower.includes('fastest') || lower.includes('fast')) return 'Fast'
  if (lower.includes('stable')) return 'Stable'
  if (lower.includes('capable')) return 'Most Capable'
  if (lower.includes('preview')) return 'Preview'
  if (lower.includes('reason')) return 'Reasoning'
  if (lower.includes('experimental') || lower.includes('exp')) return 'Experimental'
  return ''
}

/** Assign a color based on model tier */
function guessModelColor(id: string, provider: Provider): string {
  const lower = id.toLowerCase()
  if (provider === 'claude') {
    if (lower.includes('opus')) return '#f59e0b'
    if (lower.includes('sonnet')) return '#a855f7'
    if (lower.includes('haiku')) return '#22d3ee'
    return '#a855f7'
  }
  if (provider === 'gemini') {
    if (lower.includes('pro')) return '#4285f4'
    if (lower.includes('ultra')) return '#1a73e8'
    if (lower.includes('flash-lite') || lower.includes('lite')) return '#fbbc04'
    if (lower.includes('flash')) return '#34a853'
    return '#4285f4'
  }
  if (provider === 'codex') {
    if (lower.includes('spark') || lower.includes('fast')) return '#19c37d'
    if (lower.includes('o3') || lower.includes('o4')) return '#6e44ff'
    return '#10a37f'
  }
  return '#888'
}
