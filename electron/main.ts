import { app, BrowserWindow, ipcMain, shell, dialog, Notification } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { PtyManager } from './pty-manager'
import { WorkspaceManager } from './workspace-manager'
import { initUpdater } from './updater'

let mainWindow: BrowserWindow | null = null
let isClosing = false
const ptyManager = new PtyManager()
const workspaceManager = new WorkspaceManager()

// Enable hardware acceleration for crisp WebGL terminal rendering
app.commandLine.appendSwitch('enable-gpu-rasterization')
app.commandLine.appendSwitch('enable-zero-copy')
app.commandLine.appendSwitch('high-dpi-support', '1')
app.commandLine.appendSwitch('force-device-scale-factor', '1')

function createWindow(): void {
  mainWindow = new BrowserWindow({
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

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
    initUpdater(mainWindow!)
  })

  // Close handshake: let renderer save tab snapshot before quitting
  mainWindow.on('close', (e) => {
    if (isClosing) return // already confirmed, let it close
    e.preventDefault()
    mainWindow?.webContents.send('app:before-close')
    // Safety timeout: if renderer doesn't respond in 3s, force close
    setTimeout(() => {
      isClosing = true
      mainWindow?.destroy()
    }, 3000)
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
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
  ipcMain.handle('pty:create', async (_event, options: { id: string; shell?: string; cwd?: string; cols?: number; rows?: number }) => {
    const pty = ptyManager.create(options.id, {
      shell: options.shell,
      cwd: options.cwd,
      cols: options.cols || 80,
      rows: options.rows || 24,
    })
    pty.onData((data: string) => {
      mainWindow?.webContents.send(`pty:data:${options.id}`, data)
    })
    pty.onExit(({ exitCode }: { exitCode: number }) => {
      mainWindow?.webContents.send(`pty:exit:${options.id}`, exitCode)
    })
    return { success: true }
  })

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
    const fs = await import('fs/promises')
    const path = await import('path')
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true })
      const results = await Promise.all(
        entries.map(async (entry) => {
          const fullPath = path.join(dirPath, entry.name)
          const isDir = entry.isDirectory()
          let size: number | undefined
          let modifiedAt: number | undefined
          try {
            const stat = await fs.stat(fullPath)
            if (!isDir) size = stat.size
            modifiedAt = stat.mtimeMs
          } catch {
            // skip stat data if fails
          }
          return {
            name: entry.name,
            isDirectory: isDir,
            path: fullPath,
            size,
            modifiedAt,
          }
        })
      )
      return results
    } catch {
      return []
    }
  })

  // Workspace handlers
  ipcMain.handle('workspace:save', async (_event, name: string, data: unknown) => {
    return workspaceManager.save(name, data)
  })

  ipcMain.handle('workspace:load', async (_event, name: string) => {
    return workspaceManager.load(name)
  })

  ipcMain.handle('workspace:list', async () => {
    return workspaceManager.list()
  })

  // Git handlers
  ipcMain.handle('git:status', async (_event, cwd: string) => {
    const { execSync } = await import('child_process')
    try {
      // Check if we're inside a git repo at all
      execSync('git rev-parse --git-dir', { cwd, encoding: 'utf-8', timeout: 5000, stdio: 'pipe' })

      // Get branch — handles repos with no commits yet (HEAD doesn't exist)
      let branch = ''
      try {
        branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd, encoding: 'utf-8', timeout: 5000, stdio: 'pipe' }).trim()
      } catch {
        // No commits yet — try to read the initial branch name from HEAD
        try {
          const head = execSync('git symbolic-ref --short HEAD', { cwd, encoding: 'utf-8', timeout: 5000, stdio: 'pipe' }).trim()
          branch = head || '(no commits)'
        } catch {
          branch = '(no commits)'
        }
      }

      const statusRaw = execSync('git status --porcelain', { cwd, encoding: 'utf-8', timeout: 5000, stdio: 'pipe' })
      const lines = statusRaw.trim().split('\n').filter(Boolean)
      const modified = lines.filter((l) => l.startsWith(' M') || l.startsWith('M ')).length
      const added = lines.filter((l) => l.startsWith('A ') || l.startsWith('??')).length
      const deleted = lines.filter((l) => l.startsWith(' D') || l.startsWith('D ')).length
      const ahead = (() => {
        try {
          const out = execSync('git rev-list --count @{u}..HEAD', { cwd, encoding: 'utf-8', timeout: 5000, stdio: 'pipe' })
          return parseInt(out.trim()) || 0
        } catch { return 0 }
      })()
      // Per-file statuses for UI indicators
      const fileStatuses: Record<string, string> = {}
      for (const line of lines) {
        const code = line.substring(0, 2).trim()
        const filePath = line.substring(3).trim().replace(/^"(.*)"$/, '$1')
        // Use just the filename (not full path) for matching in current dir
        const fileName = filePath.includes('/') ? filePath.split('/').pop()! : filePath
        const statusChar = code === '??' ? '?' : code.charAt(0) === ' ' ? code.charAt(1) : code.charAt(0)
        fileStatuses[fileName] = statusChar
        // Also store with full relative path for nested lookup
        if (filePath !== fileName) fileStatuses[filePath] = statusChar
      }
      return { branch, modified, added, deleted, ahead, total: lines.length, isRepo: true, fileStatuses }
    } catch {
      return { branch: '', modified: 0, added: 0, deleted: 0, ahead: 0, total: 0, isRepo: false }
    }
  })

  // File CRUD handlers
  ipcMain.handle('fs:createFile', async (_event, filePath: string, content?: string) => {
    const fs = await import('fs/promises')
    try {
      await fs.writeFile(filePath, content || '', 'utf-8')
      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('fs:createDir', async (_event, dirPath: string) => {
    const fs = await import('fs/promises')
    try {
      await fs.mkdir(dirPath, { recursive: true })
      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('fs:rename', async (_event, oldPath: string, newPath: string) => {
    const fs = await import('fs/promises')
    try {
      await fs.rename(oldPath, newPath)
      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('fs:delete', async (_event, targetPath: string) => {
    const fs = await import('fs/promises')
    try {
      const stat = await fs.stat(targetPath)
      if (stat.isDirectory()) {
        await fs.rm(targetPath, { recursive: true, force: true })
      } else {
        await fs.unlink(targetPath)
      }
      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  // File preview - read first N lines
  ipcMain.handle('fs:preview', async (_event, filePath: string, maxLines = 20) => {
    const fs = await import('fs/promises')
    try {
      const content = await fs.readFile(filePath, 'utf-8')
      const lines = content.split('\n').slice(0, maxLines)
      return { success: true, content: lines.join('\n'), totalLines: content.split('\n').length }
    } catch (err) {
      return { success: false, error: String(err), content: '', totalLines: 0 }
    }
  })

  // Native OS notifications
  ipcMain.on('notify:show', (_event, opts: { title: string; body?: string }) => {
    if (Notification.isSupported()) {
      new Notification({ title: opts.title, body: opts.body || '' }).show()
    }
  })

  // Persistent storage handlers for Zustand stores
  ipcMain.handle('storage:get', async (_event, key: string) => {
    const fs = await import('fs/promises')
    const path = await import('path')
    try {
      const storageDir = path.join(app.getPath('userData'), 'storage')
      await fs.mkdir(storageDir, { recursive: true })
      const filePath = path.join(storageDir, `${key}.json`)
      const data = await fs.readFile(filePath, 'utf-8')
      return JSON.parse(data)
    } catch {
      return null
    }
  })

  ipcMain.handle('storage:set', async (_event, key: string, value: unknown) => {
    const fs = await import('fs/promises')
    const path = await import('path')
    try {
      const storageDir = path.join(app.getPath('userData'), 'storage')
      await fs.mkdir(storageDir, { recursive: true })
      const filePath = path.join(storageDir, `${key}.json`)
      await fs.writeFile(filePath, JSON.stringify(value, null, 2), 'utf-8')
      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('storage:remove', async (_event, key: string) => {
    const fs = await import('fs/promises')
    const path = await import('path')
    try {
      const storageDir = path.join(app.getPath('userData'), 'storage')
      const filePath = path.join(storageDir, `${key}.json`)
      await fs.unlink(filePath)
      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  // Save clipboard image to temp file (returns the file path)
  ipcMain.handle('file:saveTempImage', async (_event, buffer: ArrayBuffer, mimeType: string) => {
    const fs = await import('fs/promises')
    const path = await import('path')
    const ext = mimeType === 'image/png' ? '.png' : mimeType === 'image/jpeg' ? '.jpg' : mimeType === 'image/gif' ? '.gif' : mimeType === 'image/webp' ? '.webp' : '.png'
    const dir = path.join(app.getPath('userData'), 'temp-images')
    await fs.mkdir(dir, { recursive: true })
    const fileName = `clipboard-${Date.now()}${ext}`
    const filePath = path.join(dir, fileName)
    await fs.writeFile(filePath, Buffer.from(buffer))
    return filePath
  })

  // Close handshake: renderer signals it's done saving
  ipcMain.on('app:close-ready', () => {
    isClosing = true
    mainWindow?.destroy()
  })

  // App version
  ipcMain.handle('app:getVersion', () => app.getVersion())

  // Directory picker
  ipcMain.handle('dialog:selectDirectory', async () => {
    if (!mainWindow) return null
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: 'Select Project Directory',
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })
}

// Set app name to ensure consistent userData path across dev/prod
// This fixes localStorage persistence - without this, dev mode uses shared "Electron" directory
app.setName('GhostShell')
app.setAppUserModelId('com.ghostshell.app')

app.whenReady().then(() => {
  setupIPC()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  ptyManager.killAll()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
