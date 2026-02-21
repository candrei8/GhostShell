import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'fs'

export class WorkspaceManager {
  private basePath: string

  constructor() {
    this.basePath = join(app.getPath('userData'), 'workspaces')
    if (!existsSync(this.basePath)) {
      mkdirSync(this.basePath, { recursive: true })
    }
  }

  save(name: string, data: unknown): boolean {
    try {
      const filePath = join(this.basePath, `${name}.json`)
      writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
      return true
    } catch {
      return false
    }
  }

  load(name: string): unknown | null {
    try {
      const filePath = join(this.basePath, `${name}.json`)
      if (!existsSync(filePath)) return null
      const raw = readFileSync(filePath, 'utf-8')
      return JSON.parse(raw)
    } catch {
      return null
    }
  }

  list(): string[] {
    try {
      return readdirSync(this.basePath)
        .filter(f => f.endsWith('.json'))
        .map(f => f.replace('.json', ''))
    } catch {
      return []
    }
  }
}
