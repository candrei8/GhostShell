// Swarm CI Runner — Automated CI/CD Feedback Loop per Agent (A5)
//
// After each significant code change by an agent, auto-runs linter + type-checker
// + tests, then injects results back into the agent's context for self-correction.
//
// Detection: watches swarmStore.activityFeed for file_write/file_edit events.
// Execution: spawns a hidden PTY per CI run, chains checks with separators.
// Feedback:  sends CI results via gs-mail (operatorMessageAgent) to the agent.

import { useSwarmStore } from '../stores/swarmStore'
import { operatorMessageAgent } from './swarm-operator'
import { readFileSafe } from './ghostshell'
import type {
  CICheck,
  CICheckType,
  CICheckStatus,
  CIPipeline,
  SwarmActivityEvent,
} from './swarm-types'

// ─── Constants ────────────────────────────────────────────────

/** Debounce window after a file change before triggering CI (ms). */
const CI_DEBOUNCE_MS = 30_000

/** Maximum time to wait for a CI command to finish (ms). */
const CI_TIMEOUT_MS = 60_000

/** Maximum output chars kept per check. */
const MAX_OUTPUT_CHARS = 500

/** Separator echoed between commands to split output. */
const CI_SEPARATOR = '___GHOSTSHELL_CI_SEP___'

/** Exit code marker echoed after each command. */
const CI_EXIT_MARKER = '___GHOSTSHELL_CI_EXIT_'

// ─── Module State ─────────────────────────────────────────────

/** Debounce timers per agent label within a swarm. Key = `${swarmId}:${agentLabel}` */
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()

/** Track which CI runs are in-flight to avoid double-triggers. */
const runningCI = new Set<string>()

/** Cache of detected CI commands per directory. */
const ciCommandCache = new Map<string, Array<{ type: CICheckType; command: string }>>()

// ─── Detect CI Commands ──────────────────────────────────────

/**
 * Detect CI commands from project config (package.json scripts, etc.).
 * Reads package.json and looks for known script names.
 * Falls back to common defaults if nothing is found.
 */
export async function detectCICommands(
  directory: string,
): Promise<Array<{ type: CICheckType; command: string }>> {
  // Check cache first
  const cached = ciCommandCache.get(directory)
  if (cached) return cached

  const commands: Array<{ type: CICheckType; command: string }> = []

  try {
    const pkgContent = await readFileSafe(`${directory}/package.json`)
    if (pkgContent) {
      const pkg = JSON.parse(pkgContent)
      const scripts: Record<string, string> = pkg.scripts || {}

      // Lint detection
      if (scripts.lint) {
        commands.push({ type: 'lint', command: 'npm run lint' })
      } else if (scripts['lint:check']) {
        commands.push({ type: 'lint', command: 'npm run lint:check' })
      }

      // Typecheck detection
      if (scripts.typecheck) {
        commands.push({ type: 'typecheck', command: 'npm run typecheck' })
      } else if (scripts['type-check']) {
        commands.push({ type: 'typecheck', command: 'npm run type-check' })
      } else if (scripts['check-types']) {
        commands.push({ type: 'typecheck', command: 'npm run check-types' })
      } else {
        // Check if typescript is a dependency
        const allDeps = { ...pkg.dependencies, ...pkg.devDependencies }
        if (allDeps.typescript) {
          commands.push({ type: 'typecheck', command: 'npx tsc --noEmit' })
        }
      }

      // Test detection
      if (scripts.test && !scripts.test.includes('no test specified')) {
        commands.push({ type: 'test', command: 'npm run test -- --reporter=verbose 2>&1 || npm run test 2>&1' })
      } else if (scripts['test:unit']) {
        commands.push({ type: 'test', command: 'npm run test:unit' })
      }

      // Build detection (optional — heavier, run last)
      if (scripts.build) {
        commands.push({ type: 'build', command: 'npm run build' })
      }
    }
  } catch {
    // package.json not found or parse error — try defaults
  }

  // If nothing found, try sensible defaults
  if (commands.length === 0) {
    commands.push(
      { type: 'lint', command: 'npx eslint . --max-warnings=0 2>&1 || true' },
      { type: 'typecheck', command: 'npx tsc --noEmit 2>&1 || true' },
    )
  }

  ciCommandCache.set(directory, commands)
  return commands
}

// ─── Run CI Checks ────────────────────────────────────────────

/**
 * Run CI checks for an agent's changes.
 * Spawns a hidden PTY, chains all commands with separators, captures output,
 * parses exit codes, and returns structured results.
 */
export async function runCIChecks(
  swarmId: string,
  agentLabel: string,
  directory: string,
  checks?: Array<{ type: CICheckType; command: string }>,
): Promise<CICheck[]> {
  const key = `${swarmId}:${agentLabel}`

  // Guard against concurrent runs for the same agent
  if (runningCI.has(key)) {
    console.log(`[CI] Skipping — already running for ${agentLabel}`)
    return []
  }

  runningCI.add(key)

  try {
    const ciCommands = checks || await detectCICommands(directory)
    if (ciCommands.length === 0) {
      return []
    }

    const now = Date.now()
    const ptyId = `ci-${swarmId.slice(-8)}-${now}`

    // Initialize check results
    const results: CICheck[] = ciCommands.map((cmd, i) => ({
      id: `ci-check-${now}-${i}`,
      type: cmd.type,
      command: cmd.command,
      status: 'pending' as CICheckStatus,
      triggeredBy: agentLabel,
      triggeredAt: now,
    }))

    // Build the combined command string that chains all checks with separators.
    // After each command we echo the exit code for parsing.
    const isWin = navigator.userAgent.includes('Windows') || navigator.platform === 'Win32'
    const chainedCommand = ciCommands.map((cmd, i) => {
      if (isWin) {
        // PowerShell: run command, capture exit code, echo separator + exit code
        return `${cmd.command}; echo "${CI_EXIT_MARKER}${i}_$LASTEXITCODE"; echo "${CI_SEPARATOR}"`
      }
      // Bash: run command, capture exit code, echo separator + exit code
      return `${cmd.command}; echo "${CI_EXIT_MARKER}${i}_$?"; echo "${CI_SEPARATOR}"`
    }).join('\n')

    // Create hidden PTY
    const createResult = await window.ghostshell.ptyCreate({
      id: ptyId,
      cwd: directory,
      cols: 200,
      rows: 50,
    })

    if (!createResult.success) {
      console.error(`[CI] Failed to create PTY for ${agentLabel}:`, createResult.error)
      return results.map(r => ({ ...r, status: 'failed' as CICheckStatus, output: 'PTY creation failed' }))
    }

    // Collect output
    let fullOutput = ''
    const outputReady = new Promise<void>((resolve) => {
      let timeoutId: ReturnType<typeof setTimeout>
      let exitCleanup: (() => void) | undefined

      const dataCleanup = window.ghostshell.ptyOnData(ptyId, (data: string) => {
        fullOutput += data
        // Check if we've received all separators (all commands done)
        const separatorCount = (fullOutput.match(new RegExp(CI_SEPARATOR, 'g')) || []).length
        if (separatorCount >= ciCommands.length) {
          cleanup()
          resolve()
        }
      })

      exitCleanup = window.ghostshell.ptyOnExit(ptyId, () => {
        cleanup()
        resolve()
      })

      timeoutId = setTimeout(() => {
        cleanup()
        resolve()
      }, CI_TIMEOUT_MS)

      function cleanup() {
        clearTimeout(timeoutId)
        if (dataCleanup) dataCleanup()
        if (exitCleanup) exitCleanup()
      }
    })

    // Write the chained command + newline to start execution
    window.ghostshell.ptyWrite(ptyId, chainedCommand + '\r')

    // Wait for output
    await outputReady

    // Kill the hidden PTY
    window.ghostshell.ptyKill(ptyId)

    // Parse the output: split by separator, extract exit codes
    const sections = fullOutput.split(CI_SEPARATOR)

    for (let i = 0; i < results.length; i++) {
      const section = sections[i] || ''

      // Extract exit code from the exit marker
      const exitMatch = section.match(new RegExp(`${CI_EXIT_MARKER}${i}_(\\d+)`))
      const exitCode = exitMatch ? parseInt(exitMatch[1], 10) : -1

      // Clean up the output (remove the exit marker line, trim ANSI codes loosely)
      let cleanOutput = section
        .replace(new RegExp(`${CI_EXIT_MARKER}\\d+_\\d+`, 'g'), '')
        .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '') // strip basic ANSI
        .trim()

      // Truncate output
      if (cleanOutput.length > MAX_OUTPUT_CHARS) {
        cleanOutput = cleanOutput.slice(-MAX_OUTPUT_CHARS) + '\n...(truncated)'
      }

      const startTime = results[i].triggeredAt
      results[i] = {
        ...results[i],
        status: exitCode === 0 ? 'passed' : exitCode === -1 ? 'skipped' : 'failed',
        output: cleanOutput || undefined,
        duration: Date.now() - startTime,
      }
    }

    return results
  } finally {
    runningCI.delete(key)
  }
}

// ─── Inject CI Feedback ──────────────────────────────────────

/**
 * Inject CI results into an agent's context via gs-mail.
 * Builds a formatted message with pass/fail status per check,
 * including failure output for self-correction.
 */
export async function injectCIFeedback(
  swarmId: string,
  agentLabel: string,
  checks: CICheck[],
): Promise<void> {
  if (checks.length === 0) return

  const passed = checks.filter(c => c.status === 'passed').length
  const failed = checks.filter(c => c.status === 'failed').length
  const total = checks.length

  // Build the feedback message
  const lines: string[] = [
    `CI/CD RESULTS for your recent changes (${passed}/${total} passed):`,
    '',
  ]

  for (const check of checks) {
    const icon = check.status === 'passed' ? 'PASS' : check.status === 'failed' ? 'FAIL' : 'SKIP'
    const durationStr = check.duration ? ` (${Math.round(check.duration / 1000)}s)` : ''
    lines.push(`[${icon}] ${check.type.toUpperCase()}${durationStr}: ${check.command}`)

    if (check.status === 'failed' && check.output) {
      lines.push('')
      lines.push('--- Error Output ---')
      lines.push(check.output)
      lines.push('--- End Output ---')
      lines.push('')
    }
  }

  if (failed > 0) {
    lines.push('')
    lines.push(`ACTION REQUIRED: ${failed} check(s) failed. Review the error output above and fix the issues before continuing.`)
    lines.push('Focus on fixing the failing checks before writing more code.')
  } else {
    lines.push('')
    lines.push('All checks passed. Continue with your current task.')
  }

  const message = lines.join('\n')

  try {
    await operatorMessageAgent(swarmId, agentLabel, message, 'message')
  } catch (err) {
    console.error(`[CI] Failed to inject feedback for ${agentLabel}:`, err)
  }
}

// ─── Update Pipeline Store ───────────────────────────────────

function updatePipelineInStore(
  swarmId: string,
  agentLabel: string,
  checks: CICheck[],
): void {
  const total = checks.length
  const passed = checks.filter(c => c.status === 'passed').length
  const passRate = total > 0 ? Math.round((passed / total) * 100) : 0

  const pipeline: CIPipeline = {
    agentLabel,
    swarmId,
    checks,
    lastRun: Date.now(),
    passRate,
  }

  useSwarmStore.getState().updateCIPipeline(agentLabel, pipeline)
}

// ─── CI Monitor ──────────────────────────────────────────────

/**
 * Start automatic CI monitoring for a swarm.
 * Subscribes to the activity feed and triggers CI after a debounce
 * when file_write/file_edit events are detected.
 *
 * Returns a cleanup function to stop monitoring.
 */
export function startCIMonitor(
  swarmId: string,
  directory: string,
): () => void {
  let lastProcessedIndex = useSwarmStore.getState().activityFeed.length
  let destroyed = false

  // Poll the activity feed periodically (every 5 seconds) to check for new file changes
  const pollInterval = setInterval(() => {
    if (destroyed) return

    const { activityFeed } = useSwarmStore.getState()
    const swarm = useSwarmStore.getState().getSwarm(swarmId)
    if (!swarm || swarm.status !== 'running') return

    // Process only new events since last check
    const newEvents = activityFeed.slice(lastProcessedIndex)
    lastProcessedIndex = activityFeed.length

    // Filter for file mutation events belonging to this swarm
    const fileChanges = newEvents.filter(
      (e: SwarmActivityEvent) =>
        e.swarmId === swarmId &&
        (e.type === 'file_write' || e.type === 'file_edit'),
    )

    if (fileChanges.length === 0) return

    // Group by agent label and debounce per agent
    const agentChanges = new Map<string, SwarmActivityEvent[]>()
    for (const event of fileChanges) {
      const existing = agentChanges.get(event.agentLabel) || []
      existing.push(event)
      agentChanges.set(event.agentLabel, existing)
    }

    for (const [agentLabel] of agentChanges) {
      scheduleCIRun(swarmId, agentLabel, directory)
    }
  }, 5_000)

  function cleanup() {
    destroyed = true
    clearInterval(pollInterval)
    // Clear all pending debounce timers for this swarm
    for (const [key, timer] of debounceTimers.entries()) {
      if (key.startsWith(`${swarmId}:`)) {
        clearTimeout(timer)
        debounceTimers.delete(key)
      }
    }
  }

  return cleanup
}

/**
 * Schedule a debounced CI run for a specific agent.
 * Resets the timer if called again within the debounce window.
 */
function scheduleCIRun(
  swarmId: string,
  agentLabel: string,
  directory: string,
): void {
  const key = `${swarmId}:${agentLabel}`

  // Clear existing timer
  const existing = debounceTimers.get(key)
  if (existing) {
    clearTimeout(existing)
  }

  // Set new debounce timer
  const timer = setTimeout(async () => {
    debounceTimers.delete(key)

    // Verify swarm is still running
    const swarm = useSwarmStore.getState().getSwarm(swarmId)
    if (!swarm || swarm.status !== 'running') return

    console.log(`[CI] Triggering CI checks for ${agentLabel} in swarm ${swarmId}`)

    try {
      // Mark checks as running in store
      const commands = await detectCICommands(directory)
      const pendingChecks: CICheck[] = commands.map((cmd, i) => ({
        id: `ci-check-${Date.now()}-${i}`,
        type: cmd.type,
        command: cmd.command,
        status: 'running' as CICheckStatus,
        triggeredBy: agentLabel,
        triggeredAt: Date.now(),
      }))
      updatePipelineInStore(swarmId, agentLabel, pendingChecks)

      // Run the checks
      const results = await runCIChecks(swarmId, agentLabel, directory, commands)

      if (results.length > 0) {
        // Update store with results
        updatePipelineInStore(swarmId, agentLabel, results)

        // Only inject feedback if there were failures (avoid noisy all-pass messages)
        const hasFailed = results.some(r => r.status === 'failed')
        if (hasFailed) {
          await injectCIFeedback(swarmId, agentLabel, results)
        }
      }
    } catch (err) {
      console.error(`[CI] CI run failed for ${agentLabel}:`, err)
    }
  }, CI_DEBOUNCE_MS)

  debounceTimers.set(key, timer)
}

/**
 * Manually trigger a CI run for a specific agent (used by the UI).
 * Bypasses the debounce timer.
 */
export async function triggerManualCIRun(
  swarmId: string,
  agentLabel: string,
  directory: string,
): Promise<CICheck[]> {
  console.log(`[CI] Manual CI trigger for ${agentLabel} in swarm ${swarmId}`)

  const commands = await detectCICommands(directory)
  const pendingChecks: CICheck[] = commands.map((cmd, i) => ({
    id: `ci-check-${Date.now()}-${i}`,
    type: cmd.type,
    command: cmd.command,
    status: 'running' as CICheckStatus,
    triggeredBy: agentLabel,
    triggeredAt: Date.now(),
  }))
  updatePipelineInStore(swarmId, agentLabel, pendingChecks)

  const results = await runCIChecks(swarmId, agentLabel, directory, commands)

  if (results.length > 0) {
    updatePipelineInStore(swarmId, agentLabel, results)
    await injectCIFeedback(swarmId, agentLabel, results)
  }

  return results
}
