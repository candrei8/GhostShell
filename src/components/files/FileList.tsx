import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Folder,
  File,
  ChevronRight,
  Terminal,
  Bot,
  FolderOpen,
  Copy,
  FileText,
  Trash2,
  Pencil,
  FileCode,
  FileJson,
  Image,
  FileType,
  Braces,
  Hash,
} from 'lucide-react'
import { FileEntry } from '../../lib/types'
import {
  getExtensionColor,
  getExtensionLabel,
  formatFileSize,
  copyToClipboard,
  getRelativeTime,
  getGitStatusInfo,
} from '../../lib/fileUtils'

interface FileListProps {
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

function getFileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  switch (ext) {
    case 'ts': case 'tsx': case 'js': case 'jsx': case 'mjs':
      return <FileCode className="w-3.5 h-3.5" />
    case 'json':
      return <FileJson className="w-3.5 h-3.5" />
    case 'png': case 'jpg': case 'jpeg': case 'gif': case 'webp': case 'svg': case 'ico':
      return <Image className="w-3.5 h-3.5" />
    case 'css': case 'scss': case 'less':
      return <Braces className="w-3.5 h-3.5" />
    case 'md': case 'mdx': case 'txt':
      return <FileType className="w-3.5 h-3.5" />
    case 'py': case 'rs': case 'go': case 'java': case 'rb': case 'c': case 'cpp': case 'h':
      return <Hash className="w-3.5 h-3.5" />
    default:
      return <File className="w-3.5 h-3.5" />
  }
}

export function FileList({
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
}: FileListProps) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [copiedPath, setCopiedPath] = useState<string | null>(null)
  const [renamingPath, setRenamingPath] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [focusedIndex, setFocusedIndex] = useState(-1)
  const [dragOverPath, setDragOverPath] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Keyboard navigation
  useEffect(() => {
    const el = listRef.current
    if (!el) return
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setFocusedIndex((i) => Math.min(i + 1, files.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setFocusedIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter' && focusedIndex >= 0) {
        const file = files[focusedIndex]
        if (file.isDirectory) {
          onNavigate?.(file)
        } else {
          onSelect?.(file, { index: focusedIndex })
        }
      } else if (e.key === 'F2' && focusedIndex >= 0) {
        e.preventDefault()
        const file = files[focusedIndex]
        setRenamingPath(file.path)
        setRenameValue(file.name)
      } else if (e.key === 'Delete' && focusedIndex >= 0) {
        e.preventDefault()
        const file = files[focusedIndex]
        if (confirmDelete === file.path) {
          onDelete?.(file)
          setConfirmDelete(null)
        } else {
          setConfirmDelete(file.path)
        }
      }
    }
    el.addEventListener('keydown', handler)
    return () => el.removeEventListener('keydown', handler)
  }, [focusedIndex, files, onNavigate, onSelect, onDelete, confirmDelete])

  // Scroll focused item into view
  useEffect(() => {
    if (focusedIndex < 0) return
    const el = listRef.current?.children[focusedIndex] as HTMLElement
    el?.scrollIntoView({ block: 'nearest' })
  }, [focusedIndex])

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, entry: FileEntry) => {
      e.preventDefault()
      e.stopPropagation()
      const x = Math.min(e.clientX, window.innerWidth - 200)
      const y = Math.min(e.clientY, window.innerHeight - 280)
      setContextMenu({ x, y, entry })
    },
    []
  )

  const closeMenu = useCallback(() => setContextMenu(null), [])

  useEffect(() => {
    if (!contextMenu) return
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) closeMenu()
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMenu()
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
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

  const handleCopyPath = useCallback((entry: FileEntry) => {
    copyToClipboard(entry.path)
    setCopiedPath(entry.path)
    closeMenu()
  }, [closeMenu])

  const handleCopyName = useCallback((entry: FileEntry) => {
    copyToClipboard(entry.name)
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
  }, [renameValue, onRename])

  const handleDeleteEntry = useCallback((entry: FileEntry) => {
    if (confirmDelete === entry.path) {
      onDelete?.(entry)
      setConfirmDelete(null)
      closeMenu()
    } else {
      setConfirmDelete(entry.path)
    }
  }, [confirmDelete, onDelete, closeMenu])

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
        <p className="mt-0.5 text-2xs text-ghost-text-dim/25">Create a file or folder to get started</p>
      </div>
    )
  }

  return (
    <div ref={listRef} className="relative flex flex-col gap-1" tabIndex={0}>
      {files.map((file, index) => {
        const extLabel = !file.isDirectory ? getExtensionLabel(file.name) : null
        const extColor = !file.isDirectory ? getExtensionColor(file.name) : null
        const sizeStr = !file.isDirectory ? formatFileSize(file.size) : null
        const timeStr = file.modifiedAt ? getRelativeTime(file.modifiedAt) : null
        const isCopied = copiedPath === file.path
        const isRenaming = renamingPath === file.path
        const isSelected = selectedPaths?.includes(file.path) || false
        const isFocused = focusedIndex === index
        const gitCode = gitStatuses?.[file.name]
        const gitInfo = gitCode ? getGitStatusInfo(gitCode) : null

        return (
          <div
            key={file.path}
            onClick={(event) => {
              const append = event.metaKey || event.ctrlKey
              const range = event.shiftKey
              setFocusedIndex(index)
              onSelect?.(file, { append, range, index })
            }}
            onDoubleClick={() => {
              if (file.isDirectory) {
                onNavigate?.(file)
              }
            }}
            onContextMenu={(e) => handleContextMenu(e, file)}
            draggable
            onDragStart={(event) => handleDragStart(event, file, index)}
            onDragOver={(event) => handleDragOverDirectory(event, file)}
            onDragLeave={() => {
              if (dragOverPath === file.path) setDragOverPath(null)
            }}
            onDrop={(event) => handleDropOnDirectory(event, file)}
            className={`group flex cursor-pointer items-center gap-2 rounded-xl px-2.5 py-2 transition-all duration-100 ${
              isSelected
              ? 'border border-cyan-300/30 bg-cyan-300/10 shadow-[0_10px_24px_rgba(0,0,0,0.16)]'
              : isFocused
                ? 'border border-ghost-border/30 bg-white/[0.05]'
                : 'ghost-section-card hover:border-white/15'
            } ${isCopied ? 'ring-1 ring-cyan-300/26' : ''} ${
              dragOverPath === file.path ? 'border-emerald-300/35 bg-emerald-300/10' : ''
            }`}
          >
            {/* Git status indicator */}
            <div className="flex w-2 shrink-0 justify-center">
              {gitInfo && (
                <div
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: gitInfo.color }}
                  title={`Git: ${gitInfo.label}`}
                />
              )}
            </div>

            {/* File icon */}
            <span
              className="ghost-soft-pill flex h-8 w-8 shrink-0 items-center justify-center rounded-xl"
              style={{ color: file.isDirectory ? '#60a5fa' : (extColor || 'var(--ghost-text-dim)') }}
            >
              {file.isDirectory ? (
                <Folder className="w-3.5 h-3.5" />
              ) : (
                getFileIcon(file.name)
              )}
            </span>

            {/* Name or rename input */}
            {isRenaming ? (
              <input
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={() => handleSubmitRename(file)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSubmitRename(file)
                  if (e.key === 'Escape') { setRenamingPath(null); setRenameValue('') }
                }}
                className="flex-1 rounded-lg border border-cyan-300/35 bg-black/25 px-2 py-1 text-xs text-ghost-text outline-none"
                autoFocus
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <div className="min-w-0 flex-1">
                <span className={`block truncate text-xs ${isSelected ? 'font-medium text-ghost-text' : 'text-ghost-text'}`}>
                  {file.name}
                </span>
                <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-ghost-text-dim/45">
                  {gitInfo && <span>{gitInfo.label}</span>}
                  {(sizeStr || timeStr) && <span className="truncate">{sizeStr || timeStr}</span>}
                </div>
              </div>
            )}

            {/* Right side: info or hover actions */}
            {!isRenaming && (
              <div className="flex items-center gap-1 shrink-0">
                {/* Extension badge */}
                {extLabel && (
                  <span
                    className="ghost-soft-pill text-2xs rounded-md px-1.5 py-px opacity-65 transition-opacity group-hover:opacity-90"
                    style={{
                      backgroundColor: extColor ? extColor + '15' : 'rgba(255,255,255,0.04)',
                      color: extColor || 'var(--ghost-text-dim)',
                    }}
                  >
                    {extLabel}
                  </span>
                )}

                {/* Size + time (visible) / Hover actions (on hover) */}
                <div className="flex items-center gap-1">
                  <div className="hidden group-hover:flex items-center gap-0.5">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleCopyPath(file) }}
                      className="ghost-soft-pill flex h-5 w-5 items-center justify-center rounded-md text-ghost-text-dim/55 transition-colors hover:text-ghost-accent"
                      title="Copy path"
                    >
                      <Copy className="w-2.5 h-2.5" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleStartRename(file) }}
                      className="ghost-soft-pill flex h-5 w-5 items-center justify-center rounded-md text-ghost-text-dim/55 transition-colors hover:text-ghost-accent"
                      title="Rename (F2)"
                    >
                      <Pencil className="w-2.5 h-2.5" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteEntry(file) }}
                      className={`ghost-soft-pill flex h-5 w-5 items-center justify-center rounded-md transition-colors ${
                        confirmDelete === file.path
                          ? 'border-red-400/28 text-red-300'
                          : 'text-ghost-text-dim/55 hover:text-red-300'
                      }`}
                      title={confirmDelete === file.path ? 'Click again to confirm' : 'Delete'}
                    >
                      <Trash2 className="w-2.5 h-2.5" />
                    </button>
                  </div>
                </div>

                {/* Directory chevron */}
                {file.isDirectory && (
                  <ChevronRight className="h-3 w-3 text-ghost-text-dim/20 transition-colors group-hover:text-ghost-text-dim/40" />
                )}
              </div>
            )}
          </div>
        )
      })}

      {/* Context menu */}
      {contextMenu && (
        <div
          ref={menuRef}
          className="ghost-floating-panel fixed z-[999] min-w-[190px] rounded-xl py-1 animate-fade-in"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {contextMenu.entry.isDirectory ? (
            <>
              <ContextMenuItem
                icon={<Terminal className="w-3.5 h-3.5" />}
                label="Open Terminal Here"
                shortcut=""
                onClick={() => { onOpenTerminal?.(contextMenu.entry.path); closeMenu() }}
              />
              <ContextMenuItem
                icon={<Bot className="w-3.5 h-3.5" />}
                label="Launch Agent Here"
                shortcut=""
                onClick={() => { onLaunchAgent?.(contextMenu.entry.path); closeMenu() }}
              />
              <div className="mx-2 my-1 h-px bg-ghost-border/50" />
              <ContextMenuItem
                icon={<FolderOpen className="w-3.5 h-3.5" />}
                label="Set as Project Root"
                shortcut=""
                onClick={() => { onSetAsProject?.(contextMenu.entry.path); closeMenu() }}
              />
              <div className="mx-2 my-1 h-px bg-ghost-border/50" />
            </>
          ) : null}
          <ContextMenuItem
            icon={<Pencil className="w-3.5 h-3.5" />}
            label="Rename"
            shortcut="F2"
            onClick={() => handleStartRename(contextMenu.entry)}
          />
          <ContextMenuItem
            icon={<Copy className="w-3.5 h-3.5" />}
            label="Copy Path"
            shortcut=""
            onClick={() => handleCopyPath(contextMenu.entry)}
          />
          {!contextMenu.entry.isDirectory && (
            <ContextMenuItem
              icon={<FileText className="w-3.5 h-3.5" />}
              label="Copy Name"
              shortcut=""
              onClick={() => handleCopyName(contextMenu.entry)}
            />
          )}
          <div className="mx-2 my-1 h-px bg-ghost-border/50" />
          <ContextMenuItem
            icon={<Trash2 className="w-3.5 h-3.5" />}
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
  shortcut: string
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
      {shortcut && <span className="text-2xs text-ghost-text-dim/30 ml-2">{shortcut}</span>}
    </button>
  )
}
