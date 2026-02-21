import { useState, useEffect } from 'react'
import { X, FileCode, Maximize2, Minimize2 } from 'lucide-react'
import { FileEntry } from '../../lib/types'
import {
  formatFileSize,
  getExtensionColor,
  getExtensionLabel,
  getRelativeTime,
  isTextFile,
} from '../../lib/fileUtils'

interface FilePreviewProps {
  file: FileEntry
  onClose: () => void
}

export function FilePreview({ file, onClose }: FilePreviewProps) {
  const [content, setContent] = useState<string | null>(null)
  const [totalLines, setTotalLines] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)

  const extColor = getExtensionColor(file.name)
  const extLabel = getExtensionLabel(file.name)
  const canPreview = isTextFile(file.name)

  useEffect(() => {
    setContent(null)
    setError(null)
    setTotalLines(0)

    if (!canPreview || !window.ghostshell?.fsPreview) return

    setLoading(true)
    window.ghostshell
      .fsPreview(file.path, expanded ? 50 : 20)
      .then((result: { success: boolean; content: string; totalLines: number; error?: string }) => {
        if (result.success) {
          setContent(result.content)
          setTotalLines(result.totalLines)
        } else {
          setError(result.error || 'Cannot read file')
        }
      })
      .catch(() => setError('Preview unavailable'))
      .finally(() => setLoading(false))
  }, [file.path, canPreview, expanded])

  const lines = content?.split('\n') || []
  const maxHeight = expanded ? 'max-h-[50vh]' : 'max-h-[180px]'

  return (
    <div
      className="border-t border-ghost-border bg-ghost-surface/80 backdrop-blur-sm animate-fade-in flex flex-col"
      style={{ borderTopColor: extColor ? extColor + '30' : undefined }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-ghost-border/30">
        <FileCode className="w-3 h-3 shrink-0" style={{ color: extColor || 'var(--ghost-text-dim)' }} />
        <span className="text-xs text-ghost-text font-medium truncate flex-1">{file.name}</span>

        {/* Meta */}
        <div className="flex items-center gap-2 text-2xs text-ghost-text-dim/40 shrink-0">
          {extLabel && (
            <span
              className="px-1 rounded"
              style={{
                backgroundColor: extColor ? extColor + '15' : 'rgba(255,255,255,0.04)',
                color: extColor || undefined,
              }}
            >
              {extLabel}
            </span>
          )}
          {file.size !== undefined && <span className="tabular-nums">{formatFileSize(file.size)}</span>}
          {file.modifiedAt && <span>{getRelativeTime(file.modifiedAt)}</span>}
          {totalLines > 0 && <span>{totalLines} lines</span>}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-0.5 ml-1">
          {canPreview && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="w-4 h-4 flex items-center justify-center rounded text-ghost-text-dim/40 hover:text-ghost-text transition-colors"
              title={expanded ? 'Collapse' : 'Expand'}
            >
              {expanded ? <Minimize2 className="w-2.5 h-2.5" /> : <Maximize2 className="w-2.5 h-2.5" />}
            </button>
          )}
          <button
            onClick={onClose}
            className="w-4 h-4 flex items-center justify-center rounded text-ghost-text-dim/40 hover:text-ghost-text transition-colors"
            title="Close preview (Esc)"
          >
            <X className="w-2.5 h-2.5" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className={`${maxHeight} overflow-auto transition-all duration-200`}>
        {loading && (
          <div className="p-3 text-xs text-ghost-text-dim/40 animate-pulse">Loading preview...</div>
        )}

        {error && (
          <div className="p-3 text-xs text-red-400/60">{error}</div>
        )}

        {!canPreview && !loading && !error && (
          <div className="flex flex-col items-center justify-center py-6 text-ghost-text-dim/30">
            <p className="text-xs">Binary file \u2014 preview not available</p>
            <p className="text-2xs mt-0.5">{formatFileSize(file.size)}</p>
          </div>
        )}

        {content !== null && !loading && (
          <div className="font-mono text-[11px] leading-[18px]">
            {lines.map((line, i) => (
              <div key={i} className="flex hover:bg-white/[0.02] transition-colors">
                <span className="w-8 shrink-0 text-right pr-2 text-ghost-text-dim/20 select-none tabular-nums">
                  {i + 1}
                </span>
                <pre className="flex-1 text-ghost-text/80 overflow-x-auto whitespace-pre pr-3">
                  {line || ' '}
                </pre>
              </div>
            ))}
            {totalLines > lines.length && (
              <div className="flex">
                <span className="w-8 shrink-0" />
                <span className="text-ghost-text-dim/20 text-2xs py-1">
                  \u2026 {totalLines - lines.length} more lines
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
