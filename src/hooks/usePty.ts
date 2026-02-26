import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { useAgentStore } from '../stores/agentStore'
import { useTerminalStore } from '../stores/terminalStore'
import { useHistoryStore } from '../stores/historyStore'
import { useNotificationStore } from '../stores/notificationStore'
import { useActivityStore } from '../stores/activityStore'
import { buildLaunchCommand, resolveProvider, getInstallCommand, getProviderLabel } from '../lib/providers'
import { createBatchParser, stripAnsi } from '../lib/claude-output-parser'
import { Provider, SubAgentOutputLine } from '../lib/types'
import { detectDomain } from '../lib/domain-detector'

interface UsePtyOptions {
  sessionId: string
  terminal: Terminal | null
  cwd?: string
  shell?: string
  agentId?: string
  autoLaunch?: boolean
}

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
  /⠋|⠙|⠹|⠸|⠼|⠴|⠦|⠧|⠇|⠏/,
  /Thinking/,
  /Reading/,
  /Writing/,
  /Editing/,
  /Searching/,
  /Running/,
]

// --- Gemini CLI patterns ---
// Note: Gemini's banner and UI uses decorative ✦ and > characters liberally.
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
  /⠋|⠙|⠹|⠸|⠼|⠴|⠦|⠧|⠇|⠏/,  // Braille spinner characters (reliable)
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
  /codex>\s*$/,              // Codex's input prompt
  /\$ $/,                     // bash prompt
  /PS [A-Z]:\\[^>]*>\s*$/,   // PowerShell prompt
]

const CODEX_AUTO_CONFIRM_PATTERNS = [
  /\(Y\/n\)/,
  /\(y\/n\)/i,
]

const CODEX_WORKING_PATTERNS = [
  /⠋|⠙|⠹|⠸|⠼|⠴|⠦|⠧|⠇|⠏/,  // Braille spinner characters
  /\u280B|\u2819|\u2838|\u2834|\u2826|\u2807/, // More braille spinners
  /Thinking/,
  /Reading/,
  /Writing/,
  /Running/,
  /Searching/,
]

// Detect "command not found" errors — returns the binary name if matched, null otherwise
function detectCliNotFound(data: string): 'gemini' | 'claude' | 'codex' | null {
  // PowerShell patterns: "'gemini' is not recognized" / "'gemini' no se reconoce"
  const psMatch = data.match(/['"]?(gemini|claude|codex)['"]?\s*:\s*(?:.*(?:is not recognized|no se reconoce|CommandNotFoundException))/i)
  if (psMatch) return psMatch[1].toLowerCase() as 'gemini' | 'claude' | 'codex'
  // Bash/zsh: "gemini: command not found" / "gemini: not found"
  const bashMatch = data.match(/(gemini|claude|codex)\s*:\s*(?:command\s+)?not found/i)
  if (bashMatch) return bashMatch[1].toLowerCase() as 'gemini' | 'claude' | 'codex'
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

// Debounce timer for idle detection
let idleTimers: Map<string, ReturnType<typeof setTimeout>> = new Map()

// Track agents that have reached idle at least once — skip notification on initial CLI startup
const agentsReachedFirstIdle = new Set<string>()

// Track last time a working pattern was seen per agent (prevents false idle during active work)
const lastWorkingPatternTime = new Map<string, number>()

// Dedup guard: last idle notification time per agent (10s cooldown)
const lastIdleNotificationTime = new Map<string, number>()

function scheduleIdleCheck(agentId: string, delayMs: number, agentName: string) {
  const existing = idleTimers.get(agentId)
  if (existing) clearTimeout(existing)

  const timer = setTimeout(() => {
    idleTimers.delete(agentId)
    // Guard: agent may have been deleted while timer was pending
    const agent = useAgentStore.getState().getAgent(agentId)
    if (!agent) return
    if (agent.status === 'working') {
      useAgentStore.getState().setAgentStatus(agentId, 'idle')
      useActivityStore.getState().setActivity(agentId, 'idle')
      // Only notify after the first idle (skip initial CLI startup notification)
      if (agentsReachedFirstIdle.has(agentId)) {
        // Dedup: skip if we notified this agent in the last 10 seconds
        const lastNotifTime = lastIdleNotificationTime.get(agentId) || 0
        const now = Date.now()
        if (now - lastNotifTime > 10000) {
          lastIdleNotificationTime.set(agentId, now)
          useNotificationStore.getState().addNotification(
            'success',
            `${agentName} finished`,
            'Ready for input',
            4000,
            'full'
          )
        }
      } else {
        agentsReachedFirstIdle.add(agentId)
      }
    }
  }, delayMs)

  idleTimers.set(agentId, timer)
}

function cancelIdleCheck(agentId: string) {
  const existing = idleTimers.get(agentId)
  if (existing) {
    clearTimeout(existing)
    idleTimers.delete(agentId)
  }
}

export function usePty({ sessionId, terminal, cwd, shell, agentId, autoLaunch }: UsePtyOptions) {
  const connectedRef = useRef(false)

  useEffect(() => {
    if (!terminal || connectedRef.current || !window.ghostshell) return

    connectedRef.current = true
    const cleanups: (() => void)[] = []
    const { setAgentStatus, getAgent, updateAgent } = useAgentStore.getState()

    let lastDetectedCwd = cwd || ''

    // Determine provider for this agent
    const agent = agentId ? getAgent(agentId) : undefined
    const agentName = agent?.name || 'Agent'
    const provider: Provider = agent ? resolveProvider(agent) : 'claude'
    const workingPatterns = getWorkingPatterns(provider)
    const idlePatterns = getIdlePatterns(provider)
    const autoConfirmPatterns = getAutoConfirmPatterns(provider)

    // Track active subagent IDs for completion detection
    let lastSubAgentId: string | null = null

    // Line accumulator for sub-agent output capture
    let lineBuffer = ''
    let pendingOutputLines: SubAgentOutputLine[] = []
    let outputFlushTimer: ReturnType<typeof setTimeout> | null = null
    const OUTPUT_FLUSH_MS = 200

    function flushOutputLines() {
      if (pendingOutputLines.length > 0 && lastSubAgentId && agentId) {
        useActivityStore.getState().appendSubAgentOutput(agentId, lastSubAgentId, pendingOutputLines)
        pendingOutputLines = []
      }
      outputFlushTimer = null
    }

    function accumulateOutput(rawData: string) {
      if (!lastSubAgentId || !agentId) return
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
    const batchParser = agentId
      ? createBatchParser((results) => {
          const store = useActivityStore.getState()
          for (const result of results) {
            store.setActivity(agentId, result.activity, result.detail)
            if (result.fileTouch) {
              store.addFileTouch(agentId, result.fileTouch.path, result.fileTouch.operation)
            }
            store.addEvent(agentId, result.activity, result.tool, result.detail)

            // Track subagent spawning
            if (result.subAgent) {
              // Flush pending output for previous subagent
              if (lastSubAgentId && pendingOutputLines.length > 0) {
                flushOutputLines()
              }
              // Complete previous subagent if still running
              if (lastSubAgentId) {
                store.completeSubAgent(agentId, lastSubAgentId)
              }
              const domain = detectDomain(result.subAgent.description)
              lastSubAgentId = store.addSubAgent(agentId, {
                agentId,
                type: result.subAgent.type,
                description: result.subAgent.description,
                status: 'running',
                model: result.subAgent.model,
                domain,
              })
              lineBuffer = ''
            }

            // Handle sub-agent completion
            if (result.subAgentCompleted && lastSubAgentId) {
              flushOutputLines()
              store.completeSubAgent(agentId, lastSubAgentId)
              lastSubAgentId = null
              lineBuffer = ''
            }

            // Track task actions
            if (result.taskAction) {
              if (result.taskAction.action === 'create' && result.taskAction.subject) {
                store.addTask(agentId, {
                  agentId,
                  subject: result.taskAction.subject,
                  status: 'pending',
                  activeForm: result.taskAction.activeForm,
                })
              }
            }

            // Update context metrics
            if (result.contextUpdate) {
              store.updateContextMetrics(agentId, result.contextUpdate)
            }
          }
        }, 100, provider)
      : null

    const init = async () => {
      try {
        const cols = terminal.cols || 80
        const rows = terminal.rows || 24

        // Output buffer for export (last 50K chars)
        let outputBuffer = ''
        const OUTPUT_BUFFER_MAX = 50000
        const bufferKey = `__ghostshell_output_${sessionId}`

        await window.ghostshell.ptyCreate({
          id: sessionId,
          shell,
          cwd,
          cols,
          rows,
        })

        // PTY -> Terminal
        const removeDataListener = window.ghostshell.ptyOnData(sessionId, (data) => {
          terminal.write(data)

          // Buffer output for export
          outputBuffer += data
          if (outputBuffer.length > OUTPUT_BUFFER_MAX) {
            outputBuffer = outputBuffer.slice(-OUTPUT_BUFFER_MAX)
          }
          ;(window as unknown as Record<string, unknown>)[bufferKey] = outputBuffer

          // Feed data to batch parser for activity detection
          if (batchParser) {
            batchParser.push(data)
          }

          // Accumulate output for active sub-agent
          if (agentId && lastSubAgentId) {
            accumulateOutput(data)
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
            const needsAutoConfirm = autoConfirmPatterns.some((p) => p.test(data))
            if (needsAutoConfirm) {
              setTimeout(() => {
                try {
                  window.ghostshell.ptyWrite(sessionId, 'y\r')
                } catch {
                  // PTY may have closed
                }
              }, 150)
            }
          }

          // Detect CLI not found — detect actual binary from error, show helpful notification once
          if (agentId && !cliNotFoundDetected) {
            const missingBinary = detectCliNotFound(data)
            if (missingBinary) {
              cliNotFoundDetected = true
              const detectedProvider: Provider = missingBinary === 'gemini' ? 'gemini' : missingBinary === 'codex' ? 'codex' : 'claude'
              const label = getProviderLabel(detectedProvider)
              const installCmd = getInstallCommand(detectedProvider)
              setAgentStatus(agentId, 'error')
              useActivityStore.getState().setActivity(agentId, 'idle')
              useNotificationStore.getState().addNotification(
                'error',
                `${label} CLI not found`,
                `Run: ${installCmd} — or go to Settings > AI Providers > Install`,
                8000,
                'full'
              )
              // Write a helpful message directly in the terminal
              terminal.writeln('')
              terminal.writeln(`\x1b[33m[GhostShell] ${label} CLI not found.\x1b[0m`)
              terminal.writeln(`\x1b[33mRun this to install:\x1b[0m \x1b[36m${installCmd}\x1b[0m`)
              terminal.writeln(`\x1b[33mOr go to Settings > AI Providers > Install\x1b[0m`)
              terminal.writeln('')
            }
          }

          // Agent status tracking (fallback - batch parser handles granular activity)
          if (agentId) {
            const now = Date.now()
            const isWorking = workingPatterns.some((p) => p.test(data))

            if (isWorking && now - lastWorkingSet > WORKING_COOLDOWN_MS) {
              cancelIdleCheck(agentId)
              lastWorkingPatternTime.set(agentId, now)
              const currentAgent = getAgent(agentId)
              if (currentAgent && currentAgent.status !== 'working') {
                setAgentStatus(agentId, 'working')
                lastWorkingSet = now
              }
              if (currentAgent && !currentAgent.hasConversation) {
                updateAgent(agentId, { hasConversation: true })
              }
              scheduleIdleCheck(agentId, 3000, agentName)
            }

            const isPrompt = idlePatterns.some((p) => p.test(data))
            if (isPrompt) {
              // Only schedule short idle if no working pattern in the last 2 seconds
              const lastWorking = lastWorkingPatternTime.get(agentId) || 0
              if (now - lastWorking > 2000) {
                const currentAgent = getAgent(agentId)
                if (currentAgent && currentAgent.status === 'working') {
                  scheduleIdleCheck(agentId, 3000, agentName)
                }
              }
            }
          }
        })
        cleanups.push(removeDataListener)

        // Clipboard: copy/paste support (Ctrl+C with selection, Ctrl+Shift+C/V, Ctrl+V, right-click paste)
        const writeToPty = (text: string) => {
          const { syncInputsMode, sessions } = useTerminalStore.getState()
          if (syncInputsMode === 'all') {
            sessions.forEach((s) => {
              try { window.ghostshell.ptyWrite(s.id, text) } catch {}
            })
          } else {
            window.ghostshell.ptyWrite(sessionId, text)
          }
        }

        terminal.attachCustomKeyEventHandler((e) => {
          if (e.type !== 'keydown') return true

          // Shift+Enter: Insert newline without executing (multi-line input)
          if (e.shiftKey && !e.ctrlKey && !e.altKey && e.key === 'Enter') {
            // Use bracketed paste mode to send a newline that the shell
            // treats as literal text, not as command execution
            writeToPty('\x1b[200~\n\x1b[201~')
            return false
          }

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
            return true // No selection → normal SIGINT
          }

          // Ctrl+T: New terminal tab (intercept so xterm doesn't send \x14 to PTY)
          if (e.ctrlKey && !e.shiftKey && !e.altKey && e.code === 'KeyT') {
            return false
          }

          // F2: Rename active tab (intercept so xterm doesn't send escape sequence)
          if (e.key === 'F2' && !e.ctrlKey && !e.altKey && !e.shiftKey) {
            return false
          }

          // Ctrl+Shift+V or Ctrl+V: Paste from clipboard (image-aware)
          if (e.ctrlKey && e.code === 'KeyV') {
            ;(async () => {
              try {
                const items = await navigator.clipboard.read()
                for (const item of items) {
                  const imageType = item.types.find((t) => t.startsWith('image/'))
                  if (imageType) {
                    const blob = await item.getType(imageType)
                    const buffer = await blob.arrayBuffer()
                    const filePath = await (window.ghostshell as any).saveTempImage(buffer, imageType) as string
                    if (filePath) writeToPty(filePath)
                    return
                  }
                }
                // No image — fall back to text paste
                const text = await navigator.clipboard.readText()
                if (text) writeToPty(text)
              } catch {
                // Fallback if clipboard.read() not available
                navigator.clipboard.readText().then((text) => {
                  if (text) writeToPty(text)
                }).catch(() => {})
              }
            })()
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
          } else {
            navigator.clipboard.readText().then((text) => {
              if (text) writeToPty(text)
            }).catch(() => {})
          }
        }
        if (termEl) {
          termEl.addEventListener('contextmenu', handleContextMenu)
          cleanups.push(() => termEl.removeEventListener('contextmenu', handleContextMenu))

          // Drag-and-drop: drop files/images onto terminal writes their path to PTY
          // Uses dragCounter to avoid flicker when moving between child elements
          let dragCounter = 0
          const paneEl = termEl.closest('[data-terminal-pane]') as HTMLElement | null
          const handleDragEnter = (e: DragEvent) => {
            e.preventDefault()
            e.stopPropagation()
            dragCounter++
            if (dragCounter === 1 && paneEl) paneEl.classList.add('drop-target')
          }
          const handleDragOver = (e: DragEvent) => {
            e.preventDefault()
            e.stopPropagation()
            if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
          }
          const handleDragLeave = (e: DragEvent) => {
            e.preventDefault()
            e.stopPropagation()
            dragCounter--
            if (dragCounter === 0 && paneEl) paneEl.classList.remove('drop-target')
          }
          const handleDrop = (e: DragEvent) => {
            e.preventDefault()
            e.stopPropagation()
            dragCounter = 0
            if (paneEl) paneEl.classList.remove('drop-target')
            if (!e.dataTransfer) return
            const files = e.dataTransfer.files
            if (files.length > 0) {
              const paths: string[] = []
              for (let i = 0; i < files.length; i++) {
                // Electron File objects have .path with the full system path
                const filePath = (files[i] as File & { path?: string }).path
                if (filePath) paths.push(filePath)
              }
              if (paths.length > 0) {
                // Quote paths with spaces, join with space
                const text = paths.map((p) => p.includes(' ') ? `"${p}"` : p).join(' ')
                writeToPty(text)
              }
            }
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
        let inputBuffer = ''
        const onDataDisposable = terminal.onData((data) => {
          const { syncInputsMode, sessions } = useTerminalStore.getState()

          // Track command history on Enter
          if (data === '\r' || data === '\n') {
            if (inputBuffer.trim()) {
              const agent = agentId ? getAgent(agentId) : undefined
              useHistoryStore.getState().addEntry(inputBuffer, sessionId, agent?.name)
              inputBuffer = ''
            }
          } else if (data === '\x7f') {
            inputBuffer = inputBuffer.slice(0, -1)
          } else if (data.length === 1 && data.charCodeAt(0) >= 32) {
            inputBuffer += data
          } else if (data === '\x03') {
            inputBuffer = ''
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
          terminal.writeln('\r\n\x1b[90m[Process exited]\x1b[0m')
          if (agentId) {
            cancelIdleCheck(agentId)
            agentsReachedFirstIdle.delete(agentId)
            lastWorkingPatternTime.delete(agentId)
            lastIdleNotificationTime.delete(agentId)
            setAgentStatus(agentId, 'offline')
            useActivityStore.getState().setActivity(agentId, 'idle')
            updateAgent(agentId, { terminalId: undefined })
            useNotificationStore.getState().addNotification(
              'warning',
              `${agentName} disconnected`,
              'Process exited unexpectedly',
              5000,
              'full'
            )
          }
        })
        cleanups.push(removeExitListener)

        // Auto-launch CLI with agent config (retries to handle slow PTY init)
        if (autoLaunch && agentId) {
          const launchAgent = getAgent(agentId)
          if (launchAgent) {
            const launchProvider = resolveProvider(launchAgent)
            const hasConfig = launchProvider === 'gemini' ? !!launchAgent.geminiConfig : launchProvider === 'codex' ? !!launchAgent.codexConfig : !!launchAgent.claudeConfig
            if (hasConfig || launchProvider === 'gemini' || launchProvider === 'codex') {
              const cmd = buildLaunchCommand(launchAgent)
              const delays = [500, 1500, 3000]
              let attempt = 0
              const tryWrite = () => {
                if (cancelled) return
                try {
                  window.ghostshell.ptyWrite(sessionId, cmd + '\r')
                  setAgentStatus(agentId, 'working')
                } catch (err) {
                  attempt++
                  if (attempt < delays.length) {
                    setTimeout(tryWrite, delays[attempt] - delays[attempt - 1])
                  } else {
                    console.error('Auto-launch failed after retries:', err)
                    terminal.writeln(`\r\n\x1b[33m[Auto-launch failed — type the command manually: ${cmd}]\x1b[0m`)
                  }
                }
              }
              setTimeout(tryWrite, delays[0])
            }
          }
        }
      } catch (err) {
        console.error('Failed to create PTY:', err)
        terminal.writeln('\r\n\x1b[31m[Failed to create terminal process]\x1b[0m')
        if (agentId) {
          setAgentStatus(agentId, 'error')
        }
      }
    }

    // Initialize activity tracking immediately (not deferred) so AgentCard can render
    if (agentId) {
      useActivityStore.getState().initAgent(agentId)
    }

    // Defer PTY init to avoid double PTY creation in React StrictMode (dev mode).
    // StrictMode unmounts immediately after first mount — the cleanup cancels
    // the timer before the PTY is ever created, so only the second mount wins.
    let cancelled = false
    const initTimer = setTimeout(() => {
      if (!cancelled) init()
    }, 50)

    return () => {
      cancelled = true
      clearTimeout(initTimer)
      connectedRef.current = false
      if (agentId) {
        cancelIdleCheck(agentId)
        lastWorkingPatternTime.delete(agentId)
        lastIdleNotificationTime.delete(agentId)
        useActivityStore.getState().removeAgent(agentId)
      }
      if (batchParser) {
        batchParser.destroy()
      }
      if (outputFlushTimer) {
        clearTimeout(outputFlushTimer)
      }
      cleanups.forEach((fn) => fn())
      delete (window as unknown as Record<string, unknown>)[`__ghostshell_output_${sessionId}`]
      try {
        window.ghostshell.ptyKill(sessionId)
      } catch {
        // ignore
      }
    }
  }, [sessionId, terminal])
}
