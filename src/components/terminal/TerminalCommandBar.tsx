import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Clock3,
  CornerDownLeft,
  Folder,
  GitBranch,
  Package2,
  Search,
  Sparkles,
  TerminalSquare,
} from 'lucide-react'
import { smartTruncatePath } from '../../lib/formatUtils'
import { submitPromptToSession } from '../../lib/terminalPromptSubmission'
import { getGhostshellApi } from '../../lib/ghostshell'
import type { FileEntry, GitStatus, Provider } from '../../lib/types'
import { useCommandBlockStore, type CommandBlock } from '../../stores/commandBlockStore'
import { useHistoryStore, type HistoryEntry, type PathHistoryEntry } from '../../stores/historyStore'

interface TerminalCommandBarProps {
  sessionId: string
  cwd: string
  provider?: Provider
  isActive?: boolean
}

interface SuggestionItem {
  id: string
  kind: 'command' | 'path' | 'recommendation' | 'block'
  title: string
  subtitle: string
  preview?: string
  insertValue: string
  tag?: string
}

type CommandBarMode = 'none' | 'history' | 'palette'

type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun'

interface RepoRecommendation {
  id: string
  kind: 'git' | 'script'
  title: string
  subtitle: string
  command: string
}

interface RepoContext {
  gitStatus: GitStatus | null
  packageRoot: string | null
  packageName?: string
  packageManager: PackageManager
  scripts: string[]
}

const PATH_COMMAND_PREFIXES = new Set(['cd', 'ls', 'cat', 'code', 'open', 'explorer'])
const RECOMMENDED_SCRIPT_CANDIDATES = [
  'dev',
  'start',
  'build',
  'test',
  'lint',
  'typecheck',
  'type-check',
  'check-types',
] as const

function quoteShellPath(path: string): string {
  if (!/[\s"]/u.test(path)) return path
  return `"${path.replace(/"/g, '\\"')}"`
}

function detectPathCommand(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  const prefix = trimmed.split(/\s+/)[0] || ''
  return PATH_COMMAND_PREFIXES.has(prefix.toLowerCase()) ? prefix : null
}

function getPathQuery(input: string): string {
  const command = detectPathCommand(input)
  if (!command) return ''
  return input.trim().slice(command.length).trim()
}

function isAbsolutePath(path: string): boolean {
  return path.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(path)
}

function normalizeSlashes(path: string): string {
  return path.replace(/\\/g, '/')
}

function normalizePathKey(path: string): string {
  return normalizeSlashes(path).replace(/\/+$/, '').toLowerCase()
}

function pathsEqual(a: string, b: string): boolean {
  return normalizePathKey(a) === normalizePathKey(b)
}

function getParentDirectory(path: string): string | null {
  const normalized = path.replace(/[\\/]+$/, '')
  const windowsMatch = normalized.match(/^([A-Za-z]:)(?:[\\/](.*))?$/)

  if (windowsMatch) {
    const drive = windowsMatch[1]
    const tail = windowsMatch[2]
    if (!tail) return null
    const parts = tail.split(/[\\/]/).filter(Boolean)
    if (parts.length <= 1) return `${drive}\\`
    return `${drive}\\${parts.slice(0, -1).join('\\')}`
  }

  const parts = normalized.split('/').filter(Boolean)
  if (parts.length === 0) return null
  if (parts.length === 1) return '/'
  return `/${parts.slice(0, -1).join('/')}`
}

function joinPath(basePath: string, name: string): string {
  const separator = basePath.includes('\\') ? '\\' : '/'
  return basePath.endsWith(separator) ? `${basePath}${name}` : `${basePath}${separator}${name}`
}

function relativePath(fromDir: string, targetPath: string): string {
  const fromParts = normalizeSlashes(fromDir).split('/').filter(Boolean)
  const targetParts = normalizeSlashes(targetPath).split('/').filter(Boolean)

  if (/^[a-zA-Z]:/.test(fromParts[0] || '') || /^[a-zA-Z]:/.test(targetParts[0] || '')) {
    if ((fromParts[0] || '').toLowerCase() !== (targetParts[0] || '').toLowerCase()) {
      return targetPath
    }
  }

  let shared = 0
  while (shared < fromParts.length && shared < targetParts.length && fromParts[shared] === targetParts[shared]) {
    shared += 1
  }

  const upSegments = fromParts.slice(shared).map(() => '..')
  const downSegments = targetParts.slice(shared)
  const result = [...upSegments, ...downSegments].join('/')
  return result || '.'
}

function formatRelativeTimestamp(timestamp: number): string {
  const deltaMs = Date.now() - timestamp
  if (deltaMs < 60_000) return 'just now'
  if (deltaMs < 3_600_000) return `${Math.round(deltaMs / 60_000)}m ago`
  if (deltaMs < 86_400_000) return `${Math.round(deltaMs / 3_600_000)}h ago`
  return `${Math.round(deltaMs / 86_400_000)}d ago`
}

function buildCommandSuggestion(entry: HistoryEntry): SuggestionItem {
  return {
    id: `cmd-${entry.id}`,
    kind: 'command',
    title: entry.command,
    subtitle: entry.cwd
      ? `${smartTruncatePath(entry.cwd, 32)} | ${formatRelativeTimestamp(entry.timestamp)}`
      : formatRelativeTimestamp(entry.timestamp),
    preview: entry.agentName,
    insertValue: entry.command,
  }
}

function detectPackageManager(
  entries: FileEntry[],
  packageManagerField?: string,
): PackageManager {
  const normalizedField = packageManagerField?.toLowerCase() || ''
  if (normalizedField.startsWith('pnpm@')) return 'pnpm'
  if (normalizedField.startsWith('yarn@')) return 'yarn'
  if (normalizedField.startsWith('bun@')) return 'bun'
  if (normalizedField.startsWith('npm@')) return 'npm'
  if (entries.some((entry) => entry.name === 'pnpm-lock.yaml')) return 'pnpm'
  if (entries.some((entry) => entry.name === 'yarn.lock')) return 'yarn'
  if (entries.some((entry) => entry.name === 'bun.lockb' || entry.name === 'bun.lock')) return 'bun'
  return 'npm'
}

function buildScriptCommand(packageManager: PackageManager, scriptName: string): string {
  switch (packageManager) {
    case 'pnpm':
      return `pnpm run ${scriptName}`
    case 'yarn':
      return `yarn ${scriptName}`
    case 'bun':
      return `bun run ${scriptName}`
    case 'npm':
    default:
      return `npm run ${scriptName}`
  }
}

function scriptLabel(scriptName: string): { title: string; subtitle: string } {
  switch (scriptName) {
    case 'dev':
      return { title: 'Run dev', subtitle: 'start the local development loop' }
    case 'start':
      return { title: 'Start app', subtitle: 'boot the primary runtime entrypoint' }
    case 'build':
      return { title: 'Build project', subtitle: 'compile the production bundle' }
    case 'test':
      return { title: 'Run tests', subtitle: 'execute the current test suite' }
    case 'lint':
      return { title: 'Lint code', subtitle: 'check formatting and quality rules' }
    case 'typecheck':
    case 'type-check':
    case 'check-types':
      return { title: 'Typecheck', subtitle: 'verify static types before running' }
    default:
      return { title: `Run ${scriptName}`, subtitle: 'execute a recommended project script' }
  }
}

function prefixCommandForDirectory(command: string, targetDirectory: string | null, cwd: string): string {
  if (!targetDirectory || pathsEqual(targetDirectory, cwd)) return command
  const relativeTarget = relativePath(cwd, targetDirectory)
  if (relativeTarget === '.') return command
  return `cd ${quoteShellPath(relativeTarget)}; ${command}`
}

function buildRepoRecommendations(context: RepoContext | null, cwd: string): RepoRecommendation[] {
  if (!context) return []

  const recommendations: RepoRecommendation[] = []
  const addedCommands = new Set<string>()

  const addRecommendation = (recommendation: RepoRecommendation) => {
    if (addedCommands.has(recommendation.command)) return
    addedCommands.add(recommendation.command)
    recommendations.push(recommendation)
  }

  for (const scriptName of RECOMMENDED_SCRIPT_CANDIDATES) {
    if (!context.scripts.includes(scriptName)) continue
    const label = scriptLabel(scriptName)
    const rawCommand = buildScriptCommand(context.packageManager, scriptName)
    const command = prefixCommandForDirectory(rawCommand, context.packageRoot, cwd)

    addRecommendation({
      id: `script-${scriptName}`,
      kind: 'script',
      title: label.title,
      subtitle: `${label.subtitle} | ${context.packageManager}`,
      command,
    })
  }

  const gitStatus = context.gitStatus
  if (gitStatus?.isRepo) {
    const branch = gitStatus.branch || 'detached'
    addRecommendation({
      id: 'git-status',
      kind: 'git',
      title: 'Git status',
      subtitle: gitStatus.total > 0
        ? `${gitStatus.total} changed files on ${branch}`
        : `working tree clean on ${branch}`,
      command: 'git status',
    })

    addRecommendation({
      id: gitStatus.total > 0 ? 'git-diff' : 'git-log',
      kind: 'git',
      title: gitStatus.total > 0 ? 'Review diff' : 'Recent commits',
      subtitle: gitStatus.total > 0
        ? 'inspect the current file delta'
        : `scan the latest history on ${branch}`,
      command: gitStatus.total > 0 ? 'git diff --stat' : 'git log --oneline -5',
    })

    if (gitStatus.ahead > 0) {
      addRecommendation({
        id: 'git-push',
        kind: 'git',
        title: 'Push branch',
        subtitle: `${gitStatus.ahead} local commits ahead of origin`,
        command: 'git push',
      })
    }
  }

  return recommendations.slice(0, 6)
}

function buildRepoSuggestionItem(recommendation: RepoRecommendation): SuggestionItem {
  return {
    id: `rec-${recommendation.id}`,
    kind: 'recommendation',
    title: recommendation.command,
    subtitle: recommendation.subtitle,
    preview: recommendation.title,
    insertValue: recommendation.command,
    tag: recommendation.kind,
  }
}

function buildBlockSuggestion(block: CommandBlock): SuggestionItem {
  const runtime = typeof block.durationMs === 'number' ? `${Math.max(1, Math.round(block.durationMs / 1000))}s` : 'running'
  const statusLabel = block.status === 'success'
    ? 'success'
    : block.status === 'error'
      ? 'error'
      : block.status === 'interrupted'
        ? 'stopped'
        : 'running'

  return {
    id: `block-${block.id}`,
    kind: 'block',
    title: block.command,
    subtitle: `${statusLabel} | ${runtime} | ${block.cwd ? smartTruncatePath(block.cwd, 28) : 'cwd unknown'}`,
    preview: block.output.trim() || block.rawOutput.trim() || undefined,
    insertValue: block.command,
    tag: 'block',
  }
}

function scoreSearchText(values: string[], query: string): number {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return 1

  let score = 0
  for (const value of values) {
    const normalizedValue = value.toLowerCase()
    if (!normalizedValue) continue
    if (normalizedValue === normalizedQuery) score = Math.max(score, 500)
    else if (normalizedValue.startsWith(normalizedQuery)) score = Math.max(score, 240)
    else if (normalizedValue.includes(normalizedQuery)) score = Math.max(score, 120)
    else if (normalizedValue.split(/\s+/).some((part) => part.startsWith(normalizedQuery))) score = Math.max(score, 80)
  }

  return score
}

function filterSuggestionItems(items: SuggestionItem[], query: string, limit: number): SuggestionItem[] {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return items.slice(0, limit)

  return items
    .map((item, index) => ({
      item,
      index,
      score: scoreSearchText(
        [item.title, item.subtitle, item.preview || '', item.insertValue, item.tag || ''],
        normalizedQuery,
      ),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return a.index - b.index
    })
    .slice(0, limit)
    .map((entry) => entry.item)
}

function buildPathSuggestion(
  pathEntry: PathHistoryEntry,
  input: string,
  cwd: string,
  overrideLabel?: string,
): SuggestionItem {
  const pathCommand = detectPathCommand(input) || 'cd'
  const insertPath = !isAbsolutePath(pathEntry.path) ? pathEntry.path : relativePath(cwd, pathEntry.path)
  const normalizedInsertPath = insertPath === '.' ? './' : insertPath

  return {
    id: `path-${pathEntry.path}`,
    kind: 'path',
    title: overrideLabel || smartTruncatePath(pathEntry.path, 44),
    subtitle: `${pathEntry.useCount} visits | ${formatRelativeTimestamp(pathEntry.lastUsedAt)}`,
    preview: pathEntry.path,
    insertValue: `${pathCommand} ${quoteShellPath(normalizedInsertPath)}`,
  }
}

function buildFsPathSuggestion(
  entry: FileEntry,
  input: string,
  cwd: string,
): SuggestionItem {
  const pathCommand = detectPathCommand(input) || 'cd'
  const insertPath = relativePath(cwd, entry.path)
  const normalizedInsertPath = insertPath === '.' ? './' : insertPath

  return {
    id: `fs-${entry.path}`,
    kind: 'path',
    title: entry.isDirectory ? `${entry.name}/` : entry.name,
    subtitle: entry.isDirectory ? 'filesystem directory' : 'filesystem file',
    preview: entry.path,
    insertValue: `${pathCommand} ${quoteShellPath(normalizedInsertPath)}`,
  }
}

async function resolvePathSuggestions(input: string, cwd: string): Promise<FileEntry[]> {
  const command = detectPathCommand(input)
  const api = getGhostshellApi()
  if (!command || !api?.shellResolvePath || !api.fsReadDir) return []

  const rawQuery = getPathQuery(input)
  const normalizedQuery = rawQuery.replace(/\\/g, '/')
  const endsWithSlash = /[\\/]$/.test(rawQuery)
  const lastSlash = Math.max(normalizedQuery.lastIndexOf('/'), normalizedQuery.lastIndexOf('\\'))
  const parentFragment = endsWithSlash
    ? normalizedQuery || '.'
    : lastSlash >= 0
      ? normalizedQuery.slice(0, lastSlash + 1) || '.'
      : '.'
  const partial = endsWithSlash ? '' : lastSlash >= 0 ? normalizedQuery.slice(lastSlash + 1) : normalizedQuery

  try {
    const resolvedParent = await api.shellResolvePath(parentFragment || '.', cwd)
    if (!resolvedParent.success || !resolvedParent.path) return []

    const entries = await api.fsReadDir(resolvedParent.path)
    return entries
      .filter((entry) => (command.toLowerCase() === 'cd' ? entry.isDirectory : true))
      .filter((entry) => {
        if (!partial) return true
        return entry.name.toLowerCase().startsWith(partial.toLowerCase())
      })
      .sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
      })
      .slice(0, 8)
  } catch {
    return []
  }
}

async function resolveRepoContext(cwd: string): Promise<RepoContext | null> {
  const api = getGhostshellApi()
  if (!api?.fsReadDir) return null

  let gitStatus: GitStatus | null = null
  if (api.gitStatus) {
    try {
      const status = await api.gitStatus(cwd)
      gitStatus = status?.isRepo ? status : null
    } catch {
      gitStatus = null
    }
  }

  let currentDirectory: string | null = cwd
  let packageRoot: string | null = null
  let packageEntries: FileEntry[] = []
  let searchDepth = 0

  while (currentDirectory && searchDepth < 6) {
    try {
      const entries = await api.fsReadDir(currentDirectory)
      if (entries.some((entry) => !entry.isDirectory && entry.name === 'package.json')) {
        packageRoot = currentDirectory
        packageEntries = entries
        break
      }
    } catch {
      // Ignore unreadable parents and continue upward.
    }

    const parent = getParentDirectory(currentDirectory)
    if (!parent || pathsEqual(parent, currentDirectory)) break
    currentDirectory = parent
    searchDepth += 1
  }

  if (!packageRoot) {
    return gitStatus ? {
      gitStatus,
      packageRoot: null,
      packageManager: 'npm',
      scripts: [],
    } : null
  }

  let packageManager: PackageManager = detectPackageManager(packageEntries)
  let packageName: string | undefined
  let scripts: string[] = []

  if (api.fsReadFile) {
    try {
      const result = await api.fsReadFile(joinPath(packageRoot, 'package.json'))
      if (result.success && result.content) {
        const parsed = JSON.parse(result.content)
        packageName = typeof parsed.name === 'string' ? parsed.name : undefined
        scripts = parsed.scripts && typeof parsed.scripts === 'object'
          ? Object.keys(parsed.scripts).filter((script) => typeof parsed.scripts[script] === 'string')
          : []
        packageManager = detectPackageManager(packageEntries, typeof parsed.packageManager === 'string' ? parsed.packageManager : undefined)
      }
    } catch {
      // Parse failures should not break the command bar.
    }
  }

  return {
    gitStatus,
    packageRoot,
    packageName,
    packageManager,
    scripts,
  }
}

export function TerminalCommandBar({
  sessionId,
  cwd,
  provider,
  isActive = false,
}: TerminalCommandBarProps) {
  const getCommandSuggestions = useHistoryStore((state) => state.getCommandSuggestions)
  const getRecentPaths = useHistoryStore((state) => state.getRecentPaths)
  const blocksForSession = useCommandBlockStore((state) => state.blocksBySession[sessionId] || [])
  const [input, setInput] = useState('')
  const [isFocused, setIsFocused] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [mode, setMode] = useState<CommandBarMode>('none')
  const [fsPathSuggestions, setFsPathSuggestions] = useState<FileEntry[]>([])
  const [repoContext, setRepoContext] = useState<RepoContext | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const restoreInputRef = useRef('')

  const isHistoryMode = mode === 'history'
  const isPaletteMode = mode === 'palette'
  const isSearchMode = mode !== 'none'

  const recentCommands = useMemo(
    () => getCommandSuggestions('', cwd, 3),
    [cwd, getCommandSuggestions],
  )
  const recentPaths = useMemo(
    () => getRecentPaths('', 3).filter((entry) => entry.path !== cwd),
    [cwd, getRecentPaths],
  )

  const historySuggestions = useMemo(
    () => getCommandSuggestions(input, cwd, isHistoryMode ? 12 : input.trim() ? 6 : 4).map(buildCommandSuggestion),
    [cwd, getCommandSuggestions, input, isHistoryMode],
  )

  const storedPathSuggestions = useMemo(() => {
    if (isSearchMode) return []
    return getRecentPaths(getPathQuery(input).toLowerCase(), input.trim() ? 5 : 3)
      .filter((entry) => entry.path !== cwd)
      .map((entry) => buildPathSuggestion(entry, input, cwd))
  }, [cwd, getRecentPaths, input, isSearchMode])

  const liveFsSuggestions = useMemo(() => {
    if (isSearchMode) return []
    return fsPathSuggestions.map((entry) => buildFsPathSuggestion(entry, input, cwd))
  }, [cwd, fsPathSuggestions, input, isSearchMode])

  const repoRecommendations = useMemo(
    () => buildRepoRecommendations(repoContext, cwd),
    [cwd, repoContext],
  )

  const paletteRecommendationSuggestions = useMemo(
    () => filterSuggestionItems(repoRecommendations.map(buildRepoSuggestionItem), input, input.trim() ? 6 : 4),
    [input, repoRecommendations],
  )

  const palettePathSuggestions = useMemo(
    () => filterSuggestionItems(
      getRecentPaths(input.toLowerCase(), input.trim() ? 4 : 3)
        .filter((entry) => entry.path !== cwd)
        .map((entry) => buildPathSuggestion(entry, '', cwd)),
      input,
      input.trim() ? 4 : 3,
    ),
    [cwd, getRecentPaths, input],
  )

  const blockSuggestions = useMemo(
    () => filterSuggestionItems(
      [...blocksForSession].slice(-10).reverse().map(buildBlockSuggestion),
      input,
      input.trim() ? 6 : 4,
    ),
    [blocksForSession, input],
  )

  const suggestions = useMemo(() => {
    const seen = new Set<string>()
    const candidates = isPaletteMode
      ? [...paletteRecommendationSuggestions, ...blockSuggestions, ...historySuggestions, ...palettePathSuggestions]
      : isHistoryMode
        ? historySuggestions
        : [...historySuggestions, ...liveFsSuggestions, ...storedPathSuggestions]

    return candidates.filter((item) => {
      if (seen.has(item.insertValue)) return false
      seen.add(item.insertValue)
      return true
    })
  }, [
    blockSuggestions,
    historySuggestions,
    isHistoryMode,
    isPaletteMode,
    liveFsSuggestions,
    palettePathSuggestions,
    paletteRecommendationSuggestions,
    storedPathSuggestions,
  ])

  useEffect(() => {
    setSelectedIndex(0)
  }, [input, mode])

  useEffect(() => {
    let cancelled = false
    if (isSearchMode || !detectPathCommand(input)) {
      setFsPathSuggestions([])
      return () => {
        cancelled = true
      }
    }

    const timer = window.setTimeout(async () => {
      const entries = await resolvePathSuggestions(input, cwd)
      if (!cancelled) {
        setFsPathSuggestions(entries)
      }
    }, 110)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [cwd, input, isSearchMode])

  useEffect(() => {
    let cancelled = false

    void resolveRepoContext(cwd).then((context) => {
      if (!cancelled) {
        setRepoContext(context)
      }
    })

    return () => {
      cancelled = true
    }
  }, [cwd])

  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = '0px'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 140)}px`
  }, [input])

  useEffect(() => {
    if (!isActive) return
    const textarea = textareaRef.current
    if (!textarea) return
    const timer = window.setTimeout(() => {
      textarea.focus()
    }, 80)
    return () => window.clearTimeout(timer)
  }, [isActive])

  useEffect(() => {
    if (isActive || mode === 'none') return
    const restoreValue = restoreInputRef.current
    restoreInputRef.current = ''
    setMode('none')
    if (restoreValue) {
      setInput(restoreValue)
    }
  }, [isActive, mode])

  const insertSuggestion = (value: string) => {
    setInput(value)
    window.requestAnimationFrame(() => {
      const textarea = textareaRef.current
      if (!textarea) return
      textarea.focus()
      const length = value.length
      textarea.setSelectionRange(length, length)
    })
  }

  const exitSearchMode = (options?: { restoreInput?: boolean }) => {
    const restoreValue = options?.restoreInput ? restoreInputRef.current : ''
    restoreInputRef.current = ''
    setMode('none')
    if (options?.restoreInput) {
      setInput(restoreValue)
      window.requestAnimationFrame(() => {
        const textarea = textareaRef.current
        if (!textarea) return
        textarea.focus()
        const length = restoreValue.length
        textarea.setSelectionRange(length, length)
      })
    }
  }

  const activateMode = (nextMode: Exclude<CommandBarMode, 'none'>) => {
    if (mode === nextMode) {
      exitSearchMode({ restoreInput: true })
      return
    }

    if (mode === 'none') {
      restoreInputRef.current = input
      setInput('')
    }

    setMode(nextMode)
    window.requestAnimationFrame(() => textareaRef.current?.focus())
  }

  const acceptSuggestion = (value: string) => {
    exitSearchMode()
    insertSuggestion(value)
  }

  const submitTypedCommand = (command: string) => {
    const normalizedCommand = command.trim()
    if (!normalizedCommand) return

    submitPromptToSession(sessionId, normalizedCommand, cwd)
    setInput('')
    setSelectedIndex(0)
    exitSearchMode()
    window.requestAnimationFrame(() => textareaRef.current?.focus())
  }

  const handleSubmit = () => {
    if (isSearchMode) {
      const selectedSuggestion = suggestions[selectedIndex]
      const typedCommand = input.trim()

      if (typedCommand && (!selectedSuggestion || selectedSuggestion.insertValue.trim() === typedCommand)) {
        submitTypedCommand(typedCommand)
        return
      }

      if (selectedSuggestion) {
        acceptSuggestion(selectedSuggestion.insertValue)
      }
      return
    }

    const fallbackSuggestion = !input.trim() ? suggestions[selectedIndex] : null
    const nextCommand = input.trim() || fallbackSuggestion?.insertValue || ''
    if (!nextCommand) return

    submitTypedCommand(nextCommand)
  }

  const showSuggestions = isFocused || input.trim().length > 0 || isSearchMode

  return (
    <div className="shrink-0 border-t border-white/[0.06] bg-[#0b1322]/92 backdrop-blur-xl">
      <div className="px-3 pt-2.5">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-white/30">
          <span className="inline-flex items-center gap-1 rounded-full border border-[#38bdf8]/20 bg-[#38bdf8]/10 px-2 py-0.5 text-[#7dd3fc]">
            <Sparkles className="h-2.5 w-2.5" />
            Smart Input
          </span>
          {provider && <span>{provider}</span>}
          {repoContext?.gitStatus?.isRepo && (
            <span className="inline-flex items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-white/35">
              <GitBranch className="h-2.5 w-2.5" />
              {repoContext.gitStatus.branch || 'repo'}
            </span>
          )}
          {repoContext?.packageRoot && (
            <span className="inline-flex items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-white/35">
              <Package2 className="h-2.5 w-2.5" />
              {repoContext.packageName || repoContext.packageManager}
            </span>
          )}
          {isHistoryMode && (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/20 bg-amber-300/10 px-2 py-0.5 text-amber-200">
              <Search className="h-2.5 w-2.5" />
              Ctrl+R
            </span>
          )}
          {isPaletteMode && (
            <span className="inline-flex items-center gap-1 rounded-full border border-fuchsia-300/20 bg-fuchsia-300/10 px-2 py-0.5 text-fuchsia-100">
              <Sparkles className="h-2.5 w-2.5" />
              Ctrl+K
            </span>
          )}
          <span className="ml-auto truncate text-white/20">{smartTruncatePath(cwd || '.', 34)}</span>
        </div>

        {!input.trim() && !isSearchMode && (
          <div className="mt-2 space-y-2">
            {repoRecommendations.length > 0 && (
              <div>
                <p className="mb-1 text-[10px] uppercase tracking-[0.18em] text-white/22">Recommended</p>
                <div className="flex flex-wrap gap-1.5">
                  {repoRecommendations.map((recommendation) => (
                    <button
                      key={recommendation.id}
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => insertSuggestion(recommendation.command)}
                      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] transition-colors ${recommendation.kind === 'git' ? 'border-sky-400/15 bg-sky-400/8 text-sky-100 hover:border-sky-300/30 hover:bg-sky-300/12' : 'border-amber-300/15 bg-amber-300/8 text-amber-100 hover:border-amber-200/30 hover:bg-amber-200/12'}`}
                      title={recommendation.subtitle}
                    >
                      {recommendation.kind === 'git'
                        ? <GitBranch className="h-3 w-3 opacity-80" />
                        : <Package2 className="h-3 w-3 opacity-80" />}
                      <span className="max-w-[220px] truncate font-mono">{recommendation.command}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {(recentCommands.length > 0 || recentPaths.length > 0) && (
              <div>
                <p className="mb-1 text-[10px] uppercase tracking-[0.18em] text-white/22">Recent</p>
                <div className="flex flex-wrap gap-1.5">
                  {recentCommands.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => insertSuggestion(entry.command)}
                      className="inline-flex items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[11px] text-white/45 transition-colors hover:border-[#38bdf8]/20 hover:bg-[#38bdf8]/8 hover:text-white/80"
                    >
                      <Clock3 className="h-3 w-3 text-white/30" />
                      <span className="max-w-[180px] truncate font-mono">{entry.command}</span>
                    </button>
                  ))}

                  {recentPaths.map((entry) => (
                    <button
                      key={entry.path}
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => insertSuggestion(buildPathSuggestion(entry, input, cwd).insertValue)}
                      className="inline-flex items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[11px] text-white/45 transition-colors hover:border-emerald-400/20 hover:bg-emerald-400/8 hover:text-white/80"
                    >
                      <Folder className="h-3 w-3 text-white/30" />
                      <span className="max-w-[200px] truncate">{smartTruncatePath(entry.path, 28)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="px-3 pb-3 pt-2">
        <div className={`overflow-hidden rounded-2xl border transition-colors ${isFocused ? 'border-[#38bdf8]/30 bg-[#09111d]' : 'border-white/[0.08] bg-black/20'}`}>
          <div className="flex items-start gap-3 px-3 py-2.5">
            <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-white/[0.04] text-[#7dd3fc]">
              {isSearchMode ? <Search className="h-3.5 w-3.5" /> : <TerminalSquare className="h-3.5 w-3.5" />}
            </div>

            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onFocus={() => setIsFocused(true)}
              onBlur={() => window.setTimeout(() => setIsFocused(false), 120)}
              onKeyDown={(event) => {
                if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'r') {
                  event.preventDefault()
                  activateMode('history')
                  return
                }

                if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
                  event.preventDefault()
                  activateMode('palette')
                  return
                }

                if (event.key === 'ArrowDown' && suggestions.length > 0) {
                  event.preventDefault()
                  setSelectedIndex((current) => (current + 1) % suggestions.length)
                  return
                }

                if (event.key === 'ArrowUp' && suggestions.length > 0) {
                  event.preventDefault()
                  setSelectedIndex((current) => (current - 1 + suggestions.length) % suggestions.length)
                  return
                }

                if (event.key === 'Tab' && suggestions.length > 0) {
                  event.preventDefault()
                  insertSuggestion(suggestions[selectedIndex].insertValue)
                  return
                }

                if (event.key === 'Escape') {
                  event.preventDefault()
                  if (isSearchMode) {
                    exitSearchMode({ restoreInput: true })
                    return
                  }
                  if (input) {
                    setInput('')
                  } else {
                    textareaRef.current?.blur()
                  }
                  return
                }

                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  handleSubmit()
                }
              }}
              placeholder={isHistoryMode
                ? 'Search command history and press Enter to load the result...'
                : isPaletteMode
                  ? 'Search commands, blocks, repo actions, and recent paths...'
                  : 'Type a command, use repo suggestions, autocomplete paths, or press Ctrl+K...'}
              className="min-h-[28px] flex-1 resize-none bg-transparent pt-0.5 font-mono text-[13px] leading-6 text-white/90 outline-none placeholder:text-white/22"
              style={{ maxHeight: 140 }}
            />

            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={handleSubmit}
              disabled={!input.trim() && suggestions.length === 0}
              className="inline-flex h-9 shrink-0 items-center gap-1 rounded-xl bg-[#38bdf8] px-3 text-[11px] font-semibold text-[#06101c] transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:brightness-100"
            >
              <CornerDownLeft className="h-3.5 w-3.5" />
              {isSearchMode ? 'Load' : 'Run'}
            </button>
          </div>

          <div className="flex items-center justify-between border-t border-white/[0.06] px-3 py-1.5 text-[10px] text-white/25">
            <span>
              {isHistoryMode
                ? 'Ctrl+R toggle | Enter load | Up/Down navigate'
                : isPaletteMode
                  ? 'Ctrl+K toggle | Enter load | Search repo + blocks + history'
                  : 'Tab autocomplete | Ctrl+R history | Ctrl+K palette | Shift+Enter newline'}
            </span>
            <span>
              {isSearchMode
                ? `${suggestions.length} matches`
                : input.trim()
                  ? `${input.trim().split(/\s+/).length} tokens`
                  : repoRecommendations.length > 0
                    ? 'repo + history ready'
                    : 'history + paths ready'}
            </span>
          </div>
        </div>

        {showSuggestions && suggestions.length > 0 && (
          <div className="mt-2 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0a101b]/96">
            {suggestions.map((item, index) => {
              const isSelected = index === selectedIndex

              return (
                <button
                  key={item.id}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => acceptSuggestion(item.insertValue)}
                  className={`flex w-full items-start gap-3 border-b border-white/[0.04] px-3 py-2.5 text-left transition-colors last:border-b-0 ${isSelected ? 'bg-[#38bdf8]/10 text-white' : 'text-white/70 hover:bg-white/[0.03]'}`}
                >
                  <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl ${
                    item.kind === 'path'
                      ? 'bg-emerald-400/10 text-emerald-300'
                      : item.kind === 'recommendation'
                        ? item.tag === 'git'
                          ? 'bg-sky-400/10 text-sky-300'
                          : 'bg-amber-300/10 text-amber-200'
                        : item.kind === 'block'
                          ? 'bg-fuchsia-300/10 text-fuchsia-200'
                          : 'bg-white/[0.04] text-[#7dd3fc]'
                  }`}>
                    {item.kind === 'path'
                      ? <Folder className="h-3.5 w-3.5" />
                      : item.kind === 'recommendation'
                        ? item.tag === 'git'
                          ? <GitBranch className="h-3.5 w-3.5" />
                          : <Package2 className="h-3.5 w-3.5" />
                        : item.kind === 'block'
                          ? <TerminalSquare className="h-3.5 w-3.5" />
                          : <Clock3 className="h-3.5 w-3.5" />}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-mono text-[12px]">{item.title}</p>
                      <span className={`rounded-full px-1.5 py-0.5 text-[9px] uppercase tracking-[0.18em] ${
                        item.kind === 'path'
                          ? 'bg-emerald-400/10 text-emerald-300/80'
                          : item.kind === 'recommendation'
                            ? item.tag === 'git'
                              ? 'bg-sky-400/10 text-sky-300/80'
                              : 'bg-amber-300/10 text-amber-200/80'
                            : item.kind === 'block'
                              ? 'bg-fuchsia-300/10 text-fuchsia-100/80'
                              : 'bg-white/[0.05] text-white/35'
                      }`}>
                        {item.tag || item.kind}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-[10px] text-white/35">{item.subtitle}</p>
                    {item.preview && item.preview !== item.title && (
                      <p className="mt-1 truncate text-[10px] text-white/22">{item.preview}</p>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
