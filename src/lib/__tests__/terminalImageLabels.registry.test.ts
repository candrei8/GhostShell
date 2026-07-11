import { describe, expect, it } from 'vitest'
import { createTerminalImageLabelRegistry } from '../terminalImageLabels'

describe('terminalImageLabels registry', () => {
  it('assigns stable, incrementing labels per path', () => {
    const reg = createTerminalImageLabelRegistry()
    const a = 'C:\\Users\\x\\Temp\\ghostshell-img-1.png'
    const b = 'C:\\Users\\x\\Temp\\ghostshell-img-2.png'
    expect(reg.ensureLabel(a)).toBe('Image 1')
    expect(reg.ensureLabel(b)).toBe('Image 2')
    expect(reg.ensureLabel(a)).toBe('Image 1') // stable
  })

  it('masks quoted and bare occurrences in GhostShell-owned surfaces', () => {
    const reg = createTerminalImageLabelRegistry()
    const p = 'C:\\Temp\\ghostshell-img-1.png'
    reg.ensureLabel(p)
    expect(reg.maskText(`analyze "${p}" now`)).toBe('analyze "Image 1" now')
    expect(reg.maskText(`analyze '${p}' now`)).toBe("analyze 'Image 1' now")
    expect(reg.maskText(`path ${p} end`)).toBe('path Image 1 end')
  })

  it('is a no-op when no labels are registered', () => {
    const reg = createTerminalImageLabelRegistry()
    expect(reg.maskText('nothing to mask')).toBe('nothing to mask')
  })
})
