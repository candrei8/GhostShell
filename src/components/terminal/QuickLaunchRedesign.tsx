import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  FolderOpen,
  Minus,
  Plus,
  Terminal,
  Zap,
  Shield,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  X,
  Settings,
  Orbit,
  TerminalSquare,
  BrainCircuit,
  Save,
} from 'lucide-react'
import { useAgent } from '../../hooks/useAgent'
import { getGhostshellApi, selectDirectorySafe } from '../../lib/ghostshell'
import { getDefaultModel, getProviderColor, getProviderLabel } from '../../lib/providers'
import {
  type ClaudeConfig,
  type CodexConfig,
  type GeminiConfig,
  type GridLayout,
  type LaunchPreset,
  type Provider,
} from '../../lib/types'
import { useAgentStore } from '../../stores/agentStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useTerminalStore } from '../../stores/terminalStore'
import { useWorkspaceStore } from '../../stores/workspaceStore'

// ─── Constants ───────────────────────────────────────────────

const ACCENT = '#38bdf8' // sky-400

interface QuickLaunchProps {
  onLaunched: () => void
  sessionId?: string // If provided, update this session instead of creating new ones
}

const LAYOUTS: { layout: GridLayout; count: number; cols: number; rows: number }[] = [
  { layout: '1x1', count: 1, cols: 1, rows: 1 },
  { layout: '1x2', count: 2, cols: 2, rows: 1 },
  { layout: '2x2', count: 4, cols: 2, rows: 2 },
  { layout: '3x2', count: 6, cols: 3, rows: 2 },
  { layout: '4x2', count: 8, cols: 4, rows: 2 },
  { layout: '5x2', count: 10, cols: 5, rows: 2 },
  { layout: '4x3', count: 12, cols: 4, rows: 3 },
  { layout: '5x3', count: 14, cols: 5, rows: 3 },
  { layout: '4x4', count: 16, cols: 4, rows: 4 },
]

const PROVIDERS: { id: Provider; label: string }[] = [
  { id: 'claude', label: 'Claude' },
  { id: 'codex', label: 'Codex' },
  { id: 'gemini', label: 'Gemini' },
]

// ─── Layout Dots ─────────────────────────────────────────────

function LayoutDots({ cols, rows, active }: { cols: number; rows: number; active: boolean }) {
  const dotSize = 6
  const gap = 3

  return (
    <svg
      width={cols * dotSize + (cols - 1) * gap}
      height={rows * dotSize + (rows - 1) * gap}
      aria-hidden="true"
    >
      {Array.from({ length: cols * rows }, (_, i) => {
        const row = Math.floor(i / cols)
        const col = i % cols
        return (
          <rect
            key={i}
            x={col * (dotSize + gap)}
            y={row * (dotSize + gap)}
            width={dotSize}
            height={dotSize}
            rx={2}
            fill={active ? 'currentColor' : '#475569'}
          />
        )
      })}
    </svg>
  )
}

// ─── Helpers ─────────────────────────────────────────────────

function getFolderName(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/').filter(Boolean)
  return parts[parts.length - 1] || path
}

/** Resolve a terminal-style path input using Node IPC (preferred) or renderer fallback */
async function resolveInputPath(
  input: string,
  basePath: string,
  homeDir: string,
): Promise<{ success: boolean; path?: string; error?: string }> {
  const api = getGhostshellApi()
  if (!api) return { success: false, error: 'API not available' }

  // 1) Try the Node.js IPC handler (available after full Electron restart)
  if (api.shellResolvePath) {
    try {
      const result = await api.shellResolvePath(input, basePath || homeDir)
      if (result.success && result.path) return result
      if (result.error) return result
    } catch { /* fall through to renderer fallback */ }
  }

  // 2) Renderer-side fallback using fsReadDir for validation
  let p = input.trim()
  if (p.toLowerCase().startsWith('cd ')) p = p.slice(3).trim()
  if (!p) return { success: false, error: 'Empty path' }

  // Resolve ~
  if (p === '~') {
    if (!homeDir) return { success: false, error: 'Home directory unknown — use an absolute path' }
    p = homeDir
  } else if (p.startsWith('~/') || p.startsWith('~\\')) {
    if (!homeDir) return { success: false, error: 'Home directory unknown — use an absolute path' }
    p = homeDir + '/' + p.slice(2)
  }

  // Resolve relative paths against base
  if (!p.startsWith('/') && !/^[A-Z]:[/\\]/.test(p)) {
    const base = basePath || homeDir || '/'
    p = base + '/' + p
  }

  // Normalize: resolve .. and .
  const segments = p.replace(/\\/g, '/').split('/')
  const resolved: string[] = []
  for (const seg of segments) {
    if (seg === '..') { if (resolved.length > 0) resolved.pop() }
    else if (seg !== '.' && seg !== '') resolved.push(seg)
  }
  const finalPath = '/' + resolved.join('/')

  // Validate the directory actually exists
  try {
    // Prefer fs.stat-based check (accurate, available after full restart)
    if (api.fsIsDirectory) {
      const exists = await api.fsIsDirectory(finalPath)
      return exists
        ? { success: true, path: finalPath }
        : { success: false, error: 'Directory not found' }
    }

    // Fallback: list the PARENT dir and look for our target as a directory entry.
    // This works because fsReadDir returns [] on error (can't distinguish empty vs
    // non-existent) but listing the parent and searching for the child is reliable.
    const lastSlash = finalPath.lastIndexOf('/')
    const parentDir = lastSlash > 0 ? finalPath.slice(0, lastSlash) : '/'
    const dirName = finalPath.slice(lastSlash + 1)

    // Root path "/" — always valid
    if (!dirName) return { success: true, path: finalPath }

    const entries = await api.fsReadDir(parentDir)
    if (Array.isArray(entries)) {
      const found = entries.some(
        (e: { name: string; isDirectory: boolean }) => e.name === dirName && e.isDirectory,
      )
      return found
        ? { success: true, path: finalPath }
        : { success: false, error: 'Directory not found' }
    }
    return { success: false, error: 'Directory not found' }
  } catch {
    return { success: false, error: 'Directory not found' }
  }
}


// ─── Step Indicator ──────────────────────────────────────────

function StepBar({ step }: { step: 1 | 2 }) {
  return (
    <div className="flex items-center justify-center absolute left-1/2 -translate-x-1/2 top-[60px]">
      <div className="flex items-center">
        <div className={`flex h-8 items-center justify-center rounded-full px-5 text-[11px] font-bold tracking-[0.15em] uppercase transition-all ${step >= 1 ? 'border border-[#38bdf8]/40 bg-[#38bdf8]/10 text-[#38bdf8]' : 'text-white/40 border border-white/10 bg-white/[0.02]'}`}>
          <span className="mr-2 opacity-50 font-normal">1</span> LAYOUT
        </div>
        <div className={`h-px w-8 transition-all duration-500 mx-2 ${step >= 2 ? 'bg-[#38bdf8]/40' : 'bg-white/10'}`} />
        <div className={`flex h-8 items-center justify-center rounded-full px-5 text-[11px] font-bold tracking-[0.15em] uppercase transition-all ${step >= 2 ? 'border border-[#38bdf8]/40 bg-[#38bdf8]/10 text-[#38bdf8]' : 'text-white/40 border border-white/10 bg-white/[0.02]'}`}>
          <span className="mr-2 opacity-50 font-normal">2</span> AGENTS
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────

export function QuickLaunch({ onLaunched, sessionId }: QuickLaunchProps) {
  const defaultModel = useSettingsStore((s) => s.defaultModel)
  const defaultGeminiModel = useSettingsStore((s) => s.defaultGeminiModel)
  const defaultCodexModel = useSettingsStore((s) => s.defaultCodexModel)
  const defaultSkipPermissions = useSettingsStore((s) => s.defaultSkipPermissions)
  const lastAgentFolder = useSettingsStore((s) => s.lastAgentFolder)
  const setLastAgentFolder = useSettingsStore((s) => s.setLastAgentFolder)

  const currentPath = useWorkspaceStore((s) => s.currentPath)
  const setCurrentPath = useWorkspaceStore((s) => s.setCurrentPath)

  const { createAgent } = useAgent()

  // ── State ──────────────────────────────────────────────────

  const [step, setStep] = useState<1 | 2>(1)
  const [projectPath, setProjectPath] = useState(
    typeof lastAgentFolder === 'string' ? lastAgentFolder : '',
  )
  const [gridLayout, setGridLayout] = useState<GridLayout>('1x1')
  const [yolo, setYolo] = useState(Boolean(defaultSkipPermissions))
  const [providerCounts, setProviderCounts] = useState<Record<Provider, number>>({
    claude: 0, codex: 0, gemini: 0,
  })
  const [launching, setLaunching] = useState(false)
  const [cmdInput, setCmdInput] = useState('')
  const [cmdError, setCmdError] = useState('')
  const [cmdResolving, setCmdResolving] = useState(false)
  const [showSavePreset, setShowSavePreset] = useState(false)
  const [presetName, setPresetName] = useState('')
  const [pathSuccess, setPathSuccess] = useState(false)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [suggestIdx, setSuggestIdx] = useState(0)
  const suggestTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const launchPresets = useSettingsStore((s) => s.launchPresets)
  const addLaunchPreset = useSettingsStore((s) => s.addLaunchPreset)
  const removeLaunchPreset = useSettingsStore((s) => s.removeLaunchPreset)

  const rootRef = useRef<HTMLDivElement>(null)
  const skipCountResetRef = useRef(false)
  const cmdInputRef = useRef<HTMLInputElement>(null)

  const [homeDir, setHomeDir] = useState('')

  // Detect real home directory (IPC preferred, filesystem probe as fallback)
  useEffect(() => {
    const detect = async () => {
      const api = getGhostshellApi()

      // 1) Try IPC (works after full Electron restart)
      try {
        const dir = await api?.shellGetHomedir?.()
        if (dir) { setHomeDir(dir); return }
      } catch { /* not available yet */ }

      // 2) Infer from known paths
      for (const candidate of [lastAgentFolder, currentPath]) {
        if (typeof candidate === 'string') {
          const m = candidate.match(/^(\/Users\/[^/]+|\/home\/[^/]+)/)
          if (m) { setHomeDir(m[1]); return }
        }
      }

      // 3) Probe the filesystem — macOS: list /Users, pick the non-system dir
      try {
        const entries = await api?.fsReadDir?.('/Users')
        if (Array.isArray(entries)) {
          const skip = new Set(['Shared', '.localized', 'Guest'])
          const homes = entries.filter(
            (e: { name: string; isDirectory: boolean }) => e.isDirectory && !skip.has(e.name),
          )
          if (homes.length === 1) { setHomeDir(`/Users/${homes[0].name}`); return }
        }
      } catch { /* not macOS or not available */ }

      // 4) Probe Linux
      try {
        const entries = await api?.fsReadDir?.('/home')
        if (Array.isArray(entries)) {
          const homes = entries.filter(
            (e: { name: string; isDirectory: boolean }) => e.isDirectory,
          )
          if (homes.length === 1) { setHomeDir(`/home/${homes[0].name}`); return }
        }
      } catch { /* not available */ }
    }
    detect()
  }, [lastAgentFolder, currentPath])

  const resolvedPath =
    (typeof projectPath === 'string' && projectPath) ||
    (typeof currentPath === 'string' && currentPath && !/^[A-Z]:\\/.test(currentPath) ? currentPath : '') ||
    homeDir
  const folderName = resolvedPath ? getFolderName(resolvedPath) : ''
  const layoutOption = LAYOUTS.find((l) => l.layout === gridLayout) || LAYOUTS[0]
  const slotCount = layoutOption.count
  const canBrowse = Boolean(getGhostshellApi()?.selectDirectory)

  const totalAssigned = providerCounts.claude + providerCounts.codex + providerCounts.gemini

  // Reset counts when layout changes (skip when loading a preset)
  useEffect(() => {
    if (skipCountResetRef.current) {
      skipCountResetRef.current = false
      return
    }
    setProviderCounts({ claude: 0, codex: 0, gemini: 0 })
  }, [slotCount])

  useEffect(() => {
    rootRef.current?.focus()
  }, [])

  // Autocomplete: debounced directory listing as the user types
  useEffect(() => {
    if (suggestTimerRef.current) clearTimeout(suggestTimerRef.current)

    const raw = cmdInput.trim()
    if (!raw) { setSuggestions([]); return }

    suggestTimerRef.current = setTimeout(async () => {
      try {
        const api = getGhostshellApi()
        if (!api?.fsReadDir) return

        // Parse the typed text to find parent dir + partial name
        let typed = raw
        if (typed.toLowerCase().startsWith('cd ')) typed = typed.slice(3).trim()
        if (!typed) { setSuggestions([]); return }

        // Expand ~
        if (typed === '~' || typed.startsWith('~/') || typed.startsWith('~\\')) {
          typed = homeDir ? homeDir + typed.slice(1) : typed
        }

        // Make absolute
        if (!typed.startsWith('/') && !/^[A-Z]:[/\\]/.test(typed)) {
          typed = (resolvedPath || homeDir || '/') + '/' + typed
        }

        // Normalize ..
        const segs = typed.replace(/\\/g, '/').split('/')
        const norm: string[] = []
        for (const s of segs) {
          if (s === '..') { if (norm.length > 0) norm.pop() }
          else if (s !== '.') norm.push(s)
        }

        // If last char is '/' → list that dir, partial is empty
        // Otherwise → list parent dir, partial is the last segment
        const endsWithSlash = typed.endsWith('/') || typed.endsWith('\\')
        const parentDir = endsWithSlash
          ? '/' + norm.filter(Boolean).join('/')
          : '/' + norm.filter(Boolean).slice(0, -1).join('/')
        const partial = endsWithSlash ? '' : (norm[norm.length - 1] || '')

        const entries = await api.fsReadDir(parentDir || '/')
        if (!Array.isArray(entries)) { setSuggestions([]); return }

        const dirs = entries
          .filter((e: { name: string; isDirectory: boolean }) => {
            if (!e.isDirectory) return false
            if (e.name.startsWith('.')) return false
            if (!partial) return true
            return e.name.toLowerCase().startsWith(partial.toLowerCase())
          })
          .map((e: { name: string }) => e.name)
          .sort((a: string, b: string) => a.localeCompare(b))
          .slice(0, 6)

        // Don't show if the only match equals what was already typed
        if (dirs.length === 1 && dirs[0].toLowerCase() === partial.toLowerCase()) {
          setSuggestions([])
        } else {
          setSuggestions(dirs)
          setSuggestIdx(0)
        }
      } catch {
        setSuggestions([])
      }
    }, 120)

    return () => { if (suggestTimerRef.current) clearTimeout(suggestTimerRef.current) }
  }, [cmdInput, resolvedPath, homeDir])

  // Apply a tab-completion suggestion to the input
  const applySuggestion = useCallback((name: string) => {
    let raw = cmdInput.trim()
    const prefix = raw.toLowerCase().startsWith('cd ') ? 'cd ' : ''
    if (prefix) raw = raw.slice(3).trim()

    // Replace the last segment with the completed name
    const hasTrailingSlash = raw.endsWith('/') || raw.endsWith('\\')
    if (hasTrailingSlash) {
      setCmdInput(prefix + raw + name + '/')
    } else {
      const lastSlash = Math.max(raw.lastIndexOf('/'), raw.lastIndexOf('\\'))
      const before = lastSlash >= 0 ? raw.slice(0, lastSlash + 1) : ''
      setCmdInput(prefix + before + name + '/')
    }
    setSuggestions([])
    cmdInputRef.current?.focus()
  }, [cmdInput])

  // ── Helpers ────────────────────────────────────────────────

  const resolveModel = (p: Provider): string => {
    if (p === 'gemini') return defaultGeminiModel || getDefaultModel('gemini')
    if (p === 'codex') return defaultCodexModel || getDefaultModel('codex')
    return defaultModel || getDefaultModel('claude')
  }

  const getAvatar = (p: Provider) => ({
    id: `quick-${p}`,
    name: getProviderLabel(p),
    icon: p === 'gemini' ? 'Orbit' : p === 'codex' ? 'TerminalSquare' : 'BrainCircuit',
    color: getProviderColor(p),
  })

  const handleBrowse = async () => {
    if (!canBrowse) return
    try {
      const path = await selectDirectorySafe()
      if (!path) return
      setProjectPath(path)
      setCurrentPath(path)
      setLastAgentFolder(path)
    } catch {
      // cancelled
    }
  }

  const handleTerminalCommand = async () => {
    if (!cmdInput.trim() || cmdResolving) return
    setCmdError('')
    setCmdResolving(true)
    try {
      const result = await resolveInputPath(cmdInput, resolvedPath, homeDir)
      if (result.success && result.path) {
        setProjectPath(result.path)
        setCurrentPath(result.path)
        setLastAgentFolder(result.path)
        setCmdInput('')
        setCmdError('')
        // Green flash on the browse bar
        setPathSuccess(true)
        setTimeout(() => setPathSuccess(false), 1200)
      } else {
        setCmdError(result.error || 'Directory not found')
      }
    } catch {
      setCmdError('Directory not found')
    } finally {
      setCmdResolving(false)
    }
  }

  const loadPreset = (preset: LaunchPreset) => {
    skipCountResetRef.current = true
    setProjectPath(preset.path)
    setCurrentPath(preset.path)
    setLastAgentFolder(preset.path)
    setGridLayout(preset.layout)
    setYolo(preset.yolo)
    setProviderCounts(preset.providerCounts as Record<Provider, number>)
  }

  const handleSavePreset = () => {
    if (!presetName.trim()) return
    addLaunchPreset({
      id: `preset-${Date.now()}`,
      name: presetName.trim(),
      path: resolvedPath,
      layout: gridLayout,
      providerCounts: { ...providerCounts },
      yolo,
      createdAt: Date.now(),
    })
    setPresetName('')
    setShowSavePreset(false)
  }

  const handleLaunchTerminal = () => {
    if (sessionId) {
      // Update existing session to be a plain terminal
      useTerminalStore.getState().updateSession(sessionId, {
        title: 'Terminal',
        cwd: resolvedPath,
        showQuickLaunch: false,
      })
    } else {
      // Create new terminal session
      useTerminalStore.getState().addSession({
        id: `term-standalone-${Date.now()}`,
        title: 'Terminal',
        cwd: resolvedPath,
      })
    }
    onLaunched()
  }

  const increment = useCallback((p: Provider) => {
    setProviderCounts((prev) => {
      const total = prev.claude + prev.codex + prev.gemini
      if (total >= slotCount) return prev
      return { ...prev, [p]: prev[p] + 1 }
    })
  }, [slotCount])

  const decrement = useCallback((p: Provider) => {
    setProviderCounts((prev) => {
      if (prev[p] <= 0) return prev
      return { ...prev, [p]: prev[p] - 1 }
    })
  }, [])

  const fillAll = useCallback((p: Provider) => {
    setProviderCounts({ claude: 0, codex: 0, gemini: 0, [p]: slotCount })
  }, [slotCount])

  const handleLaunch = () => {
    if (launching || totalAssigned !== slotCount) return
    setLaunching(true)

    try {
      const cwd = resolvedPath || undefined
      if (cwd) setLastAgentFolder(cwd)
      const sessionIds: string[] = []
      let firstAgentId: string | undefined

      for (const { id: p } of PROVIDERS) {
        const count = providerCounts[p]
        for (let i = 0; i < count; i++) {
          const label = getProviderLabel(p)
          const name = slotCount === 1 ? label : count === 1 ? label : `${label} ${i + 1}`
          const avatar = getAvatar(p)
          const model = resolveModel(p)

          let result: ReturnType<typeof createAgent>
          if (p === 'gemini') {
            const geminiConfig: GeminiConfig = { model, yolo }
            result = createAgent(name, avatar, avatar.color, {}, cwd, undefined, undefined, true, 'gemini', geminiConfig)
          } else if (p === 'codex') {
            const codexConfig: CodexConfig = { model, fullAuto: yolo, sandbox: 'workspace-write' }
            result = createAgent(name, avatar, avatar.color, {}, cwd, undefined, undefined, true, 'codex', undefined, codexConfig)
          } else {
            const claudeConfig: ClaudeConfig = { dangerouslySkipPermissions: yolo }
            result = createAgent(name, avatar, avatar.color, claudeConfig, cwd, undefined, undefined, true, 'claude')
          }

          if (!firstAgentId) firstAgentId = result.agent.id
          sessionIds.push(result.sessionId)
        }
      }

      // If sessionId provided, replace it with the first agent's session
      if (sessionId && sessionIds.length > 0) {
        const firstSessionId = sessionIds[0]
        const firstSession = useTerminalStore.getState().getSession(firstSessionId)

        if (firstSession) {
          // Update the existing session with the new agent
          useTerminalStore.getState().updateSession(sessionId, {
            agentId: firstSession.agentId,
            title: firstSession.title,
            cwd: firstSession.cwd,
            showQuickLaunch: false,
          })

          // Remove the newly created session as we're reusing the existing one
          useTerminalStore.getState().removeSession(firstSessionId)

          // Update the agent's terminalId to point to the existing session
          if (firstSession.agentId) {
            useAgentStore.getState().updateAgent(firstSession.agentId, { terminalId: sessionId })
          }

          // If there are more sessions, keep them as-is (multi-agent group)
          if (sessionIds.length > 1) {
            const remainingSessionIds = sessionIds.slice(1)
            useTerminalStore.getState().addGroup({
              id: `group-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              name: `Session (${remainingSessionIds.length + 1})`,
              sessionIds: [sessionId, ...remainingSessionIds],
              createdAt: Date.now(),
            })
          }
        }
      } else if (sessionIds.length > 1) {
        // Normal behavior: create group for multiple sessions
        useTerminalStore.getState().addGroup({
          id: `group-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: `Session (${sessionIds.length})`,
          sessionIds,
          createdAt: Date.now(),
        })
      }

      onLaunched()
    } catch (error) {
      setLaunching(false)
      console.error('Launch failed:', error)
    }
  }

  // ── Render ─────────────────────────────────────────────────

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      className="h-full w-full overflow-y-auto scrollbar-hide outline-none relative"
    >
      <StepBar step={step} />

      <button
        onClick={() => {
          if (sessionId) {
            // Inside a tab: remove the empty session
            useTerminalStore.getState().removeSession(sessionId)
          }
          onLaunched()
        }}
        className="absolute top-10 right-10 flex h-9 w-9 items-center justify-center rounded-xl text-white/40 transition-all hover:bg-white/[0.06] hover:text-white"
        aria-label="Close"
      >
        <X className="h-5 w-5" />
      </button>

      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        className="mx-auto flex min-h-full max-w-[640px] flex-col justify-center gap-8 px-6 pt-[110px] pb-12"
      >
        <AnimatePresence mode="wait">
          {step === 1 ? (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="flex flex-col gap-7"
            >
              {/* Title */}
              <div className="text-center mb-1">
                <h1 className="text-[32px] font-bold text-white tracking-tight">Configure Layout</h1>
                <p className="mt-2 text-sm text-white/50">Select a template and working directory.</p>
              </div>

              {/* Directory */}
              <div>
                <label className="mb-2.5 block text-[11px] font-bold uppercase tracking-[0.15em] text-white/40 ml-1">
                  Working Directory
                </label>

                {/* Browse bar */}
                <div className={`flex items-center gap-3 rounded-2xl border p-3.5 transition-all duration-500 ${
                  pathSuccess
                    ? 'border-emerald-400/50 bg-emerald-400/[0.06]'
                    : 'border-white/10 bg-white/[0.02] hover:border-white/20'
                }`}>
                  <FolderOpen className={`h-5 w-5 ml-1 shrink-0 transition-colors duration-500 ${
                    pathSuccess ? 'text-emerald-400' : 'text-white/30'
                  }`} />
                  <motion.span
                    key={resolvedPath || 'empty'}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25 }}
                    className={`flex-1 truncate text-sm font-mono transition-colors duration-500 ${
                      pathSuccess ? 'text-emerald-400' : resolvedPath ? 'text-white' : 'text-white/25'
                    }`}
                  >
                    {resolvedPath || '/path/to/project'}
                  </motion.span>
                  <button
                    onClick={handleBrowse}
                    disabled={!canBrowse}
                    className="shrink-0 px-4 py-2 rounded-xl text-[11px] font-bold uppercase tracking-[0.15em] text-white/40 border border-white/10 bg-white/[0.03] transition-all hover:border-white/20 hover:text-white hover:bg-white/[0.06] disabled:opacity-30"
                  >
                    Browse
                  </button>
                </div>

                {/* Terminal command input */}
                <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden transition-all focus-within:border-[#38bdf8]/30">
                  <div className="flex items-center px-4 py-3 gap-3">
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[15px] font-bold text-[#38bdf8] leading-none select-none">{'>_'}</span>
                      <span className="text-white/25 text-sm font-mono select-none">$</span>
                    </div>
                    <input
                      ref={cmdInputRef}
                      value={cmdInput}
                      onChange={(e) => { setCmdInput(e.target.value); setCmdError('') }}
                      onKeyDown={(e) => {
                        if (e.key === 'Tab') {
                          e.preventDefault()
                          if (suggestions.length > 0) applySuggestion(suggestions[suggestIdx])
                        } else if (e.key === 'ArrowDown' && suggestions.length > 0) {
                          e.preventDefault()
                          setSuggestIdx((i) => (i + 1) % suggestions.length)
                        } else if (e.key === 'ArrowUp' && suggestions.length > 0) {
                          e.preventDefault()
                          setSuggestIdx((i) => (i - 1 + suggestions.length) % suggestions.length)
                        } else if (e.key === 'Escape') {
                          setSuggestions([])
                        } else if (e.key === 'Enter') {
                          setSuggestions([])
                          handleTerminalCommand()
                        }
                      }}
                      placeholder="cd ~/projects/my-app or ../repo"
                      className="flex-1 bg-transparent text-[14px] text-white font-mono placeholder:text-white/20 focus:outline-none caret-[#38bdf8]"
                    />
                    <button
                      onClick={handleTerminalCommand}
                      disabled={!cmdInput.trim() || cmdResolving}
                      className="shrink-0 px-4 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-[0.15em] text-white/35 border border-white/10 bg-white/[0.03] transition-all hover:border-white/20 hover:text-white hover:bg-white/[0.06] disabled:opacity-25 disabled:hover:bg-white/[0.03] disabled:hover:border-white/10 disabled:hover:text-white/35"
                    >
                      {cmdResolving ? (
                        <div className="h-3.5 w-3.5 rounded-full border-2 border-white/20 border-t-white/60 animate-spin" />
                      ) : (
                        'GO'
                      )}
                    </button>
                  </div>
                  {/* Autocomplete suggestions */}
                  <AnimatePresence>
                    {suggestions.length > 0 && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.15 }}
                        className="border-t border-white/[0.05] overflow-hidden"
                      >
                        <div className="px-2 py-1.5 flex flex-col">
                          {suggestions.map((name, i) => (
                            <button
                              key={name}
                              onMouseDown={(e) => { e.preventDefault(); applySuggestion(name) }}
                              onMouseEnter={() => setSuggestIdx(i)}
                              className={`flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-left text-[13px] font-mono transition-colors ${
                                i === suggestIdx
                                  ? 'bg-[#38bdf8]/10 text-[#38bdf8]'
                                  : 'text-white/50 hover:text-white/70'
                              }`}
                            >
                              <FolderOpen className="h-3.5 w-3.5 shrink-0 opacity-50" />
                              {name}
                              {i === suggestIdx && (
                                <span className="ml-auto text-[10px] font-sans font-bold uppercase tracking-widest text-white/20">Tab</span>
                              )}
                            </button>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <AnimatePresence>
                    {cmdError && (
                      <motion.p
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="px-4 pb-2 text-[12px] text-red-400/80 font-medium"
                      >
                        {cmdError}
                      </motion.p>
                    )}
                  </AnimatePresence>
                  <div className="px-4 pb-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/15 leading-relaxed">
                      Use the browser above or jump with terminal-style navigation commands.
                    </p>
                  </div>
                </div>
              </div>

              {/* Saved Presets */}
              {launchPresets.length > 0 && (
                <div>
                  <label className="mb-2.5 block text-[11px] font-bold uppercase tracking-[0.15em] text-white/40 ml-1">
                    Saved Presets
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {launchPresets.map((preset, idx) => {
                      const totalAgents = Object.values(preset.providerCounts).reduce((a, b) => a + b, 0)
                      return (
                        <motion.button
                          key={preset.id}
                          onClick={() => loadPreset(preset)}
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ duration: 0.2, delay: idx * 0.04 }}
                          whileTap={{ scale: 0.97 }}
                          className="group relative flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] pl-4 pr-9 py-3 text-left transition-all hover:border-[#38bdf8]/30 hover:bg-[#38bdf8]/5"
                        >
                          <div className="flex flex-col min-w-0">
                            <span className="text-[13px] font-bold text-white truncate">{preset.name}</span>
                            <span className="text-[11px] text-white/30 truncate">
                              {preset.layout} {totalAgents > 0 ? `· ${totalAgents} agent${totalAgents > 1 ? 's' : ''}` : ''}
                            </span>
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); removeLaunchPreset(preset.id) }}
                            className="absolute top-1 right-1 flex h-6 w-6 items-center justify-center rounded-lg text-white/0 transition-all group-hover:text-white/30 hover:!text-red-400 hover:!bg-red-400/10"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </motion.button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Layout */}
              <div>
                <label className="mb-2.5 block text-[11px] font-bold uppercase tracking-[0.15em] text-white/40 ml-1">
                  Layout Templates
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {LAYOUTS.map((opt) => {
                    const active = gridLayout === opt.layout
                    return (
                      <button
                        key={opt.layout}
                        onClick={() => setGridLayout(opt.layout)}
                        className={`group flex flex-col items-center justify-center gap-4 rounded-2xl border p-5 transition-all ${
                          active
                            ? 'border-[#38bdf8]/50 bg-[#38bdf8]/10 text-[#38bdf8] scale-[1.02]'
                            : 'border-white/10 bg-white/[0.02] text-white/40 hover:border-white/20 hover:bg-white/[0.04] hover:text-white/80'
                        }`}
                      >
                        <div className={`transition-transform duration-300 ${active ? 'scale-110' : 'group-hover:scale-110'}`}>
                          <LayoutDots cols={opt.cols} rows={opt.rows} active={active} />
                        </div>
                        <span className="text-[11px] font-bold tracking-widest uppercase">
                          {opt.count === 1 ? 'Single' : `${opt.count} Sessions`}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* YOLO Toggle */}
              <button
                onClick={() => setYolo(!yolo)}
                className={`group flex items-center gap-4 rounded-2xl border p-4 text-left transition-all mt-1 ${
                  yolo
                    ? 'border-amber-400/40 bg-amber-400/10'
                    : 'border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]'
                }`}
              >
                <div
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] transition-colors ${
                    yolo
                      ? 'bg-amber-400/20 text-amber-400'
                      : 'bg-white/[0.04] text-white/40 group-hover:text-white/80'
                  }`}
                >
                  {yolo ? <AlertTriangle className="h-5 w-5" /> : <Shield className="h-5 w-5" />}
                </div>
                <div className="flex-1">
                  <p className={`text-[15px] font-bold tracking-tight ${yolo ? 'text-amber-400' : 'text-white/90'}`}>
                    {yolo ? 'YOLO Mode' : 'Safe Mode'}
                  </p>
                  <p className={`text-[12px] mt-0.5 ${yolo ? 'text-amber-400/70' : 'text-white/40'}`}>
                    {yolo ? 'Skips approval prompts for all actions' : 'Requires approval for sensitive actions'}
                  </p>
                </div>
                <div
                  className={`relative flex h-7 w-[46px] shrink-0 items-center rounded-full p-1 transition-colors duration-300 ${
                    yolo ? 'bg-amber-400' : 'bg-white/10'
                  }`}
                >
                  <motion.div
                    layout
                    className="h-5 w-5 rounded-full bg-white shadow-sm"
                    animate={{ x: yolo ? 18 : 0 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  />
                </div>
              </button>

              {/* Footer */}
              <div className="flex items-center justify-between pt-5 mt-2 border-t border-white/10">
                <button
                  onClick={onLaunched}
                  className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold uppercase tracking-[0.1em] text-white/40 transition-all hover:bg-white/[0.06] hover:text-white"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Back
                </button>
                <button
                  onClick={() => setStep(2)}
                  className="group flex h-[52px] items-center gap-2.5 rounded-xl bg-[#38bdf8] px-8 text-[15px] font-bold text-[#050812] transition-all hover:bg-[#38bdf8]/90 active:scale-[0.98]"
                >
                  Configure Agents
                  <ChevronRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
                </button>
              </div>

              {/* Plain terminal link */}
              <div className="text-center">
                <button
                  onClick={handleLaunchTerminal}
                  className="group inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.02] px-5 py-2.5 text-xs font-medium text-white/40 transition-all hover:border-white/20 hover:bg-white/[0.06] hover:text-white"
                >
                  <Terminal className="h-4 w-4" />
                  Or open a plain terminal
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 30 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="flex flex-col gap-8"
            >
              {/* Title & Visual Slots */}
              <div className="text-center flex flex-col items-center">
                <h1 className="text-[32px] font-bold text-white tracking-tight">Configure Agents</h1>
                
                {/* Visual Slots representation */}
                <div className="flex flex-wrap justify-center gap-3 mt-6">
                  {Array.from({ length: slotCount }).map((_, i) => {
                    let assignedProvider: Provider | null = null;
                    let counted = 0;
                    for (const p of PROVIDERS) {
                      if (counted <= i && i < counted + providerCounts[p.id]) {
                        assignedProvider = p.id;
                        break;
                      }
                      counted += providerCounts[p.id];
                    }

                    const Icon = assignedProvider === 'claude' ? BrainCircuit : assignedProvider === 'codex' ? TerminalSquare : assignedProvider === 'gemini' ? Orbit : Plus;
                    const isAssigned = !!assignedProvider;

                    return (
                      <motion.div
                        key={i}
                        layout
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className={`flex h-[42px] w-[42px] items-center justify-center rounded-[16px] border transition-all duration-300 ${
                          isAssigned 
                            ? 'border-[#38bdf8]/40 bg-[#38bdf8]/10 text-[#38bdf8]' 
                            : 'border-[#38bdf8]/20 bg-transparent text-[#38bdf8]/50 border-solid'
                        }`}
                      >
                        <Icon className="h-5 w-5" />
                      </motion.div>
                    )
                  })}
                </div>
                
                <div className="h-6 mt-4 flex items-center justify-center">
                   {totalAssigned < slotCount ? (
                     <motion.p 
                       key="unassigned"
                       initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }}
                       className="text-[13px] font-bold uppercase tracking-widest text-[#38bdf8]/50"
                     >
                       {slotCount - totalAssigned} slot{slotCount - totalAssigned > 1 ? 's' : ''} left
                     </motion.p>
                   ) : (
                     <motion.p 
                       key="ready"
                       initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }}
                       className="text-[13px] font-bold uppercase tracking-widest text-[#38bdf8]"
                     >
                       ALL SLOTS FILLED
                     </motion.p>
                   )}
                </div>
              </div>

              {/* Provider Grid */}
              <div className="grid grid-cols-3 gap-4">
                {PROVIDERS.map((p) => {
                  const count = providerCounts[p.id]
                  const hasCount = count > 0
                  const Icon = p.id === 'gemini' ? Orbit : p.id === 'codex' ? TerminalSquare : BrainCircuit;
                  
                  return (
                    <div
                      key={p.id}
                      className={`group flex flex-col items-center gap-6 rounded-[24px] border p-6 transition-all duration-300 relative overflow-hidden ${
                        hasCount
                          ? 'border-[#38bdf8]/40 bg-white/[0.02]'
                          : 'border-white/10 bg-white/[0.01] hover:bg-white/[0.03] hover:border-white/20'
                      }`}
                    >
                      <div className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-[20px] transition-all duration-300 z-10 ${
                        hasCount ? 'bg-[#38bdf8]/20 text-[#38bdf8]' : 'bg-white/[0.03] text-white/30 group-hover:text-white/50'
                      }`}>
                        <Icon className="h-8 w-8" />
                      </div>
                      
                      <div className="text-center z-10 w-full mt-2">
                        <span className={`text-[17px] font-bold tracking-tight block transition-colors ${hasCount ? 'text-white' : 'text-white/40'}`}>
                          {p.label}
                        </span>
                      </div>

                      {/* Fill All button */}
                      <button
                        onClick={() => fillAll(p.id)}
                        disabled={count === slotCount}
                        className={`z-10 w-full rounded-xl py-2 text-[11px] font-bold uppercase tracking-[0.14em] transition-all mt-1 ${
                          count === slotCount
                            ? 'border border-[#38bdf8]/30 bg-[#38bdf8]/10 text-[#38bdf8]/50 cursor-default'
                            : 'border border-white/10 bg-white/[0.03] text-white/40 hover:border-[#38bdf8]/30 hover:bg-[#38bdf8]/10 hover:text-[#38bdf8]'
                        }`}
                      >
                        All {slotCount}
                      </button>

                      <div className={`flex items-center justify-between w-full rounded-[16px] p-1 border transition-colors mt-2 z-10 ${
                        hasCount ? 'bg-[#050812]/80 border-[#38bdf8]/20' : 'bg-white/[0.02] border-transparent'
                      }`}>
                        <button
                          onClick={() => decrement(p.id)}
                          disabled={count <= 0}
                          className="flex h-10 w-10 items-center justify-center rounded-xl text-white/50 transition-all hover:bg-white/10 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                        >
                          <Minus className="h-5 w-5" />
                        </button>
                        <span className={`w-6 text-center text-[19px] font-extrabold tabular-nums transition-colors ${hasCount ? 'text-[#38bdf8]' : 'text-white/20'}`}>
                          {count}
                        </span>
                        <button
                          onClick={() => increment(p.id)}
                          disabled={totalAssigned >= slotCount}
                          className="flex h-10 w-10 items-center justify-center rounded-xl text-white/50 transition-all hover:bg-white/10 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                        >
                          <Plus className="h-5 w-5" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Save Preset Inline */}
              <AnimatePresence>
                {showSavePreset && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                    className="overflow-hidden"
                  >
                    <div className="flex items-center gap-2 rounded-2xl border border-[#38bdf8]/20 bg-[#38bdf8]/5 p-3">
                      <Save className="h-4 w-4 text-[#38bdf8]/50 shrink-0 ml-1" />
                      <input
                        autoFocus
                        value={presetName}
                        onChange={(e) => setPresetName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSavePreset()
                          if (e.key === 'Escape') { setShowSavePreset(false); setPresetName('') }
                        }}
                        placeholder="Preset name..."
                        className="flex-1 bg-transparent text-sm text-white placeholder:text-white/25 focus:outline-none"
                      />
                      <button
                        onClick={handleSavePreset}
                        disabled={!presetName.trim()}
                        className="shrink-0 px-4 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-[0.12em] text-[#050812] bg-[#38bdf8] transition-all hover:bg-[#38bdf8]/90 disabled:opacity-40 active:scale-[0.97]"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => { setShowSavePreset(false); setPresetName('') }}
                        className="shrink-0 flex h-7 w-7 items-center justify-center rounded-lg text-white/30 transition-all hover:bg-white/[0.06] hover:text-white"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Footer */}
              <div className="flex items-center justify-between pt-6 mt-2 border-t border-white/10">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setStep(1)}
                    className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold uppercase tracking-[0.1em] text-white/40 transition-all hover:bg-white/[0.06] hover:text-white"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Back
                  </button>
                  <button
                    onClick={() => setShowSavePreset(!showSavePreset)}
                    className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold uppercase tracking-[0.1em] transition-all ${
                      showSavePreset
                        ? 'text-[#38bdf8] bg-[#38bdf8]/10'
                        : 'text-white/40 hover:bg-white/[0.06] hover:text-white'
                    }`}
                  >
                    <Save className="h-4 w-4" />
                    Save Preset
                  </button>
                </div>
                <button
                  onClick={handleLaunch}
                  disabled={launching || totalAssigned !== slotCount}
                  className="group flex h-[52px] items-center gap-2.5 rounded-xl bg-[#38bdf8] px-10 text-[15px] font-bold text-[#050812] transition-all hover:bg-[#38bdf8]/90 disabled:opacity-50 disabled:shadow-none disabled:cursor-not-allowed active:scale-[0.98]"
                >
                  {launching ? (
                     <div className="h-5 w-5 rounded-full border-2 border-[#050812]/30 border-t-[#050812] animate-spin" />
                  ) : (
                     <Zap className="h-5 w-5" />
                  )}
                  {launching ? 'Launching...' : `Launch ${slotCount} Session${slotCount > 1 ? 's' : ''}`}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}