import { type CSSProperties, useEffect, useMemo, useState } from 'react'
import {
  Bot,
  Copy,
  FileCode,
  FolderTree,
  GitBranch,
  Image as ImageIcon,
  Maximize2,
  Minimize2,
  ScanText,
  Terminal,
  X,
} from 'lucide-react'
import { FileEntry } from '../../lib/types'
import {
  copyToClipboard,
  formatFileSize,
  getExtensionColor,
  getExtensionLabel,
  getGitStatusInfo,
  getRelativeTime,
  isImageFile,
  isMarkdownFile,
  isStructuredDataFile,
  isTextFile,
  toLocalFileUrl,
} from '../../lib/fileUtils'
import { MarkdownPreview } from './MarkdownPreview'
import { StructuredDataPreview } from './StructuredDataPreview'

interface FilePreviewProps {
  file: FileEntry
  gitStatus?: string
  onOpenTerminal?: (path: string) => void
  onLaunchAgent?: (path: string) => void
  onSetAsProject?: (path: string) => void
  onClose: () => void
}

type PreviewTone = {
  badge: string
  badgeStyle: CSSProperties
  rowClassName: string
  textClassName: string
}

type PreviewKind = 'image' | 'markdown' | 'structured' | 'text' | 'binary'
type MarkdownView = 'rendered' | 'source'
type StructuredView = 'structured' | 'source'

function getParentPath(path: string): string | null {
  const normalized = path.replace(/[\\/]+$/, '')
  const windowsMatch = normalized.match(/^([A-Za-z]:)(?:\\(.+))?$/)
  if (windowsMatch) {
    const drive = windowsMatch[1]
    const tail = windowsMatch[2]
    if (!tail) return null
    const parts = tail.split('\\').filter(Boolean)
    if (parts.length <= 1) return `${drive}\\`
    return `${drive}\\${parts.slice(0, -1).join('\\')}`
  }

  const parts = normalized.split('/').filter(Boolean)
  if (parts.length === 0) return null
  if (parts.length === 1) return '/'
  return `/${parts.slice(0, -1).join('/')}`
}

function formatAbsoluteTime(timestamp?: number): string | null {
  if (!timestamp) return null
  return new Date(timestamp).toLocaleString()
}

function getPreviewTone(line: string): PreviewTone | null {
  const trimmed = line.trim()
  if (!trimmed) return null

  if (/^(todo|fixme|hack|note)\b[:\s-]*/i.test(trimmed)) {
    return {
      badge: 'NOTE',
      badgeStyle: { color: '#fbbf24', backgroundColor: 'rgba(251, 191, 36, 0.12)' },
      rowClassName: 'bg-amber-300/[0.05] hover:bg-amber-300/[0.08] border-l border-amber-300/25',
      textClassName: 'text-amber-50/95',
    }
  }

  if (/\b(error|failed|exception|fatal)\b/i.test(trimmed)) {
    return {
      badge: 'ERR',
      badgeStyle: { color: '#f87171', backgroundColor: 'rgba(248, 113, 113, 0.12)' },
      rowClassName: 'bg-rose-400/[0.05] hover:bg-rose-400/[0.08] border-l border-rose-300/25',
      textClassName: 'text-rose-50/95',
    }
  }

  if (/^(import|export)\b/.test(trimmed)) {
    return {
      badge: 'IO',
      badgeStyle: { color: '#67e8f9', backgroundColor: 'rgba(103, 232, 249, 0.12)' },
      rowClassName: 'bg-cyan-300/[0.04] hover:bg-cyan-300/[0.07] border-l border-cyan-300/18',
      textClassName: 'text-cyan-50/92',
    }
  }

  if (/^(async\s+function|function|const|let|class|interface|type|enum)\b/.test(trimmed)) {
    return {
      badge: 'SYM',
      badgeStyle: { color: '#93c5fd', backgroundColor: 'rgba(147, 197, 253, 0.12)' },
      rowClassName: 'bg-sky-300/[0.04] hover:bg-sky-300/[0.07] border-l border-sky-300/18',
      textClassName: 'text-sky-50/92',
    }
  }

  if (/^(#|##|###)\s+/.test(trimmed)) {
    return {
      badge: 'HDR',
      badgeStyle: { color: '#c4b5fd', backgroundColor: 'rgba(196, 181, 253, 0.12)' },
      rowClassName: 'bg-violet-300/[0.05] hover:bg-violet-300/[0.08] border-l border-violet-300/22',
      textClassName: 'text-violet-50/95',
    }
  }

  if (/^(\/\/|\/\*|\*|<!--)/.test(trimmed)) {
    return {
      badge: 'COM',
      badgeStyle: { color: '#94a3b8', backgroundColor: 'rgba(148, 163, 184, 0.1)' },
      rowClassName: 'bg-white/[0.015] hover:bg-white/[0.03] border-l border-white/6',
      textClassName: 'text-ghost-text-dim/75 italic',
    }
  }

  return null
}

function getPreviewKind(fileName: string): PreviewKind {
  if (isImageFile(fileName)) return 'image'
  if (isMarkdownFile(fileName)) return 'markdown'
  if (isStructuredDataFile(fileName)) return 'structured'
  if (isTextFile(fileName)) return 'text'
  return 'binary'
}

export function FilePreview({
  file,
  gitStatus,
  onOpenTerminal,
  onLaunchAgent,
  onSetAsProject,
  onClose,
}: FilePreviewProps) {
  const [content, setContent] = useState<string | null>(null)
  const [totalLines, setTotalLines] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [markdownView, setMarkdownView] = useState<MarkdownView>('rendered')
  const [structuredView, setStructuredView] = useState<StructuredView>('structured')
  const [imageMeta, setImageMeta] = useState<{ width: number; height: number } | null>(null)

  const extColor = getExtensionColor(file.name)
  const extLabel = getExtensionLabel(file.name)
  const previewKind = getPreviewKind(file.name)
  const parentPath = getParentPath(file.path)
  const gitInfo = gitStatus ? getGitStatusInfo(gitStatus) : null
  const absoluteModifiedAt = formatAbsoluteTime(file.modifiedAt)
  const fileUrl = useMemo(
    () => previewKind === 'image' ? toLocalFileUrl(file.path) : null,
    [file.path, previewKind]
  )

  useEffect(() => {
    let cancelled = false

    setContent(null)
    setError(null)
    setTotalLines(0)
    setImageMeta(null)
    setMarkdownView('rendered')
    setStructuredView('structured')

    if (previewKind === 'image' || previewKind === 'binary' || !window.ghostshell?.fsPreview) {
      return
    }

    const maxLines = previewKind === 'markdown'
      ? expanded ? 140 : 72
      : previewKind === 'structured'
        ? expanded ? 280 : 140
        : expanded ? 60 : 24

    setLoading(true)
    window.ghostshell
      .fsPreview(file.path, maxLines)
      .then((result: { success: boolean; content: string; totalLines: number; error?: string }) => {
        if (cancelled) return
        if (result.success) {
          setContent(result.content)
          setTotalLines(result.totalLines)
        } else {
          setError(result.error || 'Cannot read file')
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError('Preview unavailable')
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [expanded, file.path, previewKind])

  const lines = content?.split('\n') || []
  const highlightedLines = useMemo(
    () => lines.filter((line) => getPreviewTone(line)).length,
    [lines]
  )
  const actionPath = parentPath || file.path
  const maxHeight = previewKind === 'image'
    ? (expanded ? 'max-h-[62vh]' : 'max-h-[360px]')
    : previewKind === 'structured'
      ? (expanded ? 'max-h-[60vh]' : 'max-h-[320px]')
      : (expanded ? 'max-h-[56vh]' : 'max-h-[220px]')

  return (
    <div
      className="ghost-floating-panel animate-fade-in flex flex-col overflow-hidden rounded-2xl"
      style={{ borderTopColor: extColor ? extColor + '30' : undefined }}
    >
      <div className="ghost-toolbar-surface flex items-center gap-2 border-b border-ghost-border/40 px-3 py-2">
        <div className="ghost-soft-pill flex h-7 w-7 shrink-0 items-center justify-center rounded-lg">
          {previewKind === 'image' ? (
            <ImageIcon className="h-3.5 w-3.5" style={{ color: extColor || 'var(--ghost-text-dim)' }} />
          ) : previewKind === 'markdown' ? (
            <ScanText className="h-3.5 w-3.5" style={{ color: extColor || 'var(--ghost-text-dim)' }} />
          ) : (
            <FileCode className="h-3.5 w-3.5" style={{ color: extColor || 'var(--ghost-text-dim)' }} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-medium text-ghost-text">{file.name}</div>
          <div className="truncate text-[10px] text-ghost-text-dim/55">{parentPath || file.path}</div>
        </div>

        <div className="ml-1 flex items-center gap-1">
          {previewKind === 'markdown' && (
            <div className="mr-1 flex items-center gap-1">
              <button
                onClick={() => setMarkdownView('rendered')}
                className={`rounded-lg px-2 py-1 text-[10px] uppercase tracking-[0.16em] transition-colors ${
                  markdownView === 'rendered'
                    ? 'border border-cyan-300/28 bg-cyan-300/12 text-cyan-100'
                    : 'ghost-soft-pill text-ghost-text-dim hover:text-ghost-text'
                }`}
              >
                Rendered
              </button>
              <button
                onClick={() => setMarkdownView('source')}
                className={`rounded-lg px-2 py-1 text-[10px] uppercase tracking-[0.16em] transition-colors ${
                  markdownView === 'source'
                    ? 'border border-cyan-300/28 bg-cyan-300/12 text-cyan-100'
                    : 'ghost-soft-pill text-ghost-text-dim hover:text-ghost-text'
                }`}
              >
                Source
              </button>
            </div>
          )}
          {previewKind === 'structured' && (
            <div className="mr-1 flex items-center gap-1">
              <button
                onClick={() => setStructuredView('structured')}
                className={`rounded-lg px-2 py-1 text-[10px] uppercase tracking-[0.16em] transition-colors ${
                  structuredView === 'structured'
                    ? 'border border-cyan-300/28 bg-cyan-300/12 text-cyan-100'
                    : 'ghost-soft-pill text-ghost-text-dim hover:text-ghost-text'
                }`}
              >
                Structured
              </button>
              <button
                onClick={() => setStructuredView('source')}
                className={`rounded-lg px-2 py-1 text-[10px] uppercase tracking-[0.16em] transition-colors ${
                  structuredView === 'source'
                    ? 'border border-cyan-300/28 bg-cyan-300/12 text-cyan-100'
                    : 'ghost-soft-pill text-ghost-text-dim hover:text-ghost-text'
                }`}
              >
                Source
              </button>
            </div>
          )}
          {previewKind !== 'binary' && (
            <button
              onClick={() => setExpanded((current) => !current)}
              className="ghost-soft-pill flex h-7 w-7 items-center justify-center rounded-lg text-ghost-text-dim/50 transition-colors hover:text-ghost-text"
              title={expanded ? 'Collapse' : 'Expand'}
            >
              {expanded ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
            </button>
          )}
          <button
            onClick={onClose}
            className="ghost-soft-pill flex h-7 w-7 items-center justify-center rounded-lg text-ghost-text-dim/50 transition-colors hover:text-ghost-text"
            title="Close preview (Esc)"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>

      <div className="border-b border-ghost-border/30 px-3 py-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="ghost-soft-pill rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-cyan-100">
            {previewKind}
          </span>
          {extLabel && (
            <span
              className="ghost-soft-pill rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.16em]"
              style={{
                backgroundColor: extColor ? extColor + '15' : 'rgba(255,255,255,0.04)',
                color: extColor || 'var(--ghost-text-dim)',
              }}
            >
              {extLabel}
            </span>
          )}
          {gitInfo && (
            <span
              className="ghost-soft-pill inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.16em]"
              style={{ color: gitInfo.color }}
            >
              <GitBranch className="h-2.5 w-2.5" />
              {gitInfo.label}
            </span>
          )}
          {file.size !== undefined && (
            <span className="ghost-soft-pill rounded-full px-2 py-0.5 text-[10px] tabular-nums text-ghost-text-dim">
              {formatFileSize(file.size)}
            </span>
          )}
          {file.modifiedAt && (
            <span className="ghost-soft-pill rounded-full px-2 py-0.5 text-[10px] text-ghost-text-dim">
              {getRelativeTime(file.modifiedAt)}
            </span>
          )}
          {totalLines > 0 && (
            <span className="ghost-soft-pill rounded-full px-2 py-0.5 text-[10px] tabular-nums text-ghost-text-dim">
              {totalLines} lines
            </span>
          )}
          {imageMeta && (
            <span className="ghost-soft-pill rounded-full px-2 py-0.5 text-[10px] tabular-nums text-ghost-text-dim">
              {imageMeta.width} x {imageMeta.height}
            </span>
          )}
          {highlightedLines > 0 && (markdownView === 'source' || structuredView === 'source') && (
            <span className="ghost-soft-pill rounded-full px-2 py-0.5 text-[10px] text-cyan-100">
              {highlightedLines} signal
            </span>
          )}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => void copyToClipboard(file.path)}
            className="ghost-soft-pill inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-ghost-text-dim transition-colors hover:text-ghost-text"
            title="Copy full path"
          >
            <Copy className="h-3 w-3" />
            Copy path
          </button>
          {actionPath && onOpenTerminal && (
            <button
              onClick={() => onOpenTerminal(actionPath)}
              className="ghost-soft-pill inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-ghost-text-dim transition-colors hover:text-ghost-text"
              title="Open a terminal in this file directory"
            >
              <Terminal className="h-3 w-3" />
              Terminal
            </button>
          )}
          {actionPath && onLaunchAgent && (
            <button
              onClick={() => onLaunchAgent(actionPath)}
              className="ghost-soft-pill inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-ghost-text-dim transition-colors hover:text-ghost-text"
              title="Launch an agent in this file directory"
            >
              <Bot className="h-3 w-3" />
              Agent
            </button>
          )}
          {actionPath && onSetAsProject && (
            <button
              onClick={() => onSetAsProject(actionPath)}
              className="ghost-soft-pill inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-amber-100 transition-colors hover:text-white"
              title="Use this file directory as the project root"
            >
              <FolderTree className="h-3 w-3" />
              Root
            </button>
          )}
        </div>

        {absoluteModifiedAt && (
          <p className="mt-2 truncate text-[10px] text-ghost-text-dim/45">
            Updated {absoluteModifiedAt}
          </p>
        )}
      </div>

      <div className={`${maxHeight} overflow-auto transition-all duration-200`}>
        {loading && (
          <div className="p-3 text-xs text-ghost-text-dim/40 animate-pulse">Loading preview...</div>
        )}

        {error && (
          <div className="p-3 text-xs text-red-300/80">{error}</div>
        )}

        {previewKind === 'image' && !error && fileUrl && (
          <div className="flex min-h-[240px] items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.06),_transparent_55%),linear-gradient(135deg,rgba(255,255,255,0.03),rgba(255,255,255,0.015))] p-4">
            <img
              src={fileUrl}
              alt={file.name}
              className="max-h-full max-w-full rounded-2xl border border-white/10 bg-black/35 object-contain shadow-[0_18px_60px_rgba(0,0,0,0.35)]"
              onLoad={(event) => {
                setError(null)
                setImageMeta({
                  width: event.currentTarget.naturalWidth,
                  height: event.currentTarget.naturalHeight,
                })
              }}
              onError={() => setError('Image preview unavailable')}
            />
          </div>
        )}

        {previewKind === 'markdown' && content !== null && !loading && markdownView === 'rendered' && (
          <MarkdownPreview content={content} totalLines={totalLines} />
        )}

        {previewKind === 'structured' && content !== null && !loading && structuredView === 'structured' && (
          <StructuredDataPreview content={content} fileName={file.name} totalLines={totalLines} />
        )}

        {previewKind === 'binary' && !loading && !error && (
          <div className="flex flex-col items-center justify-center py-8 text-ghost-text-dim/30">
            <p className="text-xs">Binary file - preview not available</p>
            <p className="mt-1 text-2xs">{formatFileSize(file.size)}</p>
          </div>
        )}

        {content !== null && !loading && (
          previewKind === 'text' ||
          (previewKind === 'markdown' && markdownView === 'source') ||
          (previewKind === 'structured' && structuredView === 'source')
        ) && (
          <div className="font-mono text-[11px] leading-[18px]">
            {lines.map((line, index) => {
              const tone = getPreviewTone(line)

              return (
                <div
                  key={index}
                  className={`flex border-b border-white/[0.02] transition-colors ${
                    tone?.rowClassName || 'hover:bg-white/[0.03]'
                  }`}
                >
                  <span className="w-10 shrink-0 select-none pr-2 pt-0.5 text-right tabular-nums text-ghost-text-dim/22">
                    {index + 1}
                  </span>
                  {tone && (
                    <span
                      className="mt-1.5 mr-2 h-fit shrink-0 rounded-md px-1.5 py-px text-[9px] font-semibold tracking-[0.16em]"
                      style={tone.badgeStyle}
                    >
                      {tone.badge}
                    </span>
                  )}
                  <pre
                    className={`flex-1 overflow-x-auto whitespace-pre pr-3 ${
                      tone?.textClassName || 'text-ghost-text/82'
                    }`}
                  >
                    {line || ' '}
                  </pre>
                </div>
              )
            })}
            {totalLines > lines.length && (
              <div className="flex">
                <span className="w-10 shrink-0" />
                <span className="py-1 text-2xs text-ghost-text-dim/20">
                  ... {totalLines - lines.length} more lines
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
