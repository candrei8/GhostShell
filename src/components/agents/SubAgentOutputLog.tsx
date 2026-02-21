import { useEffect, useRef, useState } from 'react'
import { SubAgentOutputLine } from '../../lib/types'

interface SubAgentOutputLogProps {
  lines: SubAgentOutputLine[]
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export function SubAgentOutputLog({ lines }: SubAgentOutputLogProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)

  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [lines.length, autoScroll])

  const handleScroll = () => {
    const el = containerRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 30
    setAutoScroll(atBottom)
  }

  if (lines.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-ghost-text-dim/40 text-xs">
        Waiting for output...
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto overflow-x-hidden font-mono text-xs bg-ghost-bg/50 rounded p-2"
    >
      {lines.map((line, i) => (
        <div key={i} className="flex gap-2 leading-relaxed hover:bg-white/3">
          <span className="text-ghost-text-dim/30 shrink-0 select-none tabular-nums">
            {formatTime(line.timestamp)}
          </span>
          <span className="text-ghost-text/80 break-all whitespace-pre-wrap">{line.text}</span>
        </div>
      ))}
      {!autoScroll && (
        <button
          onClick={() => {
            setAutoScroll(true)
            if (containerRef.current) {
              containerRef.current.scrollTop = containerRef.current.scrollHeight
            }
          }}
          className="sticky bottom-1 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded bg-ghost-accent/20 text-ghost-accent text-[10px] hover:bg-ghost-accent/30 transition-colors"
        >
          Scroll to bottom
        </button>
      )}
    </div>
  )
}
