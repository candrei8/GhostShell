// Provider Intelligence — recommends the optimal CLI provider per swarm role.
//
// Only covers the 3 core providers (claude, codex, gemini) that have
// `coreProvider` set in SWARM_CLI_PROVIDERS. Non-core providers like
// opencode, cursor, droid, and copilot are excluded.

import type { SwarmAgentRole, SwarmCliProvider } from './swarm-types'

// ─── Types ──────────────────────────────────────────────────────

export interface ProviderRoleRecommendation {
  role: SwarmAgentRole
  recommended: SwarmCliProvider
  reason: string
  alternatives: Array<{ provider: SwarmCliProvider; reason: string }>
}

export interface ProviderRoleScore {
  score: number     // 1-10
  reason: string
}

// ─── Core Provider IDs ──────────────────────────────────────────

const CORE_PROVIDERS: SwarmCliProvider[] = ['claude', 'codex', 'gemini']

// ─── Provider x Role Matrix ─────────────────────────────────────

/**
 * Smart defaults: which provider works best for each role.
 * Based on model capabilities and pricing.
 */
export const PROVIDER_ROLE_MATRIX: Record<SwarmCliProvider, Record<SwarmAgentRole, ProviderRoleScore>> = {
  claude: {
    coordinator: { score: 10, reason: 'Mejor razonamiento para descomposicion de tareas y orquestacion' },
    builder: { score: 9, reason: 'Excelente generacion de codigo en todos los lenguajes' },
    scout: { score: 7, reason: 'Buen analisis pero mas lento de lo necesario para reconocimiento rapido' },
    reviewer: { score: 10, reason: 'El mejor detectando bugs sutiles y problemas de seguridad' },
    analyst: { score: 8, reason: 'Fuertes capacidades analiticas' },
    custom: { score: 8, reason: 'Versatil en todas las tareas' },
  },
  codex: {
    coordinator: { score: 8, reason: 'Buena orquestacion con razonamiento GPT-5.3' },
    builder: { score: 9, reason: 'Generacion de codigo rapida, excelente refactorizacion' },
    scout: { score: 7, reason: 'Buen analisis de codigo' },
    reviewer: { score: 8, reason: 'Revision de codigo exhaustiva' },
    analyst: { score: 7, reason: 'Analisis decente' },
    custom: { score: 7, reason: 'Proposito general' },
  },
  gemini: {
    coordinator: { score: 7, reason: 'Buena planificacion pero orquestacion menos precisa' },
    builder: { score: 8, reason: 'Implementacion rapida, bueno con codebases grandes' },
    scout: { score: 9, reason: 'Velocidad excelente para reconocimiento con contexto amplio' },
    reviewer: { score: 7, reason: 'Bueno pero menos exhaustivo que Claude para revisiones' },
    analyst: { score: 8, reason: 'Ventana de contexto grande ideal para monitoreo' },
    custom: { score: 7, reason: 'Proposito general' },
  },
  // Non-core providers — included to satisfy Record type but not recommended
  opencode: {
    coordinator: { score: 5, reason: 'Experimental' },
    builder: { score: 5, reason: 'Experimental' },
    scout: { score: 5, reason: 'Experimental' },
    reviewer: { score: 5, reason: 'Experimental' },
    analyst: { score: 5, reason: 'Experimental' },
    custom: { score: 5, reason: 'Experimental' },
  },
  cursor: {
    coordinator: { score: 5, reason: 'Experimental' },
    builder: { score: 5, reason: 'Experimental' },
    scout: { score: 5, reason: 'Experimental' },
    reviewer: { score: 5, reason: 'Experimental' },
    analyst: { score: 5, reason: 'Experimental' },
    custom: { score: 5, reason: 'Experimental' },
  },
  droid: {
    coordinator: { score: 5, reason: 'Experimental' },
    builder: { score: 5, reason: 'Experimental' },
    scout: { score: 5, reason: 'Experimental' },
    reviewer: { score: 5, reason: 'Experimental' },
    analyst: { score: 5, reason: 'Experimental' },
    custom: { score: 5, reason: 'Experimental' },
  },
  copilot: {
    coordinator: { score: 5, reason: 'Experimental' },
    builder: { score: 5, reason: 'Experimental' },
    scout: { score: 5, reason: 'Experimental' },
    reviewer: { score: 5, reason: 'Experimental' },
    analyst: { score: 5, reason: 'Experimental' },
    custom: { score: 5, reason: 'Experimental' },
  },
}

// ─── Functions ──────────────────────────────────────────────────

/**
 * Get the recommended provider for a role.
 * Ranks all core providers by score and returns the best one
 * with alternatives sorted by score descending.
 */
export function getRecommendedProvider(role: SwarmAgentRole): ProviderRoleRecommendation {
  const scored = CORE_PROVIDERS
    .map(p => ({
      provider: p,
      ...PROVIDER_ROLE_MATRIX[p][role],
    }))
    .sort((a, b) => b.score - a.score)

  const best = scored[0]
  const alternatives = scored.slice(1).map(s => ({
    provider: s.provider,
    reason: `${s.reason} (${s.score}/10)`,
  }))

  return {
    role,
    recommended: best.provider,
    reason: best.reason,
    alternatives,
  }
}

/**
 * Get a smart default mixed-provider roster.
 * Uses the best provider for each role instead of the same for all.
 */
export function getSmartProviderDefaults(): Record<SwarmAgentRole, SwarmCliProvider> {
  const defaults = {} as Record<SwarmAgentRole, SwarmCliProvider>
  const roles: SwarmAgentRole[] = ['coordinator', 'builder', 'scout', 'reviewer', 'analyst', 'custom']
  for (const role of roles) {
    const rec = getRecommendedProvider(role)
    defaults[role] = rec.recommended
  }
  return defaults
}

/**
 * Generate a tooltip/description explaining why a provider is good for a role.
 */
export function getProviderRoleTooltip(provider: SwarmCliProvider, role: SwarmAgentRole): string {
  const matrix = PROVIDER_ROLE_MATRIX[provider]
  if (!matrix) return 'Proveedor no reconocido'

  const entry = matrix[role]
  if (!entry) return 'Rol no reconocido'

  const rec = getRecommendedProvider(role)
  const isRecommended = rec.recommended === provider

  if (isRecommended) {
    return `${provider.charAt(0).toUpperCase() + provider.slice(1)} — recomendado para ${role} (${entry.score}/10): ${entry.reason}`
  }

  return `${provider.charAt(0).toUpperCase() + provider.slice(1)} para ${role} (${entry.score}/10): ${entry.reason}. Recomendado: ${rec.recommended} (${PROVIDER_ROLE_MATRIX[rec.recommended][role].score}/10)`
}
