import { app, BrowserWindow, ipcMain } from 'electron'
import { autoUpdater } from 'electron-updater'

let mainWindow: BrowserWindow | null = null
let checkInterval: ReturnType<typeof setInterval> | null = null
let initialCheckTimer: ReturnType<typeof setTimeout> | null = null
let isDownloading = false
let lastAvailableVersion: string | null = null
let listenersRegistered = false
let ipcRegistered = false

function send(payload: Record<string, unknown>): void {
  mainWindow?.webContents.send('updater:status', payload)
}

function log(message: string): void {
  console.log(`[updater] ${message}`)
}

function scheduleAutoChecks(): void {
  if (initialCheckTimer || checkInterval) return

  initialCheckTimer = setTimeout(() => {
    initialCheckTimer = null
    autoUpdater.checkForUpdates().catch((error) => {
      log(`Auto-check failed: ${error?.message ?? error}`)
    })
  }, 10_000)

  checkInterval = setInterval(() => {
    autoUpdater.checkForUpdates().catch((error) => {
      log(`Periodic check failed: ${error?.message ?? error}`)
    })
  }, 4 * 60 * 60 * 1000)
}

function clearAutoChecks(): void {
  if (initialCheckTimer) {
    clearTimeout(initialCheckTimer)
    initialCheckTimer = null
  }

  if (checkInterval) {
    clearInterval(checkInterval)
    checkInterval = null
  }
}

function registerUpdaterListeners(): void {
  if (listenersRegistered) return
  listenersRegistered = true

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    log('Checking for updates...')
    send({ status: 'checking' })
  })

  autoUpdater.on('update-available', (info) => {
    lastAvailableVersion = info.version
    log(`Update available: v${info.version}`)
    send({ status: 'available', version: info.version })
  })

  autoUpdater.on('update-not-available', (info) => {
    log(`Up to date (latest: v${info.version})`)
    send({ status: 'not-available' })
  })

  autoUpdater.on('download-progress', (progress) => {
    send({ status: 'downloading', progress: Math.round(progress.percent) })
  })

  autoUpdater.on('update-downloaded', (info) => {
    isDownloading = false
    log(`Update downloaded: v${info.version}`)
    send({ status: 'downloaded', version: info.version })
  })

  autoUpdater.on('error', (error) => {
    const message = error.message || String(error)
    log(`Update error: ${message}`)

    isDownloading = false
    send({ status: 'error', error: message, version: lastAvailableVersion })
  })
}

function registerIpcHandlers(): void {
  if (ipcRegistered) return
  ipcRegistered = true

  ipcMain.handle('updater:check', async () => {
    try {
      const result = await autoUpdater.checkForUpdates()
      return { success: true, version: result?.updateInfo?.version }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      log(`Manual check failed: ${message}`)
      return { success: false, error: message }
    }
  })

  ipcMain.handle('updater:download', async () => {
    try {
      isDownloading = true
      await autoUpdater.downloadUpdate()
      return { success: true }
    } catch (error) {
      isDownloading = false
      const message = error instanceof Error ? error.message : String(error)
      log(`Download failed: ${message}`)
      return { success: false, error: message }
    }
  })

  ipcMain.handle('updater:install', () => {
    autoUpdater.quitAndInstall()
  })
}

export function initUpdater(window: BrowserWindow): void {
  mainWindow = window

  if (!app.isPackaged) {
    log('Dev mode - skipping auto-update')
    return
  }

  registerUpdaterListeners()
  registerIpcHandlers()
  scheduleAutoChecks()

  window.on('closed', () => {
    if (mainWindow === window) {
      mainWindow = null
    }

    if (BrowserWindow.getAllWindows().length === 0) {
      clearAutoChecks()
    }
  })
}
