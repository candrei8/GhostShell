import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { Theme, Provider } from '../lib/types'
import { themes, getTheme, applyTheme } from '../lib/themes'
import { electronStorage } from '../lib/electronStorage'

interface SettingsState {
  themeId: string
  fontSize: number
  fontFamily: string
  terminalFontSize: number
  cursorBlink: boolean
  cursorStyle: 'block' | 'underline' | 'bar'
  claudeCliPath: string
  defaultModel: string
  defaultSkipPermissions: boolean
  defaultProvider: Provider
  geminiCliPath: string
  defaultGeminiModel: string
  codexCliPath: string
  defaultCodexModel: string
  lastAgentFolder: string
  muteNotifications: boolean
  notificationVolume: number

  setLastAgentFolder: (path: string) => void
  setTheme: (id: string) => void
  setFontSize: (size: number) => void
  setFontFamily: (family: string) => void
  setTerminalFontSize: (size: number) => void
  setCursorBlink: (blink: boolean) => void
  setCursorStyle: (style: 'block' | 'underline' | 'bar') => void
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
  getTheme: () => Theme
  getAvailableThemes: () => Theme[]
  initTheme: () => void
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
      claudeCliPath: 'claude',
      defaultModel: 'claude-opus-4-6',
      defaultSkipPermissions: false,
      defaultProvider: 'claude',
      geminiCliPath: 'gemini',
      defaultGeminiModel: 'flash',
      codexCliPath: 'codex',
      defaultCodexModel: 'gpt-5.3-codex',
      lastAgentFolder: '',
      muteNotifications: false,
      notificationVolume: 50,

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
      getTheme: () => getTheme(get().themeId),
      getAvailableThemes: () => themes,
      initTheme: () => applyTheme(getTheme(get().themeId)),
    }),
    {
      name: 'ghostshell-settings',
      version: 1,
      storage: createJSONStorage(() => electronStorage),
      partialize: (state) => ({
        themeId: state.themeId,
        fontSize: state.fontSize,
        fontFamily: state.fontFamily,
        terminalFontSize: state.terminalFontSize,
        cursorBlink: state.cursorBlink,
        cursorStyle: state.cursorStyle,
        claudeCliPath: state.claudeCliPath,
        defaultModel: state.defaultModel,
        defaultSkipPermissions: state.defaultSkipPermissions,
        defaultProvider: state.defaultProvider,
        geminiCliPath: state.geminiCliPath,
        defaultGeminiModel: state.defaultGeminiModel,
        codexCliPath: state.codexCliPath,
        defaultCodexModel: state.defaultCodexModel,
        lastAgentFolder: state.lastAgentFolder,
        muteNotifications: state.muteNotifications,
        notificationVolume: state.notificationVolume,
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
