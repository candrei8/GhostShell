import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowUpDown,
  Bot,
  CheckSquare2,
  Clock3,
  Copy,
  FilePlus,
  FolderOpen,
  FolderPlus,
  HardDrive,
  LayoutGrid,
  RefreshCw,
  Rows3,
  Search,
  Terminal,
  Trash2,
  Type,
  X,
} from 'lucide-react'
import { useAgent } from '../../hooks/useAgent'
import { copyToClipboard } from '../../lib/fileUtils'
import { selectDirectorySafe } from '../../lib/ghostshell'
import { getDefaultModel, getProviderColor, getProviderLabel } from '../../lib/providers'
import { ClaudeConfig, CodexConfig, FileEntry, GeminiConfig } from '../../lib/types'
import { useSettingsStore } from '../../stores/settingsStore'
import { useTerminalStore } from '../../stores/terminalStore'
import { useWorkspaceStore } from '../../stores/workspaceStore'
import { FileGrid } from './FileGrid'
import { FileList } from './FileList'
import { FilePreview } from './FilePreview'

type ExplorerView = 'list' | 'grid'
type SortKey = 'name' | 'modified' | 'size'
type SortDirection = 'asc' | 'desc'
type CreateMode = 'file' | 'folder'
type TransferMode = 'copy' | 'move'

function sortEntries(entries: FileEntry[], sortKey: SortKey, sortDirection: SortDirection): FileEntry[] {
  return [...entries].sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1

    let comparison = 0
    if (sortKey === 'modified') {
      comparison = (a.modifiedAt || 0) - (b.modifiedAt || 0)
    } else if (sortKey === 'size') {
      comparison = (a.size || 0) - (b.size || 0)
    } else {
      comparison = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
    }

    return sortDirection === 'asc' ? comparison : -comparison
  })
}

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

function buildBreadcrumbs(path: string): Array<{ label: string; path: string }> {
  const windowsMatch = path.match(/^([A-Za-z]:)(?:\\(.*))?$/)
  if (windowsMatch) {
    const drive = windowsMatch[1]
    const tail = windowsMatch[2]?.split('\\').filter(Boolean) || []
    let current = `${drive}\\`
    const crumbs = [{ label: drive, path: current }]
    for (const part of tail) {
      current = current.endsWith('\\') ? `${current}${part}` : `${current}\\${part}`
      crumbs.push({ label: part, path: current })
    }
    return crumbs
  }

  const parts = path.split('/').filter(Boolean)
  let current = ''
  const crumbs = [{ label: '/', path: '/' }]
  for (const part of parts) {
    current += `/${part}`
    crumbs.push({ label: part, path: current })
  }
  return crumbs
}

function getPathSeparator(path: string): string {
  return path.includes('\\') ? '\\' : '/'
}

function joinPath(basePath: string, name: string): string {
  const separator = getPathSeparator(basePath)
  return basePath.endsWith(separator) ? `${basePath}${name}` : `${basePath}${separator}${name}`
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}

function isNestedInPath(candidatePath: string, parentPath: string): boolean {
  const normalizedCandidate = normalizePath(candidatePath)
  const normalizedParent = normalizePath(parentPath)
  return normalizedCandidate === normalizedParent || normalizedCandidate.startsWith(`${normalizedParent}/`)
}

function splitName(name: string): { stem: string; extension: string } {
  const dotIndex = name.lastIndexOf('.')
  if (dotIndex <= 0) {
    return { stem: name, extension: '' }
  }
  return {
    stem: name.slice(0, dotIndex),
    extension: name.slice(dotIndex),
  }
}

function buildVariantName(name: string, attempt: number, mode: TransferMode): string {
  if (attempt === 0) return name

  const { stem, extension } = splitName(name)
  if (mode === 'copy') {
    const suffix = attempt === 1 ? ' copy' : ` copy ${attempt}`
    return `${stem}${suffix}${extension}`
  }

  return `${stem} ${attempt + 1}${extension}`
}

function isConflictError(error?: string): boolean {
  return Boolean(error && /(already exists|eexist|exists|not empty)/i.test(error))
}

export function FileExplorer() {
  const currentPath = useWorkspaceStore((s) => s.currentPath)
  const setCurrentPath = useWorkspaceStore((s) => s.setCurrentPath)
  const addSession = useTerminalStore((s) => s.addSession)
  const {
    defaultProvider,
    defaultModel,
    defaultGeminiModel,
    defaultCodexModel,
    defaultSkipPermissions,
  } = useSettingsStore()
  const { createAgent } = useAgent()

  const [browsePath, setBrowsePath] = useState(currentPath)
  const [files, setFiles] = useState<FileEntry[]>([])
  const [gitStatuses, setGitStatuses] = useState<Record<string, string>>({})
  const [query, setQuery] = useState('')
  const [view, setView] = useState<ExplorerView>('list')
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [selectedPaths, setSelectedPaths] = useState<string[]>([])
  const [bulkDeleteArmed, setBulkDeleteArmed] = useState(false)
  const [createMode, setCreateMode] = useState<CreateMode | null>(null)
  const [draftName, setDraftName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const explorerRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const createInputRef = useRef<HTMLInputElement>(null)
  const selectionAnchorRef = useRef<string | null>(null)
  const pendingSelectionPathsRef = useRef<string[] | null>(null)

  const breadcrumbs = useMemo(() => buildBreadcrumbs(browsePath), [browsePath])
  const parentPath = useMemo(() => getParentPath(browsePath), [browsePath])
  const visibleFiles = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    const filtered = !normalized
      ? files
      : files.filter((entry) => entry.name.toLowerCase().includes(normalized))
    return sortEntries(filtered, sortKey, sortDirection)
  }, [files, query, sortDirection, sortKey])
  const selectedEntries = useMemo(
    () => files.filter((entry) => selectedPaths.includes(entry.path)),
    [files, selectedPaths]
  )
  const previewFile = selectedEntries.length === 1 && !selectedEntries[0].isDirectory ? selectedEntries[0] : null
  const singleSelectedEntry = selectedEntries.length === 1 ? selectedEntries[0] : null
  const singleSelectionActionPath = useMemo(() => {
    if (!singleSelectedEntry) return null
    return singleSelectedEntry.isDirectory ? singleSelectedEntry.path : getParentPath(singleSelectedEntry.path)
  }, [singleSelectedEntry])

  const loadDirectory = useCallback(async (pathToLoad: string) => {
    setLoading(true)
    setError(null)

    try {
      const entries = await window.ghostshell.fsReadDir(pathToLoad)
      setFiles(entries)

      try {
        const gitStatus = await window.ghostshell.gitStatus(pathToLoad)
        setGitStatuses(gitStatus.fileStatuses || {})
      } catch {
        setGitStatuses({})
      }
    } catch (err) {
      setFiles([])
      setGitStatuses({})
      setError(err instanceof Error ? err.message : 'Failed to read directory')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    setBrowsePath(currentPath)
    setSelectedPaths([])
    setCreateMode(null)
    setDraftName('')
    selectionAnchorRef.current = null
  }, [currentPath])

  useEffect(() => {
    void loadDirectory(browsePath)
  }, [browsePath, loadDirectory])

  useEffect(() => {
    setSelectedPaths((current) => current.filter((path) => files.some((entry) => entry.path === path)))
  }, [files])

  useEffect(() => {
    if (!pendingSelectionPathsRef.current?.length) return
    const nextSelection = pendingSelectionPathsRef.current.filter((path) => files.some((entry) => entry.path === path))
    if (nextSelection.length === 0) return

    setSelectedPaths(nextSelection)
    selectionAnchorRef.current = nextSelection[0]
    pendingSelectionPathsRef.current = null
  }, [files])

  useEffect(() => {
    if (!bulkDeleteArmed) return
    const timer = setTimeout(() => setBulkDeleteArmed(false), 3000)
    return () => clearTimeout(timer)
  }, [bulkDeleteArmed])

  useEffect(() => {
    if (!createMode) return
    createInputRef.current?.focus()
    createInputRef.current?.select()
  }, [createMode])

  const handleNavigate = useCallback((entry: FileEntry) => {
    if (!entry.isDirectory) return
    setBrowsePath(entry.path)
    setSelectedPaths([])
    setCreateMode(null)
    setDraftName('')
    selectionAnchorRef.current = null
  }, [])

  const handleRefresh = useCallback(() => {
    void loadDirectory(browsePath)
  }, [browsePath, loadDirectory])

  const handleOpenTerminal = useCallback((path: string) => {
    addSession({
      id: `term-standalone-${Date.now()}`,
      title: 'Terminal',
      cwd: path,
    })
  }, [addSession])

  const handleLaunchAgent = useCallback((path: string) => {
    const providerColor = getProviderColor(defaultProvider)
    const providerLabel = getProviderLabel(defaultProvider)

    if (defaultProvider === 'gemini') {
      const geminiConfig: GeminiConfig = {
        model: defaultGeminiModel || getDefaultModel('gemini'),
        yolo: defaultSkipPermissions,
      }
      createAgent(
        `${providerLabel} Agent`,
        undefined,
        providerColor,
        {},
        path,
        undefined,
        undefined,
        true,
        'gemini',
        geminiConfig,
      )
      return
    }

    if (defaultProvider === 'codex') {
      const codexConfig: CodexConfig = {
        model: defaultCodexModel || getDefaultModel('codex'),
        fullAuto: defaultSkipPermissions,
        sandbox: 'workspace-write',
      }
      createAgent(
        `${providerLabel} Agent`,
        undefined,
        providerColor,
        {},
        path,
        undefined,
        undefined,
        true,
        'codex',
        undefined,
        codexConfig,
      )
      return
    }

    const claudeConfig: ClaudeConfig = {
      model: defaultModel || getDefaultModel('claude'),
      dangerouslySkipPermissions: defaultSkipPermissions,
    }
    createAgent(
      `${providerLabel} Agent`,
      undefined,
      providerColor,
      claudeConfig,
      path,
      undefined,
      undefined,
      true,
      'claude',
    )
  }, [
    createAgent,
    defaultCodexModel,
    defaultGeminiModel,
    defaultModel,
    defaultProvider,
    defaultSkipPermissions,
  ])

  const handleDelete = useCallback(async (entry: FileEntry) => {
    const result = await window.ghostshell.fsDelete(entry.path)
    if (!result.success) {
      setError(result.error || 'Delete failed')
      return
    }
    setSelectedPaths((current) => current.filter((path) => path !== entry.path))
    void loadDirectory(browsePath)
  }, [browsePath, loadDirectory])

  const handleRename = useCallback(async (entry: FileEntry, newName: string) => {
    const separator = entry.path.includes('\\') ? '\\' : '/'
    const parent = getParentPath(entry.path)
    if (!parent) return
    const nextPath = parent.endsWith(separator) ? `${parent}${newName}` : `${parent}${separator}${newName}`
    const result = await window.ghostshell.fsRename(entry.path, nextPath)
    if (!result.success) {
      setError(result.error || 'Rename failed')
      return
    }
    setSelectedPaths((current) => current.map((path) => path === entry.path ? nextPath : path))
    if (selectionAnchorRef.current === entry.path) {
      selectionAnchorRef.current = nextPath
    }
    void loadDirectory(browsePath)
  }, [browsePath, loadDirectory])

  const handleSelect = useCallback((entry: FileEntry | null, options?: { append?: boolean; range?: boolean; index?: number }) => {
    if (!entry) {
      setSelectedPaths([])
      selectionAnchorRef.current = null
      return
    }

    if (options?.range) {
      const anchorPath = selectionAnchorRef.current || entry.path
      const anchorIndex = visibleFiles.findIndex((item) => item.path === anchorPath)
      const currentIndex = options.index ?? visibleFiles.findIndex((item) => item.path === entry.path)
      if (anchorIndex >= 0 && currentIndex >= 0) {
        const [start, end] = anchorIndex < currentIndex ? [anchorIndex, currentIndex] : [currentIndex, anchorIndex]
        setSelectedPaths(visibleFiles.slice(start, end + 1).map((item) => item.path))
        return
      }
    }

    if (options?.append) {
      setSelectedPaths((current) =>
        current.includes(entry.path)
          ? current.filter((path) => path !== entry.path)
          : [...current, entry.path]
      )
      selectionAnchorRef.current = entry.path
      setBulkDeleteArmed(false)
      return
    }

    setSelectedPaths([entry.path])
    selectionAnchorRef.current = entry.path
    setBulkDeleteArmed(false)
  }, [visibleFiles])

  const handleClearSelection = useCallback(() => {
    setSelectedPaths([])
    selectionAnchorRef.current = null
    setBulkDeleteArmed(false)
  }, [])

  const handleCopySelectedPaths = useCallback(() => {
    if (selectedEntries.length === 0) return
    void copyToClipboard(selectedEntries.map((entry) => entry.path).join('\n'))
  }, [selectedEntries])

  const transferEntry = useCallback(async (
    entry: FileEntry,
    targetDirectory: string,
    mode: TransferMode,
  ): Promise<{ success: boolean; path?: string; error?: string }> => {
    const sourceParent = getParentPath(entry.path)

    if (entry.isDirectory && isNestedInPath(targetDirectory, entry.path)) {
      return { success: false, error: `Cannot ${mode} ${entry.name} into itself` }
    }

    if (mode === 'move' && sourceParent && normalizePath(sourceParent) === normalizePath(targetDirectory)) {
      return { success: false, error: `${entry.name} is already in that folder` }
    }

    for (let attempt = 0; attempt < 100; attempt += 1) {
      const candidateName = buildVariantName(entry.name, attempt, mode)
      const candidatePath = joinPath(targetDirectory, candidateName)
      if (normalizePath(candidatePath) === normalizePath(entry.path)) {
        continue
      }

      const result = mode === 'copy'
        ? await window.ghostshell.fsCopy(entry.path, candidatePath)
        : await window.ghostshell.fsRename(entry.path, candidatePath)

      if (result.success) {
        return { success: true, path: candidatePath }
      }

      if (isConflictError(result.error)) {
        continue
      }

      return { success: false, error: result.error || `${mode} failed` }
    }

    return { success: false, error: `Could not find a free name for ${entry.name}` }
  }, [])

  const handleTransferEntries = useCallback(async (
    entries: FileEntry[],
    targetDirectory: string,
    mode: TransferMode,
  ) => {
    if (entries.length === 0) return

    setLoading(true)
    setError(null)
    const createdPaths: string[] = []
    const failures: string[] = []

    try {
      for (const entry of entries) {
        const result = await transferEntry(entry, targetDirectory, mode)
        if (result.success && result.path) {
          createdPaths.push(result.path)
        } else if (result.error) {
          failures.push(result.error)
        }
      }
    } finally {
      setLoading(false)
    }

    const targetIsCurrentDirectory = normalizePath(targetDirectory) === normalizePath(browsePath)
    if (createdPaths.length > 0 && targetIsCurrentDirectory) {
      pendingSelectionPathsRef.current = createdPaths
    } else {
      handleClearSelection()
    }

    await loadDirectory(browsePath)

    if (failures.length > 0) {
      setError(failures.slice(0, 2).join(' | '))
    }
  }, [browsePath, handleClearSelection, loadDirectory, transferEntry])

  const handleDuplicateSelected = useCallback(async () => {
    if (selectedEntries.length === 0) return
    await handleTransferEntries(selectedEntries, browsePath, 'copy')
  }, [browsePath, handleTransferEntries, selectedEntries])

  const handleTransferSelectedToDirectory = useCallback(async (mode: TransferMode) => {
    if (selectedEntries.length === 0) return
    const targetDirectory = await selectDirectorySafe()
    if (!targetDirectory) return
    await handleTransferEntries(selectedEntries, targetDirectory, mode)
  }, [handleTransferEntries, selectedEntries])

  const handleMoveEntriesToDirectory = useCallback(async (sourcePaths: string[], targetDirectory: string) => {
    const sourceEntries = files.filter((entry) => sourcePaths.includes(entry.path))
    if (sourceEntries.length === 0) return
    await handleTransferEntries(sourceEntries, targetDirectory, 'move')
  }, [files, handleTransferEntries])

  const handleCreateEntry = useCallback(async () => {
    if (!createMode) return

    const nextName = draftName.trim()
    if (!nextName) {
      setError(`${createMode === 'file' ? 'File' : 'Folder'} name is required`)
      return
    }
    if (nextName === '.' || nextName === '..' || /[\\/]/.test(nextName)) {
      setError('Use a plain name, not a path')
      return
    }

    const separator = browsePath.includes('\\') ? '\\' : '/'
    const nextPath = browsePath.endsWith(separator) ? `${browsePath}${nextName}` : `${browsePath}${separator}${nextName}`
    const result = createMode === 'file'
      ? await window.ghostshell.fsCreateFile(nextPath, '')
      : await window.ghostshell.fsCreateDir(nextPath)

    if (!result.success) {
      setError(result.error || `${createMode === 'file' ? 'File' : 'Folder'} creation failed`)
      return
    }

    pendingSelectionPathsRef.current = [nextPath]
    setCreateMode(null)
    setDraftName('')
    setError(null)
    await loadDirectory(browsePath)
  }, [browsePath, createMode, draftName, loadDirectory])

  const handleDeleteSelected = useCallback(async () => {
    if (selectedEntries.length === 0) return
    if (!bulkDeleteArmed) {
      setBulkDeleteArmed(true)
      return
    }

    const failures: string[] = []
    for (const entry of selectedEntries) {
      const result = await window.ghostshell.fsDelete(entry.path)
      if (!result.success) {
        failures.push(`${entry.name}: ${result.error || 'Delete failed'}`)
      }
    }

    setBulkDeleteArmed(false)
    handleClearSelection()
    await loadDirectory(browsePath)
    if (failures.length > 0) {
      setError(failures.slice(0, 2).join(' | '))
    }
  }, [browsePath, bulkDeleteArmed, handleClearSelection, loadDirectory, selectedEntries])

  // Keyboard shortcuts — must be after all useCallback declarations it references
  useEffect(() => {
    const handleExplorerShortcuts = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const activeElement = document.activeElement as HTMLElement | null
      const isInsideExplorer = Boolean(
        explorerRef.current &&
        (explorerRef.current.contains(target) || explorerRef.current.contains(activeElement))
      )

      if (!isInsideExplorer) return
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable) {
        return
      }

      const ctrlOrMeta = event.ctrlKey || event.metaKey

      if (ctrlOrMeta && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'a') {
        event.preventDefault()
        setSelectedPaths(visibleFiles.map((entry) => entry.path))
        selectionAnchorRef.current = visibleFiles[0]?.path || null
        return
      }

      if (ctrlOrMeta && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'c') {
        if (selectedEntries.length === 0) return
        event.preventDefault()
        void handleCopySelectedPaths()
        return
      }

      if (ctrlOrMeta && event.shiftKey && !event.altKey && event.key.toLowerCase() === 'n') {
        event.preventDefault()
        setCreateMode('folder')
        setDraftName('')
        return
      }

      if (ctrlOrMeta && event.altKey && !event.shiftKey && event.key.toLowerCase() === 'n') {
        event.preventDefault()
        setCreateMode('file')
        setDraftName('')
        return
      }

      if (event.key === '/') {
        event.preventDefault()
        searchInputRef.current?.focus()
        searchInputRef.current?.select()
        return
      }

      if (event.key === 'Escape') {
        if (createMode) {
          event.preventDefault()
          setCreateMode(null)
          setDraftName('')
          return
        }

        if (selectedPaths.length > 0) {
          event.preventDefault()
          handleClearSelection()
        }
        return
      }

      if (event.key === 'Delete' && selectedEntries.length > 0) {
        event.preventDefault()
        void handleDeleteSelected()
        return
      }

      if (event.key === 'Backspace' && parentPath) {
        event.preventDefault()
        setBrowsePath(parentPath)
        handleClearSelection()
      }
    }

    window.addEventListener('keydown', handleExplorerShortcuts)
    return () => window.removeEventListener('keydown', handleExplorerShortcuts)
  }, [
    createMode,
    handleClearSelection,
    handleCopySelectedPaths,
    handleDeleteSelected,
    parentPath,
    selectedEntries.length,
    selectedPaths.length,
    visibleFiles,
  ])

  const itemCountLabel = visibleFiles.length === files.length
    ? `${visibleFiles.length} items`
    : `${visibleFiles.length} of ${files.length}`

  const sortOptions: Array<{ id: SortKey; label: string; icon: typeof Type }> = [
    { id: 'name', label: 'Name', icon: Type },
    { id: 'modified', label: 'Modified', icon: Clock3 },
    { id: 'size', label: 'Size', icon: HardDrive },
  ]

  return (
    <div ref={explorerRef} className="flex h-full flex-col bg-transparent">
      <div className="flex items-center justify-between border-b border-ghost-border/70 px-4 py-3 shrink-0">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-amber-300/22 bg-amber-300/10 text-amber-100">
              <FolderOpen className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-ghost-text">Explorer</h2>
              <p className="text-[11px] text-ghost-text-dim/70">Browse the workspace and launch from any folder.</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={handleRefresh}
            className="ghost-soft-pill flex h-8 w-8 items-center justify-center rounded-lg text-ghost-text-dim transition-colors hover:text-ghost-text"
            title="Refresh directory"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setView('list')}
            className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
              view === 'list'
                ? 'border border-cyan-300/35 bg-cyan-300/12 text-cyan-100'
                : 'ghost-soft-pill text-ghost-text-dim hover:text-ghost-text'
            }`}
            title="List view"
          >
            <Rows3 className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setView('grid')}
            className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
              view === 'grid'
                ? 'border border-cyan-300/35 bg-cyan-300/12 text-cyan-100'
                : 'ghost-soft-pill text-ghost-text-dim hover:text-ghost-text'
            }`}
            title="Grid view"
          >
            <LayoutGrid className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="border-b border-ghost-border/50 px-3 py-2.5 shrink-0">
        <div className="flex items-center gap-2 rounded-xl border border-ghost-border/70 bg-black/20 px-3 py-2 focus-within:border-ghost-accent/40 transition-colors">
          <Search className="h-3.5 w-3.5 shrink-0 text-ghost-text-dim" />
          <input
            ref={searchInputRef}
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search files in this folder..."
            className="flex-1 bg-transparent text-xs text-ghost-text placeholder:text-ghost-text-dim/55 outline-none"
          />
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {parentPath && (
            <button
              onClick={() => {
                setBrowsePath(parentPath)
                handleClearSelection()
              }}
              className="ghost-soft-pill rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-ghost-text-dim transition-colors hover:text-ghost-text"
            >
              Up
            </button>
          )}
          <button
            onClick={() => {
              setCurrentPath(browsePath)
              handleClearSelection()
            }}
            className="ghost-soft-pill rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-amber-100 transition-colors hover:text-white"
          >
            Set as root
          </button>
          <button
            onClick={() => handleOpenTerminal(browsePath)}
            className="ghost-soft-pill inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-ghost-text-dim transition-colors hover:text-ghost-text"
          >
            <Terminal className="h-3 w-3" />
            Terminal
          </button>
          <button
            onClick={() => handleLaunchAgent(browsePath)}
            className="ghost-soft-pill inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-ghost-text-dim transition-colors hover:text-ghost-text"
          >
            <Bot className="h-3 w-3" />
            Agent
          </button>
          <button
            onClick={() => {
              setCreateMode('file')
              setDraftName('')
            }}
            className="ghost-soft-pill inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-ghost-text-dim transition-colors hover:text-ghost-text"
          >
            <FilePlus className="h-3 w-3" />
            File
          </button>
          <button
            onClick={() => {
              setCreateMode('folder')
              setDraftName('')
            }}
            className="ghost-soft-pill inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-ghost-text-dim transition-colors hover:text-ghost-text"
          >
            <FolderPlus className="h-3 w-3" />
            Folder
          </button>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-[0.16em] text-ghost-text-dim/50">Sort</span>
          {sortOptions.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setSortKey(id)}
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] transition-colors ${
                sortKey === id
                  ? 'border border-cyan-300/32 bg-cyan-300/10 text-cyan-100'
                  : 'ghost-soft-pill text-ghost-text-dim hover:text-ghost-text'
              }`}
            >
              <Icon className="h-3 w-3" />
              {label}
            </button>
          ))}
          <button
            onClick={() => setSortDirection((current) => current === 'asc' ? 'desc' : 'asc')}
            className="ghost-soft-pill inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-ghost-text-dim transition-colors hover:text-ghost-text"
            title={`Sort ${sortDirection === 'asc' ? 'descending' : 'ascending'}`}
          >
            <ArrowUpDown className="h-3 w-3" />
            {sortDirection === 'asc' ? 'Asc' : 'Desc'}
          </button>
        </div>

        <div className="mt-2 flex flex-wrap gap-1">
          {breadcrumbs.map((crumb, index) => (
            <button
              key={`${crumb.path}-${index}`}
              onClick={() => {
                setBrowsePath(crumb.path)
                handleClearSelection()
              }}
              className={`rounded-full px-2 py-0.5 text-[10px] transition-colors ${
                crumb.path === browsePath
                  ? 'border border-cyan-300/32 bg-cyan-300/10 text-cyan-100'
                  : 'ghost-soft-pill text-ghost-text-dim hover:text-ghost-text'
              }`}
            >
              {crumb.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mx-3 mt-3 rounded-xl border border-rose-300/28 bg-rose-400/10 px-3 py-2 text-xs text-rose-100">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        <div className="ghost-section-card overflow-hidden rounded-2xl">
          <div className="flex items-center justify-between border-b border-white/8 px-3 py-2">
            <div>
              <p className="text-[10px] uppercase tracking-[0.16em] text-ghost-text-dim/65">Directory</p>
              <p className="mt-1 truncate text-xs font-medium text-ghost-text">{browsePath}</p>
            </div>
            <span className="ghost-soft-pill rounded-full px-2 py-0.5 text-[10px] text-ghost-text-dim">
              {itemCountLabel}
            </span>
          </div>

          {createMode && (
            <div className="border-b border-white/8 px-3 py-2">
              <div className="ghost-toolbar-surface flex flex-wrap items-center gap-2 rounded-xl px-3 py-2">
                <span className="ghost-soft-pill inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-cyan-100">
                  {createMode === 'file' ? <FilePlus className="h-3 w-3" /> : <FolderPlus className="h-3 w-3" />}
                  New {createMode}
                </span>
                <input
                  ref={createInputRef}
                  type="text"
                  value={draftName}
                  onChange={(event) => setDraftName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      void handleCreateEntry()
                    }
                    if (event.key === 'Escape') {
                      event.preventDefault()
                      setCreateMode(null)
                      setDraftName('')
                    }
                  }}
                  placeholder={createMode === 'file' ? 'new-file.ts' : 'new-folder'}
                  className="min-w-[180px] flex-1 rounded-lg border border-ghost-border/70 bg-black/20 px-3 py-2 text-xs text-ghost-text outline-none transition-colors focus:border-cyan-300/32"
                />
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => void handleCreateEntry()}
                    className="rounded-full border border-cyan-300/28 bg-cyan-300/10 px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-cyan-100 transition-colors hover:bg-cyan-300/16"
                  >
                    Create
                  </button>
                  <button
                    onClick={() => {
                      setCreateMode(null)
                      setDraftName('')
                    }}
                    className="ghost-soft-pill rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-ghost-text-dim transition-colors hover:text-ghost-text"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {selectedEntries.length > 0 && (
            <div className="border-b border-white/8 px-3 py-2">
              <div className="ghost-toolbar-surface flex flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-cyan-300/20 bg-cyan-300/10 text-cyan-100">
                    <CheckSquare2 className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-[0.16em] text-ghost-text-dim/55">Selection</p>
                    <p className="truncate text-xs text-ghost-text">
                      {selectedEntries.length} item{selectedEntries.length === 1 ? '' : 's'} selected
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1">
                  <button
                    onClick={handleCopySelectedPaths}
                    className="ghost-soft-pill inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-ghost-text-dim transition-colors hover:text-ghost-text"
                  >
                    <Copy className="h-3 w-3" />
                    Copy paths
                  </button>
                  <button
                    onClick={() => void handleDuplicateSelected()}
                    className="ghost-soft-pill inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-ghost-text-dim transition-colors hover:text-ghost-text"
                  >
                    <Copy className="h-3 w-3" />
                    Duplicate
                  </button>
                  <button
                    onClick={() => void handleTransferSelectedToDirectory('copy')}
                    className="ghost-soft-pill inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-ghost-text-dim transition-colors hover:text-ghost-text"
                  >
                    <FolderOpen className="h-3 w-3" />
                    Copy to
                  </button>
                  <button
                    onClick={() => void handleTransferSelectedToDirectory('move')}
                    className="ghost-soft-pill inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-ghost-text-dim transition-colors hover:text-ghost-text"
                  >
                    <FolderOpen className="h-3 w-3" />
                    Move to
                  </button>
                  {singleSelectedEntry && singleSelectionActionPath && (
                    <>
                      <button
                        onClick={() => handleOpenTerminal(singleSelectionActionPath)}
                        className="ghost-soft-pill inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-ghost-text-dim transition-colors hover:text-ghost-text"
                      >
                        <Terminal className="h-3 w-3" />
                        Terminal
                      </button>
                      <button
                        onClick={() => handleLaunchAgent(singleSelectionActionPath)}
                        className="ghost-soft-pill inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-ghost-text-dim transition-colors hover:text-ghost-text"
                      >
                        <Bot className="h-3 w-3" />
                        Agent
                      </button>
                      {singleSelectedEntry.isDirectory && (
                        <button
                          onClick={() => {
                            setCurrentPath(singleSelectedEntry.path)
                            setBrowsePath(singleSelectedEntry.path)
                            handleClearSelection()
                          }}
                          className="ghost-soft-pill inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-amber-100 transition-colors hover:text-white"
                        >
                          <FolderOpen className="h-3 w-3" />
                          Root
                        </button>
                      )}
                    </>
                  )}
                  <button
                    onClick={() => void handleDeleteSelected()}
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] uppercase tracking-[0.16em] transition-colors ${
                      bulkDeleteArmed
                        ? 'border border-rose-300/32 bg-rose-400/10 text-rose-100'
                        : 'ghost-soft-pill text-ghost-text-dim hover:text-rose-200'
                    }`}
                  >
                    <Trash2 className="h-3 w-3" />
                    {bulkDeleteArmed ? 'Confirm delete' : 'Delete'}
                  </button>
                  <button
                    onClick={handleClearSelection}
                    className="ghost-soft-pill inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-ghost-text-dim transition-colors hover:text-ghost-text"
                  >
                    <X className="h-3 w-3" />
                    Clear
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="px-2 py-2">
            {view === 'grid' ? (
              <FileGrid
                files={visibleFiles}
                onNavigate={handleNavigate}
                onOpenTerminal={handleOpenTerminal}
                onLaunchAgent={handleLaunchAgent}
                onSetAsProject={(path) => {
                  setCurrentPath(path)
                  setBrowsePath(path)
                  handleClearSelection()
                }}
                onDelete={handleDelete}
                onRename={handleRename}
                onMoveEntries={handleMoveEntriesToDirectory}
                onSelect={handleSelect}
                selectedPaths={selectedPaths}
                gitStatuses={gitStatuses}
              />
            ) : (
              <FileList
                files={visibleFiles}
                onNavigate={handleNavigate}
                onOpenTerminal={handleOpenTerminal}
                onLaunchAgent={handleLaunchAgent}
                onSetAsProject={(path) => {
                  setCurrentPath(path)
                  setBrowsePath(path)
                  handleClearSelection()
                }}
                onDelete={handleDelete}
                onRename={handleRename}
                onMoveEntries={handleMoveEntriesToDirectory}
                onSelect={handleSelect}
                selectedPaths={selectedPaths}
                gitStatuses={gitStatuses}
              />
            )}
          </div>
        </div>

        {previewFile && (
          <div className="mt-2">
            <FilePreview
              file={previewFile}
              gitStatus={gitStatuses[previewFile.name]}
              onOpenTerminal={handleOpenTerminal}
              onLaunchAgent={handleLaunchAgent}
              onSetAsProject={(path) => {
                setCurrentPath(path)
                setBrowsePath(path)
                handleClearSelection()
              }}
              onClose={handleClearSelection}
            />
          </div>
        )}
      </div>
    </div>
  )
}
