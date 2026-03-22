// Codebase Analyzer — generates a structured knowledge graph of a project
// for GhostSwarm agents to consume as shared context before starting work.
//
// Runs entirely in the renderer process using the `window.ghostshell.*` IPC bridge.

// ─── Types ──────────────────────────────────────────────────

export interface CodebaseNode {
  path: string           // relative to project root
  type: 'file' | 'directory' | 'module' | 'entrypoint' | 'test' | 'config'
  language?: string
  imports: string[]      // resolved relative import paths
  importedBy: string[]   // reverse deps (computed after all files parsed)
  exports: string[]      // named exports (simplified)
  linesOfCode: number
  lastModified: number
  gitHotness: number     // 0-100 normalized
  complexity: 'low' | 'medium' | 'high'
}

export interface CodebaseEdge {
  from: string  // source file path
  to: string    // target file path
  type: 'import' | 'config' | 'test-for'
}

export interface CodebaseModule {
  name: string
  directory: string
  files: string[]
  description: string  // auto-generated: "N files, primary language: X"
}

export interface CodebaseMap {
  version: 1
  projectName: string
  rootDir: string
  generatedAt: string
  summary: {
    totalFiles: number
    totalLines: number
    languages: Record<string, number>  // language → file count
    entryPoints: string[]
    testFiles: string[]
    configFiles: string[]
    hotspots: string[]    // top 10 most-modified files
  }
  nodes: CodebaseNode[]
  edges: CodebaseEdge[]
  modules: CodebaseModule[]
}

// ─── Constants ──────────────────────────────────────────────

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'out', 'build', '.ghostswarm',
  '.next', '__pycache__', '.venv', 'vendor', '.cache', '.turbo',
  'coverage', '.parcel-cache', '.nuxt', '.output',
])

const MAX_DEPTH = 5

/** Maximum file size to parse for imports (100KB). */
const MAX_PARSE_SIZE = 100 * 1024

/** Maximum number of files to process (safety limit for huge repos). */
const MAX_FILES = 8000

/** Batch size for concurrent file reads. */
const READ_BATCH_SIZE = 30

// ─── Language Detection ─────────────────────────────────────

const EXTENSION_LANGUAGE_MAP: Record<string, string> = {
  // TypeScript / JavaScript
  ts: 'TypeScript', tsx: 'TypeScript', mts: 'TypeScript', cts: 'TypeScript',
  js: 'JavaScript', jsx: 'JavaScript', mjs: 'JavaScript', cjs: 'JavaScript',
  // Python
  py: 'Python', pyi: 'Python', pyx: 'Python',
  // Rust
  rs: 'Rust',
  // Go
  go: 'Go',
  // Java / Kotlin
  java: 'Java', kt: 'Kotlin', kts: 'Kotlin',
  // C / C++
  c: 'C', h: 'C', cpp: 'C++', cc: 'C++', cxx: 'C++', hpp: 'C++',
  // C#
  cs: 'C#',
  // Ruby
  rb: 'Ruby', erb: 'Ruby',
  // PHP
  php: 'PHP',
  // Swift
  swift: 'Swift',
  // Dart
  dart: 'Dart',
  // Scala
  scala: 'Scala',
  // Shell
  sh: 'Shell', bash: 'Shell', zsh: 'Shell',
  // Web
  html: 'HTML', htm: 'HTML', css: 'CSS', scss: 'SCSS', less: 'Less',
  svelte: 'Svelte', vue: 'Vue',
  // Data / Config
  json: 'JSON', yaml: 'YAML', yml: 'YAML', toml: 'TOML', xml: 'XML',
  // Markdown / Docs
  md: 'Markdown', mdx: 'MDX', rst: 'reStructuredText',
  // SQL
  sql: 'SQL',
  // Elixir / Erlang
  ex: 'Elixir', exs: 'Elixir', erl: 'Erlang',
  // Lua
  lua: 'Lua',
  // Zig
  zig: 'Zig',
  // Haskell
  hs: 'Haskell',
  // OCaml
  ml: 'OCaml', mli: 'OCaml',
  // Terraform
  tf: 'Terraform',
  // Protobuf
  proto: 'Protobuf',
}

/** Extensions eligible for import parsing. */
const PARSEABLE_EXTENSIONS = new Set([
  'ts', 'tsx', 'js', 'jsx', 'mts', 'cts', 'mjs', 'cjs',
])

// ─── Config Detection ───────────────────────────────────────

const CONFIG_PATTERNS: RegExp[] = [
  /\.config\.[a-z]+$/,
  /^package\.json$/,
  /^tsconfig[^/]*\.json$/,
  /^\.eslintrc/,
  /^\.prettierrc/,
  /^Dockerfile$/,
  /^docker-compose/,
  /^\.env/,
  /^Makefile$/,
  /^Cargo\.toml$/,
  /^go\.mod$/,
  /^pyproject\.toml$/,
  /^setup\.py$/,
  /^requirements\.txt$/,
  /^Gemfile$/,
  /^\.github\//,
  /^\.gitlab-ci/,
  /^jest\.config/,
  /^vitest\.config/,
  /^webpack\.config/,
  /^rollup\.config/,
  /^babel\.config/,
  /^\.babelrc/,
  /^nx\.json$/,
  /^turbo\.json$/,
  /^lerna\.json$/,
]

/** Test file detection patterns. */
const TEST_PATTERNS: RegExp[] = [
  /\.test\.[a-z]+$/,
  /\.spec\.[a-z]+$/,
  /\.cy\.[a-z]+$/,
  /__tests__\//,
  /\/tests?\//,
]

/** Entry point file names (basename only). */
const ENTRY_POINT_NAMES = new Set([
  'index.ts', 'index.tsx', 'index.js', 'index.jsx',
  'main.ts', 'main.tsx', 'main.js', 'main.jsx',
  'app.ts', 'app.tsx', 'app.js', 'app.jsx',
  'App.ts', 'App.tsx', 'App.js', 'App.jsx',
  'server.ts', 'server.js',
  'cli.ts', 'cli.js',
  'mod.ts', 'mod.js',
])

// ─── Helpers ────────────────────────────────────────────────

function getExtension(filename: string): string {
  const dot = filename.lastIndexOf('.')
  return dot >= 0 ? filename.slice(dot + 1).toLowerCase() : ''
}

function getLanguage(filename: string): string | undefined {
  return EXTENSION_LANGUAGE_MAP[getExtension(filename)]
}

function isConfig(relativePath: string): boolean {
  const basename = relativePath.includes('/') ? relativePath.split('/').pop()! : relativePath
  return CONFIG_PATTERNS.some((p) => p.test(basename) || p.test(relativePath))
}

function isTest(relativePath: string): boolean {
  return TEST_PATTERNS.some((p) => p.test(relativePath))
}

function isEntryPoint(relativePath: string): boolean {
  const basename = relativePath.includes('/') ? relativePath.split('/').pop()! : relativePath
  return ENTRY_POINT_NAMES.has(basename)
}

function nodeType(relativePath: string): CodebaseNode['type'] {
  if (isConfig(relativePath)) return 'config'
  if (isTest(relativePath)) return 'test'
  if (isEntryPoint(relativePath)) return 'entrypoint'
  return 'file'
}

function computeComplexity(linesOfCode: number, importCount: number): CodebaseNode['complexity'] {
  if (linesOfCode >= 300 || importCount >= 15) return 'high'
  if (linesOfCode >= 100 || importCount >= 8) return 'medium'
  return 'low'
}

/**
 * Normalize a directory path separator to forward slashes.
 */
function normalizeSep(p: string): string {
  return p.replace(/\\/g, '/')
}

/**
 * Make a path relative to rootDir with forward slashes.
 */
function makeRelative(fullPath: string, rootDir: string): string {
  const normalFull = normalizeSep(fullPath)
  const normalRoot = normalizeSep(rootDir).replace(/\/$/, '')
  if (normalFull.startsWith(normalRoot + '/')) {
    return normalFull.slice(normalRoot.length + 1)
  }
  return normalFull
}

// ─── Import Parsing ─────────────────────────────────────────

/**
 * Parse TS/JS imports and re-exports from file content using regex.
 * Returns raw import specifiers (not yet resolved to absolute paths).
 */
function parseImports(content: string): { imports: string[]; exports: string[] } {
  const imports: string[] = []
  const exports: string[] = []

  // Match: import ... from '...'
  // Match: import '...'  (side-effect import)
  // Match: require('...')
  // Match: export ... from '...'
  const importFromRegex = /(?:import|export)\s+(?:[\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g
  const sideEffectImportRegex = /import\s+['"]([^'"]+)['"]/g
  const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g
  const exportFromRegex = /export\s+(?:\{[^}]*\}|\*)\s+from\s+['"]([^'"]+)['"]/g

  let match: RegExpExecArray | null

  // import/export ... from '...'
  while ((match = importFromRegex.exec(content)) !== null) {
    const specifier = match[1]
    if (specifier.startsWith('.')) {
      imports.push(specifier)
    }
  }

  // import '...'
  while ((match = sideEffectImportRegex.exec(content)) !== null) {
    const specifier = match[1]
    if (specifier.startsWith('.') && !imports.includes(specifier)) {
      imports.push(specifier)
    }
  }

  // require('...')
  while ((match = requireRegex.exec(content)) !== null) {
    const specifier = match[1]
    if (specifier.startsWith('.') && !imports.includes(specifier)) {
      imports.push(specifier)
    }
  }

  // export { ... } from '...' — track as both import and export
  while ((match = exportFromRegex.exec(content)) !== null) {
    const specifier = match[1]
    if (specifier.startsWith('.') && !imports.includes(specifier)) {
      imports.push(specifier)
    }
  }

  // Named exports: export const/function/class/type/interface/enum <name>
  const namedExportRegex = /export\s+(?:const|let|var|function|class|type|interface|enum|async\s+function)\s+([A-Za-z_$][\w$]*)/g
  while ((match = namedExportRegex.exec(content)) !== null) {
    exports.push(match[1])
  }

  // export default
  if (/export\s+default\s/.test(content)) {
    exports.push('default')
  }

  return { imports, exports }
}

/**
 * Resolve a relative import specifier to an absolute relative path.
 * E.g. if `sourceFile` = "src/components/Foo.tsx" and `specifier` = "../lib/utils",
 * we return "src/lib/utils" (without extension, matching will happen later).
 */
function resolveRelativeImport(sourceFile: string, specifier: string): string {
  const sourceDir = sourceFile.includes('/')
    ? sourceFile.slice(0, sourceFile.lastIndexOf('/'))
    : ''

  const parts = sourceDir ? sourceDir.split('/') : []
  const specParts = specifier.split('/')

  for (const seg of specParts) {
    if (seg === '..') {
      parts.pop()
    } else if (seg !== '.') {
      parts.push(seg)
    }
  }

  return parts.join('/')
}

/**
 * Try to match a resolved import path (without extension) to an actual file path
 * in the file set. Tries common extensions and /index patterns.
 */
function matchImportToFile(
  resolvedBase: string,
  fileSet: Set<string>,
): string | null {
  // Direct match (already has extension)
  if (fileSet.has(resolvedBase)) return resolvedBase

  // Try common extensions
  const extensions = ['ts', 'tsx', 'js', 'jsx', 'mts', 'cts', 'mjs', 'cjs']
  for (const ext of extensions) {
    const candidate = `${resolvedBase}.${ext}`
    if (fileSet.has(candidate)) return candidate
  }

  // Try /index.* pattern
  for (const ext of extensions) {
    const candidate = `${resolvedBase}/index.${ext}`
    if (fileSet.has(candidate)) return candidate
  }

  return null
}

// ─── File Discovery ─────────────────────────────────────────

interface DiscoveredFile {
  relativePath: string
  absolutePath: string
  size: number
  modifiedAt: number
  isDirectory: boolean
}

/**
 * Recursively discover files in the project using the IPC bridge.
 * Skips excluded directories, respects depth limit and file count cap.
 */
async function discoverFiles(
  rootDir: string,
  onProgress?: (stage: string, percent: number) => void,
): Promise<DiscoveredFile[]> {
  const results: DiscoveredFile[] = []
  const normalizedRoot = normalizeSep(rootDir)

  // BFS traversal to limit depth
  interface QueueItem { absPath: string; depth: number }
  const queue: QueueItem[] = [{ absPath: normalizedRoot, depth: 0 }]

  let directoriesScanned = 0

  while (queue.length > 0 && results.length < MAX_FILES) {
    // Process directories in batches to avoid overwhelming IPC
    const batch = queue.splice(0, Math.min(queue.length, 10))

    const batchResults = await Promise.all(
      batch.map(async ({ absPath, depth }) => {
        try {
          const entries = await window.ghostshell.fsReadDir(absPath)
          return { entries, absPath, depth }
        } catch {
          return { entries: [], absPath, depth }
        }
      }),
    )

    for (const { entries, depth } of batchResults) {
      for (const entry of entries) {
        if (results.length >= MAX_FILES) break

        const entryAbsPath = normalizeSep(entry.path ?? `${normalizeSep(rootDir)}/${entry.name}`)
        const relativePath = makeRelative(entryAbsPath, normalizedRoot)

        if (entry.isDirectory) {
          if (!SKIP_DIRS.has(entry.name) && depth < MAX_DEPTH) {
            queue.push({ absPath: entryAbsPath, depth: depth + 1 })
          }
        } else {
          results.push({
            relativePath,
            absolutePath: entryAbsPath,
            size: entry.size ?? 0,
            modifiedAt: entry.modifiedAt ?? 0,
            isDirectory: false,
          })
        }
      }

      directoriesScanned++
      if (onProgress && directoriesScanned % 5 === 0) {
        // Estimate progress based on queue draining
        const estimate = Math.min(90, Math.round((directoriesScanned / (directoriesScanned + queue.length)) * 30))
        onProgress('Scanning directories', estimate)
      }
    }
  }

  return results
}

// ─── Package.json Parsing ───────────────────────────────────

interface PackageJsonInfo {
  name: string
  main?: string
  scripts: Record<string, string>
  dependencies: string[]
  devDependencies: string[]
}

async function readPackageJson(rootDir: string): Promise<PackageJsonInfo | null> {
  try {
    const result = await window.ghostshell.fsReadFile(normalizeSep(rootDir) + '/package.json')
    if (!result.success || !result.content) return null

    const pkg = JSON.parse(result.content)
    return {
      name: typeof pkg.name === 'string' ? pkg.name : '',
      main: typeof pkg.main === 'string' ? pkg.main : undefined,
      scripts: typeof pkg.scripts === 'object' && pkg.scripts ? pkg.scripts : {},
      dependencies: typeof pkg.dependencies === 'object' && pkg.dependencies
        ? Object.keys(pkg.dependencies)
        : [],
      devDependencies: typeof pkg.devDependencies === 'object' && pkg.devDependencies
        ? Object.keys(pkg.devDependencies)
        : [],
    }
  } catch {
    return null
  }
}

// ─── Git Hotness ────────────────────────────────────────────

async function getGitHotness(rootDir: string): Promise<Record<string, number>> {
  try {
    if (!window.ghostshell.gitFileHotspots) return {}
    const rawCounts = await window.ghostshell.gitFileHotspots(rootDir)
    if (!rawCounts || typeof rawCounts !== 'object') return {}

    // Normalize to 0-100 scale
    const values = Object.values(rawCounts)
    if (values.length === 0) return {}

    let maxCount = 0
    for (const v of values) {
      if (v > maxCount) maxCount = v
    }
    if (maxCount === 0) return {}

    const normalized: Record<string, number> = {}
    for (const [file, count] of Object.entries(rawCounts)) {
      normalized[normalizeSep(file)] = Math.round((count / maxCount) * 100)
    }
    return normalized
  } catch {
    return {}
  }
}

// ─── Main Analyzer ──────────────────────────────────────────

export async function analyzeCodebase(
  rootDir: string,
  onProgress?: (stage: string, percent: number) => void,
): Promise<CodebaseMap> {
  const normalizedRoot = normalizeSep(rootDir)
  const progress = onProgress ?? (() => {})

  // ── Step 1: File Discovery ──
  progress('Scanning files', 0)
  const discoveredFiles = await discoverFiles(normalizedRoot, onProgress)
  progress('Scanning files', 30)

  // ── Step 2: Read package.json ──
  const pkgInfo = await readPackageJson(normalizedRoot)
  const projectName = pkgInfo?.name || normalizedRoot.split('/').pop() || 'project'

  // ── Step 3: Git Hotness ──
  progress('Analyzing git history', 35)
  const gitHotness = await getGitHotness(normalizedRoot)
  progress('Analyzing git history', 40)

  // ── Step 4: Build file set for import resolution ──
  const fileSet = new Set<string>(discoveredFiles.map((f) => f.relativePath))

  // ── Step 5: Determine entry points from package.json ──
  const pkgEntryPoints: string[] = []
  if (pkgInfo?.main) {
    const mainNorm = normalizeSep(pkgInfo.main)
    if (fileSet.has(mainNorm)) pkgEntryPoints.push(mainNorm)
  }
  // Check common script targets
  const scriptEntries = Object.values(pkgInfo?.scripts ?? {})
  for (const script of scriptEntries) {
    // Extract file references like "ts-node src/index.ts" or "node dist/main.js"
    const fileMatch = script.match(/(?:ts-node|node|tsx)\s+([\w./\\-]+\.\w+)/)
    if (fileMatch) {
      const candidate = normalizeSep(fileMatch[1])
      if (fileSet.has(candidate)) pkgEntryPoints.push(candidate)
    }
  }

  // ── Step 6: Parse files for imports ──
  progress('Parsing imports', 45)

  // Identify files that need parsing
  const parseableFiles = discoveredFiles.filter(
    (f) => PARSEABLE_EXTENSIONS.has(getExtension(f.relativePath)) && f.size <= MAX_PARSE_SIZE,
  )

  // Read files in batches
  const parsedData = new Map<string, { imports: string[]; exports: string[]; lineCount: number }>()

  for (let i = 0; i < parseableFiles.length; i += READ_BATCH_SIZE) {
    const batch = parseableFiles.slice(i, i + READ_BATCH_SIZE)

    const results = await Promise.all(
      batch.map(async (file) => {
        try {
          const result = await window.ghostshell.fsReadFile(file.absolutePath)
          if (!result.success || !result.content) return null

          const { imports, exports } = parseImports(result.content)
          const lineCount = result.content.split('\n').length

          return { relativePath: file.relativePath, imports, exports, lineCount }
        } catch {
          return null
        }
      }),
    )

    for (const res of results) {
      if (res) {
        parsedData.set(res.relativePath, {
          imports: res.imports,
          exports: res.exports,
          lineCount: res.lineCount,
        })
      }
    }

    const pct = 45 + Math.round(((i + batch.length) / parseableFiles.length) * 30)
    progress('Parsing imports', Math.min(pct, 75))
  }

  // For non-parsed files, estimate line count from file size (rough: 40 bytes per line)
  function estimateLines(size: number): number {
    return Math.max(1, Math.round(size / 40))
  }

  // ── Step 7: Build Nodes ──
  progress('Building graph', 78)

  const nodes: CodebaseNode[] = []
  const edges: CodebaseEdge[] = []
  const languageCounts: Record<string, number> = {}
  const testFiles: string[] = []
  const configFiles: string[] = []
  const entryPoints: string[] = [...pkgEntryPoints]
  let totalLines = 0

  for (const file of discoveredFiles) {
    const { relativePath } = file
    const language = getLanguage(relativePath)
    const parsed = parsedData.get(relativePath)
    const lineCount = parsed?.lineCount ?? estimateLines(file.size)
    const type = nodeType(relativePath)

    // Track entry points from file name detection
    if (type === 'entrypoint' && !entryPoints.includes(relativePath)) {
      entryPoints.push(relativePath)
    }

    // Track categories
    if (type === 'test') testFiles.push(relativePath)
    if (type === 'config') configFiles.push(relativePath)

    // Count languages
    if (language) {
      languageCounts[language] = (languageCounts[language] || 0) + 1
    }

    totalLines += lineCount

    // Resolve imports to actual files
    const resolvedImports: string[] = []
    if (parsed) {
      for (const raw of parsed.imports) {
        const resolved = resolveRelativeImport(relativePath, raw)
        const matched = matchImportToFile(resolved, fileSet)
        if (matched) {
          resolvedImports.push(matched)
        }
      }
    }

    const hotness = gitHotness[relativePath] ?? gitHotness[normalizeSep(relativePath)] ?? 0

    nodes.push({
      path: relativePath,
      type,
      language,
      imports: resolvedImports,
      importedBy: [], // filled in next step
      exports: parsed?.exports ?? [],
      linesOfCode: lineCount,
      lastModified: file.modifiedAt,
      gitHotness: hotness,
      complexity: computeComplexity(lineCount, resolvedImports.length),
    })
  }

  // ── Step 8: Build Edges + Reverse Deps ──
  progress('Resolving dependencies', 82)

  const nodeByPath = new Map<string, CodebaseNode>()
  for (const node of nodes) {
    nodeByPath.set(node.path, node)
  }

  for (const node of nodes) {
    for (const imp of node.imports) {
      edges.push({ from: node.path, to: imp, type: 'import' })
      const target = nodeByPath.get(imp)
      if (target) {
        target.importedBy.push(node.path)
      }
    }

    // Test-for edges: if a test file has the same base name as a source file
    if (node.type === 'test') {
      const baseName = node.path
        .replace(/\.(test|spec|cy)\.[a-z]+$/, '')
      // Find the matching source file
      for (const ext of ['ts', 'tsx', 'js', 'jsx']) {
        const candidate = `${baseName}.${ext}`
        if (nodeByPath.has(candidate) && candidate !== node.path) {
          edges.push({ from: node.path, to: candidate, type: 'test-for' })
          break
        }
      }
    }
  }

  // ── Step 9: Module Clustering ──
  progress('Clustering modules', 88)

  const modules = buildModules(nodes)

  // ── Step 10: Compute hotspots ──
  const hotspots = [...nodes]
    .filter((n) => n.gitHotness > 0)
    .sort((a, b) => b.gitHotness - a.gitHotness)
    .slice(0, 10)
    .map((n) => n.path)

  progress('Complete', 100)

  return {
    version: 1,
    projectName,
    rootDir: normalizedRoot,
    generatedAt: new Date().toISOString(),
    summary: {
      totalFiles: nodes.length,
      totalLines,
      languages: languageCounts,
      entryPoints,
      testFiles,
      configFiles,
      hotspots,
    },
    nodes,
    edges,
    modules,
  }
}

// ─── Module Clustering ──────────────────────────────────────

/**
 * Group files by top-level directory under `src/` (or project root).
 * A directory becomes a "module" if it contains 3+ files.
 */
function buildModules(nodes: CodebaseNode[]): CodebaseModule[] {
  const dirGroups = new Map<string, string[]>()

  for (const node of nodes) {
    if (node.type === 'directory') continue
    const parts = node.path.split('/')

    let moduleDir: string
    if (parts[0] === 'src' && parts.length > 2) {
      // Group by src/<subdir>
      moduleDir = `src/${parts[1]}`
    } else if (parts.length > 1) {
      // Group by top-level directory
      moduleDir = parts[0]
    } else {
      // Root-level file
      moduleDir = '.'
    }

    if (!dirGroups.has(moduleDir)) {
      dirGroups.set(moduleDir, [])
    }
    dirGroups.get(moduleDir)!.push(node.path)
  }

  const modules: CodebaseModule[] = []

  for (const [dir, files] of dirGroups) {
    if (files.length < 3) continue

    // Determine primary language
    const langCount: Record<string, number> = {}
    for (const file of files) {
      const lang = getLanguage(file)
      if (lang) langCount[lang] = (langCount[lang] || 0) + 1
    }

    let primaryLang = 'mixed'
    let maxCount = 0
    for (const [lang, count] of Object.entries(langCount)) {
      if (count > maxCount) {
        maxCount = count
        primaryLang = lang
      }
    }

    const name = dir === '.' ? 'root' : dir.replace(/\//g, '-')

    modules.push({
      name,
      directory: dir,
      files,
      description: `${files.length} files, primary language: ${primaryLang}`,
    })
  }

  // Sort by file count descending
  modules.sort((a, b) => b.files.length - a.files.length)

  return modules
}

// ─── Context Generator ──────────────────────────────────────

/**
 * Generate a concise markdown summary (under 2000 chars) for embedding
 * in swarm agent system prompts as codebase context.
 */
export function generateCodebaseContext(map: CodebaseMap): string {
  const { summary, modules, projectName } = map

  // Tech stack from languages
  const langEntries = Object.entries(summary.languages)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
  const techStack = langEntries.map(([lang, count]) => `${lang} (${count})`).join(', ')

  // Top modules
  const topModules = modules.slice(0, 8)
  const moduleLines = topModules
    .map((m) => `- **${m.name}/** — ${m.description}`)
    .join('\n')

  // Entry points (max 5)
  const entries = summary.entryPoints.slice(0, 5)
  const entryLines = entries.length > 0
    ? entries.map((e) => `- \`${e}\``).join('\n')
    : '- (none detected)'

  // Hotspots (max 5)
  const hotspotLines = summary.hotspots.slice(0, 5)
    .map((h) => `- \`${h}\``)
    .join('\n')

  // Config files (max 5)
  const configLines = summary.configFiles.slice(0, 5)
    .map((c) => `- \`${c}\``)
    .join('\n')

  const lines = [
    `## Codebase Map: ${projectName}`,
    '',
    `**Files:** ${summary.totalFiles} | **Lines:** ${summary.totalLines.toLocaleString()} | **Tests:** ${summary.testFiles.length}`,
    `**Tech Stack:** ${techStack}`,
    '',
    '### Modules',
    moduleLines || '- (no modules detected)',
    '',
    '### Entry Points',
    entryLines,
    '',
    '### Recently Active Files (Git Hotspots)',
    hotspotLines || '- (no git history available)',
    '',
    '### Key Config Files',
    configLines || '- (none detected)',
  ]

  let result = lines.join('\n')

  // Truncate to stay under 2000 chars
  if (result.length > 1950) {
    result = result.slice(0, 1950) + '\n...(truncated)'
  }

  return result
}
