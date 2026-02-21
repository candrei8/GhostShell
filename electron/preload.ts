import { contextBridge, ipcRenderer } from 'electron'

const api = {
  // Window controls
  windowMinimize: () => ipcRenderer.send('window:minimize'),
  windowMaximize: () => ipcRenderer.send('window:maximize'),
  windowClose: () => ipcRenderer.send('window:close'),
  windowIsMaximized: () => ipcRenderer.invoke('window:isMaximized'),

  // PTY
  ptyCreate: (options: { id: string; shell?: string; cwd?: string; cols?: number; rows?: number }) =>
    ipcRenderer.invoke('pty:create', options),
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

  // Native notifications
  showNotification: (title: string, body?: string) => ipcRenderer.send('notify:show', { title, body }),

  // Persistent storage (for Zustand stores)
  storageGet: (key: string) => ipcRenderer.invoke('storage:get', key),
  storageSet: (key: string, value: unknown) => ipcRenderer.invoke('storage:set', key, value),
  storageRemove: (key: string) => ipcRenderer.invoke('storage:remove', key),

  // Updater
  updaterCheck: () => ipcRenderer.invoke('updater:check'),
  updaterDownload: () => ipcRenderer.invoke('updater:download'),
  updaterInstall: () => ipcRenderer.invoke('updater:install'),
  onUpdaterStatus: (cb: (status: unknown) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, status: unknown) => cb(status)
    ipcRenderer.on('updater:status', handler)
    return () => { ipcRenderer.removeListener('updater:status', handler) }
  },
}

contextBridge.exposeInMainWorld('ghostshell', api)

export type GhostShellAPI = typeof api
