import { memo, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { TerminalSession } from '../../lib/types'
import { computePaneLayout, type PaneRect } from '../../lib/paneLayout'

/** Keep in sync with --pane-gap in globals.css. */
export const PANE_GAP = 10

interface PaneGridProps {
  /** Every session that must stay MOUNTED (so its xterm + PTY survive). */
  sessions: TerminalSession[]
  /**
   * Layout groups. Each one is laid out over the whole area: one per workspace
   * in tabs mode, a single group with every session in grid mode.
   */
  groups: string[][]
  /** Which sessions are shown right now. The rest stay mounted, invisible. */
  visibleSessionIds: string[]
  maximizedSessionId: string | null
  focusedSessionId: string | null
  renderPane: (session: TerminalSession) => ReactNode
}

const EMPTY_RECT: PaneRect = { x: 0, y: 0, width: 0, height: 0 }

interface PaneCellProps {
  session: TerminalSession
  x: number
  y: number
  width: number
  height: number
  visible: boolean
  maximized: boolean
  focused: boolean
  renderPane: (session: TerminalSession) => ReactNode
}

// Memoized on primitive geometry so a window drag only re-renders cells whose
// rect actually changed, not every TerminalPane on every frame.
const PaneCell = memo(function PaneCell({
  session,
  x,
  y,
  width,
  height,
  visible,
  maximized,
  focused,
  renderPane,
}: PaneCellProps) {
  return (
    <div
      className="pane-card"
      data-hidden={visible ? undefined : 'true'}
      data-maximized={maximized ? 'true' : undefined}
      data-focused={focused && visible ? 'true' : undefined}
      // The agent setup screen is not a terminal yet: no card, no focus ring.
      data-chromeless={session.showQuickLaunch ? 'true' : undefined}
      aria-hidden={!visible}
      style={{ left: x, top: y, width, height }}
    >
      {renderPane(session)}
    </div>
  )
})

interface GridGeometry {
  /** Usable area in DEVICE pixels, starting on a whole device pixel. */
  deviceWidth: number
  deviceHeight: number
  dpr: number
  /** CSS-px shift from the root's origin to the first whole device pixel. */
  dx: number
  dy: number
}

const EMPTY_GEOMETRY: GridGeometry = { deviceWidth: 0, deviceHeight: 0, dpr: 1, dx: 0, dy: 0 }

/**
 * Measure the root in device pixels. Anything above or beside the grid sized
 * in rem (the UI font size is user-configurable) or a 125%/150% display scale
 * can leave the origin on a fractional pixel, which paints every 1px border
 * smeared across two pixel rows. Laying out in device pixels from a snapped
 * origin puts every pane edge on a whole pixel.
 */
function measureGeometry(el: HTMLElement): GridGeometry {
  const rect = el.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1
  const left = Math.ceil(rect.left * dpr)
  const top = Math.ceil(rect.top * dpr)
  const right = Math.floor(rect.right * dpr)
  const bottom = Math.floor(rect.bottom * dpr)
  return {
    deviceWidth: Math.max(0, right - left),
    deviceHeight: Math.max(0, bottom - top),
    dpr,
    dx: left / dpr - rect.left,
    dy: top / dpr - rect.top,
  }
}

function sameGeometry(a: GridGeometry, b: GridGeometry): boolean {
  return (
    a.deviceWidth === b.deviceWidth &&
    a.deviceHeight === b.deviceHeight &&
    a.dpr === b.dpr &&
    Math.abs(a.dx - b.dx) < 0.001 &&
    Math.abs(a.dy - b.dy) < 0.001
  )
}

/**
 * PTY lifetime is decoupled from React mount: EVERY session is rendered once
 * and stays mounted (the WezTerm mux model, done with CSS). Each pane sits at
 * an integer pixel rect, and a hidden pane keeps the rect it will have when
 * shown — switching tabs or maximizing never resizes the panes you return to.
 */
export function PaneGrid({
  sessions,
  groups,
  visibleSessionIds,
  maximizedSessionId,
  focusedSessionId,
  renderPane,
}: PaneGridProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [geometry, setGeometry] = useState<GridGeometry>(EMPTY_GEOMETRY)

  useLayoutEffect(() => {
    const el = rootRef.current
    if (!el) return
    const measure = () => {
      const next = measureGeometry(el)
      setGeometry((prev) => (sameGeometry(prev, next) ? prev : next))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    // Moving the window to a monitor with another scale changes the DPR
    // without necessarily resizing the grid.
    let dprQuery: MediaQueryList | null = null
    const watchDpr = () => {
      dprQuery?.removeEventListener('change', onDprChange)
      dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`)
      dprQuery.addEventListener('change', onDprChange)
    }
    const onDprChange = () => {
      measure()
      watchDpr()
    }
    watchDpr()
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      dprQuery?.removeEventListener('change', onDprChange)
      window.removeEventListener('resize', measure)
    }
  }, [])

  const { deviceWidth, deviceHeight, dpr, dx, dy } = geometry
  const rects = useMemo(() => {
    const deviceRects = computePaneLayout({
      width: deviceWidth,
      height: deviceHeight,
      gap: Math.round(PANE_GAP * dpr),
      groups,
      maximizedId: maximizedSessionId,
    })
    const cssRects = new Map<string, PaneRect>()
    for (const [id, r] of deviceRects) {
      cssRects.set(id, {
        x: r.x / dpr + dx,
        y: r.y / dpr + dy,
        width: r.width / dpr,
        height: r.height / dpr,
      })
    }
    return cssRects
  }, [deviceHeight, deviceWidth, dpr, dx, dy, groups, maximizedSessionId])

  const visibleSet = useMemo(() => new Set(visibleSessionIds), [visibleSessionIds])

  return (
    <div ref={rootRef} className="relative h-full w-full overflow-hidden">
      {sessions.map((session) => {
        const rect = rects.get(session.id) ?? {
          ...EMPTY_RECT,
          width: deviceWidth / dpr,
          height: deviceHeight / dpr,
        }
        return (
          <PaneCell
            key={session.id}
            session={session}
            x={rect.x}
            y={rect.y}
            width={rect.width}
            height={rect.height}
            visible={visibleSet.has(session.id)}
            maximized={maximizedSessionId === session.id}
            focused={focusedSessionId === session.id}
            renderPane={renderPane}
          />
        )
      })}
    </div>
  )
}
