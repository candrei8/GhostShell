import { useCallback, useRef } from 'react'

interface ResizeHandleProps {
  currentHeight: number
  onResize: (newHeight: number) => void
  minHeight?: number
  maxHeight?: number
}

export function ResizeHandle({ currentHeight, onResize, minHeight = 150, maxHeight = 500 }: ResizeHandleProps) {
  const dragging = useRef(false)
  const startY = useRef(0)
  const startHeight = useRef(0)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = true
    startY.current = e.clientY
    startHeight.current = currentHeight

    const handleMouseMove = (ev: MouseEvent) => {
      if (!dragging.current) return
      const delta = startY.current - ev.clientY
      const next = Math.min(maxHeight, Math.max(minHeight, startHeight.current + delta))
      onResize(next)
    }

    const handleMouseUp = () => {
      dragging.current = false
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'
  }, [currentHeight, onResize, minHeight, maxHeight])

  return (
    <div
      onMouseDown={handleMouseDown}
      className="h-1 w-full cursor-row-resize bg-ghost-border/40 hover:bg-ghost-accent/40 transition-colors flex items-center justify-center group shrink-0"
    >
      <div className="w-8 h-0.5 rounded-full bg-ghost-text-dim/20 group-hover:bg-ghost-accent/60 transition-colors" />
    </div>
  )
}
