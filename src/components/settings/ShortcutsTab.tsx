import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Compass,
  Keyboard,
  Layers,
  Lock,
  RotateCcw,
  Search,
  Shield,
  Terminal,
} from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { useShortcutStore, type ShortcutConflict } from '../../stores/shortcutStore'
import {
  CATEGORY_DESCRIPTIONS,
  CATEGORY_LABELS,
  SHORTCUT_REGISTRY,
  eventToKeyCombo,
  getDefaultBindings,
  getKeyComboParts,
  getKeyComboSignature,
  isModifierOnly,
  type KeyCombo,
  type ShortcutBindingDescriptor,
  type ShortcutCategory,
  type ShortcutDefinition,
} from '../../lib/shortcutRegistry'

type ShortcutViewFilter = 'all' | 'customized' | 'conflicts' | 'readonly'

interface CaptureIssue {
  combo: KeyCombo
  conflicts: ShortcutConflict[]
  reserved: boolean
}

const CATEGORY_ICONS: Record<ShortcutCategory, React.ReactNode> = {
  terminal: <Terminal className="h-4 w-4" />,
  navigation: <Compass className="h-4 w-4" />,
  tabs: <Layers className="h-4 w-4" />,
  'terminal-input': <Keyboard className="h-4 w-4" />,
}

const CATEGORY_ORDER: ShortcutCategory[] = ['terminal', 'navigation', 'tabs', 'terminal-input']

const VIEW_FILTERS: {
  id: ShortcutViewFilter
  label: string
  description: string
}[] = [
  { id: 'all', label: 'All', description: 'Every registered shortcut.' },
  { id: 'customized', label: 'Customized', description: 'Only shortcuts with overrides.' },
  { id: 'conflicts', label: 'Conflicts', description: 'Bindings competing for the same combo.' },
  { id: 'readonly', label: 'Protected', description: 'Terminal-level bindings you cannot edit.' },
]

function createPendingBinding(combo: KeyCombo): ShortcutBindingDescriptor[] {
  return [{ combo, source: 'primary', readonly: false }]
}

function findShortcutById(shortcutId: string | null): ShortcutDefinition | undefined {
  if (!shortcutId) return undefined
  return SHORTCUT_REGISTRY.find((shortcut) => shortcut.id === shortcutId)
}

export function ShortcutsTab() {
  const {
    overrides,
    getActiveBindings,
    getDisplayString,
    getDefaultDisplayString,
    isCustomized,
    isDisabled,
    getConflictGroups,
    isReserved,
    assignBinding,
    clearBinding,
    resetOne,
    resetAll,
    repairConflicts,
  } = useShortcutStore()

  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<ShortcutCategory | 'all'>('all')
  const [viewFilter, setViewFilter] = useState<ShortcutViewFilter>('all')
  const [selectedId, setSelectedId] = useState<string>(SHORTCUT_REGISTRY[0]?.id || '')
  const [recordingId, setRecordingId] = useState<string | null>(null)
  const [pendingCombo, setPendingCombo] = useState<KeyCombo | null>(null)
  const [captureIssue, setCaptureIssue] = useState<CaptureIssue | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)
  const recordingRef = useRef<string | null>(null)

  useEffect(() => {
    recordingRef.current = recordingId
  }, [recordingId])

  const conflictGroups = useMemo(() => getConflictGroups(), [getConflictGroups, overrides])
  const conflictedIds = useMemo(
    () => new Set(conflictGroups.flatMap((group) => group.entries.map((entry) => entry.id))),
    [conflictGroups],
  )

  const query = search.trim().toLowerCase()

  const searchAndViewFiltered = useMemo(() => {
    return SHORTCUT_REGISTRY.filter((shortcut) => {
      if (viewFilter === 'customized' && !isCustomized(shortcut.id)) return false
      if (viewFilter === 'conflicts' && !conflictedIds.has(shortcut.id)) return false
      if (viewFilter === 'readonly' && !shortcut.readonly) return false
      if (!query) return true

      const searchableFields = [
        shortcut.label,
        shortcut.description,
        shortcut.id,
        CATEGORY_LABELS[shortcut.category],
        getDisplayString(shortcut.id),
        getDefaultDisplayString(shortcut.id),
      ]

      return searchableFields.some((value) => value.toLowerCase().includes(query))
    })
  }, [
    conflictedIds,
    getDefaultDisplayString,
    getDisplayString,
    isCustomized,
    query,
    viewFilter,
  ])

  const filtered = useMemo(() => {
    if (categoryFilter === 'all') return searchAndViewFiltered
    return searchAndViewFiltered.filter((shortcut) => shortcut.category === categoryFilter)
  }, [categoryFilter, searchAndViewFiltered])

  const grouped = useMemo(
    () =>
      CATEGORY_ORDER.map((category) => ({
        category,
        shortcuts: filtered.filter((shortcut) => shortcut.category === category),
      })).filter((group) => group.shortcuts.length > 0),
    [filtered],
  )

  const categoryStats = useMemo(
    () =>
      CATEGORY_ORDER.map((category) => {
        const items = searchAndViewFiltered.filter((shortcut) => shortcut.category === category)
        return {
          id: category,
          count: items.length,
          customized: items.filter((shortcut) => isCustomized(shortcut.id)).length,
        }
      }),
    [isCustomized, searchAndViewFiltered],
  )

  useEffect(() => {
    if (recordingId) {
      setSelectedId(recordingId)
      return
    }

    if (filtered.length === 0) return
    if (!filtered.some((shortcut) => shortcut.id === selectedId)) {
      setSelectedId(filtered[0].id)
    }
  }, [filtered, recordingId, selectedId])

  const selectedShortcut = useMemo(
    () => findShortcutById(selectedId) || filtered[0] || SHORTCUT_REGISTRY[0],
    [filtered, selectedId],
  )

  const selectedBindings = useMemo(
    () => (selectedShortcut ? getActiveBindings(selectedShortcut.id) : []),
    [getActiveBindings, overrides, selectedShortcut],
  )

  const selectedDefaults = useMemo(
    () => (selectedShortcut ? getDefaultBindings(selectedShortcut) : []),
    [selectedShortcut],
  )

  const selectedConflictGroups = useMemo(() => {
    if (!selectedShortcut) return []
    return conflictGroups.filter((group) =>
      group.entries.some((entry) => entry.id === selectedShortcut.id),
    )
  }, [conflictGroups, selectedShortcut])

  const selectedConflictPeers = useMemo(() => {
    if (!selectedShortcut) return []
    return selectedConflictGroups.flatMap((group) =>
      group.entries.filter((entry) => entry.id !== selectedShortcut.id),
    )
  }, [selectedConflictGroups, selectedShortcut])

  const canReplaceCaptureConflicts =
    !!captureIssue &&
    !captureIssue.reserved &&
    captureIssue.conflicts.length > 0 &&
    captureIssue.conflicts.every((conflict) => conflict.reassignable)

  const readonlyCount = SHORTCUT_REGISTRY.filter((shortcut) => shortcut.readonly).length
  const customizedCount = overrides.length
  const disabledCount = overrides.filter((override) => override.binding === null).length

  const stopRecording = useCallback(() => {
    setRecordingId(null)
    setPendingCombo(null)
    setCaptureIssue(null)
  }, [])

  const startRecording = useCallback((shortcutId: string) => {
    setSelectedId(shortcutId)
    setRecordingId(shortcutId)
    setPendingCombo(null)
    setCaptureIssue(null)
  }, [])

  useEffect(() => {
    const handleRecordingKeyDown = (event: KeyboardEvent) => {
      const currentShortcutId = recordingRef.current
      if (!currentShortcutId) return

      event.preventDefault()
      event.stopPropagation()

      if (event.key === 'Escape') {
        stopRecording()
        return
      }

      if (isModifierOnly(event)) return

      if (!event.ctrlKey && !event.shiftKey && !event.altKey && event.key === 'Backspace') {
        clearBinding(currentShortcutId)
        stopRecording()
        return
      }

      const combo = eventToKeyCombo(event)
      setPendingCombo(combo)

      if (isReserved(combo)) {
        setCaptureIssue({ combo, conflicts: [], reserved: true })
        return
      }

      const result = assignBinding(currentShortcutId, combo)
      if (result.status === 'assigned') {
        stopRecording()
        return
      }

      setCaptureIssue({ combo, conflicts: result.conflicts, reserved: false })
    }

    window.addEventListener('keydown', handleRecordingKeyDown, true)
    return () => window.removeEventListener('keydown', handleRecordingKeyDown, true)
  }, [assignBinding, clearBinding, isReserved, stopRecording])

  const handleReplaceConflicts = useCallback(() => {
    if (!recordingId || !captureIssue) return

    const result = assignBinding(recordingId, captureIssue.combo, { replaceConflicts: true })
    if (result.status === 'assigned') {
      stopRecording()
    }
  }, [assignBinding, captureIssue, recordingId, stopRecording])

  return (
    <motion.div
      key="shortcuts"
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 10 }}
      transition={{ duration: 0.14 }}
      className="flex flex-col gap-4"
    >
      <section className="ghost-section-card overflow-hidden rounded-2xl">
        <div className="grid gap-5 px-5 py-5 xl:grid-cols-[1.3fr,0.9fr]">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[10px] uppercase tracking-[0.24em] text-ghost-text-dim/75">
              <Keyboard className="h-3.5 w-3.5" />
              Keyboard Command Center
            </div>
            <div>
              <h3 className="text-[20px] font-semibold tracking-tight text-ghost-text">
                Shortcuts rebuilt around active bindings, not dead strings.
              </h3>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ghost-text-dim/78">
                Conflicts are detected against everything currently active, protected terminal
                combos are blocked, duplicate bindings can be repaired, and overrides can be
                disabled without destroying the default catalog.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <ShortcutStatCard
              label="Registered"
              value={SHORTCUT_REGISTRY.length}
              hint="Full catalog in this build."
              tone="default"
            />
            <ShortcutStatCard
              label="Customized"
              value={customizedCount}
              hint="Overrides stored locally."
              tone="accent"
            />
            <ShortcutStatCard
              label="Disabled"
              value={disabledCount}
              hint="Commands intentionally unassigned."
              tone="warning"
            />
            <ShortcutStatCard
              label="Protected"
              value={readonlyCount}
              hint="Terminal-owned bindings."
              tone="muted"
            />
          </div>
        </div>

        <div className="border-t border-white/8 bg-black/15 px-5 py-3">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap items-center gap-2 text-xs text-ghost-text-dim/75">
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1">
                {conflictGroups.length === 0
                  ? 'No active conflicts'
                  : `${conflictGroups.length} conflict group${conflictGroups.length === 1 ? '' : 's'} detected`}
              </span>
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1">
                Backspace disables while recording
              </span>
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1">
                Reset restores defaults and secondary bindings
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {conflictGroups.length > 0 && (
                <button
                  onClick={repairConflicts}
                  className="inline-flex h-9 items-center gap-2 rounded-xl border border-amber-300/30 bg-amber-300/10 px-3 text-xs font-semibold uppercase tracking-[0.14em] text-amber-200 transition-colors hover:bg-amber-300/16"
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Repair Conflicts
                </button>
              )}

              <AnimatePresence mode="wait">
                {confirmReset ? (
                  <motion.div
                    key="confirm-reset"
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    className="flex items-center gap-2"
                  >
                    <span className="text-xs text-ghost-text-dim/75">Reset every override?</span>
                    <button
                      onClick={() => {
                        resetAll()
                        setConfirmReset(false)
                      }}
                      className="inline-flex h-9 items-center gap-2 rounded-xl border border-red-400/30 bg-red-400/14 px-3 text-xs font-semibold uppercase tracking-[0.14em] text-red-200 transition-colors hover:bg-red-400/18"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Confirm
                    </button>
                    <button
                      onClick={() => setConfirmReset(false)}
                      className="inline-flex h-9 items-center rounded-xl border border-white/12 bg-black/20 px-3 text-xs font-semibold uppercase tracking-[0.14em] text-ghost-text-dim transition-colors hover:text-ghost-text"
                    >
                      Cancel
                    </button>
                  </motion.div>
                ) : (
                  <motion.button
                    key="reset-all"
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    onClick={() => setConfirmReset(true)}
                    disabled={overrides.length === 0}
                    className="inline-flex h-9 items-center gap-2 rounded-xl border border-white/12 bg-black/20 px-3 text-xs font-semibold uppercase tracking-[0.14em] text-ghost-text transition-colors hover:border-ghost-accent/35 hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Reset All
                  </motion.button>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="flex flex-col gap-4 xl:sticky xl:top-0 xl:self-start">
          <section className="ghost-section-card rounded-2xl p-4">
            <label className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.22em] text-ghost-text-dim/60">
              Search Catalog
            </label>
            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/22 px-3 py-2.5">
              <Search className="h-4 w-4 shrink-0 text-ghost-text-dim/60" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Find action, key, or id"
                className="w-full bg-transparent text-sm text-ghost-text placeholder:text-ghost-text-dim/45 outline-none"
              />
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {VIEW_FILTERS.map((filter) => (
                <button
                  key={filter.id}
                  onClick={() => setViewFilter(filter.id)}
                  className={`rounded-xl border px-3 py-2 text-left transition-colors ${
                    viewFilter === filter.id
                      ? 'border-ghost-accent/30 bg-ghost-accent/12 text-ghost-accent'
                      : 'border-white/10 bg-black/18 text-ghost-text-dim hover:text-ghost-text'
                  }`}
                  title={filter.description}
                >
                  <span className="block text-[10px] font-semibold uppercase tracking-[0.18em]">
                    {filter.label}
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className="ghost-section-card rounded-2xl p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-ghost-text-dim/60">
                  Categories
                </p>
                <p className="mt-1 text-xs text-ghost-text-dim/70">
                  Counts respond to search and status filters.
                </p>
              </div>
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] text-ghost-text-dim/70">
                {searchAndViewFiltered.length} visible
              </span>
            </div>

            <div className="flex flex-col gap-2">
              <CategoryButton
                active={categoryFilter === 'all'}
                icon={<Keyboard className="h-4 w-4" />}
                label="All shortcuts"
                description="Cross-surface catalog"
                count={searchAndViewFiltered.length}
                extraCount={customizedCount}
                onClick={() => setCategoryFilter('all')}
              />
              {categoryStats.map((category) => (
                <CategoryButton
                  key={category.id}
                  active={categoryFilter === category.id}
                  icon={CATEGORY_ICONS[category.id]}
                  label={CATEGORY_LABELS[category.id]}
                  description={CATEGORY_DESCRIPTIONS[category.id]}
                  count={category.count}
                  extraCount={category.customized}
                  onClick={() => setCategoryFilter(category.id)}
                />
              ))}
            </div>
          </section>

          {selectedShortcut && (
            <ShortcutInspector
              shortcut={selectedShortcut}
              activeBindings={selectedBindings}
              defaultBindings={selectedDefaults}
              displayString={getDisplayString(selectedShortcut.id)}
              defaultDisplayString={getDefaultDisplayString(selectedShortcut.id)}
              isCustomized={isCustomized(selectedShortcut.id)}
              isDisabled={isDisabled(selectedShortcut.id)}
              hasConflicts={conflictedIds.has(selectedShortcut.id)}
              conflictPeers={selectedConflictPeers}
              isRecording={recordingId === selectedShortcut.id}
              pendingCombo={pendingCombo}
              captureIssue={captureIssue}
              canReplaceCaptureConflicts={canReplaceCaptureConflicts}
              onStartRecording={() => startRecording(selectedShortcut.id)}
              onDisable={() => clearBinding(selectedShortcut.id)}
              onReset={() => resetOne(selectedShortcut.id)}
              onReplaceConflicts={handleReplaceConflicts}
              onCancelRecording={stopRecording}
            />
          )}
        </aside>

        <main className="flex flex-col gap-4">
          {grouped.length === 0 ? (
            <section className="ghost-section-card rounded-2xl px-5 py-10 text-center">
              <p className="text-sm font-medium text-ghost-text">No shortcuts match this view.</p>
              <p className="mt-2 text-sm text-ghost-text-dim/72">
                Adjust your search, category, or state filters to bring commands back into scope.
              </p>
            </section>
          ) : (
            grouped.map(({ category, shortcuts }) => (
              <section key={category} className="ghost-section-card overflow-hidden rounded-2xl">
                <div className="flex items-center gap-3 border-b border-white/8 px-5 py-4">
                  <span className="text-ghost-text-dim/80">{CATEGORY_ICONS[category]}</span>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-ghost-text-dim/60">
                      {CATEGORY_LABELS[category]}
                    </p>
                    <p className="mt-1 text-sm text-ghost-text-dim/72">
                      {CATEGORY_DESCRIPTIONS[category]}
                    </p>
                  </div>
                  <div className="ml-auto flex items-center gap-2">
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] text-ghost-text-dim/70">
                      {shortcuts.length}
                    </span>
                    {category === 'terminal-input' && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] text-ghost-text-dim/70">
                        <Lock className="h-3 w-3" />
                        Read-only
                      </span>
                    )}
                  </div>
                </div>

                <div className="divide-y divide-white/[0.05]">
                  {shortcuts.map((shortcut) => (
                    <ShortcutRow
                      key={shortcut.id}
                      shortcut={shortcut}
                      bindings={getActiveBindings(shortcut.id)}
                      defaultDisplayString={getDefaultDisplayString(shortcut.id)}
                      isSelected={selectedShortcut?.id === shortcut.id}
                      isRecording={recordingId === shortcut.id}
                      isCustomized={isCustomized(shortcut.id)}
                      isDisabled={isDisabled(shortcut.id)}
                      hasConflict={conflictedIds.has(shortcut.id)}
                      pendingCombo={recordingId === shortcut.id ? pendingCombo : null}
                      captureIssue={recordingId === shortcut.id ? captureIssue : null}
                      onSelect={() => setSelectedId(shortcut.id)}
                      onStartRecording={() => startRecording(shortcut.id)}
                      onReset={() => resetOne(shortcut.id)}
                    />
                  ))}
                </div>
              </section>
            ))
          )}
        </main>
      </div>
    </motion.div>
  )
}

function ShortcutStatCard(_: {
  label: string
  value: number
  hint: string
  tone: 'default' | 'accent' | 'warning' | 'muted'
}) {
  const { label, value, hint, tone } = _
  const toneClass =
    tone === 'accent'
      ? 'border-ghost-accent/25 bg-ghost-accent/10 text-ghost-accent'
      : tone === 'warning'
        ? 'border-amber-300/25 bg-amber-300/10 text-amber-200'
        : tone === 'muted'
          ? 'border-white/10 bg-white/[0.03] text-ghost-text-dim'
          : 'border-white/10 bg-black/18 text-ghost-text'

  return (
    <div className={`rounded-2xl border px-4 py-3 ${toneClass}`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] opacity-80">{label}</p>
      <p className="mt-3 text-[28px] font-semibold leading-none tabular-nums">{value}</p>
      <p className="mt-2 text-xs opacity-75">{hint}</p>
    </div>
  )
}

function CategoryButton(_: {
  active: boolean
  icon: React.ReactNode
  label: string
  description: string
  count: number
  extraCount: number
  onClick: () => void
}) {
  const { active, icon, label, description, count, extraCount, onClick } = _

  return (
    <button
      onClick={onClick}
      className={`flex items-start gap-3 rounded-2xl border px-3.5 py-3 text-left transition-all ${
        active
          ? 'border-ghost-accent/28 bg-ghost-accent/12'
          : 'border-white/10 bg-black/18 hover:border-white/14 hover:bg-white/[0.03]'
      }`}
    >
      <span className={active ? 'text-ghost-accent' : 'text-ghost-text-dim/70'}>{icon}</span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className={`truncate text-sm font-medium ${active ? 'text-ghost-text' : 'text-ghost-text-dim'}`}>
            {label}
          </p>
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] text-ghost-text-dim/70">
            {count}
          </span>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-ghost-text-dim/65">{description}</p>
        {extraCount > 0 && (
          <p className="mt-2 text-[10px] uppercase tracking-[0.16em] text-ghost-accent/85">
            {extraCount} customized
          </p>
        )}
      </div>
    </button>
  )
}

function ShortcutInspector(_: {
  shortcut: ShortcutDefinition
  activeBindings: ShortcutBindingDescriptor[]
  defaultBindings: ShortcutBindingDescriptor[]
  displayString: string
  defaultDisplayString: string
  isCustomized: boolean
  isDisabled: boolean
  hasConflicts: boolean
  conflictPeers: ShortcutConflict[]
  isRecording: boolean
  pendingCombo: KeyCombo | null
  captureIssue: CaptureIssue | null
  canReplaceCaptureConflicts: boolean
  onStartRecording: () => void
  onDisable: () => void
  onReset: () => void
  onReplaceConflicts: () => void
  onCancelRecording: () => void
}) {
  const {
    shortcut,
    activeBindings,
    defaultBindings,
    displayString,
    defaultDisplayString,
    isCustomized,
    isDisabled,
    hasConflicts,
    conflictPeers,
    isRecording,
    pendingCombo,
    captureIssue,
    canReplaceCaptureConflicts,
    onStartRecording,
    onDisable,
    onReset,
    onReplaceConflicts,
    onCancelRecording,
  } = _

  return (
    <section className="ghost-section-card rounded-2xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-ghost-text-dim/60">
            Inspector
          </p>
          <h4 className="mt-2 text-lg font-semibold tracking-tight text-ghost-text">
            {shortcut.label}
          </h4>
          <p className="mt-2 text-sm leading-relaxed text-ghost-text-dim/76">
            {shortcut.description}
          </p>
        </div>

        <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-ghost-text-dim/70">
          {CATEGORY_LABELS[shortcut.category]}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {shortcut.readonly && (
          <StatusPill label="Protected" tone="muted" icon={<Lock className="h-3 w-3" />} />
        )}
        {!shortcut.readonly && isCustomized && (
          <StatusPill label={isDisabled ? 'Disabled' : 'Customized'} tone="accent" />
        )}
        {hasConflicts && (
          <StatusPill label="Conflict" tone="warning" icon={<AlertTriangle className="h-3 w-3" />} />
        )}
        {activeBindings.length > 1 && (
          <StatusPill label="Secondary default" tone="default" icon={<Shield className="h-3 w-3" />} />
        )}
      </div>

      <div className="mt-5 space-y-4">
        <div className="rounded-2xl border border-white/10 bg-black/18 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ghost-text-dim/60">
            Current Binding
          </p>
          <div className="mt-3">
            <BindingCluster bindings={activeBindings} />
          </div>
          <p className="mt-3 text-xs leading-relaxed text-ghost-text-dim/72">{displayString}</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/18 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ghost-text-dim/60">
            Default Profile
          </p>
          <div className="mt-3">
            <BindingCluster bindings={defaultBindings} muted />
          </div>
          <p className="mt-3 text-xs leading-relaxed text-ghost-text-dim/72">
            {defaultDisplayString}
          </p>
        </div>
      </div>

      {!shortcut.readonly && (
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            onClick={onStartRecording}
            className={`inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-xs font-semibold uppercase tracking-[0.14em] transition-colors ${
              isRecording
                ? 'border-ghost-accent/30 bg-ghost-accent/12 text-ghost-accent'
                : 'border-white/12 bg-black/20 text-ghost-text hover:border-ghost-accent/30'
            }`}
          >
            <Keyboard className="h-3.5 w-3.5" />
            {isRecording ? 'Recording' : 'Change Binding'}
          </button>

          <button
            onClick={onDisable}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/12 bg-black/20 px-3 text-xs font-semibold uppercase tracking-[0.14em] text-ghost-text-dim transition-colors hover:text-ghost-text"
          >
            Disable
          </button>

          {isCustomized && (
            <button
              onClick={onReset}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/12 bg-black/20 px-3 text-xs font-semibold uppercase tracking-[0.14em] text-ghost-text-dim transition-colors hover:text-ghost-text"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </button>
          )}
        </div>
      )}

      {isRecording && (
        <div className="mt-5 rounded-2xl border border-ghost-accent/24 bg-ghost-accent/10 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-ghost-accent/85">
            Listening
          </p>

          <div className="mt-3">
            {pendingCombo ? (
              <BindingCluster bindings={createPendingBinding(pendingCombo)} />
            ) : (
              <p className="text-sm text-ghost-text">Press the new shortcut now.</p>
            )}
          </div>

          <p className="mt-3 text-xs text-ghost-text-dim/76">
            Esc cancels. Backspace disables this command.
          </p>

          {captureIssue?.reserved && (
            <div className="mt-4 rounded-2xl border border-red-400/26 bg-red-400/12 px-3 py-3 text-sm text-red-200">
              This combo is reserved by terminal behavior and cannot be reassigned.
            </div>
          )}

          {!!captureIssue && !captureIssue.reserved && captureIssue.conflicts.length > 0 && (
            <div className="mt-4 rounded-2xl border border-amber-300/26 bg-amber-300/12 px-3 py-3">
              <p className="text-sm font-medium text-amber-100">
                This combo is already active elsewhere.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {captureIssue.conflicts.map((conflict) => (
                  <span
                    key={`${conflict.id}-${conflict.source}-${getKeyComboSignature(conflict.combo)}`}
                    className="rounded-full border border-white/10 bg-black/16 px-2.5 py-1 text-[11px] text-amber-100/90"
                  >
                    {conflict.label}
                    {conflict.source === 'secondary' ? ' (secondary)' : ''}
                  </span>
                ))}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {canReplaceCaptureConflicts && (
                  <button
                    onClick={onReplaceConflicts}
                    className="inline-flex h-9 items-center gap-2 rounded-xl border border-amber-300/28 bg-amber-300/14 px-3 text-xs font-semibold uppercase tracking-[0.14em] text-amber-100 transition-colors hover:bg-amber-300/18"
                  >
                    Replace Conflicts
                  </button>
                )}
                <button
                  onClick={onCancelRecording}
                  className="inline-flex h-9 items-center rounded-xl border border-white/12 bg-black/20 px-3 text-xs font-semibold uppercase tracking-[0.14em] text-ghost-text-dim transition-colors hover:text-ghost-text"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {hasConflicts && conflictPeers.length > 0 && !isRecording && (
        <div className="mt-5 rounded-2xl border border-amber-300/20 bg-amber-300/10 px-3 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-100/80">
            Competing Bindings
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {conflictPeers.map((conflict) => (
              <span
                key={`${conflict.id}-${conflict.source}-${getKeyComboSignature(conflict.combo)}`}
                className="rounded-full border border-white/10 bg-black/16 px-2.5 py-1 text-[11px] text-amber-100/90"
              >
                {conflict.label}
                {conflict.source === 'secondary' ? ' (secondary)' : ''}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

function ShortcutRow(_: {
  shortcut: ShortcutDefinition
  bindings: ShortcutBindingDescriptor[]
  defaultDisplayString: string
  isSelected: boolean
  isRecording: boolean
  isCustomized: boolean
  isDisabled: boolean
  hasConflict: boolean
  pendingCombo: KeyCombo | null
  captureIssue: CaptureIssue | null
  onSelect: () => void
  onStartRecording: () => void
  onReset: () => void
}) {
  const {
    shortcut,
    bindings,
    defaultDisplayString,
    isSelected,
    isRecording,
    isCustomized,
    isDisabled,
    hasConflict,
    pendingCombo,
    captureIssue,
    onSelect,
    onStartRecording,
    onReset,
  } = _

  return (
    <div
      onClick={onSelect}
      className={`cursor-pointer px-5 py-4 transition-colors ${
        isSelected ? 'bg-white/[0.04]' : 'hover:bg-white/[0.02]'
      }`}
    >
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.95fr)_auto] xl:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-medium text-ghost-text">{shortcut.label}</p>
            {shortcut.readonly && (
              <StatusPill label="Protected" tone="muted" icon={<Lock className="h-3 w-3" />} />
            )}
            {!shortcut.readonly && isCustomized && (
              <StatusPill label={isDisabled ? 'Disabled' : 'Customized'} tone="accent" />
            )}
            {hasConflict && (
              <StatusPill label="Conflict" tone="warning" icon={<AlertTriangle className="h-3 w-3" />} />
            )}
          </div>
          <p className="mt-1 text-sm leading-relaxed text-ghost-text-dim/72">
            {shortcut.description}
          </p>
          <p className="mt-2 text-[11px] uppercase tracking-[0.16em] text-ghost-text-dim/45">
            Default: {defaultDisplayString}
          </p>
        </div>

        <div className="min-w-0">
          <BindingCluster bindings={bindings} />
        </div>

        <div className="flex items-center gap-2 xl:justify-self-end">
          {!shortcut.readonly && (
            <button
              onClick={(event) => {
                event.stopPropagation()
                onStartRecording()
              }}
              className={`inline-flex h-9 items-center gap-2 rounded-xl border px-3 text-xs font-semibold uppercase tracking-[0.14em] transition-colors ${
                isRecording
                  ? 'border-ghost-accent/30 bg-ghost-accent/12 text-ghost-accent'
                  : 'border-white/12 bg-black/20 text-ghost-text-dim hover:text-ghost-text'
              }`}
            >
              <Keyboard className="h-3.5 w-3.5" />
              {isRecording ? 'Listening' : 'Edit'}
            </button>
          )}

          {!shortcut.readonly && isCustomized && !isRecording && (
            <button
              onClick={(event) => {
                event.stopPropagation()
                onReset()
              }}
              className="inline-flex h-9 items-center gap-2 rounded-xl border border-white/12 bg-black/20 px-3 text-xs font-semibold uppercase tracking-[0.14em] text-ghost-text-dim transition-colors hover:text-ghost-text"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </button>
          )}
        </div>
      </div>

      {isRecording && (
        <div className="mt-4 rounded-2xl border border-ghost-accent/24 bg-ghost-accent/10 px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-ghost-accent/85">
              Capture
            </span>
            {pendingCombo ? (
              <BindingCluster bindings={createPendingBinding(pendingCombo)} />
            ) : (
              <span className="text-sm text-ghost-text">Waiting for input...</span>
            )}
          </div>

          {captureIssue?.reserved && (
            <p className="mt-3 text-sm text-red-200">
              Reserved by terminal behavior. Choose a different combo.
            </p>
          )}

          {!!captureIssue && !captureIssue.reserved && captureIssue.conflicts.length > 0 && (
            <p className="mt-3 text-sm text-amber-100">
              Conflicts with{' '}
              {captureIssue.conflicts
                .map((conflict) =>
                  conflict.source === 'secondary'
                    ? `${conflict.label} (secondary)`
                    : conflict.label,
                )
                .join(', ')}
              .
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function BindingCluster(_: {
  bindings: ShortcutBindingDescriptor[]
  muted?: boolean
}) {
  const { bindings, muted = false } = _

  if (bindings.length === 0) {
    return (
      <span className="inline-flex rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-xs text-ghost-text-dim/70">
        Unassigned
      </span>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {bindings.map((binding, index) => (
        <div
          key={`${binding.source}-${getKeyComboSignature(binding.combo)}`}
          className="flex flex-wrap items-center gap-2"
        >
          {index > 0 && (
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ghost-text-dim/45">
              or
            </span>
          )}

          <div className="flex flex-wrap items-center gap-1.5">
            {getKeyComboParts(binding.combo).map((part) => (
              <kbd
                key={`${binding.source}-${getKeyComboSignature(binding.combo)}-${part}`}
                className={`ghost-shortcut-key ${muted ? 'ghost-shortcut-key-muted' : ''}`}
              >
                {part}
              </kbd>
            ))}

            {binding.source === 'secondary' && (
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-ghost-text-dim/70">
                Secondary
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function StatusPill(_: {
  label: string
  tone: 'default' | 'accent' | 'warning' | 'muted'
  icon?: React.ReactNode
}) {
  const { label, tone, icon } = _
  const toneClass =
    tone === 'accent'
      ? 'border-ghost-accent/24 bg-ghost-accent/10 text-ghost-accent'
      : tone === 'warning'
        ? 'border-amber-300/24 bg-amber-300/10 text-amber-100'
        : tone === 'muted'
          ? 'border-white/10 bg-white/[0.04] text-ghost-text-dim/80'
          : 'border-white/10 bg-black/20 text-ghost-text-dim/80'

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${toneClass}`}
    >
      {icon}
      {label}
    </span>
  )
}
