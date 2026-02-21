import { autoUpdater } from 'electron-updater'
import { BrowserWindow, ipcMain } from 'electron'

let mainWindow: BrowserWindow | null = null
let checkInterval: ReturnType<typeof setInterval> | null = null

function send(payload: Record<string, unknown>): void {
  mainWindow?.webContents.send('updater:status', payload)
}

export function initUpdater(win: BrowserWindow): void {
  mainWindow = win

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  // Events → renderer
  autoUpdater.on('checking-for-update', () => {
    send({ status: 'checking' })
  })

  autoUpdater.on('update-available', (info) => {
    send({ status: 'available', version: info.version })
  })

  autoUpdater.on('update-not-available', () => {
    send({ status: 'not-available' })
  })

  autoUpdater.on('download-progress', (progress) => {
    send({ status: 'downloading', progress: Math.round(progress.percent) })
  })

  autoUpdater.on('update-downloaded', (info) => {
    send({ status: 'downloaded', version: info.version })
  })

  autoUpdater.on('error', (err) => {
    // Suppress error when there are simply no releases published yet
    const msg = err.message || ''
    if (msg.includes('404') || msg.includes('No published versions') || msg.includes('HttpError')) {
      send({ status: 'not-available' })
      return
    }
    send({ status: 'error', error: msg })
  })

  // IPC handlers
  ipcMain.handle('updater:check', async () => {
    try {
      const result = await autoUpdater.checkForUpdates()
      return { success: true, version: result?.updateInfo?.version }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('updater:download', async () => {
    try {
      await autoUpdater.downloadUpdate()
      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('updater:install', () => {
    autoUpdater.quitAndInstall()
  })

  // Auto-check: 5s after launch, then every 4 hours
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {})
  }, 5000)

  checkInterval = setInterval(
    () => {
      autoUpdater.checkForUpdates().catch(() => {})
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
