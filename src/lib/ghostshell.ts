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
