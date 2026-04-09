type FileWithOptionalPath = File & { path?: string }

function normalizeResolvedPath(path: string | null | undefined): string | null {
  if (typeof path !== 'string') return null
  const trimmed = path.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function resolveDroppedFilePath(
  file: FileWithOptionalPath,
  getPathForFile?: (file: File) => string | null | undefined,
): string | null {
  return normalizeResolvedPath(getPathForFile?.(file)) ?? normalizeResolvedPath(file.path)
}

export function resolveDroppedFilePathFromBridge(file: FileWithOptionalPath): string | null {
  if (typeof window === 'undefined') {
    return normalizeResolvedPath(file.path)
  }

  return resolveDroppedFilePath(file, window.ghostshell?.getPathForFile)
}
