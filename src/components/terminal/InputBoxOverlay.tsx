import { useEffect, useRef, useState, useCallback } from 'react'
import type { Terminal } from '@xterm/xterm'
import type { Provider } from '../../lib/types'
import { getProviderColor } from '../../lib/providers'

interface InputBoxOverlayProps {
  terminal: Terminal | null
  agentStatus: 'idle' | 'working' | 'error' | 'offline' | undefined
  provider: Provider | undefined
  containerRef: React.RefObject<HTMLDivElement | null>
}

const XTERM_PADDING = 4
const SHOW_DELAY = 300 // ms — avoids flicker during auto-confirm (~150ms)

export function InputBoxOverlay({
  terminal,
  agentStatus,
  provider,
  containerRef,
}: InputBoxOverlayProps) {
  const [visible, setVisible] = useState(false)
  const [style, setStyle] = useState<React.CSSProperties>({})
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rafRef = useRef<number | null>(null)

  const isIdle = agentStatus === 'idle'
  const color = provider ? getProviderColor(provider) : '#a855f7'

  const updatePosition = useCallback(() => {
    if (!terminal || !containerRef.current) return

    const container = containerRef.current
    const cellHeight = container.clientHeight / terminal.rows
    const cursorY = terminal.buffer.active.cursorY
    const top = XTERM_PADDING + cursorY * cellHeight

    setStyle({
      top: `${top}px`,
      height: `${container.clientHeight - top}px`,
      '--input-box-color': `${color}55`,
    } as React.CSSProperties)
  }, [terminal, containerRef, color])

  const scheduleUpdate = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(updatePosition)
  }, [updatePosition])

  // Show/hide with delay
  useEffect(() => {
    if (isIdle) {
      timerRef.current = setTimeout(() => {
        setVisible(true)
      }, SHOW_DELAY)
    } else {
      setVisible(false)
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [isIdle])

  // Position tracking when visible
  useEffect(() => {
    if (!visible || !terminal) return

    // Initial position
    updatePosition()

    // Track cursor/scroll/linefeed changes
    const disposables = [
      terminal.onCursorMove(scheduleUpdate),
      terminal.onScroll(scheduleUpdate),
      terminal.onLineFeed(scheduleUpdate),
    ]

    // Track terminal resize (refit)
    const handleRefit = () => scheduleUpdate()
    window.addEventListener('ghostshell:refit', handleRefit)

    return () => {
      disposables.forEach((d) => d.dispose())
      window.removeEventListener('ghostshell:refit', handleRefit)
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    }
  }, [visible, terminal, updatePosition, scheduleUpdate])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  return (
    <div
      className={`input-box-overlay ${visible ? 'visible' : ''}`}
      style={style}
    />
  )
}
