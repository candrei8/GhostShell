import { spawn } from 'child_process'
import { createReadStream } from 'fs'
import { stat } from 'fs/promises'
import * as readline from 'readline'

interface RunCommandOptions {
  cwd?: string
  timeoutMs?: number
}

interface SpawnSpec {
  command: string
  args: string[]
}

const INVALID_FILE_BASENAME = /[<>:"/\\|?*\x00-\x1F]/
const SAFE_EXTERNAL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:'])

function quoteWindowsArgument(value: string): string {
  if (!value) return '""'
  const escaped = value.replace(/"/g, '""')
  return /[\s"&|<>^()]/.test(escaped) ? `"${escaped}"` : escaped
}

function getSpawnSpec(command: string, args: string[]): SpawnSpec {
  if (process.platform !== 'win32') {
    return { command, args }
  }

  const commandLine = [command, ...args].map(quoteWindowsArgument).join(' ')
  return {
    command: process.env.ComSpec || 'cmd.exe',
    args: ['/d', '/s', '/c', commandLine],
  }
}

export function sanitizeFileBasename(rawName: string): string | null {
  const trimmed = rawName.trim()
  if (!trimmed || trimmed === '.' || trimmed === '..') return null
  if (INVALID_FILE_BASENAME.test(trimmed)) return null
  return trimmed
}

export function isSafeExternalUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl)
    return SAFE_EXTERNAL_PROTOCOLS.has(parsed.protocol)
  } catch {
    return false
  }
}

export async function runCommand(
  command: string,
  args: string[],
  options: RunCommandOptions = {},
): Promise<string> {
  const { command: executable, args: spawnArgs } = getSpawnSpec(command, args)

  return await new Promise<string>((resolve, reject) => {
    const child = spawn(executable, spawnArgs, {
      cwd: options.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })

    let stdout = ''
    let stderr = ''
    let settled = false
    let timeout: ReturnType<typeof setTimeout> | null = null

    const finalize = (error?: Error, output?: string) => {
      if (settled) return
      settled = true
      if (timeout) clearTimeout(timeout)
      if (error) {
        reject(error)
      } else {
        resolve(output ?? '')
      }
    }

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk
    })

    child.on('error', (error) => finalize(error))
    child.on('close', (code) => {
      if (code === 0) {
        finalize(undefined, stdout.replace(/\r\n/g, '\n'))
        return
      }

      const message = stderr.trim() || stdout.trim() || `Command exited with code ${code ?? 'unknown'}`
      finalize(new Error(message))
    })

    const timeoutMs = options.timeoutMs ?? 15000
    timeout =
      timeoutMs > 0
        ? setTimeout(() => {
            try {
              child.kill()
            } catch {
              // ignore kill failures during timeout cleanup
            }
            finalize(new Error(`Command timed out after ${timeoutMs}ms`))
          }, timeoutMs)
        : null
  })
}

export async function readFilePreview(
  filePath: string,
  maxLines = 20,
): Promise<{ content: string; totalLines: number }> {
  const fileStat = await stat(filePath)
  if (!fileStat.isFile()) {
    return { content: '', totalLines: 0 }
  }

  const previewLines: string[] = []
  let totalLines = 0
  const limit = Math.max(1, Math.floor(maxLines))
  const stream = createReadStream(filePath, { encoding: 'utf8' })
  const reader = readline.createInterface({
    input: stream,
    crlfDelay: Infinity,
  })

  try {
    for await (const line of reader) {
      totalLines += 1
      if (previewLines.length < limit) {
        previewLines.push(line)
      }
    }
  } finally {
    reader.close()
    stream.destroy()
  }

  if (fileStat.size > 0 && totalLines === 0) {
    totalLines = 1
  }

  return {
    content: previewLines.join('\n'),
    totalLines,
  }
}
