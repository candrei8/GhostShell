import { Provider } from './types'

const RESET = '\x1b[0m'
const BOLD = '\x1b[1m'
const DIM = '\x1b[2m'

const PROVIDER_ACCENTS: Record<Provider, string> = {
  claude: '\x1b[95m',
  gemini: '\x1b[94m',
  codex: '\x1b[92m',
}

const INFO = '\x1b[96m'
const WARN = '\x1b[93m'
const ERROR = '\x1b[91m'
const SUCCESS = '\x1b[92m'
const NEUTRAL = '\x1b[97m'
const MUTED = '\x1b[90m'
const INFO_BG = '\x1b[48;5;24m'
const WARN_BG = '\x1b[48;5;130m'
const ERROR_BG = '\x1b[48;5;52m'
const SUCCESS_BG = '\x1b[48;5;22m'
const CLAUDE_BG = '\x1b[48;5;54m'
const GEMINI_BG = '\x1b[48;5;24m'
const CODEX_BG = '\x1b[48;5;22m'

const ANSI_PATTERN = /\x1b\[[0-9;]*[A-Za-z]/
const ACTION_PATTERN = /\b(Reading|Read|Writing|Wrote|Creating|Created|Editing|Edited|Patching|Updating|Updated|Searching|Grepping|Running|Executing|Applying|Analyzing|Thinking|TaskCreate|TaskUpdate|WebSearch|WebFetch|ShellTool|ReadFileTool|WriteFileTool|EditTool|Bash)\b/g
const TOOL_PATTERN = /\b(readFile|writeFile|read_file|write_file|apply_patch|patch|shell_command|WebSearchTool|WebFetch|TaskCreate|TaskUpdate)\b/g
const CONTEXT_PATTERN = /(\d+(?:\.\d+)?%\s*context|\d+(?:,\d+)*(?:\.\d+)?[kKmM]?\s*tokens?|\$[0-9]+(?:\.\d+)?|Turn\s+\d+)/gi
const ERROR_PATTERN = /\b(error|failed|exception|traceback|not found|denied|CommandNotFoundException)\b/gi
const SUCCESS_PATTERN = /\b(completed|finished|done|ready|saved)\b/gi
const QUOTED_PATH_PATTERN = /(`[^`\n]+`|"[^"\n]+")/g
const SUB_AGENT_PATTERN = /\b(sub-agent|delegate|delegating|spawn(?:ing|ed)?|launch(?:ing|ed)?)\b/i
const CONTEXT_LINE_PATTERN = /^Context:\s/i
const PROMPT_PATTERN = /^(claude|gemini|codex)>\s*$/i
const ACTION_LINE_PATTERN = /\b(Reading|Read|Writing|Wrote|Creating|Created|Editing|Edited|Patching|Updating|Updated|Searching|Grepping|Running|Executing|Applying|Analyzing|Thinking|TaskCreate|TaskUpdate|WebSearch|WebFetch|ShellTool|ReadFileTool|WriteFileTool|EditTool|Bash)\b/i
const TOOL_LINE_PATTERN = /\b(readFile|writeFile|read_file|write_file|apply_patch|patch|shell_command|WebSearchTool|WebFetch|TaskCreate|TaskUpdate)\b/i
const CONTEXT_LINE_VALUE_PATTERN = /(\d+(?:\.\d+)?%\s*context|\d+(?:,\d+)*(?:\.\d+)?[kKmM]?\s*tokens?|\$[0-9]+(?:\.\d+)?|Turn\s+\d+)/i

function wrap(text: string, color: string): string {
  return `${color}${text}${RESET}`
}

export type TerminalOutputEnhancementMode = 'off' | 'balanced' | 'vivid'

type HighlightKind =
  | 'prompt'
  | 'system'
  | 'subAgent'
  | 'context'
  | 'muted'
  | 'error'
  | 'success'
  | 'action'
  | null

function getProviderBackground(provider: Provider): string {
  if (provider === 'gemini') return GEMINI_BG
  if (provider === 'codex') return CODEX_BG
  return CLAUDE_BG
}

function detectHighlightKind(trimmed: string): HighlightKind {
  if (PROMPT_PATTERN.test(trimmed) || trimmed === '>') return 'prompt'
  if (/\[GhostShell\]/.test(trimmed)) return 'system'
  if (SUB_AGENT_PATTERN.test(trimmed)) return 'subAgent'
  if (CONTEXT_LINE_PATTERN.test(trimmed) || CONTEXT_LINE_VALUE_PATTERN.test(trimmed)) return 'context'
  if (/^\[(?:Process exited|Failed to create terminal process)\]/.test(trimmed)) return 'muted'
  if (/\b(error|failed|exception|traceback|not found|denied)\b/i.test(trimmed)) return 'error'
  if (/\b(completed|finished|done)\b/i.test(trimmed) && /\b(task|sub-agent|agent)\b/i.test(trimmed)) return 'success'
  if (ACTION_LINE_PATTERN.test(trimmed) || TOOL_LINE_PATTERN.test(trimmed)) return 'action'
  return null
}

function wrapImportantLine(line: string, provider: Provider, kind: Exclude<HighlightKind, null>, mode: TerminalOutputEnhancementMode): string {
  if (mode === 'balanced') {
    if (kind === 'prompt') return wrap(line, `${BOLD}${PROVIDER_ACCENTS[provider]}`)
    if (kind === 'system' || kind === 'context') return wrap(line, `${BOLD}${INFO}`)
    if (kind === 'subAgent') return wrap(line, `${BOLD}${WARN}`)
    if (kind === 'muted') return wrap(line, MUTED)
    if (kind === 'error') return wrap(line, `${BOLD}${ERROR}`)
    if (kind === 'success') return wrap(line, `${BOLD}${SUCCESS}`)
    if (kind === 'action') return wrap(line, `${BOLD}${PROVIDER_ACCENTS[provider]}`)
    return line
  }

  if (kind === 'prompt') return wrap(line, `${BOLD}${getProviderBackground(provider)}${NEUTRAL}`)
  if (kind === 'system' || kind === 'context') return wrap(line, `${BOLD}${INFO_BG}${NEUTRAL}`)
  if (kind === 'subAgent') return wrap(line, `${BOLD}${WARN_BG}${NEUTRAL}`)
  if (kind === 'muted') return wrap(line, `${DIM}${MUTED}`)
  if (kind === 'error') return wrap(line, `${BOLD}${ERROR_BG}${NEUTRAL}`)
  if (kind === 'success') return wrap(line, `${BOLD}${SUCCESS_BG}${NEUTRAL}`)
  if (kind === 'action') return wrap(line, `${BOLD}${getProviderBackground(provider)}${NEUTRAL}`)
  return line
}

function enhanceInlineTokens(line: string, provider: Provider, mode: TerminalOutputEnhancementMode): string {
  const accent = PROVIDER_ACCENTS[provider]
  const contextColor = mode === 'vivid' ? `${BOLD}${INFO}` : `${BOLD}${INFO}`
  const pathColor = mode === 'vivid' ? `${BOLD}${NEUTRAL}` : NEUTRAL

  let next = line
  next = next.replace(ACTION_PATTERN, (match) => wrap(match, `${BOLD}${accent}`))
  next = next.replace(TOOL_PATTERN, (match) => wrap(match, `${BOLD}${accent}`))
  next = next.replace(CONTEXT_PATTERN, (match) => wrap(match, contextColor))
  next = next.replace(QUOTED_PATH_PATTERN, (match) => wrap(match, pathColor))
  next = next.replace(ERROR_PATTERN, (match) => wrap(match, `${BOLD}${ERROR}`))
  next = next.replace(SUCCESS_PATTERN, (match) => wrap(match, `${BOLD}${SUCCESS}`))
  return next
}

function enhanceLine(line: string, provider: Provider, mode: TerminalOutputEnhancementMode): string {
  if (!line.trim()) return line
  // Skip ANY line containing escape sequences — covers CSI (\x1b[...), DEC private
  // modes (\x1b[?...), charset switches (\x1b(...), and all other ESC-based sequences.
  // The old ANSI_PATTERN only matched CSI, missing \x1b[?25l, \x1b[?1049h, etc.
  if (line.includes('\x1b')) return line

  const trimmed = line.trim()

  const enhanced = enhanceInlineTokens(line, provider, mode)
  const kind = detectHighlightKind(trimmed)
  if (!kind) return enhanced

  if ((kind === 'prompt' && PROMPT_PATTERN.test(trimmed)) || (provider === 'codex' && trimmed === '>')) {
    return line.replace(trimmed, wrapImportantLine(trimmed, provider, 'prompt', mode))
  }

  return wrapImportantLine(enhanced, provider, kind, mode)
}

export function enhanceTerminalOutput(
  rawChunk: string,
  provider?: Provider,
  mode: TerminalOutputEnhancementMode = 'balanced',
): string {
  if (mode === 'off') return rawChunk
  if (!provider || !rawChunk.trim()) return rawChunk
  if (rawChunk.includes('\x1b]')) return rawChunk
  if (rawChunk.includes('\r') && !rawChunk.includes('\n')) return rawChunk

  const parts = rawChunk.split(/(\r\n|\n)/)
  return parts
    .map((part) => (part === '\n' || part === '\r\n' ? part : enhanceLine(part, provider, mode)))
    .join('')
}
