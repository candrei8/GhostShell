import { randomUUID } from 'crypto'
import { mkdirSync, promises as fs, rmSync } from 'fs'
import { app, BrowserWindow, dialog, ipcMain, Notification, shell } from 'electron'
import { is } from '@electron-toolkit/utils'
import { isAbsolute, join, normalize, resolve as pathResolve } from 'path'
import { PtyManager } from './pty-manager'
import { isSafeExternalUrl, readFilePreview, runCommand, sanitizeFileBasename } from './runtime-utils'
import { initUpdater } from './updater'
import { WorkspaceManager } from './workspace-manager'
import * as swarmFileLock from './swarm-file-lock-manager'

type Provider = 'claude' | 'gemini' | 'codex'

const EMPTY_GIT_STATUS = {
  branch: '',
  modified: 0,
  added: 0,
  deleted: 0,
  ahead: 0,
  total: 0,
  isRepo: false,
}

const CLI_DISCOVERY_COMMANDS: Record<Provider, string[][]> = {
  claude: [['models'], ['--help']],
  gemini: [['models', 'list'], ['models'], ['--help']],
  codex: [['models'], ['--help']],
}

let mainWindow: BrowserWindow | null = null
let isClosing = false
let closeForceTimer: ReturnType<typeof setTimeout> | null = null

const ptyManager = new PtyManager()
const workspaceManager = new WorkspaceManager()

// ── PTY output flow control + coalescing ──────────────────────────────────
// Agent CLIs cat huge files and run verbose builds; forwarding one
// webContents.send per node-pty chunk floods the renderer event loop. We
// coalesce chunks on a short timer and apply ack-based backpressure with the
// same watermarks VS Code uses (FlowControlConstants).
const FLOW_HIGH_WATERMARK = 100_000 // unacked chars before pausing the pty
const FLOW_LOW_WATERMARK = 5_000 // resume threshold
const FLOW_FLUSH_MS = 8

interface PtyFlowState {
  buffer: string
  unacked: number
  paused: boolean
  flushTimer: ReturnType<typeof setTimeout> | null
}

const ptyFlow = new Map<string, PtyFlowState>()

function disposePtyFlow(id: string): void {
  const state = ptyFlow.get(id)
  if (state?.flushTimer) clearTimeout(state.flushTimer)
  ptyFlow.delete(id)
}

function flushPtyBuffer(id: string): void {
  const state = ptyFlow.get(id)
  if (!state) return
  state.flushTimer = null
  if (!state.buffer) return
  // If the window is gone the renderer can never ack — dispose the flow rather
  // than clearing the buffer into the void and leaving the PTY paused-and-alive.
  if (!mainWindow || mainWindow.isDestroyed()) {
    disposePtyFlow(id)
    return
  }
  const payload = state.buffer
  state.buffer = ''
  mainWindow.webContents.send(`pty:data:${id}`, payload)
}

// Set app name early to ensure consistent userData path for cache dirs below
app.setName('GhostShell')

// Enable hardware acceleration for crisp WebGL terminal rendering.
// NOTE: do NOT force-device-scale-factor here — it makes the whole app render
// tiny on the typical 125-150% scaled Windows display and disables per-monitor
// DPI. The WebGL renderer already sizes its canvas by devicePixelRatio, so
// glyphs stay crisp at fractional scales without lying to the compositor.
app.commandLine.appendSwitch('enable-gpu-rasterization')
app.commandLine.appendSwitch('enable-zero-copy')

// Keep Chromium cache/session data in a dedicated location.
// In dev on Windows, Chromium can fail to move the default cache when a prior
// helper process still holds a lock. A per-process sessionData directory avoids
// that contention and removes the noisy GPU cache access-denied errors.
const sessionDataDir = is.dev
  ? join(app.getPath('temp'), 'GhostShell-dev', `session-${process.pid}`)
  : join(app.getPath('userData'), 'session-data')
const diskCacheDir = join(sessionDataDir, 'Cache')
const gpuCacheDir = join(sessionDataDir, 'GPUCache')
try {
  mkdirSync(sessionDataDir, { recursive: true })
} catch {
  // Best effort only.
}

if (is.dev) {
  try { rmSync(diskCacheDir, { recursive: true, force: true }) } catch {}
  try { rmSync(gpuCacheDir, { recursive: true, force: true }) } catch {}
}
try { rmSync(gpuCacheDir, { recursive: true, force: true }) } catch { /* may be locked by current process — harmless */ }
app.setPath('sessionData', sessionDataDir)
app.commandLine.appendSwitch('disk-cache-dir', diskCacheDir)
app.commandLine.appendSwitch('gpu-disk-cache-dir', gpuCacheDir)

function isProvider(value: string): value is Provider {
  return value === 'claude' || value === 'gemini' || value === 'codex'
}

function normalizeCommandInput(command: string | undefined, fallback: string): string {
  const trimmed = command?.trim()
  if (!trimmed) return fallback

  const wrappedMatch = trimmed.match(/^(['"])(.*)\1$/)
  return wrappedMatch ? wrappedMatch[2] : trimmed
}

function clearCloseForceTimer(): void {
  if (closeForceTimer) {
    clearTimeout(closeForceTimer)
    closeForceTimer = null
  }
}

function getStorageDir(): string {
  return join(app.getPath('userData'), 'storage')
}

/**
 * Validate that IPC input strings are reasonable (not absurdly long, no null bytes).
 * File lock inputs (agentName, taskId, file paths) are validated here.
 */
function sanitizeSwarmInput(value: string, label: string, maxLen = 256): string {
  if (typeof value !== 'string') throw new Error(`${label} must be a string`)
  if (value.length > maxLen) throw new Error(`${label} exceeds max length of ${maxLen}`)
  if (value.includes('\0')) throw new Error(`${label} contains null bytes`)
  return value
}

async function getStorageFilePath(key: string): Promise<string | null> {
  const safeKey = sanitizeFileBasename(key)
  if (!safeKey) return null

  const storageDir = getStorageDir()
  await fs.mkdir(storageDir, { recursive: true })
  return join(storageDir, `${safeKey}.json`)
}

function parseGitStatus(statusRaw: string): {
  modified: number
  added: number
  deleted: number
  total: number
  fileStatuses: Record<string, string>
} {
  const lines = statusRaw
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean)

  const modified = lines.filter((line) => line.startsWith(' M') || line.startsWith('M ')).length
  const added = lines.filter((line) => line.startsWith('A ') || line.startsWith('??')).length
  const deleted = lines.filter((line) => line.startsWith(' D') || line.startsWith('D ')).length
  const fileStatuses: Record<string, string> = {}

  for (const line of lines) {
    const code = line.substring(0, 2).trim()
    const filePath = line.substring(3).trim().replace(/^"(.*)"$/, '$1')
    const fileName = filePath.includes('/') ? filePath.split('/').pop()! : filePath
    const statusChar = code === '??' ? '?' : code.charAt(0) === ' ' ? code.charAt(1) : code.charAt(0)
    fileStatuses[fileName] = statusChar
    if (filePath !== fileName) {
      fileStatuses[filePath] = statusChar
    }
  }

  return {
    modified,
    added,
    deleted,
    total: lines.length,
    fileStatuses,
  }
}

async function discoverCliModels(provider: Provider, rawCommand?: string) {
  const command = normalizeCommandInput(rawCommand, provider)

  for (const args of CLI_DISCOVERY_COMMANDS[provider]) {
    try {
      const output = await runCommand(command, args, {
        timeoutMs: args.includes('--help') ? 10000 : 15000,
      })
      if (output.trim()) {
        return { success: true, output }
      }
    } catch {
      // Try the next fallback command
    }
  }

  return {
    success: false,
    output: '',
    error: `${provider} CLI not available`,
  }
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#1a1025',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      zoomFactor: 1.0,
    },
  })

  mainWindow = window

  window.on('ready-to-show', () => {
    window.show()
    initUpdater(window)
  })

  // Close handshake: let renderer save tab snapshot before quitting
  window.on('close', (event) => {
    if (isClosing) return

    event.preventDefault()
    clearCloseForceTimer()
    window.webContents.send('app:before-close')

    // Safety timeout: if renderer doesn't respond in 3s, force close.
    closeForceTimer = setTimeout(() => {
      isClosing = true
      window.destroy()
    }, 3000)
  })

  window.on('closed', () => {
    clearCloseForceTimer()
    if (mainWindow === window) {
      mainWindow = null
    }
    isClosing = false
  })

  window.webContents.setWindowOpenHandler((details) => {
    if (isSafeExternalUrl(details.url)) {
      void shell.openExternal(details.url)
    }
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void window.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// IPC Handlers
function setupIPC(): void {
  // Window controls
  ipcMain.on('window:minimize', () => mainWindow?.minimize())
  ipcMain.on('window:maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow?.maximize()
    }
  })
  ipcMain.on('window:close', () => mainWindow?.close())
  ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized())
  ipcMain.on('window:toggleFullscreen', () => {
    if (mainWindow) {
      mainWindow.setFullScreen(!mainWindow.isFullScreen())
    }
  })

  // PTY handlers
  ipcMain.handle(
    'pty:create',
    async (
      _event,
      options: {
        id: string
        shell?: string
        cwd?: string
        cols?: number
        rows?: number
        provider?: Provider
        env?: Record<string, string>
      },
    ) => {
      try {
        const id = options.id
        // Reset any flow state from a previous process under this id.
        disposePtyFlow(id)
        const flow: PtyFlowState = { buffer: '', unacked: 0, paused: false, flushTimer: null }
        ptyFlow.set(id, flow)

        ptyManager.create(
          id,
          {
            shell: options.shell,
            cwd: options.cwd,
            cols: options.cols || 80,
            rows: options.rows || 24,
            provider: options.provider,
            env: options.env,
          },
          {
            onData: (data: string) => {
              flow.buffer += data
              flow.unacked += data.length
              if (!flow.paused && flow.unacked >= FLOW_HIGH_WATERMARK) {
                flow.paused = true
                ptyManager.pause(id)
              }
              if (!flow.flushTimer) {
                flow.flushTimer = setTimeout(() => flushPtyBuffer(id), FLOW_FLUSH_MS)
              }
            },
            onExit: (exitCode: number) => {
              flushPtyBuffer(id)
              disposePtyFlow(id)
              mainWindow?.webContents.send(`pty:exit:${id}`, exitCode)
            },
          },
        )

        return { success: true }
      } catch (error) {
        disposePtyFlow(options.id)
        return { success: false, error: String(error) }
      }
    },
  )

  ipcMain.on('pty:write', (_event, id: string, data: string) => {
    ptyManager.write(id, data)
  })

  ipcMain.on('pty:resize', (_event, id: string, cols: number, rows: number) => {
    ptyManager.resize(id, cols, rows)
  })

  ipcMain.on('pty:kill', (_event, id: string) => {
    disposePtyFlow(id)
    ptyManager.kill(id)
  })

  // Ack-based flow control: renderer reports how many chars it has rendered.
  ipcMain.on('pty:ack', (_event, id: string, charCount: number) => {
    const flow = ptyFlow.get(id)
    if (!flow) return
    flow.unacked = Math.max(0, flow.unacked - (charCount || 0))
    if (flow.paused && flow.unacked < FLOW_LOW_WATERMARK) {
      flow.paused = false
      ptyManager.resume(id)
    }
  })

  ipcMain.handle('pty:isAlive', (_event, id: string) => {
    return ptyManager.isAlive(id)
  })

  ipcMain.handle('pty:getCwd', (_event, id: string) => {
    return ptyManager.getCwd(id)
  })

  // File system handlers
  ipcMain.handle('fs:readDir', async (_event, dirPath: string) => {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true })
      return await Promise.all(
        entries.map(async (entry) => {
          const fullPath = join(dirPath, entry.name)
          const isDirectory = entry.isDirectory()
          let size: number | undefined
          let modifiedAt: number | undefined

          try {
            const stats = await fs.stat(fullPath)
            if (!isDirectory) {
              size = stats.size
            }
            modifiedAt = stats.mtimeMs
          } catch {
            // Skip stat data if the entry disappears mid-refresh.
          }

          return {
            name: entry.name,
            isDirectory,
            path: fullPath,
            size,
            modifiedAt,
          }
        }),
      )
    } catch {
      return []
    }
  })

  // Workspace handlers
  ipcMain.handle('workspace:save', async (_event, name: string, data: unknown) => {
    return await workspaceManager.save(name, data)
  })

  ipcMain.handle('workspace:load', async (_event, name: string) => {
    return await workspaceManager.load(name)
  })

  ipcMain.handle('workspace:list', async () => {
    return await workspaceManager.list()
  })

  // Git handlers
  ipcMain.handle('git:status', async (_event, cwd: string) => {
    try {
      await runCommand('git', ['rev-parse', '--git-dir'], { cwd, timeoutMs: 5000 })

      let branch = ''
      try {
        branch = (await runCommand('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
          cwd,
          timeoutMs: 5000,
        })).trim()
      } catch {
        try {
          branch = (await runCommand('git', ['symbolic-ref', '--short', 'HEAD'], {
            cwd,
            timeoutMs: 5000,
          })).trim() || '(no commits)'
        } catch {
          branch = '(no commits)'
        }
      }

      const statusRaw = await runCommand('git', ['status', '--porcelain'], {
        cwd,
        timeoutMs: 5000,
      })
      const parsedStatus = parseGitStatus(statusRaw)

      const ahead = await runCommand('git', ['rev-list', '--count', '@{u}..HEAD'], {
        cwd,
        timeoutMs: 5000,
      })
        .then((output) => parseInt(output.trim(), 10) || 0)
        .catch(() => 0)

      return {
        branch,
        modified: parsedStatus.modified,
        added: parsedStatus.added,
        deleted: parsedStatus.deleted,
        ahead,
        total: parsedStatus.total,
        isRepo: true,
        fileStatuses: parsedStatus.fileStatuses,
      }
    } catch {
      return EMPTY_GIT_STATUS
    }
  })

  // Git file hotspots (commit frequency per file in last 30 days)
  ipcMain.handle('git:fileHotspots', async (_event, cwd: string) => {
    try {
      const output = await runCommand('git', [
        'log', '--format=', '--name-only', '--since=30 days ago',
      ], { cwd, timeoutMs: 15000 })

      const counts: Record<string, number> = {}
      for (const line of output.split('\n')) {
        const file = line.trim()
        if (file) counts[file] = (counts[file] || 0) + 1
      }
      return counts
    } catch {
      return {}
    }
  })

  // Git checkpoint: snapshot the FULL working tree (tracked + untracked, honoring
  // .gitignore) into a commit object on no branch, WITHOUT touching the user's
  // index or working tree. Uses a throwaway index via GIT_INDEX_FILE so
  // `git add -A` doesn't stage anything in the real index. This is the piece the
  // old `git stash create` missed — stash never captured untracked files, so
  // rollback's `git clean -fd` used to permanently delete agent-written files.
  ipcMain.handle('git:createCheckpoint', async (_event, cwd: string) => {
    const tmpIndex = join(app.getPath('temp'), `ghostshell-idx-${randomUUID()}`)
    try {
      // Provide a git identity via env so commit-tree never fails on a repo with
      // no configured user.name/user.email (it silently fell back to HEAD-only
      // before, losing all uncommitted + untracked changes while reporting clean).
      const env = {
        GIT_INDEX_FILE: tmpIndex,
        GIT_AUTHOR_NAME: 'GhostShell',
        GIT_AUTHOR_EMAIL: 'checkpoint@ghostshell.local',
        GIT_COMMITTER_NAME: 'GhostShell',
        GIT_COMMITTER_EMAIL: 'checkpoint@ghostshell.local',
      }
      await runCommand('git', ['read-tree', 'HEAD'], { cwd, env, timeoutMs: 10000 })
      await runCommand('git', ['add', '-A'], { cwd, env, timeoutMs: 20000 })
      const tree = (await runCommand('git', ['write-tree'], { cwd, env, timeoutMs: 10000 })).trim()
      const commit = (
        await runCommand('git', ['commit-tree', tree, '-p', 'HEAD', '-m', 'ghostshell-checkpoint'], {
          cwd,
          env,
          timeoutMs: 10000,
        })
      ).trim()
      // Anchor the commit under a ref so `git gc` / `git prune` can't collect
      // this otherwise-dangling object before the user rolls back to it.
      await runCommand('git', ['update-ref', `refs/ghostshell/checkpoints/${commit}`, commit], {
        cwd,
        timeoutMs: 10000,
      })
      return { hash: commit, clean: false }
    } catch {
      // Snapshot path failed (e.g. no commits yet). Fall back to HEAD as a
      // reference point — still non-destructive on rollback.
      try {
        const headHash = await runCommand('git', ['rev-parse', 'HEAD'], { cwd, timeoutMs: 5000 })
        return { hash: headHash.trim(), clean: true }
      } catch (error) {
        return { hash: '', clean: true, error: String(error) }
      }
    } finally {
      try { rmSync(tmpIndex, { force: true }) } catch { /* best effort */ }
    }
  })

  // Git rollback: restore every file captured in the checkpoint to its snapshot
  // content. We NEVER run `git clean -fd` — deleting files the checkpoint didn't
  // capture is data loss. `git checkout <snapshot> -- .` is non-destructive to
  // files created after the checkpoint (they are simply left in place).
  ipcMain.handle('git:rollback', async (_event, cwd: string, hash: string, _isClean: boolean) => {
    const trimmed = (hash || '').trim()
    if (!trimmed) {
      return { success: false, error: 'No checkpoint hash to roll back to' }
    }
    try {
      await runCommand('git', ['checkout', trimmed, '--', '.'], { cwd, timeoutMs: 15000 })
      return { success: true }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  // File CRUD handlers
  ipcMain.handle('fs:createFile', async (_event, filePath: string, content?: string) => {
    try {
      await fs.writeFile(filePath, content || '', 'utf-8')
      return { success: true }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('fs:createDir', async (_event, dirPath: string) => {
    try {
      await fs.mkdir(dirPath, { recursive: true })
      return { success: true }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('fs:copy', async (_event, sourcePath: string, destinationPath: string) => {
    try {
      await fs.cp(sourcePath, destinationPath, {
        recursive: true,
        force: false,
        errorOnExist: true,
      })
      return { success: true }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('fs:rename', async (_event, oldPath: string, newPath: string) => {
    try {
      await fs.rename(oldPath, newPath)
      return { success: true }
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'EXDEV') {
        try {
          await fs.cp(oldPath, newPath, { recursive: true, force: false, errorOnExist: true })
          const stats = await fs.stat(oldPath)
          if (stats.isDirectory()) {
            await fs.rm(oldPath, { recursive: true, force: true })
          } else {
            await fs.unlink(oldPath)
          }
          return { success: true }
        } catch (fallbackError) {
          return { success: false, error: String(fallbackError) }
        }
      }

      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('fs:delete', async (_event, targetPath: string) => {
    try {
      const stats = await fs.stat(targetPath)
      if (stats.isDirectory()) {
        await fs.rm(targetPath, { recursive: true, force: true })
      } else {
        await fs.unlink(targetPath)
      }
      return { success: true }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('fs:preview', async (_event, filePath: string, maxLines = 20) => {
    try {
      const preview = await readFilePreview(filePath, maxLines)
      return { success: true, ...preview }
    } catch (error) {
      return { success: false, error: String(error), content: '', totalLines: 0 }
    }
  })

  ipcMain.handle('fs:readFile', async (_event, filePath: string) => {
    try {
      const content = await fs.readFile(filePath, 'utf-8')
      return { success: true, content }
    } catch (error) {
      return { success: false, content: '', error: String(error) }
    }
  })

  // Notification support: native OS notification + taskbar flash when app is unfocused
  ipcMain.on('notify:show', (_event, payload?: { title?: string; body?: string }) => {
    if (mainWindow && !mainWindow.isFocused()) {
      const title = typeof payload?.title === 'string' && payload.title.trim()
        ? payload.title.trim()
        : 'GhostShell'
      const body = typeof payload?.body === 'string' ? payload.body : ''

      if (Notification.isSupported()) {
        try {
          const notification = new Notification({
            title,
            body,
            silent: true,
          })
          notification.on('click', () => {
            if (!mainWindow) return
            if (mainWindow.isMinimized()) mainWindow.restore()
            mainWindow.show()
            mainWindow.focus()
          })
          notification.show()
        } catch {
          // Fall through to taskbar flash if native notification fails.
        }
      }

      mainWindow.flashFrame(true)
      const stopFlash = () => {
        mainWindow?.flashFrame(false)
        mainWindow?.removeListener('focus', stopFlash)
      }
      mainWindow.once('focus', stopFlash)
    }
  })

  // Persistent storage handlers for Zustand stores
  ipcMain.handle('storage:get', async (_event, key: string) => {
    try {
      const filePath = await getStorageFilePath(key)
      if (!filePath) return null

      const data = await fs.readFile(filePath, 'utf-8')
      return JSON.parse(data)
    } catch {
      return null
    }
  })

  ipcMain.handle('storage:set', async (_event, key: string, value: unknown) => {
    try {
      const filePath = await getStorageFilePath(key)
      if (!filePath) {
        return { success: false, error: 'Invalid storage key' }
      }

      await fs.writeFile(filePath, JSON.stringify(value, null, 2), 'utf-8')
      return { success: true }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('storage:remove', async (_event, key: string) => {
    try {
      const filePath = await getStorageFilePath(key)
      if (!filePath) {
        return { success: false, error: 'Invalid storage key' }
      }

      await fs.unlink(filePath)
      return { success: true }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  // Swarm file lock handlers
  ipcMain.handle('swarm:acquireLocks', async (
    _event,
    swarmRoot: string,
    taskId: string,
    agentName: string,
    files: string[]
  ) => {
    try {
      sanitizeSwarmInput(swarmRoot, 'swarmRoot', 1024)
      sanitizeSwarmInput(taskId, 'taskId', 128)
      sanitizeSwarmInput(agentName, 'agentName', 128)
      for (const f of files) sanitizeSwarmInput(f, 'file', 512)

      const binDir = join(swarmRoot, 'bin')
      try { await fs.access(binDir) } catch { return { success: false, error: 'Swarm directory not found' } }
      return await swarmFileLock.acquireLocks(swarmRoot, taskId, agentName, files)
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('swarm:releaseLocks', async (_event, swarmRoot: string, taskId: string) => {
    try {
      await swarmFileLock.releaseLocks(swarmRoot, taskId)
      return { success: true }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('swarm:checkLock', async (_event, swarmRoot: string, filePath: string) => {
    try {
      return await swarmFileLock.checkLock(swarmRoot, filePath)
    } catch (error) {
      return null
    }
  })

  ipcMain.handle('swarm:getAllLocks', async (_event, swarmRoot: string) => {
    try {
      return await swarmFileLock.getAllLocks(swarmRoot)
    } catch (error) {
      return {}
    }
  })

  // Save clipboard image to temp file (returns the file path)
  ipcMain.handle('file:saveTempImage', async (_event, buffer: ArrayBuffer, mimeType: string) => {
    const ext =
      mimeType === 'image/png'
        ? '.png'
        : mimeType === 'image/jpeg'
          ? '.jpg'
          : mimeType === 'image/gif'
            ? '.gif'
            : mimeType === 'image/webp'
              ? '.webp'
              : '.png'

    const directory = join(app.getPath('userData'), 'temp-images')
    await fs.mkdir(directory, { recursive: true })

    const filePath = join(directory, `clipboard-${randomUUID()}${ext}`)
    await fs.writeFile(filePath, Buffer.from(buffer))
    return filePath
  })

  // Close handshake: renderer signals it's done saving
  ipcMain.on('app:close-ready', () => {
    clearCloseForceTimer()
    isClosing = true
    mainWindow?.destroy()
  })

  // CLI model discovery
  ipcMain.handle('cli:discoverModels', async (_event, provider: string, cliCommand?: string) => {
    if (!isProvider(provider)) {
      return { success: false, output: '', error: 'Unsupported provider' }
    }

    return await discoverCliModels(provider, cliCommand)
  })

  // CLI version check
  ipcMain.handle('cli:getVersion', async (_event, cliCommand: string) => {
    const command = normalizeCommandInput(cliCommand, '')
    if (!command) {
      return { installed: false, version: '' }
    }

    try {
      const version = (await runCommand(command, ['--version'], { timeoutMs: 10000 })).trim()
      return { installed: true, version }
    } catch {
      return { installed: false, version: '' }
    }
  })

  // App version
  ipcMain.handle('app:getVersion', () => app.getVersion())

  // Directory picker
  // Open without parent window to avoid dialog appearing behind frameless window on Windows
  ipcMain.handle('dialog:selectDirectory', async () => {
    if (!mainWindow) return null

    // On Windows with frame:false, the dialog can appear behind the window.
    // Opening without a parent ensures the dialog is always visible.
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Select Project Directory',
      defaultPath: app.getPath('home'),
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    // Re-focus the main window after the dialog closes
    mainWindow.focus()

    return result.filePaths[0]
  })

  // Verify a path exists and is a directory
  ipcMain.handle('fs:isDirectory', async (_event, dirPath: string) => {
    try {
      const stats = await fs.stat(dirPath)
      return stats.isDirectory()
    } catch {
      return false
    }
  })

  // Shell path resolution
  ipcMain.handle('shell:getHomedir', () => app.getPath('home'))

  ipcMain.handle('shell:resolvePath', async (_event, input: string, basePath: string) => {
    try {
      let p = (typeof input === 'string' ? input : '').trim()
      if (p.toLowerCase().startsWith('cd ')) p = p.slice(3).trim()
      if (!p) return { success: false, error: 'Empty path' }

      const homeDir = app.getPath('home')

      // Resolve ~
      if (p === '~') {
        p = homeDir
      } else if (p.startsWith('~/') || p.startsWith('~\\')) {
        p = join(homeDir, p.slice(2))
      }

      // Determine a valid base directory
      let base = homeDir
      if (typeof basePath === 'string' && basePath.trim()) {
        try {
          const baseStat = await fs.stat(basePath)
          if (baseStat.isDirectory()) base = basePath
        } catch { /* fallback to homeDir */ }
      }

      // Resolve the path (absolute or relative to base)
      const resolved = isAbsolute(p) ? normalize(p) : pathResolve(base, p)

      // Validate it exists and is a directory
      const stats = await fs.stat(resolved)
      if (!stats.isDirectory()) {
        return { success: false, error: 'Not a directory' }
      }

      return { success: true, path: resolved }
    } catch {
      return { success: false, error: 'Directory not found' }
    }
  })
}

app.setAppUserModelId('com.ghostshell.app')

app.whenReady().then(() => {
  setupIPC()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  ptyManager.killAll()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
