import { describe, expect, it } from 'vitest'
import { createTerminalImageLabelRegistry } from '../terminalImageLabels'

describe('createTerminalImageLabelRegistry', () => {
  it('reuses labels for the same image path and increments for new ones', () => {
    const registry = createTerminalImageLabelRegistry()

    expect(registry.ensureLabel('C:\\temp\\image-a.png')).toBe('Image 1')
    expect(registry.ensureLabel('C:\\temp\\image-a.png')).toBe('Image 1')
    expect(registry.ensureLabel('C:\\temp\\image-b.png')).toBe('Image 2')
  })

  it('masks raw and quoted image paths in terminal text', () => {
    const registry = createTerminalImageLabelRegistry()
    const firstPath = 'C:\\temp\\image-a.png'
    const secondPath = 'C:\\Users\\Test User\\image-b.png'

    registry.ensureLabel(firstPath)
    registry.ensureLabel(secondPath)

    const masked = registry.maskText(
      `Attached ${firstPath} and "${secondPath}" then retried '${secondPath}'.`,
    )

    expect(masked).toBe(`Attached Image 1 and "Image 2" then retried 'Image 2'.`)
  })
})
