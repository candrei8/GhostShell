import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import {
  CODEX_MODELS,
  CLAUDE_MODELS,
  GEMINI_MODELS,
  ModelDef,
  parseDiscoveredModels,
  resolveModelsForProvider,
} from '../lib/providers'
import { Provider } from '../lib/types'
import { electronStorage } from '../lib/electronStorage'
import { useSettingsStore } from './settingsStore'

interface CliStatus {
  installed: boolean
  version: string
  checkedAt: number
}

interface ModelState {
  discovered: Record<Provider, ModelDef[] | null>
  cliStatus: Record<Provider, CliStatus | null>
  lastFetched: Record<Provider, number>
  fetching: Record<Provider, boolean>
  _intervalId: ReturnType<typeof setInterval> | null
  _settingsUnsubscribe: (() => void) | null

  fetchModels: (provider: Provider, force?: boolean) => Promise<void>
  fetchAll: (force?: boolean) => Promise<void>
  checkCli: (provider: Provider) => Promise<void>
  ensureFresh: (provider?: Provider, maxAgeMs?: number) => Promise<void>
  startAutoRefresh: (intervalMs?: number) => void
  stopAutoRefresh: () => void
  getModels: (provider: Provider, selectedModelId?: string) => ModelDef[]
  getPreferredModel: (provider: Provider, selectedModelId?: string) => string
}

const PROVIDERS: Provider[] = ['claude', 'gemini', 'codex']

const FALLBACK: Record<Provider, ModelDef[]> = {
  claude: CLAUDE_MODELS,
  gemini: GEMINI_MODELS,
  codex: CODEX_MODELS,
}

const DEFAULT_INTERVAL = 30 * 60 * 1000
const DEFAULT_STALE_MS = 5 * 60 * 1000

function getCliCommand(provider: Provider, state = useSettingsStore.getState()): string {
  const configured =
    provider === 'gemini'
      ? state.geminiCliPath
      : provider === 'codex'
        ? state.codexCliPath
        : state.claudeCliPath

  return typeof configured === 'string' && configured.trim() ? configured.trim() : provider
}

function getProviderDefaultModel(provider: Provider, state = useSettingsStore.getState()): string {
  const configured =
    provider === 'gemini'
      ? state.defaultGeminiModel
      : provider === 'codex'
        ? state.defaultCodexModel
        : state.defaultModel

  return typeof configured === 'string' && configured.trim()
    ? configured.trim()
    : FALLBACK[provider][0]?.id || provider
}

function getModelColor(provider: Provider): string {
  return FALLBACK[provider][0]?.color || '#888888'
}

function getSettingsCliSnapshot(state = useSettingsStore.getState()): Record<Provider, string> {
  return {
    claude: getCliCommand('claude', state),
    gemini: getCliCommand('gemini', state),
    codex: getCliCommand('codex', state),
  }
}

function sanitizeModelDef(value: unknown, provider: Provider): ModelDef | null {
  if (!value || typeof value !== 'object') return null

  const raw = value as Record<string, unknown>
  const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : ''
  if (!id) return null

  return {
    id,
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : id,
    badge: typeof raw.badge === 'string' ? raw.badge : '',
    color: typeof raw.color === 'string' && raw.color.trim() ? raw.color : getModelColor(provider),
  }
}

function sanitizeModelList(value: unknown, provider: Provider): ModelDef[] | null {
  if (value == null) return null
  if (!Array.isArray(value)) return null

  const seen = new Set<string>()
  const out: ModelDef[] = []

  for (const entry of value) {
    const sanitized = sanitizeModelDef(entry, provider)
    if (!sanitized || seen.has(sanitized.id)) continue
    seen.add(sanitized.id)
    out.push(sanitized)
  }

  return out.length > 0 ? out : null
}

function sanitizeCliStatus(value: unknown): CliStatus | null {
  if (!value || typeof value !== 'object') return null

  const raw = value as Record<string, unknown>
  return {
    installed: typeof raw.installed === 'boolean' ? raw.installed : false,
    version: typeof raw.version === 'string' ? raw.version : '',
    checkedAt:
      typeof raw.checkedAt === 'number' && Number.isFinite(raw.checkedAt) && raw.checkedAt > 0
        ? raw.checkedAt
        : 0,
  }
}

function sanitizeTimestamp(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
}

function normalizePersistedModelState(persistedState: unknown) {
  const raw = (persistedState && typeof persistedState === 'object'
    ? persistedState
    : {}) as Record<string, unknown>
  const discoveredRaw =
    raw.discovered && typeof raw.discovered === 'object'
      ? (raw.discovered as Record<string, unknown>)
      : {}
  const cliStatusRaw =
    raw.cliStatus && typeof raw.cliStatus === 'object'
      ? (raw.cliStatus as Record<string, unknown>)
      : {}
  const lastFetchedRaw =
    raw.lastFetched && typeof raw.lastFetched === 'object'
      ? (raw.lastFetched as Record<string, unknown>)
      : {}

  return {
    discovered: {
      claude: sanitizeModelList(discoveredRaw.claude, 'claude'),
      gemini: sanitizeModelList(discoveredRaw.gemini, 'gemini'),
      codex: sanitizeModelList(discoveredRaw.codex, 'codex'),
    },
    cliStatus: {
      claude: sanitizeCliStatus(cliStatusRaw.claude),
      gemini: sanitizeCliStatus(cliStatusRaw.gemini),
      codex: sanitizeCliStatus(cliStatusRaw.codex),
    },
    lastFetched: {
      claude: sanitizeTimestamp(lastFetchedRaw.claude),
      gemini: sanitizeTimestamp(lastFetchedRaw.gemini),
      codex: sanitizeTimestamp(lastFetchedRaw.codex),
    },
  }
}

export const useModelStore = create<ModelState>()(
  persist(
    (set, get) => ({
      discovered: { claude: null, gemini: null, codex: null },
      cliStatus: { claude: null, gemini: null, codex: null },
      lastFetched: { claude: 0, gemini: 0, codex: 0 },
      fetching: { claude: false, gemini: false, codex: false },
      _intervalId: null,
      _settingsUnsubscribe: null,

      fetchModels: async (provider: Provider, force = true) => {
        if (!window.ghostshell?.cliDiscoverModels) return
        if (get().fetching[provider]) return

        const lastFetchedAt = get().lastFetched[provider]
        if (!force && lastFetchedAt > 0 && Date.now() - lastFetchedAt < DEFAULT_STALE_MS) {
          return
        }

        set((state) => ({
          fetching: { ...state.fetching, [provider]: true },
        }))

        try {
          const result = await window.ghostshell.cliDiscoverModels(provider, getCliCommand(provider))
          if (result.success && result.output.trim()) {
            const parsed = parseDiscoveredModels(provider, result.output)
            if (parsed.length > 0) {
              set((state) => ({
                discovered: { ...state.discovered, [provider]: parsed },
                lastFetched: { ...state.lastFetched, [provider]: Date.now() },
              }))
            }
          }
        } catch {
          // Keep the last known list if discovery fails.
        } finally {
          set((state) => ({
            fetching: { ...state.fetching, [provider]: false },
          }))
        }
      },

      fetchAll: async (force = true) => {
        await Promise.allSettled(PROVIDERS.map((provider) => get().fetchModels(provider, force)))
        await Promise.allSettled(PROVIDERS.map((provider) => get().checkCli(provider)))
      },

      checkCli: async (provider: Provider) => {
        if (!window.ghostshell?.cliGetVersion) return

        try {
          const result = await window.ghostshell.cliGetVersion(getCliCommand(provider))
          set((state) => ({
            cliStatus: {
              ...state.cliStatus,
              [provider]: {
                installed: result.installed,
                version: result.version,
                checkedAt: Date.now(),
              },
            },
          }))
        } catch {
          set((state) => ({
            cliStatus: {
              ...state.cliStatus,
              [provider]: {
                installed: false,
                version: '',
                checkedAt: Date.now(),
              },
            },
          }))
        }
      },

      ensureFresh: async (provider?: Provider, maxAgeMs = DEFAULT_STALE_MS) => {
        const providers = provider ? [provider] : PROVIDERS
        const now = Date.now()

        await Promise.allSettled(
          providers.map(async (currentProvider) => {
            const lastFetchedAt = get().lastFetched[currentProvider]
            const discovered = get().discovered[currentProvider]
            const isStale = !discovered || discovered.length === 0 || now - lastFetchedAt > maxAgeMs
            if (isStale) {
              await get().fetchModels(currentProvider, true)
            }
            await get().checkCli(currentProvider)
          }),
        )
      },

      startAutoRefresh: (intervalMs = DEFAULT_INTERVAL) => {
        get().stopAutoRefresh()

        void get().ensureFresh()

        const intervalId = setInterval(() => {
          void get().ensureFresh(undefined, 0)
        }, intervalMs)

        const previousCliSnapshot = getSettingsCliSnapshot()
        const unsubscribe = useSettingsStore.subscribe((state) => {
          const nextSnapshot = getSettingsCliSnapshot(state)

          for (const provider of PROVIDERS) {
            if (nextSnapshot[provider] !== previousCliSnapshot[provider]) {
              previousCliSnapshot[provider] = nextSnapshot[provider]
              void get().fetchModels(provider, true)
              void get().checkCli(provider)
            }
          }
        })

        set({
          _intervalId: intervalId,
          _settingsUnsubscribe: unsubscribe,
        })
      },

      stopAutoRefresh: () => {
        const intervalId = get()._intervalId
        if (intervalId) {
          clearInterval(intervalId)
        }

        const unsubscribe = get()._settingsUnsubscribe
        if (unsubscribe) {
          unsubscribe()
        }

        set({
          _intervalId: null,
          _settingsUnsubscribe: null,
        })
      },

      getModels: (provider: Provider, selectedModelId?: string) => {
        const discovered = sanitizeModelList(get().discovered[provider], provider)
        return resolveModelsForProvider(provider, discovered, selectedModelId)
      },

      getPreferredModel: (provider: Provider, selectedModelId?: string) => {
        const requestedModel = selectedModelId?.trim()
        const models = get().getModels(provider, requestedModel)
        if (requestedModel && models.some((model) => model.id === requestedModel)) {
          return requestedModel
        }

        const defaultModel = getProviderDefaultModel(provider)
        if (defaultModel && models.some((model) => model.id === defaultModel)) {
          return defaultModel
        }

        return models[0]?.id || defaultModel || FALLBACK[provider][0]?.id || ''
      },
    }),
    {
      name: 'ghostshell-models',
      version: 2,
      storage: createJSONStorage(() => electronStorage),
      partialize: (state) => ({
        discovered: state.discovered,
        cliStatus: state.cliStatus,
        lastFetched: state.lastFetched,
      }),
      migrate: (persistedState) => normalizePersistedModelState(persistedState),
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...normalizePersistedModelState(persistedState),
      }),
    },
  ),
)
