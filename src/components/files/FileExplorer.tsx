import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  FolderOpen,
  LayoutGrid,
  List,
  ChevronRight,
  ArrowUp,
  RefreshCw,
  Terminal,
  Bot,
  Folder,
  FilePlus,
  FolderPlus,
  Search,
  X,
  ArrowUpDown,
  Eye,
  EyeOff,
} from 'lucide-react'
import { useWorkspaceStore } from '../../stores/workspaceStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useTerminalStore } from '../../stores/terminalStore'
import { useAgent } from '../../hooks/useAgent'
import { FileGrid } from './FileGrid'
import { FileList } from './FileList'
import { FilePreview } from './FilePreview'
import { FileEntry, GitStatus } from '../../lib/types'
import { useNotificationStore } from '../../stores/notificationStore'
import { getProviderLabel } from '../../lib/providers'

type ViewMode = 'grid' | 'list'
type SortMode = 'name' | 'size' | 'date' | 'type'

export function FileExplorer() {
  const currentPath = useWorkspaceStore((s) => s.currentPath)
  const setCurrentPath = useWorkspaceStore((s) => s.setCurrentPath)
  const defaultModel = useSettingsStore((s) => s.defaultModel)
  const defaultSkipPermissions = useSettingsStore((s) => s.defaultSkipPermissions)
  const defaultProvider = useSettingsStore((s) => s.defaultProvider)
  const defaultGeminiModel = useSettingsStore((s) => s.defaultGeminiModel)
  const addSession = useTerminalStore((s) => s.addSession)
  const { createAgent } = useAgent()
  const addNotification = useNotificationStore((s) => s.addNotification)

  const [files, setFiles] = useState<FileEntry[]>([])
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [browsePath, setBrowsePath] = useState(currentPath)
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null)
  const [creating, setCreating] = useState<'file' | 'folder' | null>(null)
  const [newName, setNewName] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [sortMode, setSortMode] = useState<SortMode>('name')
  const [showHidden, setShowHidden] = useState(false)
  const [selectedFile, setSelectedFile] = useState<FileEntry | null>(null)
  const [showPreview, setShowPreview] = useState(false)

  const searchRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const loadFiles = useCallback((path: string) => {
    setBrowsePath(path)
    setSelectedFile(null)
    setSearchQuery('')
    if (!window.ghostshell) return
    window.ghostshell.fsReadDir(path).then(setFiles).catch(() => {
      setFiles([])
      addNotification('error', 'Cannot read directory', path)
    })
    window.ghostshell.gitStatus(path).then(setGitStatus).catch(() => setGitStatus(null))
  }, [addNotification])

  useEffect(() => {
    loadFiles(currentPath)
  }, [currentPath, loadFiles])

  // Keyboard shortcuts
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const handleKeyDown = (e: KeyboardEvent) => {
      // Backspace = go up (when not typing in an input)
      if (e.key === 'Backspace' && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault()
        handleGoUp()
      }
      // Ctrl+F or / = toggle search
      if ((e.ctrlKey && e.key === 'f') || (e.key === '/' && !(e.target instanceof HTMLInputElement))) {
        e.preventDefault()
        setShowSearch(true)
        setTimeout(() => searchRef.current?.focus(), 50)
      }
      // Escape = close search
      if (e.key === 'Escape') {
        if (showSearch) {
          setShowSearch(false)
          setSearchQuery('')
        }
        if (showPreview) {
          setShowPreview(false)
        }
      }
    }
    el.addEventListener('keydown', handleKeyDown)
    return () => el.removeEventListener('keydown', handleKeyDown)
  }, [showSearch, showPreview]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleNavigate = useCallback(
    (entry: FileEntry) => {
      if (entry.isDirectory) {
        loadFiles(entry.path)
      }
    },
    [loadFiles]
  )

  const handleGoUp = useCallback(() => {
    const normalized = browsePath.replace(/\\/g, '/')
    const parts = normalized.split('/').filter(Boolean)
    if (parts.length > 1) {
      parts.pop()
      let parent = parts.join('/')
      // Handle Windows drive letters (C:)
      if (/^[a-zA-Z]:$/.test(parts[0])) {
        parent = parts[0] + '/' + parts.slice(1).join('/')
      } else {
        parent = '/' + parent
      }
      loadFiles(parent)
    }
  }, [browsePath, loadFiles])

  const handleSetAsProject = useCallback(
    (path?: string) => {
      setCurrentPath(path || browsePath)
    },
    [browsePath, setCurrentPath]
  )

  const handleOpenFolder = useCallback(async () => {
    if (!window.ghostshell) return
    const path = await window.ghostshell.selectDirectory()
    if (path) {
      setCurrentPath(path)
      loadFiles(path)
    }
  }, [setCurrentPath, loadFiles])

  const handleOpenTerminal = useCallback(
    (path?: string) => {
      const targetPath = path || browsePath
      const folderName = targetPath.replace(/\\/g, '/').split('/').filter(Boolean).pop() || 'Terminal'
      addSession({
        id: 'term-standalone-' + Date.now(),
        title: folderName,
        cwd: targetPath,
      })
    },
    [browsePath, addSession]
  )

  const handleLaunchAgent = useCallback(
    (path?: string) => {
      const targetPath = path || browsePath
      const folderName = targetPath.replace(/\\/g, '/').split('/').filter(Boolean).pop() || 'Agent'
      const label = `${getProviderLabel(defaultProvider)} - ${folderName}`
      if (defaultProvider === 'gemini') {
        createAgent(
          label, undefined, undefined, {},
          targetPath, undefined, undefined, true,
          'gemini', { model: defaultGeminiModel, yolo: defaultSkipPermissions },
        )
      } else {
        createAgent(
          label, undefined, undefined,
          { model: defaultModel, dangerouslySkipPermissions: defaultSkipPermissions },
          targetPath, undefined, undefined, true, 'claude',
        )
      }
    },
    [browsePath, createAgent, defaultModel, defaultSkipPermissions, defaultProvider, defaultGeminiModel]
  )

  const handleCreateSubmit = useCallback(async () => {
    if (!newName.trim() || !creating || !window.ghostshell) return
    const separator = browsePath.includes('\\') ? '\\' : '/'
    const fullPath = browsePath + separator + newName.trim()
    const result = creating === 'folder'
      ? await window.ghostshell.fsCreateDir(fullPath)
      : await window.ghostshell.fsCreateFile(fullPath)
    if (result.success) {
      addNotification('success', `Created ${creating}`, newName.trim())
      loadFiles(browsePath)
    } else {
      addNotification('error', `Failed to create ${creating}`, result.error)
    }
    setCreating(null)
    setNewName('')
  }, [creating, newName, browsePath, loadFiles, addNotification])

  const handleDelete = useCallback(async (entry: FileEntry) => {
    if (!window.ghostshell) return
    const result = await window.ghostshell.fsDelete(entry.path)
    if (result.success) {
      addNotification('info', 'Deleted', entry.name)
      if (selectedFile?.path === entry.path) setSelectedFile(null)
      loadFiles(browsePath)
    } else {
      addNotification('error', 'Delete failed', result.error)
    }
  }, [browsePath, loadFiles, addNotification, selectedFile])

  const handleRename = useCallback(async (entry: FileEntry, newFileName: string) => {
    if (!window.ghostshell) return
    const separator = browsePath.includes('\\') ? '\\' : '/'
    const newPath = browsePath + separator + newFileName
    const result = await window.ghostshell.fsRename(entry.path, newPath)
    if (result.success) {
      addNotification('success', 'Renamed', `${entry.name} \u2192 ${newFileName}`)
      loadFiles(browsePath)
    } else {
      addNotification('error', 'Rename failed', result.error)
    }
  }, [browsePath, loadFiles, addNotification])

  const handleSelectFile = useCallback((entry: FileEntry | null) => {
    setSelectedFile(entry)
    if (entry && !entry.isDirectory) {
      setShowPreview(true)
    }
  }, [])

  // Filter + sort files
  const processedFiles = useMemo(() => {
    let filtered = files

    // Hide dotfiles unless toggled
    if (!showHidden) {
      filtered = filtered.filter((f) => !f.name.startsWith('.'))
    }

    // Search filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      filtered = filtered.filter((f) => f.name.toLowerCase().includes(q))
    }

    // Sort
    const sorted = [...filtered].sort((a, b) => {
      // Directories always first
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1

      switch (sortMode) {
        case 'size':
          return (b.size || 0) - (a.size || 0)
        case 'date':
          return (b.modifiedAt || 0) - (a.modifiedAt || 0)
        case 'type': {
          const extA = a.name.split('.').pop()?.toLowerCase() || ''
          const extB = b.name.split('.').pop()?.toLowerCase() || ''
          return extA.localeCompare(extB) || a.name.localeCompare(b.name)
        }
        default:
          return a.name.localeCompare(b.name)
      }
    })

    return sorted
  }, [files, searchQuery, sortMode, showHidden])

  const { folderCount, fileCount, totalSize } = useMemo(() => {
    let folders = 0
    let filesCount = 0
    let size = 0
    for (const f of processedFiles) {
      if (f.isDirectory) folders++
      else {
        filesCount++
        size += f.size || 0
      }
    }
    return { folderCount: folders, fileCount: filesCount, totalSize: size }
  }, [processedFiles])

  const breadcrumbs = browsePath.replace(/\\/g, '/').split('/').filter(Boolean)

  // Smart breadcrumb: show first, ..., last 2 when too long
  const displayBreadcrumbs = useMemo(() => {
    if (breadcrumbs.length <= 4) return breadcrumbs.map((c, i) => ({ label: c, index: i }))
    return [
      { label: breadcrumbs[0], index: 0 },
      { label: '\u2026', index: -1 },
      { label: breadcrumbs[breadcrumbs.length - 2], index: breadcrumbs.length - 2 },
      { label: breadcrumbs[breadcrumbs.length - 1], index: breadcrumbs.length - 1 },
    ]
  }, [breadcrumbs])

  const sortLabels: Record<SortMode, string> = { name: 'Name', size: 'Size', date: 'Date', type: 'Type' }
  const cycleSortMode = useCallback(() => {
    const modes: SortMode[] = ['name', 'size', 'date', 'type']
    const idx = modes.indexOf(sortMode)
    setSortMode(modes[(idx + 1) % modes.length])
  }, [sortMode])

  return (
    <div ref={containerRef} className="flex flex-col h-full overflow-hidden" tabIndex={-1}>
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-3 pt-3 pb-1.5">
        <div className="flex items-center gap-1.5">
          <FolderOpen className="w-3.5 h-3.5 text-ghost-accent" />
          <span className="text-xs font-semibold text-ghost-text-dim uppercase tracking-wider">
            Explorer
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => { setShowSearch(!showSearch); if (!showSearch) setTimeout(() => searchRef.current?.focus(), 50) }}
            className={`w-5 h-5 flex items-center justify-center rounded transition-colors ${showSearch ? 'text-ghost-accent bg-ghost-accent/10' : 'text-ghost-text-dim hover:bg-white/5'}`}
            title="Search (Ctrl+F)"
          >
            <Search className="w-3 h-3" />
          </button>
          <button
            onClick={() => { setCreating('file'); setNewName('') }}
            className="w-5 h-5 flex items-center justify-center rounded text-ghost-text-dim hover:bg-white/5 hover:text-ghost-accent"
            title="New File"
          >
            <FilePlus className="w-3 h-3" />
          </button>
          <button
            onClick={() => { setCreating('folder'); setNewName('') }}
            className="w-5 h-5 flex items-center justify-center rounded text-ghost-text-dim hover:bg-white/5 hover:text-ghost-accent"
            title="New Folder"
          >
            <FolderPlus className="w-3 h-3" />
          </button>
          <div className="w-px h-3 bg-ghost-border mx-0.5" />
          <button
            onClick={handleGoUp}
            className="w-5 h-5 flex items-center justify-center rounded text-ghost-text-dim hover:bg-white/5"
            title="Go Up (Backspace)"
          >
            <ArrowUp className="w-3 h-3" />
          </button>
          <button
            onClick={handleOpenFolder}
            className="w-5 h-5 flex items-center justify-center rounded text-ghost-text-dim hover:bg-white/5"
            title="Open Folder"
          >
            <FolderOpen className="w-3 h-3" />
          </button>
          <button
            onClick={() => loadFiles(browsePath)}
            className="w-5 h-5 flex items-center justify-center rounded text-ghost-text-dim hover:bg-white/5"
            title="Refresh"
          >
            <RefreshCw className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* ── Search bar ── */}
      {showSearch && (
        <div className="flex items-center gap-1 mx-3 mb-1.5 animate-fade-in">
          <div className="flex-1 flex items-center bg-ghost-surface border border-ghost-border rounded-md px-2 focus-within:border-ghost-accent/60 transition-colors">
            <Search className="w-3 h-3 text-ghost-text-dim/50 shrink-0" />
            <input
              ref={searchRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') { setShowSearch(false); setSearchQuery('') } }}
              placeholder="Filter files..."
              className="flex-1 bg-transparent py-1 px-1.5 text-xs text-ghost-text outline-none placeholder:text-ghost-text-dim/40"
              autoFocus
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="text-ghost-text-dim hover:text-ghost-text">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Breadcrumbs ── */}
      <div className="flex items-center gap-0.5 px-3 pb-1 overflow-x-auto text-xs scrollbar-none">
        {displayBreadcrumbs.map((crumb, i) => (
          <div key={i} className="flex items-center gap-0.5 shrink-0">
            {i > 0 && <ChevronRight className="w-2.5 h-2.5 text-ghost-text-dim/30" />}
            {crumb.index === -1 ? (
              <span className="text-ghost-text-dim/40">{crumb.label}</span>
            ) : (
              <button
                onClick={() => {
                  const target = breadcrumbs.slice(0, crumb.index + 1).join('/')
                  loadFiles(/^[a-zA-Z]:/.test(target) ? target + '/' : '/' + target)
                }}
                className={`transition-colors truncate max-w-[80px] ${
                  crumb.index === breadcrumbs.length - 1
                    ? 'text-ghost-text font-medium'
                    : 'text-ghost-text-dim hover:text-ghost-accent'
                }`}
              >
                {crumb.label}
              </button>
            )}
          </div>
        ))}
      </div>

      {/* ── Git status + controls bar ── */}
      <div className="flex items-center gap-1.5 px-3 pb-1.5">
        <div className="flex items-center gap-1 ml-auto">
          <button
            onClick={() => setShowHidden(!showHidden)}
            className={`w-5 h-5 flex items-center justify-center rounded transition-colors ${showHidden ? 'text-ghost-accent' : 'text-ghost-text-dim/40 hover:text-ghost-text-dim'}`}
            title={showHidden ? 'Hide dotfiles' : 'Show dotfiles'}
          >
            {showHidden ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
          </button>
          <button
            onClick={cycleSortMode}
            className="flex items-center gap-0.5 px-1 h-5 rounded text-ghost-text-dim/60 hover:text-ghost-text-dim transition-colors"
            title={`Sort by ${sortLabels[sortMode]}`}
          >
            <ArrowUpDown className="w-2.5 h-2.5" />
            <span className="text-2xs">{sortLabels[sortMode]}</span>
          </button>
          <div className="w-px h-3 bg-ghost-border/40" />
          <button
            onClick={() => setViewMode('list')}
            className={`w-5 h-5 flex items-center justify-center rounded transition-colors ${
              viewMode === 'list' ? 'text-ghost-accent' : 'text-ghost-text-dim/40 hover:text-ghost-text-dim'
            }`}
            title="List View"
          >
            <List className="w-3 h-3" />
          </button>
          <button
            onClick={() => setViewMode('grid')}
            className={`w-5 h-5 flex items-center justify-center rounded transition-colors ${
              viewMode === 'grid' ? 'text-ghost-accent' : 'text-ghost-text-dim/40 hover:text-ghost-text-dim'
            }`}
            title="Grid View"
          >
            <LayoutGrid className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* ── Stats + Quick actions ── */}
      <div className="flex items-center gap-1.5 px-3 pb-1.5 text-2xs text-ghost-text-dim/50">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-0.5">
            <Folder className="w-2.5 h-2.5 text-blue-400/60" />
            {folderCount}
          </span>
          <span>{fileCount} files</span>
          {searchQuery && <span className="text-ghost-accent">({processedFiles.length} match)</span>}
        </div>
        <div className="flex items-center gap-1 ml-auto">
          <button
            onClick={() => handleOpenTerminal()}
            className="flex items-center gap-0.5 px-1.5 py-0.5 rounded hover:bg-white/5 text-ghost-text-dim/60 hover:text-ghost-text transition-colors"
            title="Open terminal here"
          >
            <Terminal className="w-2.5 h-2.5" />
          </button>
          <button
            onClick={() => handleLaunchAgent()}
            className="flex items-center gap-0.5 px-1.5 py-0.5 rounded hover:bg-white/5 text-ghost-text-dim/60 hover:text-ghost-text transition-colors"
            title={`Launch ${getProviderLabel(defaultProvider)} here`}
          >
            <Bot className="w-2.5 h-2.5" />
          </button>
          {browsePath !== currentPath && (
            <button
              onClick={() => handleSetAsProject()}
              className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-ghost-accent/10 text-ghost-accent hover:bg-ghost-accent/20 transition-colors"
              title="Set as project root"
            >
              <FolderOpen className="w-2.5 h-2.5" />
              <span>Root</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Create inline ── */}
      {creating && (
        <div className="flex items-center gap-1 px-3 pb-1.5 animate-fade-in">
          <div className="flex-1 flex items-center bg-ghost-surface border border-ghost-accent/50 rounded-md px-2 py-0.5">
            {creating === 'folder' ? (
              <FolderPlus className="w-3 h-3 text-ghost-accent shrink-0 mr-1" />
            ) : (
              <FilePlus className="w-3 h-3 text-ghost-accent shrink-0 mr-1" />
            )}
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateSubmit()
                if (e.key === 'Escape') setCreating(null)
              }}
              placeholder={creating === 'folder' ? 'folder-name' : 'filename.ext'}
              className="flex-1 bg-transparent text-xs text-ghost-text outline-none placeholder:text-ghost-text-dim/40"
              autoFocus
            />
          </div>
          <button
            onClick={handleCreateSubmit}
            className="px-2 py-1 text-xs bg-ghost-accent text-white rounded hover:bg-ghost-accent/80"
          >
            OK
          </button>
          <button
            onClick={() => setCreating(null)}
            className="px-1.5 py-1 text-xs text-ghost-text-dim hover:text-ghost-text"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* ── File list / grid ── */}
      <div className="flex-1 overflow-y-auto px-1.5 sidebar-scroll">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={browsePath}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
          >
            {viewMode === 'grid' ? (
              <FileGrid
                files={processedFiles}
                onNavigate={handleNavigate}
                onSelect={handleSelectFile}
                selectedPath={selectedFile?.path || null}
                gitStatuses={gitStatus?.fileStatuses}
              />
            ) : (
              <FileList
                files={processedFiles}
                onNavigate={handleNavigate}
                onOpenTerminal={handleOpenTerminal}
                onLaunchAgent={handleLaunchAgent}
                onSetAsProject={handleSetAsProject}
                onDelete={handleDelete}
                onRename={handleRename}
                onSelect={handleSelectFile}
                selectedPath={selectedFile?.path || null}
                gitStatuses={gitStatus?.fileStatuses}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ── Ghost Peek ── */}
      {showPreview && selectedFile && !selectedFile.isDirectory && (
        <FilePreview
          file={selectedFile}
          onClose={() => setShowPreview(false)}
        />
      )}
    </div>
  )
}
