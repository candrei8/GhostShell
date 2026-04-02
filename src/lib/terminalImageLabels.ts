function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export interface TerminalImageLabelRegistry {
  ensureLabel: (filePath: string) => string
  maskText: (text: string) => string
  getLabels: (filePaths: string[]) => string[]
}

export function createTerminalImageLabelRegistry(): TerminalImageLabelRegistry {
  const labelsByPath = new Map<string, string>()
  let nextIndex = 1

  const ensureLabel = (filePath: string): string => {
    const existing = labelsByPath.get(filePath)
    if (existing) return existing

    const label = `Image ${nextIndex}`
    nextIndex += 1
    labelsByPath.set(filePath, label)
    return label
  }

  const maskText = (text: string): string => {
    let next = text

    for (const [filePath, label] of labelsByPath.entries()) {
      const escaped = escapeRegExp(filePath)
      next = next.replace(new RegExp(`"${escaped}"`, 'g'), `"${label}"`)
      next = next.replace(new RegExp(`'${escaped}'`, 'g'), `'${label}'`)
      next = next.replace(new RegExp(escaped, 'g'), label)
    }

    return next
  }

  const getLabels = (filePaths: string[]): string[] => filePaths.map((filePath) => ensureLabel(filePath))

  return {
    ensureLabel,
    maskText,
    getLabels,
  }
}
