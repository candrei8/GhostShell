import { app } from 'electron'
import { join } from 'path'
import { mkdir, readFile, readdir, writeFile } from 'fs/promises'
import { sanitizeFileBasename } from './runtime-utils'

export class WorkspaceManager {
  private get basePath(): string {
    return join(app.getPath('userData'), 'workspaces')
  }

  private async getWorkspaceFilePath(name: string): Promise<string | null> {
    const safeName = sanitizeFileBasename(name)
    if (!safeName) return null

    const basePath = this.basePath
    await mkdir(basePath, { recursive: true })
    return join(basePath, `${safeName}.json`)
  }

  async save(name: string, data: unknown): Promise<boolean> {
    try {
      const filePath = await this.getWorkspaceFilePath(name)
      if (!filePath) return false
      await writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8')
      return true
    } catch {
      return false
    }
  }

  async load(name: string): Promise<unknown | null> {
    try {
      const filePath = await this.getWorkspaceFilePath(name)
      if (!filePath) return null
      const raw = await readFile(filePath, 'utf-8')
      return JSON.parse(raw)
    } catch {
      return null
    }
  }

  async list(): Promise<string[]> {
    try {
      await mkdir(this.basePath, { recursive: true })
      return (await readdir(this.basePath))
        .filter(f => f.endsWith('.json'))
        .map(f => f.replace('.json', ''))
    } catch {
      return []
    }
  }
}
