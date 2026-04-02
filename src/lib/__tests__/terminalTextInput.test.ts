import { describe, expect, it } from 'vitest'
import { normalizeTerminalPasteText, shouldCaptureStructuredTextInsertion } from '../terminalTextInput'

describe('terminalTextInput', () => {
  it('normalizes pasted newlines to carriage returns for PTY writes', () => {
    expect(normalizeTerminalPasteText('one\r\ntwo\nthree')).toBe('one\rtwo\rthree')
  })

  it('captures structured paste and replacement input types', () => {
    expect(shouldCaptureStructuredTextInsertion('insertFromPaste', 'hello')).toBe(true)
    expect(shouldCaptureStructuredTextInsertion('insertReplacementText', 'hello')).toBe(true)
    expect(shouldCaptureStructuredTextInsertion('insertFromDrop', 'hello')).toBe(true)
  })

  it('captures multi-character insertText but ignores regular typing', () => {
    expect(shouldCaptureStructuredTextInsertion('insertText', 'hola mundo')).toBe(true)
    expect(shouldCaptureStructuredTextInsertion('insertText', 'a')).toBe(false)
    expect(shouldCaptureStructuredTextInsertion('insertCompositionText', 'a')).toBe(false)
  })
})
