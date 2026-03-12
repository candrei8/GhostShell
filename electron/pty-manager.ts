import * as pty from 'node-pty'
import { statSync } from 'fs'
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

export class PtyManager {
  private processes: Map<string, pty.IPty> = new Map()

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

  create(id: string, options: PtyOptions = {}): pty.IPty {
    if (this.processes.has(id)) {
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
      Object.assign(env, options.env)
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

    this.processes.set(id, proc)
    proc.onExit(() => {
      if (this.processes.get(id) === proc) {
        this.processes.delete(id)
      }
    })
    return proc
  }

  write(id: string, data: string): void {
    this.processes.get(id)?.write(data)
  }

  resize(id: string, cols: number, rows: number): void {
    try {
      this.processes.get(id)?.resize(cols, rows)
    } catch {
      // Ignore resize errors for dead processes
    }
  }

  /** Get the current working directory of a PTY process */
  getCwd(id: string): string | null {
    const proc = this.processes.get(id)
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
          const fs = require('fs')
          const cwd = fs.readlinkSync(`/proc/${pid}/cwd`)
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

  kill(id: string): void {
    const proc = this.processes.get(id)
    if (proc) {
      try {
        proc.kill()
      } catch {
        // Already dead
      }
      this.processes.delete(id)
    }
  }

  killAll(): void {
    for (const id of this.processes.keys()) {
      this.kill(id)
    }
  }
}
