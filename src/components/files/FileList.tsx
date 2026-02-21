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
  onSelect?: (entry: FileEntry | null) => void
  selectedPath?: string | null
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
  onSelect,
  selectedPath,
  gitStatuses,
}: FileListProps) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [copiedPath, setCopiedPath] = useState<string | null>(null)
  const [renamingPath, setRenamingPath] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [focusedIndex, setFocusedIndex] = useState(-1)
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
          onSelect?.(file)
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

  if (files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-ghost-text-dim/40">
        <Folder className="w-8 h-8 mb-2 opacity-30" />
        <p className="text-xs">Empty directory</p>
        <p className="text-2xs mt-0.5 text-ghost-text-dim/25">Create a file or folder to get started</p>
      </div>
    )
  }

  return (
    <div ref={listRef} className="flex flex-col relative" tabIndex={0}>
      {files.map((file, index) => {
        const extLabel = !file.isDirectory ? getExtensionLabel(file.name) : null
        const extColor = !file.isDirectory ? getExtensionColor(file.name) : null
        const sizeStr = !file.isDirectory ? formatFileSize(file.size) : null
        const timeStr = file.modifiedAt ? getRelativeTime(file.modifiedAt) : null
        const isCopied = copiedPath === file.path
        const isRenaming = renamingPath === file.path
        const isSelected = selectedPath === file.path
        const isFocused = focusedIndex === index
        const gitCode = gitStatuses?.[file.name]
        const gitInfo = gitCode ? getGitStatusInfo(gitCode) : null

        return (
          <div
            key={file.path}
            onClick={() => {
              setFocusedIndex(index)
              if (file.isDirectory) {
                onNavigate?.(file)
              } else {
                onSelect?.(file)
              }
            }}
            onContextMenu={(e) => handleContextMenu(e, file)}
            className={`group flex items-center gap-1.5 px-1.5 py-[5px] rounded-md transition-all duration-100 ${
              file.isDirectory ? 'cursor-pointer' : 'cursor-default'
            } ${isSelected
              ? 'bg-ghost-accent/10 border border-ghost-accent/20'
              : isFocused
                ? 'bg-white/[0.04] border border-ghost-border/30'
                : 'border border-transparent hover:bg-white/[0.03]'
            } ${isCopied ? 'bg-ghost-accent/10' : ''}`}
          >
            {/* Git status indicator */}
            <div className="w-2 shrink-0 flex justify-center">
              {gitInfo && (
                <div
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: gitInfo.color }}
                  title={`Git: ${gitInfo.label}`}
                />
              )}
            </div>

            {/* File icon */}
            <span className="shrink-0" style={{ color: file.isDirectory ? '#60a5fa' : (extColor || 'var(--ghost-text-dim)') }}>
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
                className="flex-1 bg-ghost-surface border border-ghost-accent/50 rounded px-1.5 py-px text-xs text-ghost-text outline-none"
                autoFocus
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span className={`text-xs truncate flex-1 ${isSelected ? 'text-ghost-text font-medium' : 'text-ghost-text'}`}>
                {file.name}
              </span>
            )}

            {/* Right side: info or hover actions */}
            {!isRenaming && (
              <div className="flex items-center gap-1 shrink-0">
                {/* Extension badge */}
                {extLabel && (
                  <span
                    className="text-2xs px-1 py-px rounded opacity-50 group-hover:opacity-70 transition-opacity"
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
                  {/* Default: show size/time */}
                  <span className="text-2xs text-ghost-text-dim/30 tabular-nums group-hover:hidden">
                    {sizeStr || timeStr || ''}
                  </span>

                  {/* Hover: show quick actions */}
                  <div className="hidden group-hover:flex items-center gap-0.5">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleCopyPath(file) }}
                      className="w-4 h-4 flex items-center justify-center rounded text-ghost-text-dim/40 hover:text-ghost-accent hover:bg-ghost-accent/10 transition-colors"
                      title="Copy path"
                    >
                      <Copy className="w-2.5 h-2.5" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleStartRename(file) }}
                      className="w-4 h-4 flex items-center justify-center rounded text-ghost-text-dim/40 hover:text-ghost-accent hover:bg-ghost-accent/10 transition-colors"
                      title="Rename (F2)"
                    >
                      <Pencil className="w-2.5 h-2.5" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteEntry(file) }}
                      className={`w-4 h-4 flex items-center justify-center rounded transition-colors ${
                        confirmDelete === file.path
                          ? 'text-red-400 bg-red-500/10'
                          : 'text-ghost-text-dim/40 hover:text-red-400 hover:bg-red-500/10'
                      }`}
                      title={confirmDelete === file.path ? 'Click again to confirm' : 'Delete'}
                    >
                      <Trash2 className="w-2.5 h-2.5" />
                    </button>
                  </div>
                </div>

                {/* Directory chevron */}
                {file.isDirectory && (
                  <ChevronRight className="w-3 h-3 text-ghost-text-dim/20 group-hover:text-ghost-text-dim/40 transition-colors" />
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
          className="fixed z-[999] min-w-[180px] py-1 bg-ghost-surface border border-ghost-border rounded-lg shadow-xl animate-fade-in"
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
              <div className="h-px bg-ghost-border/50 mx-2 my-1" />
              <ContextMenuItem
                icon={<FolderOpen className="w-3.5 h-3.5" />}
                label="Set as Project Root"
                shortcut=""
                onClick={() => { onSetAsProject?.(contextMenu.entry.path); closeMenu() }}
              />
              <div className="h-px bg-ghost-border/50 mx-2 my-1" />
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
          <div className="h-px bg-ghost-border/50 mx-2 my-1" />
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
      className={`flex items-center gap-2.5 w-full px-3 py-1.5 text-xs transition-colors text-left ${
        variant === 'danger'
          ? 'text-red-400 hover:bg-red-500/10'
          : 'text-ghost-text-dim hover:text-ghost-text hover:bg-white/5'
      }`}
    >
      <span className="shrink-0 opacity-60">{icon}</span>
      <span className="flex-1">{label}</span>
      {shortcut && <span className="text-2xs text-ghost-text-dim/30 ml-2">{shortcut}</span>}
    </button>
  )
}
