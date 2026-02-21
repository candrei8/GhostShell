import * as pty from 'node-pty'
import { platform } from 'os'

interface PtyOptions {
  shell?: string
  cwd?: string
  cols?: number
  rows?: number
}

export class PtyManager {
  private processes: Map<string, pty.IPty> = new Map()

  private getDefaultShell(): string {
    if (platform() === 'win32') {
      return 'powershell.exe'
    }
    return process.env.SHELL || '/bin/bash'
  }

  create(id: string, options: PtyOptions = {}): pty.IPty {
    if (this.processes.has(id)) {
      this.kill(id)
    }

    const shell = options.shell || this.getDefaultShell()
    // Suppress PowerShell startup banner with -NoLogo
    const shellArgs = /powershell/i.test(shell) ? ['-NoLogo', '-NoProfile'] : []
    // Use winpty on Windows to avoid conpty AttachConsole errors in Electron
    const proc = pty.spawn(shell, shellArgs, {
      name: 'xterm-256color',
      cols: options.cols || 80,
      rows: options.rows || 24,
      cwd: options.cwd || process.env.HOME || process.env.USERPROFILE || '.',
      env: { ...process.env } as Record<string, string>,
      useConpty: false,
    })

    this.processes.set(id, proc)
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
