import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Keyboard, Lock, RotateCcw, Search } from 'lucide-react'
import { useShortcutStore, type ShortcutConflict } from '../../stores/shortcutStore'
import {
  CATEGORY_LABELS,
  SHORTCUT_REGISTRY,
  eventToKeyCombo,
  getKeyComboParts,
  getKeyComboSignature,
  isModifierOnly,
  type KeyCombo,
  type ShortcutBindingDescriptor,
  type ShortcutDefinition,
} from '../../lib/shortcutRegistry'

interface CaptureIssue {
  combo: KeyCombo
  conflicts: ShortcutConflict[]
  reserved: boolean
}

function createPendingBinding(combo: KeyCombo): ShortcutBindingDescriptor[] {
  return [{ combo, source: 'primary', readonly: false }]
}

export function ShortcutsTab() {
  const {
    overrides,
    getActiveBindings,
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
  const [viewFilter, setViewFilter] = useState<'all' | 'customized' | 'conflicts'>('all')

  const conflictGroups = useMemo(() => getConflictGroups(), [getConflictGroups, overrides])
  const conflictedIds = useMemo(
    () => new Set(conflictGroups.flatMap((group) => group.entries.map((entry) => entry.id))),
    [conflictGroups],
  )

  const query = search.trim().toLowerCase()

  const filteredShortcuts = useMemo(() => {
    return SHORTCUT_REGISTRY.filter((shortcut) => {
      if (viewFilter === 'customized' && !isCustomized(shortcut.id)) return false
      if (viewFilter === 'conflicts' && !conflictedIds.has(shortcut.id)) return false

      if (!query) return true

      return (
        shortcut.label.toLowerCase().includes(query) ||
        shortcut.description.toLowerCase().includes(query) ||
        shortcut.id.toLowerCase().includes(query) ||
        CATEGORY_LABELS[shortcut.category].toLowerCase().includes(query)
      )
    })
  }, [conflictedIds, isCustomized, query, viewFilter])

  const grouped = useMemo(() => {
    const groups: Record<string, ShortcutDefinition[]> = {}
    for (const shortcut of filteredShortcuts) {
      if (!groups[shortcut.category]) groups[shortcut.category] = []
      groups[shortcut.category].push(shortcut)
    }
    return Object.entries(groups).map(([category, shortcuts]) => ({ category, shortcuts }))
  }, [filteredShortcuts])

  return (
    <div className="flex h-full flex-col gap-6 p-2">
      {/* Header & Controls */}
      <div className="flex flex-col gap-4 border-b border-white/10 pb-6">
        <div>
          <h2 className="text-xl font-bold text-white">Keyboard Shortcuts</h2>
          <p className="mt-1 text-sm text-white/60">
            Customize your workflow. Click any shortcut to remap it.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 focus-within:border-[#38bdf8]/50">
              <Search className="h-4 w-4 text-white/50" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search shortcuts..."
                className="w-48 bg-transparent text-sm text-white placeholder:text-white/30 outline-none"
              />
            </div>

            <div className="flex rounded-lg border border-white/10 bg-white/[0.02] p-1">
              {(['all', 'customized', 'conflicts'] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setViewFilter(filter)}
                  className={`rounded-md px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors ${
                    viewFilter === filter
                      ? 'bg-[#38bdf8]/20 text-[#38bdf8]'
                      : 'text-white/50 hover:text-white'
                  }`}
                >
                  {filter}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {conflictGroups.length > 0 && (
              <button
                onClick={repairConflicts}
                className="inline-flex items-center gap-2 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs font-bold uppercase tracking-wider text-amber-300 hover:bg-amber-400/20"
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                Fix Conflicts
              </button>
            )}
            {overrides.length > 0 && (
              <button
                onClick={resetAll}
                className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-bold uppercase tracking-wider text-white/70 hover:bg-white/[0.06] hover:text-white"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset All
              </button>
            )}
          </div>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto pr-2">
        {grouped.length === 0 ? (
          <div className="py-12 text-center text-sm text-white/50">
            No shortcuts match your criteria.
          </div>
        ) : (
          <div className="flex flex-col gap-8 pb-12">
            {grouped.map(({ category, shortcuts }) => (
              <div key={category} className="flex flex-col gap-3">
                <h3 className="text-xs font-bold uppercase tracking-widest text-[#38bdf8]">
                  {CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS]}
                </h3>
                <div className="flex flex-col rounded-xl border border-white/10 bg-white/[0.02]">
                  {shortcuts.map((shortcut, idx) => (
                    <ShortcutRow
                      key={shortcut.id}
                      shortcut={shortcut}
                      bindings={getActiveBindings(shortcut.id)}
                      defaultDisplayString={getDefaultDisplayString(shortcut.id)}
                      isCustomized={isCustomized(shortcut.id)}
                      isDisabled={isDisabled(shortcut.id)}
                      hasConflict={conflictedIds.has(shortcut.id)}
                      isReserved={isReserved}
                      assignBinding={assignBinding}
                      clearBinding={clearBinding}
                      resetOne={resetOne}
                      isLast={idx === shortcuts.length - 1}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ShortcutRow({
  shortcut,
  bindings,
  defaultDisplayString,
  isCustomized,
  isDisabled,
  hasConflict,
  isReserved,
  assignBinding,
  clearBinding,
  resetOne,
  isLast,
}: {
  shortcut: ShortcutDefinition
  bindings: ShortcutBindingDescriptor[]
  defaultDisplayString: string
  isCustomized: boolean
  isDisabled: boolean
  hasConflict: boolean
  isReserved: (combo: KeyCombo) => boolean
  assignBinding: (
    id: string,
    combo: KeyCombo,
    opts?: { replaceConflicts?: boolean },
  ) => { status: string; conflicts: ShortcutConflict[] }
  clearBinding: (id: string) => void
  resetOne: (id: string) => void
  isLast: boolean
}) {
  const [isRecording, setIsRecording] = useState(false)
  const [pendingCombo, setPendingCombo] = useState<KeyCombo | null>(null)
  const [captureIssue, setCaptureIssue] = useState<CaptureIssue | null>(null)

  const stopRecording = useCallback(() => {
    setIsRecording(false)
    setPendingCombo(null)
    setCaptureIssue(null)
  }, [])

  useEffect(() => {
    if (!isRecording) return

    const handleKeyDown = (event: KeyboardEvent) => {
      event.preventDefault()
      event.stopPropagation()

      if (event.key === 'Escape') {
        stopRecording()
        return
      }

      if (isModifierOnly(event)) return

      if (!event.ctrlKey && !event.shiftKey && !event.altKey && event.key === 'Backspace') {
        clearBinding(shortcut.id)
        stopRecording()
        return
      }

      const combo = eventToKeyCombo(event)
      setPendingCombo(combo)

      if (isReserved(combo)) {
        setCaptureIssue({ combo, conflicts: [], reserved: true })
        return
      }

      const result = assignBinding(shortcut.id, combo)
      if (result.status === 'assigned') {
        stopRecording()
        return
      }

      setCaptureIssue({ combo, conflicts: result.conflicts, reserved: false })
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [isRecording, assignBinding, clearBinding, isReserved, shortcut.id, stopRecording])

  return (
    <div
      className={`flex flex-col p-4 transition-colors ${!isLast ? 'border-b border-white/5' : ''} ${
        isRecording ? 'bg-[#38bdf8]/5' : 'hover:bg-white/[0.02]'
      }`}
    >
      <div className="flex items-center justify-between gap-4">
        {/* Info */}
        <div className="flex flex-1 flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-white">{shortcut.label}</span>
            {shortcut.readonly && (
              <span className="inline-flex items-center gap-1 rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white/60">
                <Lock className="h-3 w-3" /> Protected
              </span>
            )}
            {!shortcut.readonly && isCustomized && (
              <span className="rounded bg-[#38bdf8]/20 px-1.5 py-0.5 text-[10px] font-bold uppercase text-[#38bdf8]">
                {isDisabled ? 'Disabled' : 'Custom'}
              </span>
            )}
            {hasConflict && (
              <span className="inline-flex items-center gap-1 rounded bg-amber-400/20 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-400">
                <AlertTriangle className="h-3 w-3" /> Conflict
              </span>
            )}
          </div>
          <span className="text-xs text-white/50">{shortcut.description}</span>
        </div>

        {/* Binding Display */}
        <div className="flex items-center gap-3">
          {isRecording ? (
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-[#38bdf8] animate-pulse">Listening...</span>
              {pendingCombo && <BindingCluster bindings={createPendingBinding(pendingCombo)} />}
            </div>
          ) : (
            <BindingCluster bindings={bindings} />
          )}
        </div>

        {/* Actions */}
        <div className="flex w-32 items-center justify-end gap-2">
          {isRecording ? (
            <button
              onClick={stopRecording}
              className="rounded-md border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs font-bold text-white hover:bg-white/10"
            >
              Cancel
            </button>
          ) : (
            <>
              {!shortcut.readonly && (
                <button
                  onClick={() => setIsRecording(true)}
                  className="rounded-md border border-white/10 bg-black/20 px-3 py-1.5 text-xs font-bold text-white/70 hover:border-[#38bdf8]/50 hover:text-[#38bdf8]"
                >
                  Edit
                </button>
              )}
              {isCustomized && (
                <button
                  onClick={() => resetOne(shortcut.id)}
                  title="Reset to default"
                  className="rounded-md border border-white/10 bg-black/20 p-1.5 text-white/50 hover:bg-white/10 hover:text-white"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Recording Sub-panel */}
      {isRecording && (
        <div className="mt-3 flex flex-col gap-2 rounded-lg bg-black/40 p-3 text-xs">
          <span className="text-white/60">
            Press desired key combination. Press <strong>Escape</strong> to cancel, or{' '}
            <strong>Backspace</strong> to disable.
          </span>
          {captureIssue?.reserved && (
            <span className="font-bold text-red-400">
              This combo is reserved by the terminal and cannot be used.
            </span>
          )}
          {!!captureIssue && !captureIssue.reserved && captureIssue.conflicts.length > 0 && (
            <div className="flex items-center gap-3">
              <span className="font-bold text-amber-400">
                Conflicts with:{' '}
                {captureIssue.conflicts.map((c) => c.label).join(', ')}
              </span>
              <button
                onClick={() => {
                  assignBinding(shortcut.id, captureIssue.combo, { replaceConflicts: true })
                  stopRecording()
                }}
                className="rounded bg-amber-400/20 px-2 py-1 font-bold text-amber-300 hover:bg-amber-400/30"
              >
                Overwrite
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function BindingCluster({ bindings }: { bindings: ShortcutBindingDescriptor[] }) {
  if (bindings.length === 0) {
    return <span className="text-xs font-bold text-white/30">Unassigned</span>
  }

  return (
    <div className="flex items-center gap-2">
      {bindings.map((binding, i) => (
        <div key={i} className="flex items-center gap-2">
          {i > 0 && <span className="text-[10px] font-bold text-white/30">OR</span>}
          <div className="flex items-center gap-1">
            {getKeyComboParts(binding.combo).map((part, j) => (
              <kbd
                key={j}
                className="flex min-w-[24px] items-center justify-center rounded border border-white/20 bg-black/40 px-1.5 py-0.5 text-xs font-bold text-white shadow-sm"
              >
                {part}
              </kbd>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
