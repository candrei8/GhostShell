import { autoUpdater } from 'electron-updater'
import { app, BrowserWindow, ipcMain } from 'electron'

let mainWindow: BrowserWindow | null = null
let checkInterval: ReturnType<typeof setInterval> | null = null
let isDownloading = false

function send(payload: Record<string, unknown>): void {
  mainWindow?.webContents.send('updater:status', payload)
}

function log(msg: string): void {
  console.log(`[updater] ${msg}`)
}

export function initUpdater(win: BrowserWindow): void {
  mainWindow = win

  // Skip auto-update in dev mode — no packaged app-update.yml
  if (!app.isPackaged) {
    log('Dev mode — skipping auto-update')
    return
  }

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  // Events → renderer
  autoUpdater.on('checking-for-update', () => {
    log('Checking for updates…')
    send({ status: 'checking' })
  })

  autoUpdater.on('update-available', (info) => {
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

  autoUpdater.on('error', (err) => {
    const msg = err.message || String(err)
    log(`Update error: ${msg}`)

    if (isDownloading) {
      // Download-phase error — the user explicitly started this, so show it
      isDownloading = false
      send({ status: 'error', error: msg })
    } else {
      // Check-phase error (network, 404, rate-limit, DNS, etc.) — suppress silently
      send({ status: 'not-available' })
    }
  })

  // IPC handlers
  ipcMain.handle('updater:check', async () => {
    try {
      const result = await autoUpdater.checkForUpdates()
      return { success: true, version: result?.updateInfo?.version }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log(`Manual check failed: ${msg}`)
      return { success: false, error: msg }
    }
  })

  ipcMain.handle('updater:download', async () => {
    try {
      isDownloading = true
      await autoUpdater.downloadUpdate()
      return { success: true }
    } catch (err) {
      isDownloading = false
      const msg = err instanceof Error ? err.message : String(err)
      log(`Download failed: ${msg}`)
      return { success: false, error: msg }
    }
  })

  ipcMain.handle('updater:install', () => {
    autoUpdater.quitAndInstall()
  })

  // Auto-check: 10 s after launch, then every 4 hours
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      log(`Auto-check failed: ${err?.message ?? err}`)
    })
  }, 10_000)

  checkInterval = setInterval(
    () => {
      autoUpdater.checkForUpdates().catch((err) => {
        log(`Periodic check failed: ${err?.message ?? err}`)
      })
    },
    4 * 60 * 60 * 1000
  )

  win.on('closed', () => {
    if (checkInterval) {
      clearInterval(checkInterval)
      checkInterval = null
    }
    mainWindow = null
  })
}
