import { describe, expect, it } from 'vitest'
import { normalizeTerminalPasteText, shouldCaptureStructuredTextInsertion } from '../terminalTextInput'

describe('terminalTextInput', () => {
  it('normalizes pasted newlines to carriage returns for PTY writes', () => {
    expect(normalizeTerminalPasteText('one\r\ntwo\nthree')).toBe('one\rtwo\rthree')
  })

  it('does NOT capture paste/drop input types (xterm handles those natively)', () => {
    // Intercepting these caused double writes that agent CLIs registered as
    // multiple paste blocks. The paste pipeline owns them via the paste event.
    expect(shouldCaptureStructuredTextInsertion('insertFromPaste', 'hello')).toBe(false)
    expect(shouldCaptureStructuredTextInsertion('insertReplacementText', 'hello')).toBe(false)
    expect(shouldCaptureStructuredTextInsertion('insertFromDrop', 'hello')).toBe(false)
  })

  it('captures multi-character insertText but ignores regular typing', () => {
    expect(shouldCaptureStructuredTextInsertion('insertText', 'hola mundo')).toBe(true)
    expect(shouldCaptureStructuredTextInsertion('insertText', 'a')).toBe(false)
    expect(shouldCaptureStructuredTextInsertion('insertCompositionText', 'a')).toBe(false)
  })
})
