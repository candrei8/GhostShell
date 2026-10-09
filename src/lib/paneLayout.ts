/**
 * Pane layout math. Pure so it can be unit-tested and so every pane gets an
 * integer pixel rect: fractional cell sizes (what `repeat(n, 1fr)` produces)
 * make xterm's cols flicker by one as the window moves a single pixel and blur
 * the canvas edges.
 */

export interface PaneRect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Wide matrix layout: maximize columns, minimize rows.
 * 1→1x1, 2→2x1, 3→3x1, 4→2x2, 5→3x2, 6→3x2, 7→4x2, 8→4x2, 9→5x2, 10→5x2,
 * 11→4x3, 12→4x3, 13→5x3, 14→5x3, 15→5x3, 16→4x4
 */
export function getGridDimensions(count: number): { cols: number; rows: number } {
  if (count <= 1) return { cols: 1, rows: 1 }
  if (count <= 3) return { cols: count, rows: 1 }
  if (count <= 10) {
    const rows = 2
    return { cols: Math.ceil(count / rows), rows }
  }
  if (count <= 15) {
    const rows = 3
    return { cols: Math.ceil(count / rows), rows }
  }
  const rows = 4
  return { cols: Math.ceil(count / rows), rows }
}

/**
 * Split `total` px into `count` integer tracks separated by `gap`. Leftover
 * pixels go one each to the leading tracks, so sizes differ by at most 1px and
 * tracks + gaps always sum to exactly `total`.
 */
export function splitTracks(total: number, count: number, gap: number): Array<{ start: number; size: number }> {
  if (count <= 0) return []
  const usable = Math.max(0, Math.floor(total) - gap * (count - 1))
  const base = Math.floor(usable / count)
  const remainder = usable - base * count
  const tracks: Array<{ start: number; size: number }> = []
  let position = 0
  for (let i = 0; i < count; i++) {
    const size = base + (i < remainder ? 1 : 0)
    tracks.push({ start: position, size })
    position += size + gap
  }
  return tracks
}

/**
 * Lay out one group of panes over the full area, row-major. A short last row
 * stretches its panes to fill the width instead of leaving an empty hole.
 */
export function layoutGroup(ids: string[], width: number, height: number, gap: number): Map<string, PaneRect> {
  const rects = new Map<string, PaneRect>()
  if (ids.length === 0) return rects

  const { cols, rows } = getGridDimensions(ids.length)
  const rowTracks = splitTracks(height, rows, gap)

  for (let row = 0; row < rows; row++) {
    const rowIds = ids.slice(row * cols, row * cols + cols)
    if (rowIds.length === 0) break
    const colTracks = splitTracks(width, rowIds.length, gap)
    rowIds.forEach((id, col) => {
      rects.set(id, {
        x: colTracks[col].start,
        y: rowTracks[row].start,
        width: colTracks[col].size,
        height: rowTracks[row].size,
      })
    })
  }

  return rects
}

export interface PaneLayoutInput {
  width: number
  height: number
  gap: number
  /** Each group is laid out over the whole area (tabs: one group per workspace; grid: one group). */
  groups: string[][]
  /** Gets the whole area; every other pane keeps its rect so restoring never resizes it. */
  maximizedId?: string | null
}

export function computePaneLayout({ width, height, gap, groups, maximizedId }: PaneLayoutInput): Map<string, PaneRect> {
  const w = Math.max(0, Math.floor(width))
  const h = Math.max(0, Math.floor(height))
  const rects = new Map<string, PaneRect>()

  for (const group of groups) {
    for (const [id, rect] of layoutGroup(group, w, h, gap)) {
      if (!rects.has(id)) rects.set(id, rect)
    }
  }

  if (maximizedId) {
    rects.set(maximizedId, { x: 0, y: 0, width: w, height: h })
  }

  return rects
}
