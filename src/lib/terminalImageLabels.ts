function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export interface TerminalImageLabelRegistry {
  ensureLabel: (filePath: string) => string
  maskText: (text: string) => string
  getLabels: (filePaths: string[]) => string[]
}

interface CompiledLabel {
  label: string
  quoted: RegExp
  bare: RegExp
}

/**
 * Maps attached image temp-paths to friendly "Image N" labels.
 *
 * IMPORTANT: masking is ONLY for GhostShell-owned surfaces (command blocks,
 * companion chat, history). It must NEVER be applied to the raw byte stream on
 * its way to xterm — rewriting PTY bytes with a different-length string
 * desyncs a TUI's column math and breaks Claude Code's input-box repaint.
 * Regexes are compiled once per label and cached (the old code allocated three
 * RegExp objects per label on every output chunk).
 */
export function createTerminalImageLabelRegistry(): TerminalImageLabelRegistry {
  const labelsByPath = new Map<string, string>()
  const compiled: CompiledLabel[] = []
  let nextIndex = 1

  const ensureLabel = (filePath: string): string => {
    const existing = labelsByPath.get(filePath)
    if (existing) return existing

    const label = `Image ${nextIndex}`
    nextIndex += 1
    labelsByPath.set(filePath, label)
    const escaped = escapeRegExp(filePath)
    compiled.push({
      label,
      quoted: new RegExp(`(["'])${escaped}\\1`, 'g'),
      bare: new RegExp(escaped, 'g'),
    })
    return label
  }

  const maskText = (text: string): string => {
    if (!compiled.length || !text) return text
    let next = text
    for (const { label, quoted, bare } of compiled) {
      next = next.replace(quoted, (_m, q) => `${q}${label}${q}`)
      next = next.replace(bare, label)
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
