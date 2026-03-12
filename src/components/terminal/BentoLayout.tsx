import { useMemo } from 'react'
import { TerminalSession } from '../../lib/types'

export type BentoNode =
  | { type: 'pane'; id: string }
  | {
      type: 'split'
      direction: 'horizontal' | 'vertical'
      ratio: number
      children: [BentoNode, BentoNode]
    }

interface BentoLayoutProps {
  sessions: TerminalSession[]
  renderPane: (session: TerminalSession, isMaximized: boolean) => React.ReactNode
  maximizedSessionId: string | null
}

/**
 * Wide matrix layout: maximize columns, minimize rows.
 * Matches the layout templates: 1→1x1, 2→2x1, 3→3x1, 4→2x2, 5→3x2,
 * 6→3x2, 7→4x2, 8→4x2, 9→5x2, 10→5x2, 11→4x3, 12→4x3, 13→5x3,
 * 14→5x3, 15→5x3, 16→4x4
 */
function getGridDimensions(count: number): { cols: number; rows: number } {
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

export function BentoLayout({
  sessions,
  renderPane,
  maximizedSessionId,
}: BentoLayoutProps) {
  const maximizedSession = maximizedSessionId
    ? sessions.find((s) => s.id === maximizedSessionId)
    : null

  const { cols, rows } = useMemo(
    () => getGridDimensions(maximizedSession ? 1 : sessions.length),
    [maximizedSession, sessions.length],
  )

  if (sessions.length === 0) return null

  if (maximizedSession) {
    return (
      <div className="relative h-full w-full overflow-hidden bg-ghost-bg">
        {renderPane(maximizedSession, true)}
      </div>
    )
  }

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
      {sessions.map((session) => (
        <div key={session.id} className="relative overflow-hidden min-w-0 min-h-0">
          {renderPane(session, false)}
        </div>
      ))}
    </div>
  )
}
