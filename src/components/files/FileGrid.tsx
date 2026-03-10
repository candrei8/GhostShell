import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Bot,
  Copy,
  FileText,
  Folder,
  FolderOpen,
  File,
  FileCode,
  FileJson,
  Image,
  FileType,
  Braces,
  Hash,
  Pencil,
  Terminal,
  Trash2,
} from 'lucide-react'
import { FileEntry } from '../../lib/types'
import {
  copyToClipboard,
  getExtensionColor,
  getExtensionLabel,
  formatFileSize,
  getGitStatusInfo,
} from '../../lib/fileUtils'

interface FileGridProps {
  files: FileEntry[]
  onNavigate?: (entry: FileEntry) => void
  onOpenTerminal?: (path: string) => void
  onLaunchAgent?: (path: string) => void
  onSetAsProject?: (path: string) => void
  onDelete?: (entry: FileEntry) => void
  onRename?: (entry: FileEntry, newName: string) => void
  onMoveEntries?: (sourcePaths: string[], targetDirectory: string) => void
  onSelect?: (entry: FileEntry | null, options?: { append?: boolean; range?: boolean; index?: number }) => void
  selectedPaths?: string[]
  gitStatuses?: Record<string, string>
}

interface ContextMenuState {
  x: number
  y: number
  entry: FileEntry
}

function getGridIcon(name: string, size: number) {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  switch (ext) {
    case 'ts': case 'tsx': case 'js': case 'jsx': case 'mjs':
      return <FileCode style={{ width: size * 4, height: size * 4 }} />
    case 'json':
      return <FileJson style={{ width: size * 4, height: size * 4 }} />
    case 'png': case 'jpg': case 'jpeg': case 'gif': case 'webp': case 'svg': case 'ico':
      return <Image style={{ width: size * 4, height: size * 4 }} />
    case 'css': case 'scss': case 'less':
      return <Braces style={{ width: size * 4, height: size * 4 }} />
    case 'md': case 'mdx': case 'txt':
      return <FileType style={{ width: size * 4, height: size * 4 }} />
    case 'py': case 'rs': case 'go': case 'java': case 'rb': case 'c': case 'cpp': case 'h':
      return <Hash style={{ width: size * 4, height: size * 4 }} />
    default:
      return <File style={{ width: size * 4, height: size * 4 }} />
  }
}

export function FileGrid({
  files,
  onNavigate,
  onOpenTerminal,
  onLaunchAgent,
  onSetAsProject,
  onDelete,
  onRename,
  onMoveEntries,
  onSelect,
  selectedPaths,
  gitStatuses,
}: FileGridProps) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [copiedPath, setCopiedPath] = useState<string | null>(null)
  const [renamingPath, setRenamingPath] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [dragOverPath, setDragOverPath] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const handleClick = useCallback(
    (file: FileEntry, index: number, event: React.MouseEvent<HTMLButtonElement>) => {
      const append = event.metaKey || event.ctrlKey
      const range = event.shiftKey

      onSelect?.(file, { append, range, index })
    },
    [onSelect]
  )

  const closeMenu = useCallback(() => setContextMenu(null), [])

  useEffect(() => {
    if (!contextMenu) return
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) closeMenu()
    }
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenu()
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [contextMenu, closeMenu])

  useEffect(() => {
    if (!copiedPath) return
    const timer = setTimeout(() => setCopiedPath(null), 1500)
    return () => clearTimeout(timer)
  }, [copiedPath])

  useEffect(() => {
    if (!confirmDelete) return
    const timer = setTimeout(() => setConfirmDelete(null), 3000)
    return () => clearTimeout(timer)
  }, [confirmDelete])

  const handleContextMenu = useCallback((event: React.MouseEvent, entry: FileEntry) => {
    event.preventDefault()
    event.stopPropagation()
    const x = Math.min(event.clientX, window.innerWidth - 200)
    const y = Math.min(event.clientY, window.innerHeight - 280)
    setContextMenu({ x, y, entry })
  }, [])

  const handleCopyPath = useCallback((entry: FileEntry) => {
    void copyToClipboard(entry.path)
    setCopiedPath(entry.path)
    closeMenu()
  }, [closeMenu])

  const handleCopyName = useCallback((entry: FileEntry) => {
    void copyToClipboard(entry.name)
    setCopiedPath(entry.path)
    closeMenu()
  }, [closeMenu])

  const handleStartRename = useCallback((entry: FileEntry) => {
    setRenamingPath(entry.path)
    setRenameValue(entry.name)
    closeMenu()
  }, [closeMenu])

  const handleSubmitRename = useCallback((entry: FileEntry) => {
    if (renameValue.trim() && renameValue !== entry.name) {
      onRename?.(entry, renameValue.trim())
    }
    setRenamingPath(null)
    setRenameValue('')
  }, [onRename, renameValue])

  const handleDeleteEntry = useCallback((entry: FileEntry) => {
    if (confirmDelete === entry.path) {
      onDelete?.(entry)
      setConfirmDelete(null)
      closeMenu()
      return
    }

    setConfirmDelete(entry.path)
  }, [closeMenu, confirmDelete, onDelete])

  const handleDragStart = useCallback((event: React.DragEvent, entry: FileEntry, index: number) => {
    const dragPaths = selectedPaths?.includes(entry.path) ? selectedPaths : [entry.path]
    if (!selectedPaths?.includes(entry.path)) {
      onSelect?.(entry, { index })
    }
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('application/x-ghostshell-paths', JSON.stringify(dragPaths))
    event.dataTransfer.setData('text/plain', dragPaths.join('\n'))
  }, [onSelect, selectedPaths])

  const handleDragOverDirectory = useCallback((event: React.DragEvent, entry: FileEntry) => {
    if (!entry.isDirectory) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setDragOverPath(entry.path)
  }, [])

  const handleDropOnDirectory = useCallback((event: React.DragEvent, entry: FileEntry) => {
    if (!entry.isDirectory) return
    event.preventDefault()
    setDragOverPath(null)

    const raw = event.dataTransfer.getData('application/x-ghostshell-paths')
    if (!raw) return

    try {
      const sourcePaths = JSON.parse(raw) as string[]
      void onMoveEntries?.(sourcePaths, entry.path)
    } catch {
      // ignore invalid payload
    }
  }, [onMoveEntries])

  if (files.length === 0) {
    return (
      <div className="ghost-section-card flex flex-col items-center justify-center rounded-2xl py-8 text-ghost-text-dim/40">
        <Folder className="mb-2 h-8 w-8 opacity-30" />
        <p className="text-xs">Empty directory</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-3 gap-2 px-1 py-1">
      {files.map((file, index) => {
        const extColor = !file.isDirectory ? getExtensionColor(file.name) : null
        const extLabel = !file.isDirectory ? getExtensionLabel(file.name) : null
        const isSelected = selectedPaths?.includes(file.path) || false
        const gitCode = gitStatuses?.[file.name]
        const gitInfo = gitCode ? getGitStatusInfo(gitCode) : null
        const sizeStr = !file.isDirectory ? formatFileSize(file.size) : null

        return (
          <button
            key={file.path}
            onClick={(event) => handleClick(file, index, event)}
            onDoubleClick={() => {
              if (file.isDirectory) {
                onNavigate?.(file)
              }
            }}
            onContextMenu={(event) => handleContextMenu(event, file)}
            draggable
            onDragStart={(event) => handleDragStart(event, file, index)}
            onDragOver={(event) => handleDragOverDirectory(event, file)}
            onDragLeave={() => {
              if (dragOverPath === file.path) setDragOverPath(null)
            }}
            onDrop={(event) => handleDropOnDirectory(event, file)}
            className={`group relative flex flex-col items-center gap-2 rounded-2xl p-3 transition-all duration-100 ${
              isSelected
                ? 'border border-cyan-300/30 bg-cyan-300/10 shadow-[0_12px_24px_rgba(0,0,0,0.16)]'
                : 'ghost-section-card hover:border-white/15'
            } ${dragOverPath === file.path ? 'border-emerald-300/35 bg-emerald-300/10' : ''} cursor-pointer`}
          >
            {/* Git status dot */}
            {gitInfo && (
              <div
                className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: gitInfo.color }}
              />
            )}

            {/* Icon */}
            <div
              className="ghost-soft-pill flex h-12 w-12 items-center justify-center rounded-2xl transition-transform group-hover:scale-105"
              style={{ color: file.isDirectory ? '#60a5fa' : (extColor || 'var(--ghost-text-dim)') }}
            >
              {file.isDirectory ? (
                <Folder style={{ width: 20, height: 20 }} />
              ) : (
                getGridIcon(file.name, 5)
              )}
            </div>

            {/* Name */}
            {renamingPath === file.path ? (
              <input
                type="text"
                value={renameValue}
                onChange={(event) => setRenameValue(event.target.value)}
                onBlur={() => handleSubmitRename(file)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') handleSubmitRename(file)
                  if (event.key === 'Escape') {
                    setRenamingPath(null)
                    setRenameValue('')
                  }
                }}
                className="w-full rounded-lg border border-cyan-300/35 bg-black/25 px-2 py-1 text-center text-2xs text-ghost-text outline-none"
                autoFocus
                onClick={(event) => event.stopPropagation()}
              />
            ) : (
              <span className="w-full truncate text-center text-2xs leading-tight text-ghost-text">
                {file.name}
              </span>
            )}

            {/* Extension badge or size */}
            {renamingPath !== file.path && extLabel ? (
              <span
                className="ghost-soft-pill rounded-md px-1.5 py-px text-[9px] opacity-75"
                style={{
                  backgroundColor: extColor ? extColor + '15' : 'rgba(255,255,255,0.04)',
                  color: extColor || 'var(--ghost-text-dim)',
                }}
              >
                {extLabel}
              </span>
            ) : renamingPath !== file.path && sizeStr ? (
              <span className="text-[9px] text-ghost-text-dim/30">{sizeStr}</span>
            ) : (
              <span className="text-[9px] opacity-0">-</span>
            )}

            {renamingPath !== file.path && (
              <div className="absolute inset-x-2 bottom-2 hidden items-center justify-center gap-1 rounded-xl bg-black/35 px-2 py-1 backdrop-blur-sm group-hover:flex">
                <button
                  onClick={(event) => {
                    event.stopPropagation()
                    handleCopyPath(file)
                  }}
                  className="ghost-soft-pill flex h-6 w-6 items-center justify-center rounded-lg text-ghost-text-dim/60 transition-colors hover:text-ghost-text"
                  title="Copy path"
                >
                  <Copy className="h-3 w-3" />
                </button>
                <button
                  onClick={(event) => {
                    event.stopPropagation()
                    handleStartRename(file)
                  }}
                  className="ghost-soft-pill flex h-6 w-6 items-center justify-center rounded-lg text-ghost-text-dim/60 transition-colors hover:text-ghost-text"
                  title="Rename"
                >
                  <Pencil className="h-3 w-3" />
                </button>
                <button
                  onClick={(event) => {
                    event.stopPropagation()
                    handleDeleteEntry(file)
                  }}
                  className={`ghost-soft-pill flex h-6 w-6 items-center justify-center rounded-lg transition-colors ${
                    confirmDelete === file.path
                      ? 'border border-rose-300/28 text-rose-200'
                      : 'text-ghost-text-dim/60 hover:text-rose-200'
                  }`}
                  title={confirmDelete === file.path ? 'Click again to confirm' : 'Delete'}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            )}
          </button>
        )
      })}

      {contextMenu && (
        <div
          ref={menuRef}
          className="ghost-floating-panel fixed z-[999] min-w-[190px] rounded-xl py-1 animate-fade-in"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {contextMenu.entry.isDirectory ? (
            <>
              <ContextMenuItem
                icon={<Terminal className="h-3.5 w-3.5" />}
                label="Open Terminal Here"
                onClick={() => {
                  onOpenTerminal?.(contextMenu.entry.path)
                  closeMenu()
                }}
              />
              <ContextMenuItem
                icon={<Bot className="h-3.5 w-3.5" />}
                label="Launch Agent Here"
                onClick={() => {
                  onLaunchAgent?.(contextMenu.entry.path)
                  closeMenu()
                }}
              />
              <ContextMenuItem
                icon={<FolderOpen className="h-3.5 w-3.5" />}
                label="Set as Project Root"
                onClick={() => {
                  onSetAsProject?.(contextMenu.entry.path)
                  closeMenu()
                }}
              />
              <div className="mx-2 my-1 h-px bg-ghost-border/50" />
            </>
          ) : null}

          <ContextMenuItem
            icon={<Pencil className="h-3.5 w-3.5" />}
            label="Rename"
            shortcut="F2"
            onClick={() => handleStartRename(contextMenu.entry)}
          />
          <ContextMenuItem
            icon={<Copy className="h-3.5 w-3.5" />}
            label="Copy Path"
            onClick={() => handleCopyPath(contextMenu.entry)}
          />
          {!contextMenu.entry.isDirectory && (
            <ContextMenuItem
              icon={<FileText className="h-3.5 w-3.5" />}
              label="Copy Name"
              onClick={() => handleCopyName(contextMenu.entry)}
            />
          )}
          <div className="mx-2 my-1 h-px bg-ghost-border/50" />
          <ContextMenuItem
            icon={<Trash2 className="h-3.5 w-3.5" />}
            label={confirmDelete === contextMenu.entry.path ? 'Confirm Delete' : 'Delete'}
            shortcut="Del"
            onClick={() => handleDeleteEntry(contextMenu.entry)}
            variant="danger"
          />
        </div>
      )}
    </div>
  )
}

function ContextMenuItem({
  icon,
  label,
  shortcut,
  onClick,
  variant,
}: {
  icon: React.ReactNode
  label: string
  shortcut?: string
  onClick: () => void
  variant?: 'danger'
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-xs transition-colors ${
        variant === 'danger'
          ? 'text-red-400 hover:bg-red-500/10'
          : 'text-ghost-text-dim hover:bg-white/[0.06] hover:text-ghost-text'
      }`}
    >
      <span className="shrink-0 opacity-60">{icon}</span>
      <span className="flex-1">{label}</span>
      {shortcut && <span className="ml-2 text-2xs text-ghost-text-dim/30">{shortcut}</span>}
    </button>
  )
}
