import * as pty from 'node-pty'
import { readlinkSync, statSync } from 'fs'
import { platform } from 'os'
import { basename } from 'path'

interface PtyOptions {
  shell?: string
  cwd?: string
  cols?: number
  rows?: number
  provider?: 'claude' | 'gemini' | 'codex'
  env?: Record<string, string>
}

interface SpawnRuntimeOptions {
  useConpty?: boolean
}

interface PtyHandlers {
  onData?: (data: string) => void
  onExit?: (exitCode: number) => void
}

interface PtyEntry {
  proc: pty.IPty
  disposables: pty.IDisposable[]
}

export class PtyManager {
  private entries: Map<string, PtyEntry> = new Map()

  /** Back-compat accessor: the live process for an id, if any. */
  private getProc(id: string): pty.IPty | undefined {
    return this.entries.get(id)?.proc
  }

  private getDefaultShell(): string {
    if (platform() === 'win32') {
      return 'powershell.exe'
    }
    return process.env.SHELL || '/bin/bash'
  }

  private parseShell(shell?: string): { file: string; args: string[] } {
    const rawShell = shell?.trim() || this.getDefaultShell()
    const tokens = rawShell.match(/"[^"]+"|'[^']+'|\S+/g)?.map((token) => token.replace(/^['"]|['"]$/g, '')) || []

    if (tokens.length === 0) {
      return { file: this.getDefaultShell(), args: [] }
    }

    const [file, ...args] = tokens
    return { file, args }
  }

  private isPowerShellShell(shellFile: string): boolean {
    const executable = basename(shellFile).toLowerCase()
    return executable === 'powershell' || executable === 'powershell.exe' || executable === 'pwsh' || executable === 'pwsh.exe'
  }

  private withShellStartupArgs(shellFile: string, args: string[]): string[] {
    if (!this.isPowerShellShell(shellFile)) {
      return args
    }

    const normalizedArgs = args.map((arg) => arg.toLowerCase())
    const startupArgs: string[] = []

    if (!normalizedArgs.includes('-nologo')) {
      startupArgs.push('-NoLogo')
    }
    if (!normalizedArgs.includes('-noprofile')) {
      startupArgs.push('-NoProfile')
    }
    if (!normalizedArgs.includes('-executionpolicy')) {
      startupArgs.push('-ExecutionPolicy', 'Bypass')
    }

    return [...startupArgs, ...args]
  }

  private isValidDirectory(pathValue?: string): pathValue is string {
    if (!pathValue) return false
    try {
      return statSync(pathValue).isDirectory()
    } catch {
      return false
    }
  }

  private resolveCwd(preferredCwd?: string): string {
    const candidates = [
      preferredCwd,
      process.env.HOME,
      process.env.USERPROFILE,
      process.cwd(),
      '.',
    ]

    for (const candidate of candidates) {
      if (this.isValidDirectory(candidate)) {
        return candidate
      }
    }

    return '.'
  }

  private spawnProcess(
    shellFile: string,
    shellArgs: string[],
    cwd: string,
    env: Record<string, string>,
    options: PtyOptions,
    runtimeOptions: SpawnRuntimeOptions = {},
  ): pty.IPty {
    return pty.spawn(shellFile, shellArgs, {
      name: 'xterm-256color',
      cols: options.cols || 80,
      rows: options.rows || 24,
      cwd,
      env,
      useConpty: runtimeOptions.useConpty,
    })
  }

  private createSpawnPlans(
    preferredShell: { file: string; args: string[] },
    preferredCwd: string,
    fallbackShell: { file: string; args: string[] },
    fallbackCwd: string,
  ): Array<{ shell: { file: string; args: string[] }; cwd: string; runtime: SpawnRuntimeOptions }> {
    const plans: Array<{
      shell: { file: string; args: string[] }
      cwd: string
      runtime: SpawnRuntimeOptions
    }> = []
    const seen = new Set<string>()

    const pushPlan = (
      shell: { file: string; args: string[] },
      cwd: string,
      runtime: SpawnRuntimeOptions,
    ) => {
      const key = `${shell.file}|${shell.args.join('\u0000')}|${cwd}|${runtime.useConpty ?? 'default'}`
      if (seen.has(key)) return
      seen.add(key)
      plans.push({ shell, cwd, runtime })
    }

    if (platform() === 'win32') {
      // Prefer ConPTY: it has a larger, better-buffered pipe than winpty, so
      // large bracketed pastes arrive to agent CLIs (Claude/Codex/Gemini) as
      // a single paste block instead of getting fragmented across pipe reads.
      // Winpty stays as a fallback if ConPTY's AttachConsole fails.
      pushPlan(preferredShell, preferredCwd, { useConpty: true })
      pushPlan(preferredShell, preferredCwd, { useConpty: false })
      pushPlan(fallbackShell, fallbackCwd, { useConpty: true })
      pushPlan(fallbackShell, fallbackCwd, { useConpty: false })
      return plans
    }

    pushPlan(preferredShell, preferredCwd, {})
    pushPlan(fallbackShell, fallbackCwd, {})
    return plans
  }

  create(id: string, options: PtyOptions = {}, handlers: PtyHandlers = {}): pty.IPty {
    if (this.entries.has(id)) {
      this.kill(id)
    }

    const preferredShell = this.parseShell(options.shell)
    const preferredCwd = this.resolveCwd(options.cwd)
    const shellArgs = this.withShellStartupArgs(preferredShell.file, preferredShell.args)
    // Use winpty on Windows to avoid conpty AttachConsole errors in Electron
    const provider = options.provider || 'claude'
    const providerLabel = provider.toUpperCase()
    const env: Record<string, string> = {
      ...(process.env as Record<string, string>),
      TERM_PROGRAM: 'GhostShell',
      TERM_PROGRAM_VERSION: process.env.npm_package_version || 'dev',
      COLORTERM: 'truecolor',
      FORCE_COLOR: '1',
      CLICOLOR: '1',
      GHOSTSHELL_CLI_PRESET: 'pro',
      GHOSTSHELL_PROVIDER: providerLabel,
    }

    if (options.env) {
      // Filter out dangerous env vars that could compromise child process security
      const dangerousKeys = /^(LD_PRELOAD|LD_LIBRARY_PATH|DYLD_INSERT_LIBRARIES|DYLD_LIBRARY_PATH|PYTHONHOME|PYTHONPATH|NODE_OPTIONS|ELECTRON_RUN_AS_NODE)$/i
      for (const [key, value] of Object.entries(options.env)) {
        if (!dangerousKeys.test(key)) {
          env[key] = value
        }
      }
    }

    const fallbackShell = this.parseShell()
    const fallbackShellArgs = this.withShellStartupArgs(fallbackShell.file, fallbackShell.args)
    const fallbackCwd = this.resolveCwd()
    const spawnPlans = this.createSpawnPlans(
      { file: preferredShell.file, args: shellArgs },
      preferredCwd,
      { file: fallbackShell.file, args: fallbackShellArgs },
      fallbackCwd,
    )

    let proc: pty.IPty | null = null
    let lastError: unknown = null

    for (const plan of spawnPlans) {
      try {
        proc = this.spawnProcess(plan.shell.file, plan.shell.args, plan.cwd, env, options, plan.runtime)
        break
      } catch (error) {
        lastError = error
      }
    }

    if (!proc) {
      throw lastError instanceof Error ? lastError : new Error('Failed to spawn PTY process')
    }

    const disposables: pty.IDisposable[] = []

    if (handlers.onData) {
      const cb = handlers.onData
      disposables.push(proc.onData((data: string) => cb(data)))
    }

    // The exit disposable is stored so kill()/recreate can tear the listener
    // down — otherwise a dying old process (ConPTY flushes exit async on
    // Windows) delivers its exit event to the NEW session sharing this id.
    disposables.push(
      proc.onExit(({ exitCode }: { exitCode: number }) => {
        // Only act if this entry is still the current one for this id.
        if (this.entries.get(id)?.proc !== proc) return
        handlers.onExit?.(exitCode)
        this.entries.delete(id)
      }),
    )

    this.entries.set(id, { proc, disposables })
    return proc
  }

  write(id: string, data: string): void {
    const proc = this.getProc(id)
    if (!proc || !data) return
    // Hand the full payload to node-pty in one call. node-pty queues to the
    // PTY pipe with the OS's own backpressure — no setTimeout delays means
    // bracketed-paste boundaries stay tight and Claude sees one paste block.
    proc.write(data)
  }

  /** Flow control: pause/resume the underlying pipe (ack-based backpressure). */
  pause(id: string): void {
    try { this.getProc(id)?.pause() } catch { /* dead process */ }
  }

  resume(id: string): void {
    try { this.getProc(id)?.resume() } catch { /* dead process */ }
  }

  resize(id: string, cols: number, rows: number): void {
    try {
      this.getProc(id)?.resize(cols, rows)
    } catch {
      // Ignore resize errors for dead processes
    }
  }

  /** Get the current working directory of a PTY process */
  getCwd(id: string): string | null {
    const proc = this.getProc(id)
    if (!proc) return null

    try {
      // node-pty exposes the process property which we can use to get the PID
      const pid = proc.pid
      if (!pid) return null

      // On Windows, we can't easily get CWD from PID without native addons.
      // Instead, return null and let the renderer track CWD via shell integration.
      // On Linux/macOS we could read /proc/<pid>/cwd
      if (platform() !== 'win32') {
        try {
          const cwd = readlinkSync(`/proc/${pid}/cwd`)
          return cwd
        } catch {
          return null
        }
      }

      return null
    } catch {
      return null
    }
  }

  /** Check if a PTY process is still alive */
  isAlive(id: string): boolean {
    const proc = this.getProc(id)
    if (!proc) return false
    try {
      // node-pty process — check if pid is still valid
      const pid = proc.pid
      if (!pid || pid <= 0) return false
      // On all platforms, sending signal 0 checks if the process exists
      process.kill(pid, 0)
      return true
    } catch {
      return false
    }
  }

  kill(id: string): void {
    const entry = this.entries.get(id)
    if (!entry) return
    // Dispose data/exit listeners BEFORE killing so a late flush from the dying
    // process can't reach a renderer that has since re-subscribed under this id.
    for (const d of entry.disposables) {
      try { d.dispose() } catch { /* noop */ }
    }
    try {
      entry.proc.kill()
    } catch {
      // Already dead
    }
    this.entries.delete(id)
  }

  killAll(): void {
    for (const id of [...this.entries.keys()]) {
      this.kill(id)
    }
  }
}
