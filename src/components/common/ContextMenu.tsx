import { useEffect, useRef } from 'react'

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

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  return (
    <div
      ref={ref}
      className="absolute bg-ghost-surface border border-ghost-border rounded-lg shadow-xl z-50 py-1 min-w-[160px]"
      style={position ? { left: position.x, top: position.y } : undefined}
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
                : 'text-ghost-text hover:bg-white/5'
            }`}
          >
            {item.icon}
            {item.label}
          </button>
        )
      ))}
    </div>
  )
}
