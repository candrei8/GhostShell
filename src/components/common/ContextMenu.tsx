import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

interface MenuItem {
  label: string
  icon?: React.ReactNode
  onClick: () => void
  danger?: boolean
  divider?: boolean
}

interface ContextMenuProps {
  items: MenuItem[]
  onClose: () => void
  position?: { x: number; y: number }
}

export function ContextMenu({ items, onClose, position }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null)
  // Portalled to <body> with position:fixed so it is never clipped by an
  // ancestor's overflow:hidden (e.g. the titlebar). Coords are clamped to the
  // viewport, flipping up/left when near an edge.
  const [coords, setCoords] = useState<{ left: number; top: number }>(() => ({
    left: position?.x ?? 0,
    top: position?.y ?? 0,
  }))

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const margin = 8
    const vw = window.innerWidth
    const vh = window.innerHeight
    let left = position?.x ?? 0
    let top = position?.y ?? 0
    if (left + rect.width + margin > vw) left = Math.max(margin, vw - rect.width - margin)
    if (top + rect.height + margin > vh) top = Math.max(margin, vh - rect.height - margin)
    setCoords({ left, top })
  }, [position?.x, position?.y, items.length])

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return createPortal(
    <div
      ref={ref}
      className="fixed bg-ghost-surface border border-ghost-border rounded-md shadow-minimal-lg z-[999] py-1 min-w-[160px]"
      style={{ left: coords.left, top: coords.top }}
    >
      {items.map((item, i) => (
        item.divider ? (
          <div key={i} className="border-t border-ghost-border my-1" />
        ) : (
          <button
            key={i}
            onClick={() => {
              item.onClick()
              onClose()
            }}
            className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors ${
              item.danger
                ? 'text-red-400 hover:bg-red-500/10'
                : 'text-ghost-text hover:bg-white/[0.06]'
            }`}
          >
            {item.icon}
            {item.label}
          </button>
        )
      ))}
    </div>,
    document.body,
  )
}
