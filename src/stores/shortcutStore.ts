import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { electronStorage } from '../lib/electronStorage'
import {
  type KeyCombo,
  type ShortcutBindingDescriptor,
  type ShortcutBindingSource,
  SHORTCUT_REGISTRY,
  formatKeyCombo,
  getDefaultBindings,
  getKeyComboSignature,
  getResolvedBindings,
  getShortcutDef,
  isReservedCombo,
  normalizeKeyCombo,
} from '../lib/shortcutRegistry'

export interface ShortcutOverride {
  shortcutId: string
  binding: KeyCombo | null
}

export interface ShortcutConflict {
  id: string
  label: string
  combo: KeyCombo
  source: ShortcutBindingSource
  readonly: boolean
  reassignable: boolean
  displayString: string
}

export interface ShortcutConflictGroup {
  signature: string
  combo: KeyCombo
  entries: ShortcutConflict[]
}

export type AssignBindingResult =
  | { status: 'assigned'; conflicts: ShortcutConflict[] }
  | { status: 'conflict'; conflicts: ShortcutConflict[] }
  | { status: 'blocked'; conflicts: ShortcutConflict[] }

interface ShortcutState {
  overrides: ShortcutOverride[]
  getBinding: (shortcutId: string) => KeyCombo | null
  getActiveBindings: (shortcutId: string) => ShortcutBindingDescriptor[]
  getDisplayString: (shortcutId: string) => string
  getDefaultDisplayString: (shortcutId: string) => string
  isCustomized: (shortcutId: string) => boolean
  isDisabled: (shortcutId: string) => boolean
  findConflicts: (combo: KeyCombo, excludeId?: string) => ShortcutConflict[]
  getConflictGroups: () => ShortcutConflictGroup[]
  isReserved: (combo: KeyCombo) => boolean
  assignBinding: (
    shortcutId: string,
    binding: KeyCombo,
    options?: { replaceConflicts?: boolean },
  ) => AssignBindingResult
  setOverride: (shortcutId: string, binding: KeyCombo | null) => void
  clearBinding: (shortcutId: string) => void
  resetOne: (shortcutId: string) => void
  resetAll: () => void
  repairConflicts: () => void
}

function getOverride(overrides: ShortcutOverride[], shortcutId: string): ShortcutOverride | undefined {
  return overrides.find((override) => override.shortcutId === shortcutId)
}

function mergeOverride(
  overrides: ShortcutOverride[],
  shortcutId: string,
  binding: KeyCombo | null,
): ShortcutOverride[] {
  return [
    ...overrides.filter((override) => override.shortcutId !== shortcutId),
    {
      shortcutId,
      binding: binding ? normalizeKeyCombo(binding) : null,
    },
  ]
}

function getActiveBindingsForShortcut(
  overrides: ShortcutOverride[],
  shortcutId: string,
): ShortcutBindingDescriptor[] {
  const definition = getShortcutDef(shortcutId)
  if (!definition) return []

  const override = getOverride(overrides, shortcutId)
  const hasOverride = override !== undefined
  const primaryBinding = hasOverride ? override?.binding ?? null : definition.defaultBinding

  return getResolvedBindings(definition, primaryBinding, hasOverride)
}

function createConflict(
  shortcutId: string,
  binding: ShortcutBindingDescriptor,
): ShortcutConflict | null {
  const definition = getShortcutDef(shortcutId)
  if (!definition) return null

  return {
    id: definition.id,
    label: definition.label,
    combo: binding.combo,
    source: binding.source,
    readonly: binding.readonly || !!definition.readonly,
    reassignable: binding.source === 'primary' && !definition.readonly,
    displayString: formatKeyCombo(binding.combo),
  }
}

function collectConflictGroups(overrides: ShortcutOverride[]): ShortcutConflictGroup[] {
  const groups = new Map<string, ShortcutConflictGroup>()

  for (const definition of SHORTCUT_REGISTRY) {
    const bindings = getActiveBindingsForShortcut(overrides, definition.id)

    for (const binding of bindings) {
      const signature = getKeyComboSignature(binding.combo)
      const existing = groups.get(signature)
      const conflict = createConflict(definition.id, binding)
      if (!conflict) continue

      if (existing) {
        existing.entries.push(conflict)
        continue
      }

      groups.set(signature, {
        signature,
        combo: binding.combo,
        entries: [conflict],
      })
    }
  }

  return Array.from(groups.values()).filter((group) => group.entries.length > 1)
}

function normalizeStoredOverrides(value: unknown): ShortcutOverride[] {
  if (!Array.isArray(value)) return []

  const latest = new Map<string, ShortcutOverride>()

  for (const rawOverride of value) {
    if (!rawOverride || typeof rawOverride !== 'object') continue

    const shortcutId =
      'shortcutId' in rawOverride && typeof rawOverride.shortcutId === 'string'
        ? rawOverride.shortcutId
        : null

    if (!shortcutId) continue

    const definition = getShortcutDef(shortcutId)
    if (!definition || definition.readonly) continue

    const binding =
      'binding' in rawOverride && rawOverride.binding && typeof rawOverride.binding === 'object'
        ? normalizeKeyCombo(rawOverride.binding as KeyCombo)
        : rawOverride && 'binding' in rawOverride && rawOverride.binding === null
          ? null
          : undefined

    if (binding === undefined) continue

    latest.set(shortcutId, {
      shortcutId,
      binding,
    })
  }

  return Array.from(latest.values())
}

function pickConflictKeeper(entries: ShortcutConflict[]): ShortcutConflict {
  return entries.find((entry) => entry.readonly) || entries[0]
}

export const useShortcutStore = create<ShortcutState>()(
  persist(
    (set, get) => ({
      overrides: [],

      getBinding: (shortcutId: string) => {
        const override = getOverride(get().overrides, shortcutId)
        if (override) return override.binding
        const definition = getShortcutDef(shortcutId)
        return definition?.defaultBinding ?? null
      },

      getActiveBindings: (shortcutId: string) => {
        return getActiveBindingsForShortcut(get().overrides, shortcutId)
      },

      getDisplayString: (shortcutId: string) => {
        const bindings = get().getActiveBindings(shortcutId)
        if (bindings.length === 0) return 'Unassigned'
        return bindings.map((binding) => formatKeyCombo(binding.combo)).join(' / ')
      },

      getDefaultDisplayString: (shortcutId: string) => {
        const definition = getShortcutDef(shortcutId)
        if (!definition) return 'Unassigned'
        return getDefaultBindings(definition)
          .map((binding) => formatKeyCombo(binding.combo))
          .join(' / ')
      },

      isCustomized: (shortcutId: string) => {
        return get().overrides.some((override) => override.shortcutId === shortcutId)
      },

      isDisabled: (shortcutId: string) => {
        return get().overrides.some(
          (override) => override.shortcutId === shortcutId && override.binding === null,
        )
      },

      findConflicts: (combo: KeyCombo, excludeId?: string) => {
        const normalized = normalizeKeyCombo(combo)
        const matches: ShortcutConflict[] = []

        for (const definition of SHORTCUT_REGISTRY) {
          if (definition.id === excludeId) continue

          for (const binding of getActiveBindingsForShortcut(get().overrides, definition.id)) {
            if (getKeyComboSignature(binding.combo) !== getKeyComboSignature(normalized)) continue

            const conflict = createConflict(definition.id, binding)
            if (conflict) matches.push(conflict)
          }
        }

        return matches
      },

      getConflictGroups: () => {
        return collectConflictGroups(get().overrides)
      },

      isReserved: (combo: KeyCombo) => isReservedCombo(combo),

      assignBinding: (shortcutId, binding, options) => {
        const definition = getShortcutDef(shortcutId)
        if (!definition || definition.readonly) {
          return { status: 'blocked', conflicts: [] }
        }

        const normalized = normalizeKeyCombo(binding)
        const conflicts = get().findConflicts(normalized, shortcutId)

        if (conflicts.length > 0 && !options?.replaceConflicts) {
          const status = conflicts.some((conflict) => !conflict.reassignable)
            ? 'blocked'
            : 'conflict'
          return { status, conflicts }
        }

        if (conflicts.some((conflict) => !conflict.reassignable)) {
          return { status: 'blocked', conflicts }
        }

        set((state) => {
          let nextOverrides = mergeOverride(state.overrides, shortcutId, normalized)

          if (options?.replaceConflicts) {
            const conflictsToDisable = Array.from(
              new Set(conflicts.filter((conflict) => conflict.reassignable).map((conflict) => conflict.id)),
            )

            for (const conflictId of conflictsToDisable) {
              nextOverrides = mergeOverride(nextOverrides, conflictId, null)
            }
          }

          return { overrides: nextOverrides }
        })

        return { status: 'assigned', conflicts }
      },

      setOverride: (shortcutId, binding) => {
        const definition = getShortcutDef(shortcutId)
        if (!definition || definition.readonly) return

        set((state) => ({
          overrides: mergeOverride(state.overrides, shortcutId, binding),
        }))
      },

      clearBinding: (shortcutId) => {
        const definition = getShortcutDef(shortcutId)
        if (!definition || definition.readonly) return

        set((state) => ({
          overrides: mergeOverride(state.overrides, shortcutId, null),
        }))
      },

      resetOne: (shortcutId) => {
        set((state) => ({
          overrides: state.overrides.filter((override) => override.shortcutId !== shortcutId),
        }))
      },

      resetAll: () => {
        set({ overrides: [] })
      },

      repairConflicts: () => {
        set((state) => {
          const groups = collectConflictGroups(state.overrides)
          if (groups.length === 0) return state

          let nextOverrides = [...state.overrides]

          for (const group of groups) {
            const keeper = pickConflictKeeper(group.entries)

            for (const entry of group.entries) {
              if (entry.id === keeper.id && entry.source === keeper.source) continue
              if (!entry.reassignable) continue
              nextOverrides = mergeOverride(nextOverrides, entry.id, null)
            }
          }

          return { overrides: nextOverrides }
        })
      },
    }),
    {
      name: 'ghostshell-shortcuts',
      storage: electronStorage as any,
      partialize: (state) => ({ overrides: state.overrides }),
      version: 2,
      migrate: (persistedState) => {
        const overrides = normalizeStoredOverrides(
          persistedState && typeof persistedState === 'object' && 'overrides' in persistedState
            ? (persistedState as { overrides?: unknown }).overrides
            : [],
        )

        return { overrides }
      },
    },
  ),
)
