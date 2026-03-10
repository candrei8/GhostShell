import { randomUUID } from 'crypto'
import { promises as fs } from 'fs'
import { app, BrowserWindow, dialog, ipcMain, Notification, shell } from 'electron'
import { is } from '@electron-toolkit/utils'
import { join } from 'path'
import { PtyManager } from './pty-manager'
import { isSafeExternalUrl, readFilePreview, runCommand, sanitizeFileBasename } from './runtime-utils'
import { initUpdater } from './updater'
import { WorkspaceManager } from './workspace-manager'

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

// Enable hardware acceleration for crisp WebGL terminal rendering
app.commandLine.appendSwitch('enable-gpu-rasterization')
app.commandLine.appendSwitch('enable-zero-copy')
app.commandLine.appendSwitch('high-dpi-support', '1')
app.commandLine.appendSwitch('force-device-scale-factor', '1')

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
      },
    ) => {
      try {
        const pty = ptyManager.create(options.id, {
          shell: options.shell,
          cwd: options.cwd,
          cols: options.cols || 80,
          rows: options.rows || 24,
          provider: options.provider,
        })

        pty.onData((data: string) => {
          mainWindow?.webContents.send(`pty:data:${options.id}`, data)
        })

        pty.onExit(({ exitCode }: { exitCode: number }) => {
          mainWindow?.webContents.send(`pty:exit:${options.id}`, exitCode)
        })

        return { success: true }
      } catch (error) {
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
    ptyManager.kill(id)
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

  // Native OS notifications
  ipcMain.on('notify:show', (_event, options: { title: string; body?: string }) => {
    if (Notification.isSupported()) {
      new Notification({
        title: options.title,
        body: options.body || '',
      }).show()
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
}

// Set app name to ensure consistent userData path across dev/prod.
// Without this, dev mode can share the generic "Electron" directory.
app.setName('GhostShell')
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
