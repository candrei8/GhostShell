import { describe, expect, it, vi } from 'vitest'
import { resolveDroppedFilePath } from '../fileDrop'

describe('resolveDroppedFilePath', () => {
  it('prefers the preload resolver when available', () => {
    const file = { name: 'spec.md', path: 'legacy/spec.md' } as File & { path?: string }
    const getPathForFile = vi.fn(() => 'C:/workspace/spec.md')

    expect(resolveDroppedFilePath(file, getPathForFile)).toBe('C:/workspace/spec.md')
    expect(getPathForFile).toHaveBeenCalledWith(file)
  })

  it('falls back to legacy File.path when no preload resolver exists', () => {
    const file = { name: 'notes.txt', path: 'C:/workspace/notes.txt' } as File & { path?: string }

    expect(resolveDroppedFilePath(file)).toBe('C:/workspace/notes.txt')
  })

  it('returns null when the file has no native path', () => {
    const file = { name: 'image.png' } as File & { path?: string }

    expect(resolveDroppedFilePath(file)).toBeNull()
  })
})
