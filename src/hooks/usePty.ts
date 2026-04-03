import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { useAgentStore } from '../stores/agentStore'
import { useTerminalStore } from '../stores/terminalStore'
import { useNotificationStore } from '../stores/notificationStore'
import { useActivityStore } from '../stores/activityStore'
import { useCompanionStore } from '../stores/companionStore'
import { useCommandBlockStore, type CommandBlock, type CommandBlockStatus } from '../stores/commandBlockStore'
import { useSettingsStore, type NotificationTimingMode } from '../stores/settingsStore'
import { buildLaunchCommand, resolveProvider, getInstallCommand, getProviderLabel, getKnownContextWindow } from '../lib/providers'
import { createBatchParser, stripAnsi } from '../lib/claude-output-parser'
import { enhanceTerminalOutput } from '../lib/terminalOutputEnhancer'
import { createTerminalImageLabelRegistry } from '../lib/terminalImageLabels'
import { normalizeTerminalPasteText, shouldCaptureStructuredTextInsertion } from '../lib/terminalTextInput'
import { SHORTCUT_EVENTS } from '../lib/shortcutEvents'
import { Provider, SubAgentOutputLine } from '../lib/types'
import { detectDomain } from '../lib/domain-detector'
import { reportAgentOutput } from '../lib/swarm-message-injector'
import { feedAgentOutput } from '../lib/swarm-self-heal'
import { registerPromptSubmission } from '../lib/terminalPromptSubmission'
import { emitSwarmActivity } from '../lib/swarm-activity-emitter'

interface UsePtyOptions {
  sessionId: string
  terminal: Terminal | null
  cwd?: string
  shell?: string
  agentId?: string
  autoLaunch?: boolean
  readOnly?: boolean
}

const SMART_INPUT_FOCUS_EVENT = 'ghostshell:focus-command-bar'

// Detect CWD from PowerShell/bash prompt patterns
const PS_CWD_REGEX = /PS\s+([A-Z]:\\[^\r\n>]*?)>/
const BASH_CWD_REGEX = /:\s*([~\/][^\$\r\n]*?)\s*\$/

// Detect when Claude CLI is waiting for user input (idle prompt)
const CLAUDE_IDLE_PATTERNS = [
  />\s*$/,
  /\$ $/,
  /PS [A-Z]:\\[^>]*>\s*$/,
]

// Detect Claude CLI confirmation prompts that should be auto-confirmed
const CLAUDE_AUTO_CONFIRM_PATTERNS = [
  /clear.*context.*\(y\/n\)/i,
  /bypass.*\(y\/n\)/i,
  /Do you want to proceed\?.*\(y\/n\)/i,
  /Continue\?.*\(y\/n\)/i,
  /\(y\)es.*\(n\)o/i,
  /Has the issue been fixed\?.*\(y\/n\)/i,
  /Do you want to.*\?.*\(y\/n\)/i,
  /\? \(Y\/n\)/,
  /\? \(y\/N\)/,
]

// Detect when Claude CLI is actively working
const CLAUDE_WORKING_PATTERNS = [
  /\u280B/,
  /\u2819/,
  /\u2838/,
  /\u2834/,
  /\u2826/,
  /\u2807/,
  /\u280B|\u2819|\u2839|\u2838|\u283C|\u2834|\u2826|\u2827|\u2807|\u280F/,
  /Thinking/,
  /Reading/,
  /Writing/,
  /Editing/,
  /Searching/,
  /Running/,
]

// --- Gemini CLI patterns ---
// Note: Gemini's banner and UI uses decorative sparkle and > characters liberally.
// Patterns must be specific enough to avoid matching static UI elements.
const GEMINI_IDLE_PATTERNS = [
  /gemini>\s*$/,              // Gemini's actual input prompt
  /\$ $/,                     // bash prompt
  /PS [A-Z]:\\[^>]*>\s*$/,   // PowerShell prompt
]

const GEMINI_AUTO_CONFIRM_PATTERNS = [
  /\(Y\/n\)/,
  /\(y\/n\)/i,
  /Do you want to proceed/i,
]

const GEMINI_WORKING_PATTERNS = [
  /\u280B|\u2819|\u2839|\u2838|\u283C|\u2834|\u2826|\u2827|\u2807|\u280F/, // Braille spinner characters (reliable)
  /\u280B|\u2819|\u2838|\u2834|\u2826|\u2807/, // More braille spinners
  /Generating\.\.\./,        // "Generating..." with ellipsis
  /Thinking\.\.\./,          // "Thinking..." with ellipsis
  /Reading file/i,           // Specific tool actions
  /Writing to/i,
  /Editing file/i,
  /Searching/i,
  /Running command/i,
]

// --- Codex CLI patterns ---
const CODEX_IDLE_PATTERNS = [
  /codex>\s*$/,              // Codex's input prompt (legacy)
  /^>\s*$/m,                 // Codex CLI prompt
  /\$ $/,                     // bash prompt
  /PS [A-Z]:\\[^>]*>\s*$/,   // PowerShell prompt
]

const CODEX_AUTO_CONFIRM_PATTERNS = [
  /\(Y\/n\)/,
  /\(y\/n\)/i,
]

const CODEX_WORKING_PATTERNS = [
  /\u280B|\u2819|\u2839|\u2838|\u283C|\u2834|\u2826|\u2827|\u2807|\u280F/, // Braille spinner characters
  /\u280B|\u2819|\u2838|\u2834|\u2826|\u2807/, // More braille spinners
  /Thinking/,
  /Reading/,
  /Writing/,
  /Running/,
  /Searching/,
  /Executing/,
  /Applying/,
  /Analyzing/,
  /read_file|write_file|apply_patch|shell_command/,
]

const POWERSHELL_COMMAND_PROMPT = /(?:^|\n)PS [A-Z]:\\[^>\n\r]*>\s*$/i
const POSIX_COMMAND_PROMPT = /(?:^|\n)(?:[^\n\r]+@[^:\n\r]+:)?[~\/][^\n\r]*[$#]\s*$/
const NAMED_CLI_COMMAND_PROMPT = /(?:^|\n)(?:codex|gemini|claude)>\s*$/i
const PLAIN_CLI_COMMAND_PROMPT = /(?:^|\n)>\s*$/
const CONFIRMATION_CONTEXT_PATTERN = /\b(?:allow|deny|approve|permission|continue|proceed|confirm|bypass|fixed)\b/i

// Detect "command not found" errors; returns the binary name if matched, null otherwise
function detectCliNotFound(data: string): 'gemini' | 'claude' | 'codex' | null {
  // PowerShell patterns: "'gemini' is not recognized" / "'gemini' no se reconoce"
  const psMatch = data.match(/['"]?(gemini|claude|codex)['"]?\s*:\s*(?:.*(?:is not recognized|no se reconoce|CommandNotFoundException))/i)
  if (psMatch) return psMatch[1].toLowerCase() as 'gemini' | 'claude' | 'codex'
  // Bash/zsh: "gemini: command not found" / "gemini: not found"
  const bashMatch = data.match(/(gemini|claude|codex)\s*:\s*(?:command\s+)?not found/i)
  if (bashMatch) return bashMatch[1].toLowerCase() as 'gemini' | 'claude' | 'codex'
  return null
}

function detectProviderFromCommand(command: string): Provider | null {
  const tokens = command.trim().match(/"[^"]+"|'[^']+'|\S+/g)
  if (!tokens || tokens.length === 0) return null

  const candidates: string[] = []
  if (/^(?:npx|pnpm|bunx|yarn)$/i.test(tokens[0]) && tokens[1]) {
    candidates.push(tokens[1])
  }
  candidates.push(tokens[0])

  for (const token of candidates) {
    const normalized = token.replace(/^['"]|['"]$/g, '')
    const base = normalized.split(/[\\/]/).pop() || normalized
    const match = /^(claude|gemini|codex)(?:\.cmd|\.exe)?$/i.exec(base)
    if (match) {
      return match[1].toLowerCase() as Provider
    }
  }

  return null
}

function detectProviderFromOutput(data: string): Provider | null {
  const promptMatch = data.match(/(?:^|\n)\s*(claude|gemini|codex)>\s*$/im)
  if (promptMatch) {
    return promptMatch[1].toLowerCase() as Provider
  }
  return null
}

function getWorkingPatterns(provider: Provider): RegExp[] {
  if (provider === 'gemini') return GEMINI_WORKING_PATTERNS
  if (provider === 'codex') return CODEX_WORKING_PATTERNS
  return CLAUDE_WORKING_PATTERNS
}

function getIdlePatterns(provider: Provider): RegExp[] {
  if (provider === 'gemini') return GEMINI_IDLE_PATTERNS
  if (provider === 'codex') return CODEX_IDLE_PATTERNS
  return CLAUDE_IDLE_PATTERNS
}

function getAutoConfirmPatterns(provider: Provider): RegExp[] {
  if (provider === 'gemini') return GEMINI_AUTO_CONFIRM_PATTERNS
  if (provider === 'codex') return CODEX_AUTO_CONFIRM_PATTERNS
  return CLAUDE_AUTO_CONFIRM_PATTERNS
}

function getNativeMultilineSequence(provider: Provider): string {
  // Claude Code: ESC + CR (Alt/Option+Enter) inserts a newline without submit.
  // The old approach (\\ + CR) showed a visible backslash and caused double
  // newlines on Windows because the PTY CR echo stacked with the CLI's own
  // continuation newline.
  // Codex / Gemini: raw LF (Ctrl+J) inserts a newline without submit.
  if (provider === 'claude') return '\x1b\r'
  return '\n'
}

function getCommandCompletionPromptPatterns(provider: Provider): RegExp[] {
  if (provider === 'gemini') {
    return [POWERSHELL_COMMAND_PROMPT, POSIX_COMMAND_PROMPT, NAMED_CLI_COMMAND_PROMPT]
  }
  if (provider === 'codex') {
    return [POWERSHELL_COMMAND_PROMPT, POSIX_COMMAND_PROMPT, NAMED_CLI_COMMAND_PROMPT, PLAIN_CLI_COMMAND_PROMPT]
  }
  return [POWERSHELL_COMMAND_PROMPT, POSIX_COMMAND_PROMPT, NAMED_CLI_COMMAND_PROMPT, PLAIN_CLI_COMMAND_PROMPT]
}

function isLikelyPrompt(buffer: string, provider: Provider): boolean {
  const tail = buffer.replace(/\r/g, '').slice(-320)
  if (!tail.trim()) return false
  if (getAutoConfirmPatterns(provider).some((pattern) => pattern.test(tail))) return false

  const lines = tail
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0)
  const lastLine = lines[lines.length - 1] || ''
  const previousLine = lines[lines.length - 2] || ''

  if (!lastLine) return false
  if (
    lastLine === '>' &&
    (
      getAutoConfirmPatterns(provider).some((pattern) => pattern.test(previousLine)) ||
      CONFIRMATION_CONTEXT_PATTERN.test(previousLine) ||
      /[?:]\s*$/.test(previousLine)
    )
  ) {
    return false
  }

  return getCommandCompletionPromptPatterns(provider).some((pattern) => pattern.test(tail))
}

function isNativeShellPrompt(buffer: string): boolean {
  const tail = buffer.replace(/\r/g, '').slice(-320)
  if (!tail.trim()) return false
  return POWERSHELL_COMMAND_PROMPT.test(tail) || POSIX_COMMAND_PROMPT.test(tail)
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Debounce timer for idle detection
let idleTimers: Map<string, ReturnType<typeof setTimeout>> = new Map()

// Track last time a working pattern was seen per tracked activity source.
const lastWorkingPatternTime = new Map<string, number>()

// Timing constants for idle/completion detection
const IDLE_DELAY_MS = 8000
const IDLE_GRACE_MS = 5000

interface CompletionTimingProfile {
  completionDebounceMs: number
  completionGraceMs: number
  activityQuietMs: number
  minCommandRuntimeMs: number
}

const COMPLETION_TIMING_PROFILES: Record<NotificationTimingMode, CompletionTimingProfile> = {
  aggressive: {
    completionDebounceMs: 550,
    completionGraceMs: 900,
    activityQuietMs: 900,
    minCommandRuntimeMs: 500,
  },
  balanced: {
    completionDebounceMs: 1100,
    completionGraceMs: 1800,
    activityQuietMs: 1600,
    minCommandRuntimeMs: 1200,
  },
  silent: {
    completionDebounceMs: 2200,
    completionGraceMs: 3200,
    activityQuietMs: 2800,
    minCommandRuntimeMs: 4000,
  },
}

function getCompletionTimingProfile(): CompletionTimingProfile {
  const mode = useSettingsStore.getState().notificationTimingMode
  return COMPLETION_TIMING_PROFILES[mode] || COMPLETION_TIMING_PROFILES.balanced
}

function scheduleIdleCheck(activityId: string, sessionId: string, delayMs: number, agentId?: string, agentLabel?: string) {
  const existing = idleTimers.get(activityId)
  if (existing) clearTimeout(existing)

  const timer = setTimeout(() => {
    idleTimers.delete(activityId)
    const session = useTerminalStore.getState().getSession(sessionId)
    if (!session) return
    const agent = agentId ? useAgentStore.getState().getAgent(agentId) : undefined
    if (agentId && !agent) return
    const lastWorking = lastWorkingPatternTime.get(activityId) || 0
    const elapsed = Date.now() - lastWorking
    if (elapsed < delayMs) {
      scheduleIdleCheck(activityId, sessionId, delayMs - elapsed + 1000, agentId, agentLabel)
      return
    }

    if (useCommandBlockStore.getState().activeBlockBySession[sessionId]) {
      scheduleIdleCheck(activityId, sessionId, delayMs, agentId, agentLabel)
      return
    }

    const wasWorking = agentId && agent?.status === 'working'

    if (wasWorking) {
      useAgentStore.getState().setAgentStatus(agentId, 'idle')
    }

    const activityStore = useActivityStore.getState()
    activityStore.setActivity(activityId, 'idle')

    const runningSubAgents = (activityStore.activities[activityId]?.subAgents || []).filter(
      (sub) => sub.status === 'running' || sub.status === 'spawning',
    )
    for (const sub of runningSubAgents) {
      activityStore.completeSubAgent(activityId, sub.id)
    }
  }, delayMs)

  idleTimers.set(activityId, timer)
}

function cancelIdleCheck(activityId: string) {
  const existing = idleTimers.get(activityId)
  if (existing) {
    clearTimeout(existing)
    idleTimers.delete(activityId)
  }
}

export function usePty({ sessionId, terminal, cwd, shell, agentId, autoLaunch, readOnly = false }: UsePtyOptions) {
  const connectedRef = useRef(false)
  const readOnlyRef = useRef(readOnly)

  useEffect(() => {
    readOnlyRef.current = readOnly
  }, [readOnly])

  useEffect(() => {
    if (!terminal || connectedRef.current || !window.ghostshell) return

    connectedRef.current = true
    useCompanionStore.getState().initSession(sessionId)
    const cleanups: (() => void)[] = []
    const { setAgentStatus, getAgent, updateAgent } = useAgentStore.getState()
    let cancelled = false
    const hasLiveSession = () => !!useTerminalStore.getState().getSession(sessionId)
    const withTerminal = (callback: (term: Terminal) => void) => {
      if (cancelled) return
      try {
        callback(terminal)
      } catch {
        // Late PTY/xterm events can race with tab teardown.
      }
    }

    let lastDetectedCwd = cwd || ''

    // Determine the tracked activity source for this terminal.
    const agent = agentId ? getAgent(agentId) : undefined
    const session = useTerminalStore.getState().getSession(sessionId)
    const activityId = agentId || sessionId
    const agentName = agent?.name || session?.title || 'Terminal'
    let currentProvider: Provider = agent ? resolveProvider(agent) : session?.detectedProvider || 'claude'
    const imageLabels = createTerminalImageLabelRegistry()

    function quotePath(filePath: string): string {
      return filePath.includes(' ') ? `"${filePath}"` : filePath
    }

    function isImagePath(filePath: string): boolean {
      return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(filePath)
    }

    function setStandaloneProvider(nextProvider?: Provider) {
      if (agentId) return
      if (currentProvider === nextProvider && useTerminalStore.getState().getSession(sessionId)?.detectedProvider === nextProvider) {
        return
      }
      currentProvider = nextProvider || 'claude'
      useTerminalStore.getState().updateSession(sessionId, { detectedProvider: nextProvider })
      useActivityStore.getState().updateContextMetrics(activityId, {
        maxTokens: nextProvider ? getKnownContextWindow(nextProvider) : 0,
      })
    }

    function isInteractiveProviderSession(): boolean {
      if (agentId) return true
      return !!useTerminalStore.getState().getSession(sessionId)?.detectedProvider
    }

    // Track active subagent IDs for completion detection
    let lastSubAgentId: string | null = null

    // Line accumulator for sub-agent output capture
    let lineBuffer = ''
    let pendingOutputLines: SubAgentOutputLine[] = []
    let outputFlushTimer: ReturnType<typeof setTimeout> | null = null
    const OUTPUT_FLUSH_MS = 200
    let companionLineBuffer = ''
    let lastContextSummary = ''
    let lastSubAgentSignature = ''
    let lastSubAgentStartedAt = 0
    const SUBAGENT_SPAWN_DEDUPE_MS = 1200
    let promptTail = ''
    let completionCheckTimer: ReturnType<typeof setTimeout> | null = null
    let completionCandidateTail = ''
    let autoConfirmPendingUntil = 0
    let pendingDisplayEcho = ''

    function shortenCommand(command: string): string {
      const trimmed = command.trim().replace(/\s+/g, ' ')
      if (!trimmed) return 'No command details'
      if (trimmed.length <= 96) return trimmed
      return `${trimmed.slice(0, 93)}...`
    }

    function clearCompletionCheck() {
      if (completionCheckTimer) {
        clearTimeout(completionCheckTimer)
        completionCheckTimer = null
      }
      completionCandidateTail = ''
    }

    function sanitizeReadOnlyDisplay(rawChunk: string): string {
      if (!readOnlyRef.current || !rawChunk) return rawChunk

      let nextChunk = rawChunk

      if (pendingDisplayEcho) {
        const echoPattern = new RegExp(
          `(?:^|\\r?\\n)(?:PS [^\\n\\r>]*>\\s*|(?:codex|gemini|claude)>\\s*|>\\s*|(?:[^\\n\\r]+@[^:\\n\\r]+:)?[~\\/][^\\n\\r]*[$#]\\s*)?${escapeRegex(pendingDisplayEcho)}(?:\\r?\\n)?`,
          'i',
        )
        const strippedEcho = nextChunk.replace(echoPattern, (match, offset) => (offset === 0 ? '' : '\n'))
        if (strippedEcho !== nextChunk) {
          nextChunk = strippedEcho
          pendingDisplayEcho = ''
        }
      }

      return nextChunk.replace(
        /(?:\r?\n)?(?:PS [A-Z]:\\[^>\n\r]*>\s*|(?:[^\n\r]+@[^:\n\r]+:)?[~\/][^\n\r]*[$#]\s*|(?:codex|gemini|claude)>\s*|>\s*)$/i,
        '',
      )
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    function notifyCommandCompletion(block: CommandBlock) {
      if (block.status !== 'success') return

      const profile = getCompletionTimingProfile()
      const runtimeMs = block.durationMs || 0
      if (runtimeMs < profile.minCommandRuntimeMs) return

      const appFocused = typeof document !== 'undefined' ? document.hasFocus() : false
      const tier = appFocused ? 'toast' : 'full'
      const source = agentName || 'Terminal'

      useNotificationStore.getState().addNotification({
        type: 'success',
        title: `${source} finished`,
        message: shortenCommand(block.command),
        source,
        duration: 5000,
        tier,
        dedupeKey: `command-complete:${sessionId}:${block.id}`,
        dedupeWindowMs: 5000,
      })
    }

    function finalizeActiveBlock(
      status?: Exclude<CommandBlockStatus, 'running'>,
      notify = true,
    ) {
      clearCompletionCheck()
      autoConfirmPendingUntil = 0
      pendingDisplayEcho = ''
      const completed = useCommandBlockStore.getState().finishActiveBlock(sessionId, status)
      if (notify && completed) {
        notifyCommandCompletion(completed)
      }
      return completed
    }

    function trackCommandSubmission(rawCommand: string) {
      const command = rawCommand.trim()
      if (!command) return

      const detectedCommandProvider = detectProviderFromCommand(command)
      if (detectedCommandProvider) {
        setStandaloneProvider(detectedCommandProvider)
      }

      const sessionCwd =
        useTerminalStore.getState().getSession(sessionId)?.cwd ||
        lastDetectedCwd ||
        cwd ||
        ''

      autoConfirmPendingUntil = 0
      clearCompletionCheck()
      const maskedCommand = imageLabels.maskText(command)
      pendingDisplayEcho = maskedCommand.trim()
      registerPromptSubmission(sessionId, maskedCommand, sessionCwd)
      promptTail = ''
      inputBuffer = ''
    }

    function scheduleCommandCompletionCheck(promptCandidate: string) {
      clearCompletionCheck()
      const profile = getCompletionTimingProfile()
      completionCandidateTail = promptCandidate
      completionCheckTimer = setTimeout(() => {
        completionCheckTimer = null
        const activeBlockId = useCommandBlockStore.getState().activeBlockBySession[sessionId]
        if (!activeBlockId) return

        if (!isLikelyPrompt(promptTail, currentProvider) || promptTail !== completionCandidateTail) {
          completionCandidateTail = ''
          return
        }

        const now = Date.now()
        if (now < autoConfirmPendingUntil) {
          scheduleCommandCompletionCheck(promptTail)
          return
        }

        const lastWorkingAt = lastWorkingPatternTime.get(activityId) || 0
        if (now - lastWorkingAt < profile.completionGraceMs) {
          scheduleCommandCompletionCheck(promptTail)
          return
        }

        const lastActivityAt = useActivityStore.getState().activities[activityId]?.lastActivityTime || 0
        if (lastActivityAt > 0 && now - lastActivityAt < profile.activityQuietMs) {
          scheduleCommandCompletionCheck(promptTail)
          return
        }

        completionCandidateTail = ''
        finalizeActiveBlock()
      }, profile.completionDebounceMs)
    }

    function flushOutputLines() {
      if (pendingOutputLines.length > 0 && lastSubAgentId) {
        useActivityStore.getState().appendSubAgentOutput(activityId, lastSubAgentId, pendingOutputLines)
        pendingOutputLines = []
      }
      outputFlushTimer = null
    }

    function flushCompanionOutput(force = false) {
      if (force && companionLineBuffer.trim()) {
        useCompanionStore.getState().addAssistantMessage(sessionId, companionLineBuffer, currentProvider)
      }
      companionLineBuffer = ''
    }

    function accumulateCompanionOutput(rawData: string) {
      const normalized = stripAnsi(rawData)
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
      companionLineBuffer += normalized
      const lines = companionLineBuffer.split('\n')
      companionLineBuffer = lines.pop() || ''
      for (const line of lines) {
        useCompanionStore.getState().addAssistantMessage(sessionId, line, currentProvider)
      }
    }

    function accumulateOutput(rawData: string) {
      if (!lastSubAgentId) return
      lineBuffer += rawData
      const lines = lineBuffer.split('\n')
      // Keep the last incomplete line in the buffer
      lineBuffer = lines.pop() || ''
      const now = Date.now()
      for (const line of lines) {
        const stripped = stripAnsi(line).trim()
        if (stripped.length === 0) continue
        pendingOutputLines.push({ timestamp: now, text: stripped })
      }
      if (pendingOutputLines.length > 0 && !outputFlushTimer) {
        outputFlushTimer = setTimeout(flushOutputLines, OUTPUT_FLUSH_MS)
      }
    }

    // Cooldown: prevent rapid working/idle status flip-flops
    let lastWorkingSet = 0
    const WORKING_COOLDOWN_MS = 500

    // Track if we already detected CLI-not-found (show notification once)
    let cliNotFoundDetected = false

    // Create batch parser for output detection (provider-aware)
    const batchParser = createBatchParser((results) => {
      const store = useActivityStore.getState()
      const companion = useCompanionStore.getState()
      const sawSubAgentCompletion = results.some((result) => result.subAgentCompleted)
      const nextSubAgent = [...results].reverse().find((result) => result.subAgent)?.subAgent

      for (const result of results) {
        if (result.activity !== 'idle') {
          const now = Date.now()
          lastWorkingPatternTime.set(activityId, now)
          cancelIdleCheck(activityId)
          const currentAgent = agentId ? getAgent(agentId) : undefined
          if (agentId && currentAgent && currentAgent.status !== 'working' && now - lastWorkingSet > WORKING_COOLDOWN_MS) {
            setAgentStatus(agentId, 'working')
            lastWorkingSet = now
          }
          if (agentId && currentAgent && !currentAgent.hasConversation) {
            updateAgent(agentId, { hasConversation: true })
          }
          scheduleIdleCheck(activityId, sessionId, IDLE_DELAY_MS, agentId, agentName)
        }

        store.setActivity(activityId, result.activity, result.detail)
        if (result.fileTouch) {
          store.addFileTouch(activityId, result.fileTouch.path, result.fileTouch.operation)
        }
        store.addEvent(activityId, result.activity, result.tool, result.detail)
        companion.addActivityEvent(sessionId, {
          provider: currentProvider,
          activity: result.activity,
          tool: result.tool,
          detail: result.detail,
          fileTouch: result.fileTouch,
        })

        if (result.taskAction?.action === 'create' && result.taskAction.subject) {
          store.addTask(activityId, {
            agentId: activityId,
            subject: result.taskAction.subject,
            status: 'pending',
            activeForm: result.taskAction.activeForm,
          })
        }

        if (result.contextUpdate) {
          store.updateContextMetrics(activityId, {
            ...result.contextUpdate,
            maxTokens:
              typeof result.contextUpdate.maxTokens === 'number'
                ? result.contextUpdate.maxTokens
                : getKnownContextWindow(currentProvider),
          })
          const parts: string[] = []
          if (typeof result.contextUpdate.usagePercentage === 'number') {
            parts.push(`${Math.round(result.contextUpdate.usagePercentage)}% context`)
          }
          if (typeof result.contextUpdate.tokenEstimate === 'number') {
            parts.push(`${Math.round(result.contextUpdate.tokenEstimate).toLocaleString()} tokens`)
          }
          if (typeof result.contextUpdate.turnCount === 'number') {
            parts.push(`turn ${result.contextUpdate.turnCount}`)
          }
          if (typeof result.contextUpdate.costEstimate === 'number') {
            parts.push(`$${result.contextUpdate.costEstimate.toFixed(2)}`)
          }
          const summary = parts.join(' | ')
          if (summary && summary !== lastContextSummary) {
            lastContextSummary = summary
            companion.addSystemMessage(sessionId, `Context: ${summary}`, currentProvider)
          }
        }
      }

      if (sawSubAgentCompletion) {
        if (lastSubAgentId) {
          flushOutputLines()
          store.completeSubAgent(activityId, lastSubAgentId)
          lastSubAgentId = null
          lineBuffer = ''
        } else {
          const fallbackRunning = [...(store.activities[activityId]?.subAgents || [])]
            .reverse()
            .find((sub) => sub.status === 'running' || sub.status === 'spawning')
          if (fallbackRunning) {
            store.completeSubAgent(activityId, fallbackRunning.id)
          }
        }
      }

      if (nextSubAgent) {
        const now = Date.now()
        const signature = `${nextSubAgent.type}|${nextSubAgent.model || ''}|${nextSubAgent.description}`
        const isDuplicateSpawn =
          !!lastSubAgentId &&
          signature === lastSubAgentSignature &&
          now - lastSubAgentStartedAt < SUBAGENT_SPAWN_DEDUPE_MS

        if (!isDuplicateSpawn) {
          if (lastSubAgentId) {
            flushOutputLines()
            store.completeSubAgent(activityId, lastSubAgentId)
          }
          const domain = detectDomain(nextSubAgent.description)
          lastSubAgentId = store.addSubAgent(activityId, {
            agentId: activityId,
            type: nextSubAgent.type,
            description: nextSubAgent.description,
            status: 'running',
            model: nextSubAgent.model,
            domain,
          })
          lastSubAgentSignature = signature
          lastSubAgentStartedAt = now
          lineBuffer = ''
        }
      }

      // Emit activity events for swarm feed
      emitSwarmActivity(sessionId, results)
    }, 100, () => currentProvider)

    const init = async () => {
      try {
        const cols = terminal.cols || 80
        const rows = terminal.rows || 24

        // Output buffer for export (last 50K chars)
        let outputBuffer = ''
        const OUTPUT_BUFFER_MAX = 50000
        const bufferKey = `__ghostshell_output_${sessionId}`

        const createResult = await window.ghostshell.ptyCreate({
          id: sessionId,
          shell,
          cwd,
          cols,
          rows,
          provider: currentProvider,
        })
        if (!createResult.success) {
          throw new Error(createResult.error || 'Failed to create PTY process')
        }

        // PTY -> Terminal
        const removeDataListener = window.ghostshell.ptyOnData(sessionId, (data) => {
          if (cancelled || !hasLiveSession()) return

          clearCompletionCheck()
          // Report output for swarm heartbeat tracking + self-heal analysis
          reportAgentOutput(sessionId)
          feedAgentOutput(sessionId, data)
          const maskedData = imageLabels.maskText(data)
          const sanitizedDisplayData = sanitizeReadOnlyDisplay(maskedData)
          const outputEmphasis = useSettingsStore.getState().terminalOutputEmphasis
          const hasResolvedProvider = !!agentId || !!useTerminalStore.getState().getSession(sessionId)?.detectedProvider
          const bypassOutputEnhancer = currentProvider === 'gemini' || currentProvider === 'codex'
          const displayData =
            outputEmphasis === 'off' || !hasResolvedProvider || bypassOutputEnhancer
              ? sanitizedDisplayData
              : enhanceTerminalOutput(sanitizedDisplayData, currentProvider, outputEmphasis)
          let bufferBeforeWrite: Terminal['buffer']['active']
          try {
            bufferBeforeWrite = terminal.buffer.active
          } catch {
            return
          }
          const savedViewportY = bufferBeforeWrite.viewportY
          const preserveViewport =
            currentProvider === 'gemini' &&
            !data.includes('\x1b') &&
            bufferBeforeWrite.baseY - bufferBeforeWrite.viewportY > 1

          if (displayData && preserveViewport) {
            withTerminal((term) => {
              term.write(displayData, () => {
                if (cancelled || !hasLiveSession()) return
                try {
                  const bufferAfterWrite = term.buffer.active
                  const targetViewportY = Math.min(savedViewportY, bufferAfterWrite.baseY)
                  if (bufferAfterWrite.viewportY !== targetViewportY) {
                    term.scrollToLine(targetViewportY)
                  }
                } catch {
                  // Ignore writes landing after tab teardown.
                }
              })
            })
          } else if (displayData) {
            withTerminal((term) => {
              term.write(displayData)
            })
          }

          // Buffer output for export
          outputBuffer += data
          if (outputBuffer.length > OUTPUT_BUFFER_MAX) {
            outputBuffer = outputBuffer.slice(-OUTPUT_BUFFER_MAX)
          }
          ;(window as unknown as Record<string, unknown>)[bufferKey] = outputBuffer

          useCommandBlockStore.getState().appendOutput(sessionId, maskedData)
          const normalizedForPrompt = stripAnsi(data)
            .replace(/\r\n/g, '\n')
            .replace(/\r/g, '\n')
          const detectedOutputProvider = detectProviderFromOutput(normalizedForPrompt)
          if (detectedOutputProvider) {
            setStandaloneProvider(detectedOutputProvider)
          }
          promptTail = (promptTail + normalizedForPrompt).slice(-320)

          const standaloneProvider = !agentId
            ? useTerminalStore.getState().getSession(sessionId)?.detectedProvider
            : undefined
          if (standaloneProvider && isNativeShellPrompt(promptTail)) {
            setStandaloneProvider(undefined)
          }

          // Feed data to batch parser for activity detection
          batchParser.push(data)

          accumulateCompanionOutput(maskedData)

          // Accumulate output for active sub-agent
          if (lastSubAgentId) {
            accumulateOutput(maskedData)
          }

          // Track CWD from prompt output
          const psMatch = data.match(PS_CWD_REGEX)
          if (psMatch && psMatch[1]) {
            const detected = psMatch[1].trim()
            if (detected !== lastDetectedCwd) {
              lastDetectedCwd = detected
              useTerminalStore.getState().updateSession(sessionId, { cwd: detected })
              if (agentId) {
                updateAgent(agentId, { cwd: detected })
              }
            }
          } else {
            const bashMatch = data.match(BASH_CWD_REGEX)
            if (bashMatch && bashMatch[1]) {
              const detected = bashMatch[1].trim()
              if (detected !== lastDetectedCwd) {
                lastDetectedCwd = detected
                useTerminalStore.getState().updateSession(sessionId, { cwd: detected })
                if (agentId) {
                  updateAgent(agentId, { cwd: detected })
                }
              }
            }
          }

          // Auto-confirm CLI prompts (provider-aware)
          if (agentId) {
            const needsAutoConfirm = getAutoConfirmPatterns(currentProvider).some((p) => p.test(data))
            if (needsAutoConfirm) {
              autoConfirmPendingUntil = Math.max(
                autoConfirmPendingUntil,
                Date.now() + getCompletionTimingProfile().completionGraceMs + 1200,
              )
              setTimeout(() => {
                try {
                  window.ghostshell.ptyWrite(sessionId, 'y\r')
                } catch {
                  // PTY may have closed
                }
              }, 150)
            }
          }

          // Detect CLI not found and show a helpful notification once.
          if (!cliNotFoundDetected) {
            const missingBinary = detectCliNotFound(data)
            if (missingBinary) {
              cliNotFoundDetected = true
              const detectedProvider: Provider = missingBinary === 'gemini' ? 'gemini' : missingBinary === 'codex' ? 'codex' : 'claude'
              setStandaloneProvider(detectedProvider)
              const label = getProviderLabel(detectedProvider)
              const installCmd = getInstallCommand(detectedProvider)
              useActivityStore.getState().setActivity(activityId, 'idle')
              useCommandBlockStore.getState().markActiveBlockError(sessionId)
              finalizeActiveBlock('error', false)
              useCompanionStore.getState().addSystemMessage(
                sessionId,
                `${label} CLI not found. Install with: ${installCmd}`,
                currentProvider,
              )
              if (agentId) {
                setAgentStatus(agentId, 'error')
                withTerminal((term) => {
                  term.writeln('')
                  term.writeln(`\x1b[33m[GhostShell] ${label} CLI not found.\x1b[0m`)
                  term.writeln(`\x1b[33mRun this to install:\x1b[0m \x1b[36m${installCmd}\x1b[0m`)
                  term.writeln(`\x1b[33mOr go to Settings > AI Providers > Install\x1b[0m`)
                  term.writeln('')
                })
              }
            }
          }

          // Fallback activity tracking for prompt-only transitions.
          const now = Date.now()
          const isWorking = getWorkingPatterns(currentProvider).some((p) => p.test(data))

          if (isWorking && now - lastWorkingSet > WORKING_COOLDOWN_MS) {
            cancelIdleCheck(activityId)
            lastWorkingPatternTime.set(activityId, now)
            const currentAgent = agentId ? getAgent(agentId) : undefined
            if (agentId && currentAgent && currentAgent.status !== 'working') {
              setAgentStatus(agentId, 'working')
              lastWorkingSet = now
            }
            if (agentId && currentAgent && !currentAgent.hasConversation) {
              updateAgent(agentId, { hasConversation: true })
            }
            scheduleIdleCheck(activityId, sessionId, IDLE_DELAY_MS, agentId, agentName)
          }

          const isPrompt = getIdlePatterns(currentProvider).some((p) => p.test(data))
          if (isPrompt) {
            const lastWorking = lastWorkingPatternTime.get(activityId) || 0
            if (now - lastWorking > IDLE_GRACE_MS) {
              const currentAgent = agentId ? getAgent(agentId) : undefined
              if (!agentId || currentAgent?.status === 'working') {
                scheduleIdleCheck(activityId, sessionId, IDLE_DELAY_MS, agentId, agentName)
              }
            }
          }

          if (isLikelyPrompt(promptTail, currentProvider)) {
            scheduleCommandCompletionCheck(promptTail)
          }
        })
        cleanups.push(removeDataListener)

        let inputBuffer = ''

        // Clipboard: copy/paste support (Ctrl+C with selection, Ctrl+Shift+C/V, Ctrl+V, right-click paste)
        const writeToPty = (text: string, mirrorToInputBuffer = false) => {
          if (mirrorToInputBuffer) {
            inputBuffer += text.replace(/\x1b\[200~|\x1b\[201~/g, '')
          }

          const { syncInputsMode, sessions } = useTerminalStore.getState()
          if (syncInputsMode === 'all') {
            sessions.forEach((s) => {
              try { window.ghostshell.ptyWrite(s.id, text) } catch {}
            })
          } else {
            window.ghostshell.ptyWrite(sessionId, text)
          }
        }

        const writeInjectedText = (text: string) => {
          if (!text) return
          const normalized = normalizeTerminalPasteText(text)
          if (!normalized) return
          if (terminal.modes.bracketedPasteMode) {
            writeToPty(`\x1b[200~${normalized}\x1b[201~`, true)
          } else {
            writeToPty(normalized, true)
          }
        }

        const writeMultilineShortcutToSession = (targetSessionId: string): void => {
          const targetSession = useTerminalStore.getState().getSession(targetSessionId)
          const targetAgent = targetSession?.agentId
            ? useAgentStore.getState().getAgent(targetSession.agentId)
            : undefined
          const targetProvider: Provider = targetAgent
            ? resolveProvider(targetAgent)
            : targetSession?.detectedProvider || currentProvider || 'claude'

          try {
            const seq = getNativeMultilineSequence(targetProvider)
            window.ghostshell.ptyWrite(targetSessionId, seq)
            if (targetSessionId === sessionId) {
              inputBuffer += '\n'
              // Refresh terminal after TUI redraws to clear rendering artifacts
              if (terminal) {
                setTimeout(() => terminal.refresh(0, terminal.rows - 1), 80)
              }
            }
          } catch {
            // PTY not ready yet
          }
        }

        const writeMultilineShortcut = (): void => {
          const { syncInputsMode, sessions } = useTerminalStore.getState()
          if (syncInputsMode === 'all') {
            sessions.forEach((s) => {
              writeMultilineShortcutToSession(s.id)
            })
          } else {
            writeMultilineShortcutToSession(sessionId)
          }
        }

        terminal.attachCustomKeyEventHandler((e) => {
          if (readOnlyRef.current) {
            if (e.type !== 'keydown') return false

            if (e.ctrlKey && e.shiftKey && e.code === 'KeyC') {
              const sel = terminal.getSelection()
              if (sel) navigator.clipboard.writeText(sel)
              return false
            }

            if (e.ctrlKey && !e.shiftKey && !e.altKey && e.code === 'KeyC') {
              const sel = terminal.getSelection()
              if (sel) {
                navigator.clipboard.writeText(sel)
                terminal.clearSelection()
              }
              return false
            }

            if ((e.ctrlKey || e.metaKey) && e.code === 'KeyA') {
              terminal.selectAll()
              return false
            }

            return false
          }

          if (
            isInteractiveProviderSession() &&
            e.key === 'Enter' &&
            !e.shiftKey &&
            !e.ctrlKey &&
            !e.altKey &&
            !e.metaKey
          ) {
            if (e.type === 'keydown' && !e.isComposing) {
              inputBuffer = ''
              writeToPty('\r')
            }
            return false
          }

          // Shift+Enter: insert a new line via the provider's native multiline shortcut.
          // Must block BOTH keydown AND keypress to prevent xterm from sending \r to the PTY.
          if (e.shiftKey && !e.ctrlKey && !e.altKey && e.key === 'Enter') {
            if (e.type === 'keydown') writeMultilineShortcut()
            return false
          }

          // Ctrl+V: Prevent xterm from sending \x16 (raw Ctrl+V control char) to PTY.
          // Return false so the browser fires the native paste event. Structured
          // text insertion tools are handled separately via beforeinput/input.
          if (e.ctrlKey && !e.shiftKey && !e.altKey && e.code === 'KeyV') {
            return false
          }

          if (e.type !== 'keydown') return true

          // Ctrl+Shift+C: Copy selection
          if (e.ctrlKey && e.shiftKey && e.code === 'KeyC') {
            const sel = terminal.getSelection()
            if (sel) navigator.clipboard.writeText(sel)
            return false
          }

          // Ctrl+C with active selection: Copy instead of SIGINT
          if (e.ctrlKey && !e.shiftKey && !e.altKey && e.code === 'KeyC') {
            const sel = terminal.getSelection()
            if (sel) {
              navigator.clipboard.writeText(sel)
              terminal.clearSelection()
              return false
            }
            return true // No selection -> normal SIGINT
          }

          // Alt+Tab: block so xterm doesn't send \t to the PTY during OS window switch
          if (e.altKey && e.key === 'Tab') {
            return false
          }

          // Ctrl+T: New terminal tab (intercept so xterm doesn't send \x14 to PTY)
          if (e.ctrlKey && !e.shiftKey && !e.altKey && e.code === 'KeyT') {
            if (e.type === 'keydown') {
              window.dispatchEvent(new CustomEvent(SHORTCUT_EVENTS.newTerminal))
            }
            return false
          }

          // F2: Rename active tab (intercept so xterm doesn't send escape sequence)
          if (e.key === 'F2' && !e.ctrlKey && !e.altKey && !e.shiftKey) {
            return false
          }

          return true
        })
        cleanups.push(() => terminal.attachCustomKeyEventHandler(() => true))

        // Right-click paste
        const termEl = terminal.element
        const handleContextMenu = (e: MouseEvent) => {
          e.preventDefault()
          const sel = terminal.getSelection()
          if (sel) {
            navigator.clipboard.writeText(sel)
          } else if (readOnlyRef.current) {
            window.dispatchEvent(
              new CustomEvent(SMART_INPUT_FOCUS_EVENT, {
                detail: { sessionId },
              }),
            )
          } else {
            navigator.clipboard.readText().then((text) => {
              if (text) {
                writeInjectedText(text)
              }
            }).catch(() => {})
          }
        }
        if (termEl) {
          termEl.addEventListener('contextmenu', handleContextMenu)
          cleanups.push(() => termEl.removeEventListener('contextmenu', handleContextMenu))

          // Paste event: images are handled by GhostShell, while text is still bridged
          // through our PTY writer so bracketed paste stays consistent.
          const handlePaste = (e: ClipboardEvent) => {
            if (readOnlyRef.current) {
              e.preventDefault()
              e.stopPropagation()
              return
            }
            if (!e.clipboardData) return
            // Check for image data synchronously
            const items = e.clipboardData.items
            for (let i = 0; i < items.length; i++) {
              if (items[i].type.startsWith('image/')) {
                e.preventDefault()
                e.stopPropagation()
                const mimeType = items[i].type
                const blob = items[i].getAsFile()
                if (!blob) return
                ;(async () => {
                  try {
                    const buffer = await blob.arrayBuffer()
                    const filePath = await window.ghostshell.saveTempImage(buffer, mimeType)
                    if (filePath) {
                      imageLabels.ensureLabel(filePath)
                      writeToPty(quotePath(filePath), true)
                    }
                  } catch {
                    // Silently fail; clipboard permission may be denied
                  }
                })()
                return
              }
            }
            const text = e.clipboardData.getData('text/plain')
            if (text) {
              e.preventDefault()
              e.stopPropagation()
              writeInjectedText(text)
            }
          }
          termEl.addEventListener('paste', handlePaste, true)
          cleanups.push(() => termEl.removeEventListener('paste', handlePaste, true))

          const helperTextarea = termEl.querySelector('textarea')
          let lastStructuredInsert = ''
          let lastStructuredInsertAt = 0
          const STRUCTURED_INSERT_DEDUPE_MS = 100

          const handleStructuredInsert = (text: string) => {
            if (!text) return
            lastStructuredInsert = text
            lastStructuredInsertAt = Date.now()
            writeInjectedText(text)
          }

          const clearHelperTextarea = () => {
            if (helperTextarea instanceof HTMLTextAreaElement) {
              helperTextarea.value = ''
            }
          }

          const handleBeforeInput = (e: Event) => {
            if (!(e instanceof InputEvent)) return
            if (readOnlyRef.current) {
              e.preventDefault()
              e.stopPropagation()
              e.stopImmediatePropagation()
              return
            }
            const text = e.data || ''
            if (!shouldCaptureStructuredTextInsertion(e.inputType, text)) return

            e.preventDefault()
            e.stopPropagation()
            e.stopImmediatePropagation()
            clearHelperTextarea()
            handleStructuredInsert(text)
          }

          const handleInput = (e: Event) => {
            if (!(e instanceof InputEvent)) return
            if (readOnlyRef.current) {
              e.stopPropagation()
              e.stopImmediatePropagation()
              clearHelperTextarea()
              return
            }
            const fallbackText =
              helperTextarea instanceof HTMLTextAreaElement
                ? helperTextarea.value
                : ''
            const text = e.data || fallbackText
            if (!shouldCaptureStructuredTextInsertion(e.inputType, text)) return

            const now = Date.now()
            if (text === lastStructuredInsert && now - lastStructuredInsertAt < STRUCTURED_INSERT_DEDUPE_MS) {
              e.stopPropagation()
              e.stopImmediatePropagation()
              clearHelperTextarea()
              return
            }

            e.stopPropagation()
            e.stopImmediatePropagation()
            clearHelperTextarea()
            handleStructuredInsert(text)
          }

          if (helperTextarea instanceof HTMLTextAreaElement) {
            helperTextarea.addEventListener('beforeinput', handleBeforeInput, true)
            helperTextarea.addEventListener('input', handleInput, true)
            cleanups.push(() => {
              helperTextarea.removeEventListener('beforeinput', handleBeforeInput, true)
              helperTextarea.removeEventListener('input', handleInput, true)
            })
          }

          // Drag-and-drop: drop files/images onto terminal writes their path to PTY.
          // Handles OS files (have .path), web images (save to temp), and mixed drops.
          // Uses dragCounter to avoid flicker when moving between child elements.
          let dragCounter = 0
          const paneEl = termEl.closest('[data-terminal-pane]') as HTMLElement | null
          const handleDragEnter = (e: DragEvent) => {
            if (readOnlyRef.current) return
            e.preventDefault()
            e.stopPropagation()
            dragCounter++
            if (dragCounter === 1 && paneEl) paneEl.classList.add('drop-target')
          }
          const handleDragOver = (e: DragEvent) => {
            if (readOnlyRef.current) return
            e.preventDefault()
            e.stopPropagation()
            if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
          }
          const handleDragLeave = (e: DragEvent) => {
            if (readOnlyRef.current) return
            e.preventDefault()
            e.stopPropagation()
            dragCounter--
            if (dragCounter === 0 && paneEl) paneEl.classList.remove('drop-target')
          }
          const handleDrop = (e: DragEvent) => {
            if (readOnlyRef.current) {
              e.preventDefault()
              e.stopPropagation()
              return
            }
            e.preventDefault()
            e.stopPropagation()
            dragCounter = 0
            if (paneEl) paneEl.classList.remove('drop-target')
            if (!e.dataTransfer) return

            ;(async () => {
              const paths: string[] = []
              const files = e.dataTransfer!.files

              for (let i = 0; i < files.length; i++) {
                const file = files[i] as File & { path?: string }
                if (file.path) {
                  // Electron file from OS; has full system path
                  paths.push(file.path)
                } else if (file.type.startsWith('image/')) {
                  // Web-dragged image (no OS path); save to temp
                  try {
                    const buffer = await file.arrayBuffer()
                    const savedPath = await window.ghostshell.saveTempImage(buffer, file.type)
                    if (savedPath) paths.push(savedPath)
                  } catch {
                    // skip on failure
                  }
                }
              }

              // Also check DataTransferItems for image blobs with no File entry
              if (paths.length === 0 && e.dataTransfer!.items) {
                for (let i = 0; i < e.dataTransfer!.items.length; i++) {
                  const item = e.dataTransfer!.items[i]
                  if (item.kind === 'file' && item.type.startsWith('image/')) {
                    const blob = item.getAsFile()
                    if (blob) {
                      try {
                        const buffer = await blob.arrayBuffer()
                        const savedPath = await window.ghostshell.saveTempImage(buffer, item.type)
                        if (savedPath) paths.push(savedPath)
                      } catch {
                        // skip on failure
                      }
                    }
                  }
                }
              }

              if (paths.length > 0) {
                for (const path of paths) {
                  if (isImagePath(path)) {
                    imageLabels.ensureLabel(path)
                  }
                }

                // Avoid writing local status lines into xterm. TUI CLIs like Codex
                // render their own screen and can glitch if we inject extra output.
                const text = paths.map((path) => quotePath(path)).join(' ')
                writeToPty(text, true)
              }
            })()
          }
          termEl.addEventListener('dragenter', handleDragEnter)
          termEl.addEventListener('dragover', handleDragOver)
          termEl.addEventListener('dragleave', handleDragLeave)
          termEl.addEventListener('drop', handleDrop)
          cleanups.push(() => {
            termEl.removeEventListener('dragenter', handleDragEnter)
            termEl.removeEventListener('dragover', handleDragOver)
            termEl.removeEventListener('dragleave', handleDragLeave)
            termEl.removeEventListener('drop', handleDrop)
            if (paneEl) paneEl.classList.remove('drop-target')
          })
        }

        // Terminal -> PTY (with sync support + history tracking)
        const onDataDisposable = terminal.onData((data) => {
          if (readOnlyRef.current) return
          const { syncInputsMode, sessions } = useTerminalStore.getState()
          const shouldTrackShellPromptSubmission = !isInteractiveProviderSession()

          // Track command history on Enter
          if (data === '\r' || data === '\n') {
            if (shouldTrackShellPromptSubmission) {
              trackCommandSubmission(inputBuffer)
            } else {
              inputBuffer = ''
            }
          } else if (data === '\x7f') {
            inputBuffer = inputBuffer.slice(0, -1)
          } else if (data.length === 1 && data.charCodeAt(0) >= 32) {
            inputBuffer += data
          } else if (data === '\x03') {
            inputBuffer = ''
            finalizeActiveBlock('interrupted', false)
          }

          if (syncInputsMode === 'all') {
            sessions.forEach((s) => {
              try {
                window.ghostshell.ptyWrite(s.id, data)
              } catch {
                // Session may not have PTY yet
              }
            })
          } else {
            window.ghostshell.ptyWrite(sessionId, data)
          }
        })
        cleanups.push(() => onDataDisposable.dispose())

        // Resize
        const onResizeDisposable = terminal.onResize(({ cols, rows }) => {
          window.ghostshell.ptyResize(sessionId, cols, rows)
        })
        cleanups.push(() => onResizeDisposable.dispose())

        // Exit - set offline
        const removeExitListener = window.ghostshell.ptyOnExit(sessionId, (_exitCode) => {
          if (cancelled) return

          if (hasLiveSession()) {
            withTerminal((term) => {
              term.writeln('\r\n\x1b[90m[Process exited]\x1b[0m')
            })
            flushCompanionOutput(true)
            useCompanionStore.getState().addSystemMessage(sessionId, 'Process exited.', currentProvider)
          }
          finalizeActiveBlock('interrupted', false)
          cancelIdleCheck(activityId)
          lastWorkingPatternTime.delete(activityId)
          useActivityStore.getState().setActivity(activityId, 'idle')
          const runningSubAgents = (useActivityStore.getState().activities[activityId]?.subAgents || []).filter(
            (sub) => sub.status === 'running' || sub.status === 'spawning',
          )
          for (const sub of runningSubAgents) {
            useActivityStore.getState().completeSubAgent(activityId, sub.id)
          }
          if (agentId) {
            setAgentStatus(agentId, 'offline')
            updateAgent(agentId, { terminalId: undefined })
          }
        })
        cleanups.push(removeExitListener)

        // Auto-launch CLI with agent config (retries to handle slow PTY init)
        if (autoLaunch && agentId) {
          const launchAgent = getAgent(agentId)
          if (launchAgent) {
            // Check for pre-built launch command (swarm agents) or build from config
            const launchSession = useTerminalStore.getState().getSession(sessionId)
            const cmd = launchSession?.launchCommand || (() => {
              const launchProvider = resolveProvider(launchAgent)
              const hasConfig = launchProvider === 'gemini' ? !!launchAgent.geminiConfig : launchProvider === 'codex' ? !!launchAgent.codexConfig : !!launchAgent.claudeConfig
              if (hasConfig || launchProvider === 'gemini' || launchProvider === 'codex') return buildLaunchCommand(launchAgent)
              return null
            })()
            if (cmd) {
              const delays = [500, 1500, 3000]
              let attempt = 0
              const tryWrite = () => {
                if (cancelled || !hasLiveSession()) return
                try {
                  window.ghostshell.ptyWrite(sessionId, cmd + '\r')
                  setAgentStatus(agentId, 'working')
                } catch (err) {
                  attempt++
                  if (attempt < delays.length) {
                    setTimeout(tryWrite, delays[attempt] - delays[attempt - 1])
                  } else {
                    console.error('Auto-launch failed after retries:', err)
                    withTerminal((term) => {
                      term.writeln(`\r\n\x1b[33m[Auto-launch failed - type the command manually: ${cmd}]\x1b[0m`)
                    })
                  }
                }
              }
              setTimeout(tryWrite, delays[0])
            }
          }
        }
      } catch (err) {
        if (cancelled) return
        console.error('Failed to create PTY:', err)
        withTerminal((term) => {
          term.writeln('\r\n\x1b[31m[Failed to create terminal process]\x1b[0m')
        })
        useCompanionStore.getState().addSystemMessage(sessionId, 'Failed to create terminal process.', currentProvider)
        finalizeActiveBlock('error', false)
        if (agentId) {
          setAgentStatus(agentId, 'error')
        }
      }
    }

    // Initialize activity tracking immediately so panels can render.
    useActivityStore.getState().initAgent(activityId)
    useActivityStore.getState().updateContextMetrics(activityId, {
      maxTokens: getKnownContextWindow(currentProvider),
    })

    // Defer PTY init to avoid double PTY creation in React StrictMode (dev mode).
    // StrictMode unmounts immediately after first mount; the cleanup cancels
    // the timer before the PTY is ever created, so only the second mount wins.
    const initTimer = setTimeout(() => {
      if (!cancelled) init()
    }, 50)

    return () => {
      cancelled = true
      clearTimeout(initTimer)
      connectedRef.current = false
      clearCompletionCheck()
      finalizeActiveBlock('interrupted', false)
      cancelIdleCheck(activityId)
      lastWorkingPatternTime.delete(activityId)
      useActivityStore.getState().removeAgent(activityId)
      batchParser.destroy()
      if (outputFlushTimer) {
        clearTimeout(outputFlushTimer)
      }
      flushCompanionOutput(true)
      cleanups.forEach((fn) => fn())
      delete (window as unknown as Record<string, unknown>)[`__ghostshell_output_${sessionId}`]
      useCompanionStore.getState().removeSession(sessionId)
      try {
        window.ghostshell.ptyKill(sessionId)
      } catch {
        // ignore
      }
    }
  }, [sessionId, terminal])
}
