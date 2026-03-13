import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { Theme, Provider, SavedAgentConfig, AgentAvatarConfig } from '../lib/types'
import { themes, getTheme, applyTheme } from '../lib/themes'
import { electronStorage } from '../lib/electronStorage'
import { CliVisualProfile } from '../lib/terminalPresets'

export type NotificationTimingMode = 'aggressive' | 'balanced' | 'silent'
export type TerminalOutputEmphasis = 'off' | 'balanced' | 'vivid'

interface SettingsState {
  themeId: string
  fontSize: number
  fontFamily: string
  terminalFontSize: number
  cursorBlink: boolean
  cursorStyle: 'block' | 'underline' | 'bar'
  cliVisualProfile: CliVisualProfile
  terminalOutputEmphasis: TerminalOutputEmphasis
  claudeCliPath: string
  defaultModel: string
  defaultSkipPermissions: boolean
  defaultProvider: Provider
  geminiCliPath: string
  defaultGeminiModel: string
  codexCliPath: string
  defaultCodexModel: string
  lastAgentFolder: string
  restoreTabs: boolean
  muteNotifications: boolean
  notificationVolume: number
  notificationTimingMode: NotificationTimingMode
  savedAgents: SavedAgentConfig[]
  dockPosition: { x: number; y: number } | null

  setRestoreTabs: (restore: boolean) => void
  addSavedAgent: (config: SavedAgentConfig) => void
  removeSavedAgent: (id: string) => void
  setLastAgentFolder: (path: string) => void
  setTheme: (id: string) => void
  setFontSize: (size: number) => void
  setFontFamily: (family: string) => void
  setTerminalFontSize: (size: number) => void
  setCursorBlink: (blink: boolean) => void
  setCursorStyle: (style: 'block' | 'underline' | 'bar') => void
  setCliVisualProfile: (profile: CliVisualProfile) => void
  setTerminalOutputEmphasis: (emphasis: TerminalOutputEmphasis) => void
  setClaudeCliPath: (path: string) => void
  setDefaultModel: (model: string) => void
  setDefaultSkipPermissions: (skip: boolean) => void
  setDefaultProvider: (provider: Provider) => void
  setGeminiCliPath: (path: string) => void
  setDefaultGeminiModel: (model: string) => void
  setCodexCliPath: (path: string) => void
  setDefaultCodexModel: (model: string) => void
  setMuteNotifications: (mute: boolean) => void
  setNotificationVolume: (volume: number) => void
  setNotificationTimingMode: (mode: NotificationTimingMode) => void
  setDockPosition: (pos: { x: number; y: number } | null) => void
  getTheme: () => Theme
  getAvailableThemes: () => Theme[]
  initTheme: () => void
}

const CURSOR_STYLES = new Set(['block', 'underline', 'bar'])
const VISUAL_PROFILES = new Set(['executive', 'focus', 'minimal'])
const OUTPUT_EMPHASIS = new Set(['off', 'balanced', 'vivid'])
const PROVIDERS = new Set(['claude', 'gemini', 'codex'])
const TIMING_MODES = new Set(['aggressive', 'balanced', 'silent'])
const PROVIDER_LABELS: Record<Provider, string> = {
  claude: 'Claude',
  gemini: 'Gemini',
  codex: 'Codex',
}
const PROVIDER_ICONS: Record<Provider, string> = {
  claude: 'Ghost',
  gemini: 'Sparkles',
  codex: 'Bot',
}
const PROVIDER_COLORS: Record<Provider, string> = {
  claude: '#a855f7',
  gemini: '#3b82f6',
  codex: '#10b981',
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  if (value < min) return min
  if (value > max) return max
  return value
}

function pickNumber(input: unknown, fallback: number, min: number, max: number): number {
  const value = typeof input === 'number' ? input : Number(input)
  if (!Number.isFinite(value)) return fallback
  return clampNumber(value, min, max)
}

function isCursorStyle(value: unknown): value is 'block' | 'underline' | 'bar' {
  return typeof value === 'string' && CURSOR_STYLES.has(value)
}

function isCliVisualProfile(value: unknown): value is CliVisualProfile {
  return typeof value === 'string' && VISUAL_PROFILES.has(value)
}

function isTerminalOutputEmphasis(value: unknown): value is TerminalOutputEmphasis {
  return typeof value === 'string' && OUTPUT_EMPHASIS.has(value)
}

function isProvider(value: unknown): value is Provider {
  return typeof value === 'string' && PROVIDERS.has(value)
}

function isTimingMode(value: unknown): value is NotificationTimingMode {
  return typeof value === 'string' && TIMING_MODES.has(value)
}

function pickString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

function pickTrimmedString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function pickOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}

function getFallbackAvatar(provider: Provider): AgentAvatarConfig {
  return {
    id: `preset-${provider}`,
    name: PROVIDER_LABELS[provider],
    icon: PROVIDER_ICONS[provider],
    color: PROVIDER_COLORS[provider],
  }
}

function getDefaultModelForProvider(provider: Provider): string {
  if (provider === 'gemini') return 'gemini-3-flash-preview'
  if (provider === 'codex') return 'gpt-5.3-codex'
  return 'claude-opus-4-6'
}

function sanitizeSavedAgent(value: unknown): SavedAgentConfig | null {
  if (!value || typeof value !== 'object') return null

  const raw = value as Record<string, unknown>
  const provider = isProvider(raw.provider) ? raw.provider : 'claude'
  const fallbackAvatar = getFallbackAvatar(provider)
  const avatarRaw =
    raw.avatar && typeof raw.avatar === 'object'
      ? (raw.avatar as Record<string, unknown>)
      : {}

  return {
    id: pickTrimmedString(raw.id, `saved-${provider}-${Date.now()}`),
    name: pickTrimmedString(raw.name, `${PROVIDER_LABELS[provider]} Preset`),
    avatar: {
      id: pickTrimmedString(avatarRaw.id, fallbackAvatar.id),
      name: pickTrimmedString(avatarRaw.name, fallbackAvatar.name),
      icon: pickTrimmedString(avatarRaw.icon, fallbackAvatar.icon),
      color: pickTrimmedString(avatarRaw.color, fallbackAvatar.color),
    },
    provider,
    model: pickTrimmedString(raw.model, getDefaultModelForProvider(provider)),
    systemPrompt: pickOptionalString(raw.systemPrompt),
    skipPermissions: typeof raw.skipPermissions === 'boolean' ? raw.skipPermissions : false,
    cwd: pickOptionalString(raw.cwd),
    createdAt: pickNumber(raw.createdAt, Date.now(), 0, Number.MAX_SAFE_INTEGER),
  }
}

function sanitizeSavedAgents(value: unknown): SavedAgentConfig[] {
  if (!Array.isArray(value)) return []

  const seen = new Set<string>()
  const out: SavedAgentConfig[] = []

  for (const entry of value) {
    const sanitized = sanitizeSavedAgent(entry)
    if (!sanitized || seen.has(sanitized.id)) continue
    seen.add(sanitized.id)
    out.push(sanitized)
  }

  return out
}

function normalizePersistedSettings(persistedState: unknown) {
  const raw = (persistedState && typeof persistedState === 'object'
    ? persistedState
    : {}) as Record<string, unknown>

  return {
    themeId: pickString(raw.themeId, 'qubria-dark'),
    fontSize: pickNumber(raw.fontSize, 13, 10, 18),
    fontFamily: pickString(
      raw.fontFamily,
      'JetBrains Mono, Fira Code, Cascadia Code, Consolas, monospace',
    ),
    terminalFontSize: pickNumber(raw.terminalFontSize, 14, 10, 24),
    cursorBlink: typeof raw.cursorBlink === 'boolean' ? raw.cursorBlink : true,
    cursorStyle: isCursorStyle(raw.cursorStyle) ? raw.cursorStyle : 'bar',
    cliVisualProfile: isCliVisualProfile(raw.cliVisualProfile) ? raw.cliVisualProfile : 'executive',
    terminalOutputEmphasis: isTerminalOutputEmphasis(raw.terminalOutputEmphasis)
      ? raw.terminalOutputEmphasis
      : 'balanced',
    claudeCliPath: pickTrimmedString(raw.claudeCliPath, 'claude'),
    defaultModel: pickTrimmedString(raw.defaultModel, 'claude-opus-4-6'),
    defaultSkipPermissions:
      typeof raw.defaultSkipPermissions === 'boolean' ? raw.defaultSkipPermissions : false,
    defaultProvider: isProvider(raw.defaultProvider) ? raw.defaultProvider : 'claude',
    geminiCliPath: pickTrimmedString(raw.geminiCliPath, 'gemini'),
    defaultGeminiModel: pickTrimmedString(raw.defaultGeminiModel, 'gemini-3-flash-preview'),
    codexCliPath: pickTrimmedString(raw.codexCliPath, 'codex'),
    defaultCodexModel: pickTrimmedString(raw.defaultCodexModel, 'gpt-5.3-codex'),
    lastAgentFolder: pickString(raw.lastAgentFolder, ''),
    restoreTabs: typeof raw.restoreTabs === 'boolean' ? raw.restoreTabs : true,
    muteNotifications: typeof raw.muteNotifications === 'boolean' ? raw.muteNotifications : false,
    notificationVolume: pickNumber(raw.notificationVolume, 50, 0, 100),
    notificationTimingMode: isTimingMode(raw.notificationTimingMode)
      ? raw.notificationTimingMode
      : 'balanced',
    savedAgents: sanitizeSavedAgents(raw.savedAgents),
    dockPosition:
      raw.dockPosition && typeof raw.dockPosition === 'object'
        ? {
            x: pickNumber((raw.dockPosition as Record<string, unknown>).x, 0, -9999, 9999),
            y: pickNumber((raw.dockPosition as Record<string, unknown>).y, 0, -9999, 9999),
          }
        : null,
  }
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      themeId: 'qubria-dark',
      fontSize: 13,
      fontFamily: 'JetBrains Mono, Fira Code, Cascadia Code, Consolas, monospace',
      terminalFontSize: 14,
      cursorBlink: true,
      cursorStyle: 'bar',
      cliVisualProfile: 'executive',
      terminalOutputEmphasis: 'balanced',
      claudeCliPath: 'claude',
      defaultModel: 'claude-opus-4-6',
      defaultSkipPermissions: false,
      defaultProvider: 'claude',
      geminiCliPath: 'gemini',
      defaultGeminiModel: 'gemini-3-flash-preview',
      codexCliPath: 'codex',
      defaultCodexModel: 'gpt-5.3-codex',
      lastAgentFolder: '',
      restoreTabs: true,
      muteNotifications: false,
      notificationVolume: 50,
      notificationTimingMode: 'balanced',
      savedAgents: [],
      dockPosition: null,

      setRestoreTabs: (restore) => set({ restoreTabs: restore }),
      addSavedAgent: (config) =>
        set((state) => {
          const sanitized = sanitizeSavedAgent(config)
          if (!sanitized) return state
          return { savedAgents: [...state.savedAgents, sanitized] }
        }),
      removeSavedAgent: (id) => set((state) => ({ savedAgents: state.savedAgents.filter((a) => a.id !== id) })),
      setLastAgentFolder: (path) => set({ lastAgentFolder: path }),
      setTheme: (id) => {
        set({ themeId: id })
        applyTheme(getTheme(id))
      },
      setFontSize: (size) => set({ fontSize: size }),
      setFontFamily: (family) => set({ fontFamily: family }),
      setTerminalFontSize: (size) => set({ terminalFontSize: size }),
      setCursorBlink: (blink) => set({ cursorBlink: blink }),
      setCursorStyle: (style) => set({ cursorStyle: style }),
      setCliVisualProfile: (profile) => set({ cliVisualProfile: profile }),
      setTerminalOutputEmphasis: (emphasis) => set({ terminalOutputEmphasis: emphasis }),
      setClaudeCliPath: (path) => set({ claudeCliPath: path }),
      setDefaultModel: (model) => set({ defaultModel: model }),
      setDefaultSkipPermissions: (skip) => set({ defaultSkipPermissions: skip }),
      setDefaultProvider: (provider) => set({ defaultProvider: provider }),
      setGeminiCliPath: (path) => set({ geminiCliPath: path }),
      setDefaultGeminiModel: (model) => set({ defaultGeminiModel: model }),
      setCodexCliPath: (path) => set({ codexCliPath: path }),
      setDefaultCodexModel: (model) => set({ defaultCodexModel: model }),
      setMuteNotifications: (mute) => set({ muteNotifications: mute }),
      setNotificationVolume: (volume) => set({ notificationVolume: volume }),
      setNotificationTimingMode: (mode) => set({ notificationTimingMode: mode }),
      setDockPosition: (pos) => set({ dockPosition: pos }),
      getTheme: () => getTheme(get().themeId),
      getAvailableThemes: () => themes,
      initTheme: () => applyTheme(getTheme(get().themeId)),
    }),
    {
      name: 'ghostshell-settings',
      version: 4,
      storage: createJSONStorage(() => electronStorage),
      partialize: (state) => ({
        themeId: state.themeId,
        fontSize: state.fontSize,
        fontFamily: state.fontFamily,
        terminalFontSize: state.terminalFontSize,
        cursorBlink: state.cursorBlink,
        cursorStyle: state.cursorStyle,
        cliVisualProfile: state.cliVisualProfile,
        terminalOutputEmphasis: state.terminalOutputEmphasis,
        claudeCliPath: state.claudeCliPath,
        defaultModel: state.defaultModel,
        defaultSkipPermissions: state.defaultSkipPermissions,
        defaultProvider: state.defaultProvider,
        geminiCliPath: state.geminiCliPath,
        defaultGeminiModel: state.defaultGeminiModel,
        codexCliPath: state.codexCliPath,
        defaultCodexModel: state.defaultCodexModel,
        lastAgentFolder: state.lastAgentFolder,
        restoreTabs: state.restoreTabs,
        muteNotifications: state.muteNotifications,
        notificationVolume: state.notificationVolume,
        notificationTimingMode: state.notificationTimingMode,
        savedAgents: state.savedAgents,
        dockPosition: state.dockPosition,
      }),
      migrate: (persistedState) => normalizePersistedSettings(persistedState),
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...normalizePersistedSettings(persistedState),
      }),
      onRehydrateStorage: () => {
        return (state) => {
          if (state) {
            // Re-apply theme CSS variables after hydration
            applyTheme(getTheme(state.themeId))
          }
        }
      },
    }
  )
)
