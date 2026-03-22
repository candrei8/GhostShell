// SwarmSplitPane — Generic resizable horizontal split pane
// Two children separated by a draggable divider

import { useState, useRef, useCallback, type ReactNode } from 'react'

interface SwarmSplitPaneProps {
  top: ReactNode
  bottom: ReactNode
  initialRatio?: number  // 0.0–1.0, default 0.55
  minRatio?: number
  maxRatio?: number
}

export function SwarmSplitPane({
  top, bottom, initialRatio = 0.55, minRatio = 0.2, maxRatio = 0.8,
}: SwarmSplitPaneProps) {
  const [ratio, setRatio] = useState(initialRatio)
  const containerRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    dragging.current = true
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }, [])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current || !containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const y = e.clientY - rect.top
    const newRatio = Math.min(maxRatio, Math.max(minRatio, y / rect.height))
    setRatio(newRatio)
  }, [minRatio, maxRatio])

  const onPointerUp = useCallback(() => {
    dragging.current = false
  }, [])

  return (
    <div ref={containerRef} style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
      {/* Top pane */}
      <div style={{ height: `${ratio * 100}%`, minHeight: 0, overflow: 'hidden' }}>
        {top}
      </div>

      {/* Drag handle */}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{
          height: 4,
          flexShrink: 0,
          cursor: 'row-resize',
          background: 'rgba(255,255,255,0.04)',
          position: 'relative',
          zIndex: 10,
        }}
      >
        {/* Visual indicator */}
        <div style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          width: 32,
          height: 2,
          borderRadius: 1,
          background: 'rgba(255,255,255,0.15)',
          transition: 'background 0.2s',
        }} />
      </div>

      {/* Bottom pane */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {bottom}
      </div>
    </div>
  )
}
