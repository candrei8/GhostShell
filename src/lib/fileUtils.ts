// ─── File Utilities ─── Single source of truth for all file components ───

export const EXTENSION_COLORS: Record<string, string> = {
  // TypeScript / JavaScript
  ts: '#3178c6',
  tsx: '#3178c6',
  js: '#f7df1e',
  jsx: '#f7df1e',
  mjs: '#f7df1e',
  cjs: '#f7df1e',
  // Web
  html: '#e34c26',
  css: '#264de4',
  scss: '#cf649a',
  less: '#1d365d',
  svg: '#ffb13b',
  // Data
  json: '#6d9b37',
  yaml: '#cb171e',
  yml: '#cb171e',
  toml: '#9c4221',
  xml: '#e34c26',
  csv: '#217346',
  // Config
  env: '#ecd53f',
  lock: '#6b7280',
  gitignore: '#f05032',
  // Languages
  py: '#3776ab',
  rs: '#dea584',
  go: '#00add8',
  rb: '#cc342d',
  java: '#b07219',
  kt: '#a97bff',
  swift: '#f05138',
  c: '#555555',
  cpp: '#f34b7d',
  h: '#555555',
  cs: '#178600',
  php: '#4f5d95',
  lua: '#000080',
  // Shell
  sh: '#89e051',
  bash: '#89e051',
  zsh: '#89e051',
  ps1: '#012456',
  bat: '#c1f12e',
  cmd: '#c1f12e',
  // Docs
  md: '#755838',
  mdx: '#755838',
  txt: '#6b7280',
  // Images
  png: '#a855f7',
  jpg: '#a855f7',
  jpeg: '#a855f7',
  gif: '#a855f7',
  webp: '#a855f7',
  ico: '#a855f7',
  // Other
  sql: '#e38c00',
  graphql: '#e535ab',
  gql: '#e535ab',
  dockerfile: '#384d54',
  vue: '#41b883',
  svelte: '#ff3e00',
}

const TEXT_EXTENSIONS = new Set([
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs',
  'html', 'css', 'scss', 'less', 'svg',
  'json', 'yaml', 'yml', 'toml', 'xml', 'csv',
  'env', 'gitignore', 'editorconfig',
  'py', 'rs', 'go', 'rb', 'java', 'kt', 'swift', 'c', 'cpp', 'h', 'cs', 'php', 'lua',
  'sh', 'bash', 'zsh', 'ps1', 'bat', 'cmd',
  'md', 'mdx', 'txt', 'log', 'ini', 'cfg', 'conf',
  'sql', 'graphql', 'gql',
  'dockerfile', 'vue', 'svelte',
  'makefile', 'cmake',
])

const MARKDOWN_EXTENSIONS = new Set(['md', 'mdx', 'markdown'])
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp'])
const JSON_EXTENSIONS = new Set(['json'])
const YAML_EXTENSIONS = new Set(['yaml', 'yml'])

function getExtension(filename: string): string | null {
  const lower = filename.toLowerCase()
  if (lower.startsWith('.')) {
    const name = lower.slice(1)
    if (TEXT_EXTENSIONS.has(name)) return name
  }

  const ext = lower.split('.').pop()
  if (!ext || ext === lower) return null
  return ext
}

export function getExtensionColor(filename: string): string | null {
  const ext = getExtension(filename)
  if (!ext) return null
  return EXTENSION_COLORS[ext] || null
}

export function getExtensionLabel(filename: string): string | null {
  const ext = getExtension(filename)
  if (!ext || ext === filename.toLowerCase()) return null
  return ext
}

export function formatFileSize(bytes?: number): string {
  if (bytes === undefined || bytes === null) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

export function copyToClipboard(text: string): Promise<void> {
  return navigator.clipboard.writeText(text).catch(() => {
    // Fallback for older Electron versions
    const el = document.createElement('textarea')
    el.value = text
    el.style.cssText = 'position:fixed;opacity:0;pointer-events:none'
    document.body.appendChild(el)
    el.select()
    document.execCommand('copy')
    document.body.removeChild(el)
  })
}

export function isTextFile(filename: string): boolean {
  const lower = filename.toLowerCase()
  const ext = getExtension(filename)
  const knownTextFiles = ['makefile', 'dockerfile', 'rakefile', 'gemfile', 'procfile', 'license', 'readme']
  if (knownTextFiles.includes(lower)) return true
  if (!ext) return false
  return TEXT_EXTENSIONS.has(ext)
}

export function isMarkdownFile(filename: string): boolean {
  const ext = getExtension(filename)
  return ext ? MARKDOWN_EXTENSIONS.has(ext) : false
}

export function isImageFile(filename: string): boolean {
  const ext = getExtension(filename)
  return ext ? IMAGE_EXTENSIONS.has(ext) : false
}

export function isJsonFile(filename: string): boolean {
  const ext = getExtension(filename)
  return ext ? JSON_EXTENSIONS.has(ext) : false
}

export function isYamlFile(filename: string): boolean {
  const ext = getExtension(filename)
  return ext ? YAML_EXTENSIONS.has(ext) : false
}

export function isStructuredDataFile(filename: string): boolean {
  return isJsonFile(filename) || isYamlFile(filename)
}

export function toLocalFileUrl(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  const withDrivePrefix = /^[A-Za-z]:\//.test(normalized) ? `/${normalized}` : normalized
  return encodeURI(`file://${withDrivePrefix}`)
}

export function getRelativeTime(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo ago`
  return `${Math.floor(months / 12)}y ago`
}

/** Git status code to display info */
export function getGitStatusInfo(code: string): { label: string; color: string } | null {
  switch (code) {
    case 'M': return { label: 'M', color: '#facc15' } // yellow - modified
    case 'A': return { label: 'A', color: '#4ade80' } // green - added
    case 'D': return { label: 'D', color: '#f87171' } // red - deleted
    case '?': return { label: 'U', color: '#9ca3af' } // gray - untracked
    case 'R': return { label: 'R', color: '#60a5fa' } // blue - renamed
    case 'C': return { label: 'C', color: '#c084fc' } // purple - copied
    default: return null
  }
}
