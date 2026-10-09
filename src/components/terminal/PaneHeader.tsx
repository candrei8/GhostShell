import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import {
  Copy,
  Eraser,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  X,
} from 'lucide-react'
import { ContextMenu } from '../common/ContextMenu'
import { ProviderGlyph } from './ProviderGlyph'
import { Provider } from '../../lib/types'
import { SHORTCUT_EVENTS } from '../../lib/shortcutEvents'

export type PaneStatus = 'alive' | 'busy' | 'offline' | 'error'

interface PaneHeaderProps {
  title: string
  cwd?: string
  provider?: Provider
  status: PaneStatus
  /** "Thinking", "Editing"… shown only while busy. */
  statusLabel: string | null
  elapsedLabel: string | null
  isActive: boolean
  isMaximized: boolean
  onRename: (title: string) => void
  onToggleMaximize: () => void
  onSplit: () => void
  onClose?: () => void
  onSearch: () => void
  onClear: () => void
  /** Give keyboard focus back to the pane's input (terminal or command bar). */
  onFocusPane: () => void
}

const STATUS_COLOR: Record<PaneStatus, string> = {
  alive: 'var(--status-alive)',
  busy: 'var(--status-alive)',
  offline: 'var(--status-offline)',
  error: 'var(--status-error)',
}

const STATUS_TITLE: Record<PaneStatus, string> = {
  alive: 'Running',
  busy: 'Working',
  offline: 'Offline',
  error: 'Error',
}

/**
 * Pane header: status dot · provider glyph · name · live status · actions.
 * Actions stay visible (dimmed) rather than appearing on hover, so maximize
 * and close are always one click away in a wall of panes.
 */
export function PaneHeader({
  title,
  cwd,
  provider,
  status,
  statusLabel,
  elapsedLabel,
  isActive,
  isMaximized,
  onRename,
  onToggleMaximize,
  onSplit,
  onClose,
  onSearch,
  onClear,
  onFocusPane,
}: PaneHeaderProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState(title)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!isEditing) setDraft(title)
  }, [title, isEditing])

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [isEditing])

  // F2 / "Rename tab" shortcut targets the active pane.
  useEffect(() => {
    if (!isActive) return
    const startRename = () => {
      setDraft(title)
      setIsEditing(true)
    }
    window.addEventListener(SHORTCUT_EVENTS.renameTab, startRename as EventListener)
    return () => window.removeEventListener(SHORTCUT_EVENTS.renameTab, startRename as EventListener)
  }, [isActive, title])

  const commit = () => {
    const next = draft.trim()
    if (next && next !== title) onRename(next)
    else setDraft(title)
    setIsEditing(false)
    onFocusPane()
  }

  const cancel = () => {
    setDraft(title)
    setIsEditing(false)
    onFocusPane()
  }

  const stop = (e: ReactMouseEvent) => e.stopPropagation()
  // Header buttons must never take keyboard focus: a focused button would
  // swallow the next keystrokes meant for the terminal (maximize, then type).
  const keepFocus = (e: ReactMouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const openMenu = (e: ReactMouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    if (menu) {
      setMenu(null)
      return
    }
    const rect = e.currentTarget.getBoundingClientRect()
    setMenu({ x: rect.right - 168, y: rect.bottom + 4 })
  }

  const menuItems = [
    {
      label: 'Rename',
      icon: <Pencil className="h-3.5 w-3.5 opacity-60" />,
      onClick: () => {
        setDraft(title)
        setIsEditing(true)
      },
    },
    {
      label: isMaximized ? 'Restore size' : 'Maximize',
      icon: isMaximized
        ? <Minimize2 className="h-3.5 w-3.5 opacity-60" />
        : <Maximize2 className="h-3.5 w-3.5 opacity-60" />,
      onClick: onToggleMaximize,
    },
    { label: 'New pane here', icon: <Plus className="h-3.5 w-3.5 opacity-60" />, onClick: onSplit },
    { label: 'Search', icon: <Search className="h-3.5 w-3.5 opacity-60" />, onClick: onSearch },
    {
      label: 'Clear',
      icon: <Eraser className="h-3.5 w-3.5 opacity-60" />,
      onClick: () => {
        onClear()
        onFocusPane()
      },
    },
    ...(cwd
      ? [{
          label: 'Copy path',
          icon: <Copy className="h-3.5 w-3.5 opacity-60" />,
          onClick: () => { navigator.clipboard.writeText(cwd).catch(() => {}) },
        }]
      : []),
    ...(onClose
      ? [
          { label: '', onClick: () => {}, divider: true },
          { label: 'Close pane', icon: <X className="h-3.5 w-3.5" />, onClick: onClose, danger: true },
        ]
      : []),
  ]

  return (
    <div
      className="pane-header flex shrink-0 items-center gap-2.5 pl-3.5 pr-2"
      onDoubleClick={(e) => {
        if ((e.target as HTMLElement).closest('button,input')) return
        onToggleMaximize()
      }}
    >
      <span
        className="pane-status-dot h-[7px] w-[7px] shrink-0 rounded-full"
        data-busy={status === 'busy' ? 'true' : undefined}
        style={{ backgroundColor: STATUS_COLOR[status] }}
        title={STATUS_TITLE[status]}
      />

      <ProviderGlyph provider={provider} size={16} />

      {isEditing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') cancel()
          }}
          onClick={stop}
          className="h-6 min-w-0 max-w-[200px] flex-1 rounded-md border bg-transparent px-1.5 text-[14px] font-semibold outline-none"
          style={{ borderColor: 'var(--ghost-accent)', color: 'var(--ghost-text)' }}
        />
      ) : (
        <span
          onDoubleClick={(e) => {
            e.stopPropagation()
            setIsEditing(true)
          }}
          className={`pane-title min-w-0 shrink truncate text-[14px] font-semibold tracking-[-0.01em] transition-colors ${
            isActive ? 'text-white' : 'text-white/60'
          }`}
          title={cwd ? `${title} — ${cwd}\nDouble-click to rename` : 'Double-click to rename'}
        >
          {title}
        </span>
      )}

      {!isEditing && statusLabel && (
        <span className="min-w-0 truncate text-[11.5px] text-white/40">
          {statusLabel}
          {elapsedLabel && <span className="tabular-nums text-white/25">{` · ${elapsedLabel}`}</span>}
        </span>
      )}

      <span className="min-w-0 flex-1" />

      <div className="flex shrink-0 items-center gap-0.5" onDoubleClick={stop}>
        <button
          type="button"
          className="pane-action"
          // Also keeps ContextMenu's outside-mousedown from closing the menu
          // right before this click would reopen it: the button toggles.
          onMouseDown={keepFocus}
          onClick={openMenu}
          title="More"
          aria-label="More actions"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="pane-action"
          onMouseDown={keepFocus}
          onClick={(e) => {
            e.stopPropagation()
            onToggleMaximize()
          }}
          title={isMaximized ? 'Restore (Ctrl+Shift+Enter)' : 'Maximize (Ctrl+Shift+Enter)'}
          aria-label={isMaximized ? 'Restore pane size' : 'Maximize pane'}
          aria-pressed={isMaximized}
        >
          {isMaximized ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
        </button>
        <button
          type="button"
          className="pane-action"
          onMouseDown={keepFocus}
          onClick={(e) => {
            e.stopPropagation()
            onSplit()
          }}
          title="New pane in same folder (Ctrl+Shift+D)"
          aria-label="New pane in same folder"
        >
          <Plus className="h-4 w-4" />
        </button>
        {onClose && (
          <button
            type="button"
            className="pane-action"
            data-danger="true"
            onMouseDown={keepFocus}
            onClick={(e) => {
              e.stopPropagation()
              onClose()
            }}
            title="Close pane"
            aria-label="Close pane"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {menu && <ContextMenu items={menuItems} position={menu} onClose={() => setMenu(null)} />}
    </div>
  )
}
