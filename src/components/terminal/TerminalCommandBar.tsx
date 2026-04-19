import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Clock3,
  CornerDownLeft,
  Folder,
  GitBranch,
  Package2,
  Search,
  Square,
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
const EMPTY_COMMAND_BLOCKS: CommandBlock[] = []
const SMART_INPUT_FOCUS_EVENT = 'ghostshell:focus-command-bar'

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

function dedupeSuggestionItems(items: SuggestionItem[]): SuggestionItem[] {
  const seen = new Set<string>()

  return items.filter((item) => {
    const key = item.insertValue.trim().toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function findPrefixSuggestion(items: SuggestionItem[], input: string): SuggestionItem | null {
  const normalizedInput = input.trim()
  if (!normalizedInput) return null

  const lowerInput = normalizedInput.toLowerCase()

  return items.find((item) => {
    const candidate = item.insertValue.trim()
    return candidate.length > normalizedInput.length && candidate.toLowerCase().startsWith(lowerInput)
  }) || null
}

function getSuggestionBadgeLabel(item: SuggestionItem | null): string {
  if (!item) return ''
  if (item.kind === 'command') return 'history'
  return item.tag || item.kind
}

function getSuggestionSuffix(suggestion: SuggestionItem | null, input: string): string {
  if (!suggestion) return ''
  if (!input) return suggestion.insertValue
  return suggestion.insertValue.slice(input.length)
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

function buildStaticPathSuggestion(
  id: string,
  title: string,
  subtitle: string,
  preview: string,
  insertValue: string,
): SuggestionItem {
  return {
    id,
    kind: 'path',
    title,
    subtitle,
    preview,
    insertValue,
    tag: 'path',
  }
}

async function resolvePathBase(fragment: string, cwd: string): Promise<string | null> {
  const api = getGhostshellApi()
  const normalizedFragment = fragment.trim() || '.'

  if (api?.shellResolvePath) {
    try {
      const resolved = await api.shellResolvePath(normalizedFragment, cwd)
      if (resolved.success && resolved.path) return resolved.path
    } catch {
      // Fall back to a lightweight renderer-side resolution.
    }
  }

  if (normalizedFragment === '.') return cwd
  if (normalizedFragment === '..') return getParentDirectory(cwd) || cwd

  if (normalizedFragment === '~' || normalizedFragment.startsWith('~/') || normalizedFragment.startsWith('~\\')) {
    try {
      const homeDir = await api?.shellGetHomedir?.()
      if (!homeDir) return cwd
      if (normalizedFragment === '~') return homeDir
      return joinPath(homeDir, normalizedFragment.slice(2))
    } catch {
      return cwd
    }
  }

  if (normalizedFragment.startsWith('../') || normalizedFragment.startsWith('..\\')) {
    let remaining = normalizedFragment
    let basePath = cwd

    while (remaining.startsWith('../') || remaining.startsWith('..\\')) {
      basePath = getParentDirectory(basePath) || basePath
      remaining = remaining.slice(3)
    }

    return remaining ? joinPath(basePath, remaining) : basePath
  }

  if (normalizedFragment.startsWith('./') || normalizedFragment.startsWith('.\\')) {
    return joinPath(cwd, normalizedFragment.slice(2))
  }

  if (isAbsolutePath(normalizedFragment)) return normalizedFragment
  return joinPath(cwd, normalizedFragment)
}

async function resolvePathSuggestions(input: string, cwd: string): Promise<FileEntry[]> {
  const command = detectPathCommand(input)
  const api = getGhostshellApi()
  if (!command || !api?.fsReadDir) return []

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
    const resolvedParentPath = await resolvePathBase(parentFragment || '.', cwd)
    if (!resolvedParentPath) return []

    const entries = await api.fsReadDir(resolvedParentPath)
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
  const blocksForSession = useCommandBlockStore(
    (state) => state.blocksBySession[sessionId] ?? EMPTY_COMMAND_BLOCKS,
  )
  const hasActiveBlock = useCommandBlockStore(
    (state) => !!state.activeBlockBySession[sessionId],
  )

  const sendInterrupt = () => {
    try {
      window.ghostshell.ptyWrite(sessionId, '\x03')
    } catch {
      // PTY may not be ready yet
    }
  }
  const [input, setInput] = useState('')
  const [isFocused, setIsFocused] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [mode, setMode] = useState<CommandBarMode>('none')
  const [fsPathSuggestions, setFsPathSuggestions] = useState<FileEntry[]>([])
  const [repoContext, setRepoContext] = useState<RepoContext | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const restoreInputRef = useRef('')

  const isHistoryMode = mode === 'history'
  const isPaletteMode = mode === 'palette'
  const isSearchMode = mode !== 'none'
  const hasPathCommand = !!detectPathCommand(input)
  const pathQuery = useMemo(() => getPathQuery(input), [input])

  const historySuggestions = useMemo(
    () => getCommandSuggestions(input, cwd, isHistoryMode ? 12 : input.trim() ? 6 : 4).map(buildCommandSuggestion),
    [cwd, getCommandSuggestions, input, isHistoryMode],
  )

  const storedPathSuggestions = useMemo(() => {
    if (isSearchMode || !hasPathCommand) return []
    return getRecentPaths(pathQuery.toLowerCase(), input.trim() ? 5 : 3)
      .filter((entry) => entry.path !== cwd)
      .map((entry) => buildPathSuggestion(entry, input, cwd))
  }, [cwd, getRecentPaths, hasPathCommand, input, isSearchMode, pathQuery])

  const liveFsSuggestions = useMemo(() => {
    if (isSearchMode || !hasPathCommand) return []
    return fsPathSuggestions.map((entry) => buildFsPathSuggestion(entry, input, cwd))
  }, [cwd, fsPathSuggestions, hasPathCommand, input, isSearchMode])

  const fallbackPathSuggestions = useMemo(() => {
    if (isSearchMode || !hasPathCommand || pathQuery.trim()) return []

    const pathCommand = detectPathCommand(input) || 'cd'
    const suggestions: SuggestionItem[] = []
    const parentDirectory = getParentDirectory(cwd)

    if (parentDirectory && !pathsEqual(parentDirectory, cwd)) {
      suggestions.push(
        buildStaticPathSuggestion(
          `path-parent-${cwd}`,
          '../',
          'parent directory',
          parentDirectory,
          `${pathCommand} ..`,
        ),
      )
    }

    if (repoContext?.packageRoot && !pathsEqual(repoContext.packageRoot, cwd)) {
      const relativeRoot = relativePath(cwd, repoContext.packageRoot)
      suggestions.push(
        buildStaticPathSuggestion(
          `path-root-${repoContext.packageRoot}`,
          smartTruncatePath(repoContext.packageRoot, 44),
          'project root',
          repoContext.packageRoot,
          `${pathCommand} ${quoteShellPath(relativeRoot === '.' ? './' : relativeRoot)}`,
        ),
      )
    }

    return suggestions
  }, [cwd, hasPathCommand, input, isSearchMode, pathQuery, repoContext])

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

  const searchSuggestions = useMemo(() => {
    const candidates = isPaletteMode
      ? [...paletteRecommendationSuggestions, ...blockSuggestions, ...historySuggestions, ...palettePathSuggestions]
      : isHistoryMode
        ? historySuggestions
        : []

    return dedupeSuggestionItems(candidates)
  }, [
    blockSuggestions,
    historySuggestions,
    isHistoryMode,
    isPaletteMode,
    palettePathSuggestions,
    paletteRecommendationSuggestions,
  ])

  const inlineCompletionSuggestions = useMemo(() => {
    if (isSearchMode || !input.trim()) return []

    const candidates = hasPathCommand
      ? pathQuery.trim()
        ? [...liveFsSuggestions, ...storedPathSuggestions]
        : [...storedPathSuggestions, ...liveFsSuggestions, ...fallbackPathSuggestions]
      : filterSuggestionItems(
          [...repoRecommendations.map(buildRepoSuggestionItem), ...historySuggestions],
          input,
          6,
        )

    return dedupeSuggestionItems(candidates)
  }, [
    hasPathCommand,
    historySuggestions,
    input,
    isSearchMode,
    fallbackPathSuggestions,
    liveFsSuggestions,
    pathQuery,
    repoRecommendations,
    storedPathSuggestions,
  ])

  const activeInlineSuggestion = useMemo(
    () => {
      if (hasPathCommand && !pathQuery.trim()) {
        return inlineCompletionSuggestions[0] || null
      }
      return findPrefixSuggestion(inlineCompletionSuggestions, input)
    },
    [hasPathCommand, inlineCompletionSuggestions, input, pathQuery],
  )
  const activeInlineSuffix = useMemo(
    () => getSuggestionSuffix(activeInlineSuggestion, input),
    [activeInlineSuggestion, input],
  )

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
    if (!isActive) return
    const field = inputRef.current
    if (!field) return
    const timer = window.setTimeout(() => {
      field.focus()
    }, 80)
    return () => window.clearTimeout(timer)
  }, [isActive])

  useEffect(() => {
    const handleFocusRequest = (event: Event) => {
      const detail = event instanceof CustomEvent
        ? (event.detail as { sessionId?: string; text?: string } | undefined)
        : undefined

      if (detail?.sessionId && detail.sessionId !== sessionId) return
      const field = inputRef.current
      field?.focus()

      // Inject pasted text (from xterm paste event when in readOnly/smart-input mode).
      // Append at current caret position so Ctrl+V / Wispr Flow / context-menu paste
      // all land in the command bar instead of being silently dropped.
      if (detail?.text && field) {
        const start = field.selectionStart ?? field.value.length
        const end = field.selectionEnd ?? field.value.length
        const next = field.value.slice(0, start) + detail.text + field.value.slice(end)
        setInput(next)
        window.requestAnimationFrame(() => {
          const caret = start + detail.text!.length
          field.setSelectionRange(caret, caret)
          field.focus()
        })
      }
    }

    window.addEventListener(SMART_INPUT_FOCUS_EVENT, handleFocusRequest as EventListener)
    return () =>
      window.removeEventListener(SMART_INPUT_FOCUS_EVENT, handleFocusRequest as EventListener)
  }, [sessionId])

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
      const field = inputRef.current
      if (!field) return
      field.focus()
      const length = value.length
      field.setSelectionRange(length, length)
    })
  }

  const exitSearchMode = (options?: { restoreInput?: boolean }) => {
    const restoreValue = options?.restoreInput ? restoreInputRef.current : ''
    restoreInputRef.current = ''
    setMode('none')
    if (options?.restoreInput) {
      setInput(restoreValue)
      window.requestAnimationFrame(() => {
        const field = inputRef.current
        if (!field) return
        field.focus()
        const length = restoreValue.length
        field.setSelectionRange(length, length)
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
    window.requestAnimationFrame(() => inputRef.current?.focus())
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
    window.requestAnimationFrame(() => inputRef.current?.focus())
  }

  const handleSubmit = () => {
    if (isSearchMode) {
      const selectedSuggestion = searchSuggestions[selectedIndex]
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

    const nextCommand = input.trim()
    if (!nextCommand) return

    submitTypedCommand(nextCommand)
  }

  const footerLabel = isSearchMode
    ? isHistoryMode
      ? 'History mode: Enter loads, arrows move, Esc closes.'
      : 'Palette mode: search repo actions, blocks, and command history.'
    : activeInlineSuggestion
      ? activeInlineSuggestion.insertValue
      : 'Tab autocomplete · Ctrl+R history · Ctrl+K palette'

  const footerStatus = isSearchMode
    ? `${searchSuggestions.length} results`
    : activeInlineSuggestion
      ? getSuggestionBadgeLabel(activeInlineSuggestion)
      : input.trim()
        ? 'ready'
        : hasPathCommand
          ? 'paths'
          : 'idle'
  const footerText = footerLabel.replaceAll('Ã‚Â·', '·')

  const displayFooterText = isSearchMode || activeInlineSuggestion
    ? footerLabel
    : 'Tab or -> autocomplete | Ctrl+R history | Ctrl+K palette'

  return (
    <div
      className="shrink-0 border-t backdrop-blur-xl"
      style={{
        borderColor: 'color-mix(in srgb, var(--ghost-border) 72%, rgba(255,255,255,0.04))',
        background: 'linear-gradient(180deg, color-mix(in srgb, var(--ghost-bg) 88%, rgba(255,255,255,0.02)) 0%, color-mix(in srgb, var(--ghost-sidebar) 94%, rgba(255,255,255,0.015)) 100%)',
      }}
    >
      <div className="px-3 pb-2 pt-2">
        <div className="flex items-center gap-3 text-[10px] uppercase tracking-[0.18em] text-white/24">
          <span>
            {isHistoryMode
              ? 'History Search'
              : isPaletteMode
                ? 'Command Palette'
                : provider
                  ? `${provider} command line`
                  : 'Command line'}
          </span>
          <span className="truncate text-white/18">{smartTruncatePath(cwd || '.', 38)}</span>
          <span className="ml-auto shrink-0 text-white/16">
            {isHistoryMode ? 'Ctrl+R' : isPaletteMode ? 'Ctrl+K' : 'Tab'}
          </span>
        </div>
      </div>

      <div className="px-3 pb-3">
        <div className="relative">
          {isSearchMode && searchSuggestions.length > 0 && (
            <div
              className="absolute bottom-full left-0 right-0 z-20 mb-2 overflow-hidden rounded-[20px] border shadow-2xl"
              style={{
                borderColor: 'color-mix(in srgb, var(--ghost-border) 82%, rgba(255,255,255,0.08))',
                background: 'color-mix(in srgb, var(--ghost-sidebar) 94%, rgba(255,255,255,0.025))',
                boxShadow: '0 24px 48px rgba(0, 0, 0, 0.42)',
              }}
            >
              {searchSuggestions.map((item, index) => {
                const isSelected = index === selectedIndex

                return (
                  <button
                    key={item.id}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => acceptSuggestion(item.insertValue)}
                    className={`flex h-14 w-full items-center gap-3 border-b px-3 text-left transition-colors last:border-b-0 ${
                      isSelected ? 'text-white' : 'text-white/72 hover:text-white'
                    }`}
                    style={{
                      borderColor: 'color-mix(in srgb, var(--ghost-border) 74%, rgba(255,255,255,0.04))',
                      background: isSelected
                        ? 'color-mix(in srgb, var(--ghost-accent) 10%, rgba(255,255,255,0.02))'
                        : 'transparent',
                    }}
                  >
                    <div
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl"
                      style={{
                        background: isSelected
                          ? 'color-mix(in srgb, var(--ghost-accent) 16%, transparent)'
                          : 'color-mix(in srgb, var(--ghost-surface) 88%, rgba(255,255,255,0.02))',
                        color: item.kind === 'path'
                          ? 'var(--ghost-success)'
                          : item.kind === 'recommendation'
                            ? 'var(--ghost-accent)'
                            : item.kind === 'block'
                              ? 'var(--ghost-accent-2)'
                              : 'color-mix(in srgb, var(--ghost-text-dim) 84%, white)',
                      }}
                    >
                      {item.kind === 'path'
                        ? <Folder className="h-4 w-4" />
                        : item.kind === 'recommendation'
                          ? item.tag === 'git'
                            ? <GitBranch className="h-4 w-4" />
                            : <Package2 className="h-4 w-4" />
                          : item.kind === 'block'
                            ? <TerminalSquare className="h-4 w-4" />
                            : <Clock3 className="h-4 w-4" />}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-mono text-[12px]">{item.title}</p>
                        <span
                          className="rounded-full px-1.5 py-0.5 text-[9px] uppercase tracking-[0.18em]"
                          style={{
                            background: isSelected
                              ? 'color-mix(in srgb, var(--ghost-accent) 14%, transparent)'
                              : 'color-mix(in srgb, var(--ghost-surface) 88%, rgba(255,255,255,0.02))',
                            color: 'color-mix(in srgb, var(--ghost-text-dim) 82%, white)',
                          }}
                        >
                          {getSuggestionBadgeLabel(item)}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-[10px] text-white/34">{item.subtitle}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          <div
            className="overflow-hidden rounded-[20px] border transition-colors"
            style={{
              borderColor: isFocused
                ? 'color-mix(in srgb, var(--ghost-accent) 28%, rgba(255,255,255,0.08))'
                : 'color-mix(in srgb, var(--ghost-border) 82%, rgba(255,255,255,0.08))',
              background: isFocused
                ? 'color-mix(in srgb, var(--ghost-sidebar) 90%, rgba(255,255,255,0.018))'
                : 'color-mix(in srgb, var(--ghost-bg) 90%, rgba(255,255,255,0.014))',
              boxShadow: isFocused
                ? '0 14px 30px rgba(0, 0, 0, 0.28)'
                : '0 10px 24px rgba(0, 0, 0, 0.22)',
            }}
          >
            <div className="flex h-14 items-center gap-3 px-3">
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl"
                style={{
                  background: 'color-mix(in srgb, var(--ghost-surface) 88%, rgba(255,255,255,0.02))',
                  color: isSearchMode
                    ? 'var(--ghost-accent-2)'
                    : 'color-mix(in srgb, var(--ghost-accent) 78%, white)',
                }}
              >
                {isSearchMode ? <Search className="h-3.5 w-3.5" /> : <TerminalSquare className="h-3.5 w-3.5" />}
              </div>

              <div className="relative flex h-full flex-1 items-center">
                {activeInlineSuffix && !isSearchMode && (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 flex items-center overflow-hidden font-mono text-[13px]"
                  >
                    <span className="whitespace-pre text-transparent">{input}</span>
                    <span className="whitespace-pre text-white/24">{activeInlineSuffix}</span>
                  </div>
                )}

                <input
                  ref={inputRef}
                  value={input}
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  onChange={(event) => setInput(event.target.value)}
                  onFocus={() => setIsFocused(true)}
                  onBlur={() => window.setTimeout(() => setIsFocused(false), 120)}
                  onKeyDown={(event) => {
                    // Ctrl+C without a selection → send SIGINT to the PTY so
                    // users can interrupt a running process (e.g. npm run dev)
                    // from the Smart Input, just like a normal terminal.
                    if (
                      (event.ctrlKey || event.metaKey) &&
                      !event.shiftKey &&
                      !event.altKey &&
                      event.key.toLowerCase() === 'c'
                    ) {
                      const target = event.currentTarget
                      const hasSelection =
                        target.selectionStart !== null &&
                        target.selectionEnd !== null &&
                        target.selectionStart !== target.selectionEnd
                      if (!hasSelection) {
                        event.preventDefault()
                        sendInterrupt()
                        return
                      }
                      // With an active selection, let the browser copy it.
                    }

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

                    if (event.key === 'ArrowDown' && isSearchMode && searchSuggestions.length > 0) {
                      event.preventDefault()
                      setSelectedIndex((current) => (current + 1) % searchSuggestions.length)
                      return
                    }

                    if (event.key === 'ArrowUp' && isSearchMode && searchSuggestions.length > 0) {
                      event.preventDefault()
                      setSelectedIndex((current) => (current - 1 + searchSuggestions.length) % searchSuggestions.length)
                      return
                    }

                    if (event.key === 'Tab' && isSearchMode && searchSuggestions.length > 0) {
                      event.preventDefault()
                      insertSuggestion(searchSuggestions[selectedIndex].insertValue)
                      return
                    }

                    if (event.key === 'Tab' && activeInlineSuggestion) {
                      event.preventDefault()
                      insertSuggestion(activeInlineSuggestion.insertValue)
                      return
                    }

                    const caretAtEnd = event.currentTarget.selectionStart === input.length
                      && event.currentTarget.selectionEnd === input.length

                    if (event.key === 'ArrowRight' && !isSearchMode && activeInlineSuggestion && caretAtEnd) {
                      event.preventDefault()
                      insertSuggestion(activeInlineSuggestion.insertValue)
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
                        inputRef.current?.blur()
                      }
                      return
                    }

                    if (event.key === 'Enter') {
                      event.preventDefault()
                      handleSubmit()
                    }
                  }}
                  placeholder={isHistoryMode
                    ? 'Search command history and press Enter to load the result...'
                    : isPaletteMode
                      ? 'Search commands, blocks, repo actions, and recent paths...'
                      : 'Type a command or path. Press Tab to complete.'}
                  className="relative z-10 h-full flex-1 bg-transparent font-mono text-[13px] text-white/92 outline-none placeholder:text-white/22"
                />
              </div>

              {activeInlineSuggestion && !isSearchMode && (
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => insertSuggestion(activeInlineSuggestion.insertValue)}
                  className="hidden h-8 items-center rounded-lg border px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/42 md:inline-flex"
                  style={{
                    borderColor: 'color-mix(in srgb, var(--ghost-border) 82%, rgba(255,255,255,0.08))',
                    background: 'color-mix(in srgb, var(--ghost-surface) 88%, rgba(255,255,255,0.02))',
                  }}
                >
                  Tab
                </button>
              )}

              {hasActiveBlock && !isSearchMode && (
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={sendInterrupt}
                  title="Send Ctrl+C to running process"
                  className="inline-flex h-9 shrink-0 items-center gap-1 rounded-xl border px-2.5 text-[10px] font-semibold uppercase tracking-[0.16em] transition-all"
                  style={{
                    borderColor: 'color-mix(in srgb, rgb(244, 63, 94) 48%, rgba(255,255,255,0.08))',
                    background: 'color-mix(in srgb, rgb(244, 63, 94) 16%, rgba(255,255,255,0.02))',
                    color: 'color-mix(in srgb, rgb(244, 63, 94) 86%, white)',
                  }}
                >
                  <Square className="h-3.5 w-3.5" />
                  Stop
                </button>
              )}

              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={handleSubmit}
                disabled={!input.trim() && !activeInlineSuggestion}
                className="inline-flex h-9 shrink-0 items-center gap-1 rounded-xl border px-2.5 text-[10px] font-semibold uppercase tracking-[0.16em] transition-all disabled:cursor-not-allowed disabled:opacity-35"
                style={{
                  borderColor: 'color-mix(in srgb, var(--ghost-border) 82%, rgba(255,255,255,0.08))',
                  background: isFocused
                    ? 'color-mix(in srgb, var(--ghost-accent) 18%, rgba(255,255,255,0.02))'
                    : 'color-mix(in srgb, var(--ghost-surface) 88%, rgba(255,255,255,0.02))',
                  color: isFocused
                    ? 'color-mix(in srgb, var(--ghost-accent) 82%, white)'
                    : 'color-mix(in srgb, var(--ghost-text-dim) 80%, white)',
                }}
              >
                <CornerDownLeft className="h-3.5 w-3.5" />
                {isSearchMode ? 'Load' : 'Run'}
              </button>
            </div>

            <div
              className="flex h-8 items-center justify-between border-t px-3 text-[10px]"
              style={{
                borderColor: 'color-mix(in srgb, var(--ghost-border) 74%, rgba(255,255,255,0.04))',
                color: 'color-mix(in srgb, var(--ghost-text-dim) 70%, white)',
              }}
            >
              <div className="min-w-0 flex items-center gap-2 overflow-hidden">
                {activeInlineSuggestion && !isSearchMode ? (
                  <>
                    <span
                      className="inline-flex h-5 items-center rounded-md border px-1.5 font-semibold uppercase tracking-[0.16em]"
                      style={{
                        borderColor: 'color-mix(in srgb, var(--ghost-border) 84%, rgba(255,255,255,0.1))',
                        background: 'color-mix(in srgb, var(--ghost-surface) 88%, rgba(255,255,255,0.02))',
                      }}
                    >
                      Tab
                    </span>
                    <span className="truncate font-mono text-white/58">{displayFooterText}</span>
                  </>
                ) : (
                  <span className="truncate">{displayFooterText}</span>
                )}
              </div>

              <span className="ml-3 shrink-0 uppercase tracking-[0.16em] text-white/20">
                {footerStatus}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
