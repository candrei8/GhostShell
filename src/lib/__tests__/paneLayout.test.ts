import { describe, expect, it } from 'vitest'
import { computePaneLayout, getGridDimensions, layoutGroup, splitTracks } from '../paneLayout'

const ids = (n: number) => Array.from({ length: n }, (_, i) => `s${i}`)

describe('splitTracks', () => {
  it('produces integer tracks that exactly fill the total', () => {
    for (const [total, count, gap] of [[1001, 3, 10], [999, 4, 10], [1366, 5, 12], [17, 3, 1]] as const) {
      const tracks = splitTracks(total, count, gap)
      expect(tracks).toHaveLength(count)
      tracks.forEach((t) => {
        expect(Number.isInteger(t.start)).toBe(true)
        expect(Number.isInteger(t.size)).toBe(true)
      })
      const last = tracks[tracks.length - 1]
      expect(last.start + last.size).toBe(total)
      const sizes = tracks.map((t) => t.size)
      expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1)
    }
  })

  it('floors fractional totals', () => {
    const tracks = splitTracks(800.7, 2, 10)
    expect(tracks[1].start + tracks[1].size).toBe(800)
  })
})

describe('getGridDimensions', () => {
  it('keeps the wide-matrix templates', () => {
    expect(getGridDimensions(1)).toEqual({ cols: 1, rows: 1 })
    expect(getGridDimensions(3)).toEqual({ cols: 3, rows: 1 })
    expect(getGridDimensions(4)).toEqual({ cols: 2, rows: 2 })
    expect(getGridDimensions(6)).toEqual({ cols: 3, rows: 2 })
    expect(getGridDimensions(12)).toEqual({ cols: 4, rows: 3 })
    expect(getGridDimensions(16)).toEqual({ cols: 4, rows: 4 })
  })
})

describe('layoutGroup', () => {
  it('lays 6 panes as a 3x2 grid with uniform gaps', () => {
    const rects = layoutGroup(ids(6), 1210, 810, 10)
    expect(rects.get('s0')).toEqual({ x: 0, y: 0, width: 397, height: 400 })
    expect(rects.get('s2')).toEqual({ x: 814, y: 0, width: 396, height: 400 })
    expect(rects.get('s5')).toEqual({ x: 814, y: 410, width: 396, height: 400 })
  })

  it('stretches a short last row instead of leaving a hole', () => {
    const rects = layoutGroup(ids(5), 1210, 810, 10)
    const bottom = [rects.get('s3')!, rects.get('s4')!]
    expect(bottom[0].x).toBe(0)
    expect(bottom[1].x + bottom[1].width).toBe(1210)
    expect(bottom[0].width).toBe(600)
  })

  it('never overlaps panes', () => {
    for (let n = 1; n <= 16; n++) {
      const rects = [...layoutGroup(ids(n), 1500, 900, 10).values()]
      expect(rects).toHaveLength(n)
      for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
          const a = rects[i]
          const b = rects[j]
          const overlap =
            a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
          expect(overlap).toBe(false)
        }
      }
    }
  })
})

describe('computePaneLayout', () => {
  it('lays every group over the whole area (tabs mode)', () => {
    const rects = computePaneLayout({ width: 1000, height: 600, gap: 10, groups: [['a'], ['b', 'c']] })
    expect(rects.get('a')).toEqual({ x: 0, y: 0, width: 1000, height: 600 })
    expect(rects.get('b')).toEqual({ x: 0, y: 0, width: 495, height: 600 })
    expect(rects.get('c')).toEqual({ x: 505, y: 0, width: 495, height: 600 })
  })

  it('gives the maximized pane the whole area and leaves the rest untouched', () => {
    const groups = [['a', 'b', 'c', 'd']]
    const normal = computePaneLayout({ width: 1000, height: 600, gap: 10, groups })
    const maxed = computePaneLayout({ width: 1000, height: 600, gap: 10, groups, maximizedId: 'b' })
    expect(maxed.get('b')).toEqual({ x: 0, y: 0, width: 1000, height: 600 })
    for (const id of ['a', 'c', 'd']) expect(maxed.get(id)).toEqual(normal.get(id))
  })
})
