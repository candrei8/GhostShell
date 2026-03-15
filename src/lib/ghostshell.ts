// GhostShell IPC bridge — type-safe accessor and swarm path helpers.

type GhostshellApi = Window['ghostshell']

function getWindowWithGhostshell(): (Window & { ghostshell?: GhostshellApi }) | undefined {
  if (typeof window === 'undefined') return undefined
  return window as Window & { ghostshell?: GhostshellApi }
}

export function getGhostshellApi(): GhostshellApi | undefined {
  return getWindowWithGhostshell()?.ghostshell
}

export async function selectDirectorySafe(): Promise<string | null> {
  const api = getGhostshellApi()
  if (!api?.selectDirectory) return null
  return api.selectDirectory()
}

// ─── GhostSwarm Path Convention ─────────────────────────────

/** Top-level hidden directory name for all swarm data inside a project. */
export const GHOSTSWARM_DIR = '.ghostswarm'

/** Subdirectory under GHOSTSWARM_DIR that contains per-pane swarm roots. */
export const SWARMS_SUBDIR = 'swarms'

/**
 * Compute the canonical swarm root path for a given project directory and pane.
 *
 * Result: `{projectDir}/.ghostswarm/swarms/{paneId}`
 */
export function buildSwarmRoot(projectDir: string, paneId: string): string {
  return `${projectDir}/${GHOSTSWARM_DIR}/${SWARMS_SUBDIR}/${paneId}`
}

/** Canonical bin/ path inside a swarm root. */
export function swarmBinPath(swarmRoot: string): string {
  return `${swarmRoot}/bin`
}

/** Canonical knowledge/ path inside a swarm root. */
export function swarmKnowledgePath(swarmRoot: string): string {
  return `${swarmRoot}/knowledge`
}

/** Canonical reports/ path inside a swarm root. */
export function swarmReportsPath(swarmRoot: string): string {
  return `${swarmRoot}/reports`
}

/** Canonical inbox/ path inside a swarm root. */
export function swarmInboxPath(swarmRoot: string): string {
  return `${swarmRoot}/inbox`
}

/** Canonical prompts/ path inside a swarm root. */
export function swarmPromptsPath(swarmRoot: string): string {
  return `${swarmRoot}/prompts`
}

// ─── Safe Filesystem Helpers ────────────────────────────────

/**
 * Read a file safely via the IPC bridge. Returns null on failure.
 */
export async function readFileSafe(filePath: string): Promise<string | null> {
  const api = getGhostshellApi()
  if (!api?.fsReadFile) return null
  try {
    const result = await api.fsReadFile(filePath)
    return result.success ? (result.content ?? null) : null
  } catch {
    return null
  }
}

/**
 * Write a file safely via the IPC bridge. Returns true on success.
 */
export async function writeFileSafe(filePath: string, content: string): Promise<boolean> {
  const api = getGhostshellApi()
  if (!api?.fsCreateFile) return false
  try {
    await api.fsCreateFile(filePath, content)
    return true
  } catch {
    return false
  }
}

/**
 * Create a directory safely via the IPC bridge. Returns true on success.
 */
export async function mkdirSafe(dirPath: string): Promise<boolean> {
  const api = getGhostshellApi()
  if (!api?.fsCreateDir) return false
  try {
    await api.fsCreateDir(dirPath)
    return true
  } catch {
    return false
  }
}
