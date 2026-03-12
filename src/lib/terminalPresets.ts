import { Provider, TerminalTheme } from './types'

export type CliVisualProfile = 'executive' | 'focus' | 'minimal'

export const CLI_VISUAL_PROFILE_OPTIONS: Array<{ id: CliVisualProfile; label: string; hint: string }> = [
  {
    id: 'executive',
    label: 'Executive',
    hint: 'Premium contrast with clear provider identity.',
  },
  {
    id: 'focus',
    label: 'Focus',
    hint: 'Calmer rhythm and softer highlights for deep work.',
  },
  {
    id: 'minimal',
    label: 'Minimal',
    hint: 'Low-chroma, restrained look with reduced visual noise.',
  },
]

export interface SearchDecorations {
  matchOverviewRuler: string
  activeMatchColorOverviewRuler: string
  matchBackground: string
  activeMatchBackground: string
}

export interface CliAppearancePreset {
  theme: TerminalTheme
  cursorStyle: 'block' | 'underline' | 'bar'
  cursorBlink: boolean
  lineHeight: number
  letterSpacing: number
  searchDecorations: SearchDecorations
}

const CURSOR_STYLES = new Set(['block', 'underline', 'bar'])
const VISUAL_PROFILES = new Set(['executive', 'focus', 'minimal'])
const PROVIDERS = new Set<Provider>(['claude', 'gemini', 'codex'])

function isCursorStyle(value: unknown): value is 'block' | 'underline' | 'bar' {
  return typeof value === 'string' && CURSOR_STYLES.has(value)
}

function isCliVisualProfile(value: unknown): value is CliVisualProfile {
  return typeof value === 'string' && VISUAL_PROFILES.has(value)
}

function isProvider(value: unknown): value is Provider {
  return typeof value === 'string' && PROVIDERS.has(value as Provider)
}

interface ProviderVisualProfile {
  accent: string
  selection: string
  cursorStyle: 'block' | 'underline' | 'bar'
  cursorBlink: boolean
  lineHeight: number
  letterSpacing: number
  search: SearchDecorations
  overrides: Partial<TerminalTheme>
}

const PROVIDER_VISUAL_PROFILES: Record<Provider, ProviderVisualProfile> = {
  claude: {
    accent: '#b79cff',
    selection: 'rgba(183, 156, 255, 0.30)',
    cursorStyle: 'bar',
    cursorBlink: true,
    lineHeight: 1.19,
    letterSpacing: 0.16,
    search: {
      matchOverviewRuler: '#b79cff80',
      activeMatchColorOverviewRuler: '#cfc0ff',
      matchBackground: '#b79cff36',
      activeMatchBackground: '#b79cff66',
    },
    overrides: {
      blue: '#8f88ff',
      brightBlue: '#aca7ff',
      magenta: '#b79cff',
      brightMagenta: '#d5c6ff',
      cyan: '#84d5ff',
      brightCyan: '#abe6ff',
      cursorAccent: '#0a0f1a',
    },
  },
  gemini: {
    accent: '#62c8ff',
    selection: 'rgba(98, 200, 255, 0.28)',
    cursorStyle: 'underline',
    cursorBlink: true,
    lineHeight: 1.17,
    letterSpacing: 0.12,
    search: {
      matchOverviewRuler: '#62c8ff80',
      activeMatchColorOverviewRuler: '#9addff',
      matchBackground: '#62c8ff35',
      activeMatchBackground: '#62c8ff62',
    },
    overrides: {
      blue: '#62c8ff',
      brightBlue: '#97ddff',
      cyan: '#49d6d2',
      brightCyan: '#79ebe8',
      magenta: '#91a3ff',
      brightMagenta: '#b5c2ff',
      cursorAccent: '#071220',
    },
  },
  codex: {
    accent: '#41d1a5',
    selection: 'rgba(65, 209, 165, 0.28)',
    cursorStyle: 'block',
    cursorBlink: false,
    lineHeight: 1.15,
    letterSpacing: 0.08,
    search: {
      matchOverviewRuler: '#41d1a580',
      activeMatchColorOverviewRuler: '#79e6c6',
      matchBackground: '#41d1a538',
      activeMatchBackground: '#41d1a56a',
    },
    overrides: {
      green: '#41d1a5',
      brightGreen: '#79e6c6',
      cyan: '#59d7c4',
      brightCyan: '#8cebdd',
      yellow: '#f0c66a',
      brightYellow: '#f6d996',
      cursorAccent: '#06140f',
    },
  },
}

const PROFILE_TUNING: Record<CliVisualProfile, Partial<Record<Provider, Partial<ProviderVisualProfile>>> & {
  fallbackCursorStyle: 'block' | 'underline' | 'bar'
  fallbackCursorBlink: boolean
  fallbackLineHeight: number
  fallbackLetterSpacing: number
  fallbackSearch: SearchDecorations
}> = {
  executive: {
    fallbackCursorStyle: 'bar',
    fallbackCursorBlink: true,
    fallbackLineHeight: 1.15,
    fallbackLetterSpacing: 0,
    fallbackSearch: {
      matchOverviewRuler: '#94a3b880',
      activeMatchColorOverviewRuler: '#e2e8f0',
      matchBackground: '#94a3b830',
      activeMatchBackground: '#94a3b860',
    },
  },
  focus: {
    fallbackCursorStyle: 'underline',
    fallbackCursorBlink: false,
    fallbackLineHeight: 1.2,
    fallbackLetterSpacing: 0.14,
    fallbackSearch: {
      matchOverviewRuler: '#7dd3fc80',
      activeMatchColorOverviewRuler: '#bae6fd',
      matchBackground: '#7dd3fc2e',
      activeMatchBackground: '#7dd3fc54',
    },
    claude: {
      accent: '#9ca7ff',
      selection: 'rgba(156, 167, 255, 0.24)',
      cursorStyle: 'underline',
      cursorBlink: false,
      lineHeight: 1.22,
      letterSpacing: 0.2,
      search: {
        matchOverviewRuler: '#9ca7ff80',
        activeMatchColorOverviewRuler: '#b8c1ff',
        matchBackground: '#9ca7ff30',
        activeMatchBackground: '#9ca7ff58',
      },
    },
    gemini: {
      accent: '#75d7ff',
      selection: 'rgba(117, 215, 255, 0.23)',
      cursorStyle: 'bar',
      cursorBlink: false,
      lineHeight: 1.2,
      letterSpacing: 0.18,
      search: {
        matchOverviewRuler: '#75d7ff80',
        activeMatchColorOverviewRuler: '#a0e6ff',
        matchBackground: '#75d7ff30',
        activeMatchBackground: '#75d7ff55',
      },
    },
    codex: {
      accent: '#67dfbc',
      selection: 'rgba(103, 223, 188, 0.22)',
      cursorStyle: 'underline',
      cursorBlink: false,
      lineHeight: 1.18,
      letterSpacing: 0.14,
      search: {
        matchOverviewRuler: '#67dfbc80',
        activeMatchColorOverviewRuler: '#9aecd3',
        matchBackground: '#67dfbc30',
        activeMatchBackground: '#67dfbc58',
      },
    },
  },
  minimal: {
    fallbackCursorStyle: 'bar',
    fallbackCursorBlink: false,
    fallbackLineHeight: 1.16,
    fallbackLetterSpacing: 0.05,
    fallbackSearch: {
      matchOverviewRuler: '#cbd5e180',
      activeMatchColorOverviewRuler: '#e2e8f0',
      matchBackground: '#cbd5e12e',
      activeMatchBackground: '#cbd5e152',
    },
    claude: {
      accent: '#cbd5e1',
      selection: 'rgba(148, 163, 184, 0.20)',
      cursorStyle: 'bar',
      cursorBlink: false,
      lineHeight: 1.18,
      letterSpacing: 0.06,
      search: {
        matchOverviewRuler: '#cbd5e180',
        activeMatchColorOverviewRuler: '#e2e8f0',
        matchBackground: '#cbd5e130',
        activeMatchBackground: '#cbd5e156',
      },
      overrides: {
        blue: '#9fb0c5',
        brightBlue: '#b9c7d8',
        magenta: '#a9b6c9',
        brightMagenta: '#c4cfdd',
        cyan: '#98b8c9',
        brightCyan: '#b5cedb',
      },
    },
    gemini: {
      accent: '#d1d5db',
      selection: 'rgba(148, 163, 184, 0.20)',
      cursorStyle: 'bar',
      cursorBlink: false,
      lineHeight: 1.17,
      letterSpacing: 0.06,
      search: {
        matchOverviewRuler: '#d1d5db80',
        activeMatchColorOverviewRuler: '#e5e7eb',
        matchBackground: '#d1d5db2d',
        activeMatchBackground: '#d1d5db52',
      },
      overrides: {
        blue: '#a9b6c8',
        brightBlue: '#c0cad8',
        magenta: '#aeb9c9',
        brightMagenta: '#c6cfdd',
        cyan: '#a0bcc8',
        brightCyan: '#bad1d8',
      },
    },
    codex: {
      accent: '#d1d5db',
      selection: 'rgba(148, 163, 184, 0.20)',
      cursorStyle: 'bar',
      cursorBlink: false,
      lineHeight: 1.16,
      letterSpacing: 0.05,
      search: {
        matchOverviewRuler: '#d1d5db80',
        activeMatchColorOverviewRuler: '#e5e7eb',
        matchBackground: '#d1d5db2d',
        activeMatchBackground: '#d1d5db52',
      },
      overrides: {
        green: '#a9bdb5',
        brightGreen: '#c3d2cb',
        cyan: '#a8bdc1',
        brightCyan: '#c3d3d6',
        yellow: '#c8bdab',
        brightYellow: '#ddd3c4',
      },
    },
  },
}

const DEFAULT_SEARCH_DECORATIONS: SearchDecorations = {
  matchOverviewRuler: '#94a3b880',
  activeMatchColorOverviewRuler: '#e2e8f0',
  matchBackground: '#94a3b830',
  activeMatchBackground: '#94a3b860',
}

export function getCliAppearancePreset(
  baseTheme: TerminalTheme,
  provider: Provider | undefined,
  visualProfile: CliVisualProfile,
  fallbackCursorStyle: 'block' | 'underline' | 'bar',
  fallbackCursorBlink: boolean,
): CliAppearancePreset {
  const safeVisualProfile: CliVisualProfile = isCliVisualProfile(visualProfile) ? visualProfile : 'executive'
  const tuning = PROFILE_TUNING[safeVisualProfile] || PROFILE_TUNING.executive
  const safeProvider = isProvider(provider) ? provider : undefined
  const safeCursorStyle = isCursorStyle(fallbackCursorStyle)
    ? fallbackCursorStyle
    : tuning.fallbackCursorStyle

  if (!safeProvider) {
    return {
      theme: baseTheme,
      cursorStyle: safeCursorStyle,
      cursorBlink: fallbackCursorBlink ?? tuning.fallbackCursorBlink,
      lineHeight: tuning.fallbackLineHeight,
      letterSpacing: tuning.fallbackLetterSpacing,
      searchDecorations: tuning.fallbackSearch || DEFAULT_SEARCH_DECORATIONS,
    }
  }

  const baseProfile = PROVIDER_VISUAL_PROFILES[safeProvider]
  const overrideProfile = tuning[safeProvider] || {}
  const profile: ProviderVisualProfile = {
    ...baseProfile,
    ...overrideProfile,
    search: {
      ...baseProfile.search,
      ...(overrideProfile.search || {}),
    },
    overrides: {
      ...baseProfile.overrides,
      ...(overrideProfile.overrides || {}),
    },
  }

  return {
    theme: {
      ...baseTheme,
      cursor: profile.accent,
      selectionBackground: profile.selection,
      ...profile.overrides,
    },
    cursorStyle: profile.cursorStyle,
    cursorBlink: profile.cursorBlink,
    lineHeight: profile.lineHeight,
    letterSpacing: profile.letterSpacing,
    searchDecorations: profile.search,
  }
}
