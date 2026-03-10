import { contextBridge, ipcRenderer } from 'electron'

const api = {
  // Window controls
  windowMinimize: () => ipcRenderer.send('window:minimize'),
  windowMaximize: () => ipcRenderer.send('window:maximize'),
  windowClose: () => ipcRenderer.send('window:close'),
  windowIsMaximized: () => ipcRenderer.invoke('window:isMaximized'),

  // PTY
  ptyCreate: (options: { id: string; shell?: string; cwd?: string; cols?: number; rows?: number; provider?: 'claude' | 'gemini' | 'codex' }) =>
    ipcRenderer.invoke('pty:create', options) as Promise<{ success: boolean; error?: string }>,
  ptyWrite: (id: string, data: string) => ipcRenderer.send('pty:write', id, data),
  ptyResize: (id: string, cols: number, rows: number) => ipcRenderer.send('pty:resize', id, cols, rows),
  ptyKill: (id: string) => ipcRenderer.send('pty:kill', id),
  ptyGetCwd: (id: string) => ipcRenderer.invoke('pty:getCwd', id) as Promise<string | null>,
  ptyOnData: (id: string, callback: (data: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: string) => callback(data)
    ipcRenderer.on(`pty:data:${id}`, handler)
    return () => ipcRenderer.removeListener(`pty:data:${id}`, handler)
  },
  ptyOnExit: (id: string, callback: (exitCode: number) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, exitCode: number) => callback(exitCode)
    ipcRenderer.on(`pty:exit:${id}`, handler)
    return () => ipcRenderer.removeListener(`pty:exit:${id}`, handler)
  },

  // File system
  fsReadDir: (path: string) => ipcRenderer.invoke('fs:readDir', path),
  fsCreateFile: (filePath: string, content?: string) => ipcRenderer.invoke('fs:createFile', filePath, content),
  fsCreateDir: (dirPath: string) => ipcRenderer.invoke('fs:createDir', dirPath),
  fsCopy: (sourcePath: string, destinationPath: string) => ipcRenderer.invoke('fs:copy', sourcePath, destinationPath),
  fsRename: (oldPath: string, newPath: string) => ipcRenderer.invoke('fs:rename', oldPath, newPath),
  fsDelete: (targetPath: string) => ipcRenderer.invoke('fs:delete', targetPath),
  fsPreview: (filePath: string, maxLines?: number) => ipcRenderer.invoke('fs:preview', filePath, maxLines),

  // Git
  gitStatus: (cwd: string) => ipcRenderer.invoke('git:status', cwd),

  // Workspace
  workspaceSave: (name: string, data: unknown) => ipcRenderer.invoke('workspace:save', name, data),
  workspaceLoad: (name: string) => ipcRenderer.invoke('workspace:load', name),
  workspaceList: () => ipcRenderer.invoke('workspace:list'),
  selectDirectory: () => ipcRenderer.invoke('dialog:selectDirectory'),

  // App info
  getVersion: () => ipcRenderer.invoke('app:getVersion') as Promise<string>,

  // Native notifications
  showNotification: (title: string, body?: string) => ipcRenderer.send('notify:show', { title, body }),

  // Persistent storage (for Zustand stores)
  storageGet: (key: string) => ipcRenderer.invoke('storage:get', key),
  storageSet: (key: string, value: unknown) => ipcRenderer.invoke('storage:set', key, value),
  storageRemove: (key: string) => ipcRenderer.invoke('storage:remove', key),

  // Save clipboard image to temp file
  saveTempImage: (buffer: ArrayBuffer, mimeType: string) =>
    ipcRenderer.invoke('file:saveTempImage', buffer, mimeType) as Promise<string>,

  // CLI model discovery
  cliDiscoverModels: (provider: 'claude' | 'gemini' | 'codex', command?: string) =>
    ipcRenderer.invoke('cli:discoverModels', provider, command) as Promise<{ success: boolean; output: string; error?: string }>,
  cliGetVersion: (cli: string) =>
    ipcRenderer.invoke('cli:getVersion', cli) as Promise<{ installed: boolean; version: string }>,

  // Updater
  updaterCheck: () => ipcRenderer.invoke('updater:check'),
  updaterDownload: () => ipcRenderer.invoke('updater:download'),
  updaterInstall: () => ipcRenderer.invoke('updater:install'),
  onUpdaterStatus: (cb: (status: unknown) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, status: unknown) => cb(status)
    ipcRenderer.on('updater:status', handler)
    return () => { ipcRenderer.removeListener('updater:status', handler) }
  },

  // Close handshake (for tab snapshot save)
  onBeforeClose: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('app:before-close', handler)
    return () => { ipcRenderer.removeListener('app:before-close', handler) }
  },
  closeReady: () => ipcRenderer.send('app:close-ready'),
}

contextBridge.exposeInMainWorld('ghostshell', api)

export type GhostShellAPI = typeof api
