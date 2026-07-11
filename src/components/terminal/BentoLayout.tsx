import { useMemo } from 'react'
import { TerminalSession } from '../../lib/types'

interface BentoLayoutProps {
  /** Every session that must stay MOUNTED (so its xterm + PTY survive). */
  sessions: TerminalSession[]
  /** Which sessions are currently shown. Hidden ones stay mounted via CSS. */
  visibleSessionIds: string[]
  maximizedSessionId: string | null
  renderPane: (session: TerminalSession, isMaximized: boolean) => React.ReactNode
}

/**
 * Wide matrix layout: maximize columns, minimize rows.
 * Matches the layout templates: 1→1x1, 2→2x1, 3→3x1, 4→2x2, 5→3x2,
 * 6→3x2, 7→4x2, 8→4x2, 9→5x2, 10→5x2, 11→4x3, 12→4x3, 13→5x3,
 * 14→5x3, 15→5x3, 16→4x4
 */
export function getGridDimensions(count: number): { cols: number; rows: number } {
  if (count <= 1) return { cols: 1, rows: 1 }
  if (count <= 3) return { cols: count, rows: 1 }
  if (count <= 10) {
    const rows = 2
    const cols = Math.ceil(count / rows)
    return { cols, rows }
  }
  if (count <= 15) {
    const rows = 3
    const cols = Math.ceil(count / rows)
    return { cols, rows }
  }
  const rows = 4
  const cols = Math.ceil(count / rows)
  return { cols, rows }
}

/**
 * PTY lifetime is decoupled from React mount: EVERY session is rendered once
 * and kept mounted. Tabs/grid/maximize only toggle CSS visibility and the grid
 * dimensions — panes are never unmounted, so switching layout never kills a
 * shell/agent process (the WezTerm mux model, done with CSS).
 */
export function BentoLayout({
  sessions,
  visibleSessionIds,
  maximizedSessionId,
  renderPane,
}: BentoLayoutProps) {
  const visibleSet = useMemo(() => new Set(visibleSessionIds), [visibleSessionIds])
  const { cols, rows } = useMemo(
    () => getGridDimensions(visibleSessionIds.length || 1),
    [visibleSessionIds.length],
  )

  if (sessions.length === 0) return null

  return (
    <div
      className="h-full w-full overflow-hidden bg-ghost-bg"
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gridTemplateRows: `repeat(${rows}, 1fr)`,
        gap: '1px',
      }}
    >
      {sessions.map((session) => {
        const visible = visibleSet.has(session.id)
        return (
          <div
            key={session.id}
            className="relative overflow-hidden min-w-0 min-h-0"
            // Hidden panes stay mounted (display:none) so their PTY survives.
            style={visible ? undefined : { display: 'none' }}
            aria-hidden={!visible}
          >
            {renderPane(session, maximizedSessionId === session.id)}
          </div>
        )
      })}
    </div>
  )
}
