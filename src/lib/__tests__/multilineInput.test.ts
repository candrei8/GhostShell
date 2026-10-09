import { describe, expect, it } from 'vitest'
import { WIN32_SHIFT_ENTER, getNativeMultilineSequence } from '../multilineInput'

describe('getNativeMultilineSequence', () => {
  it('uses Alt+Enter (ESC CR) for Claude Code on every platform', () => {
    expect(getNativeMultilineSequence('claude', true)).toBe('\x1b\r')
    expect(getNativeMultilineSequence('claude', false)).toBe('\x1b\r')
  })

  it('sends a real Shift+Enter key event to Codex on Windows', () => {
    // A raw LF reaches Codex through ConPTY as Ctrl+Enter, which it ignores.
    expect(getNativeMultilineSequence('codex', true)).toBe(WIN32_SHIFT_ENTER)
  })

  it('keeps LF (Ctrl+J) for Codex on Unix PTYs and for Gemini', () => {
    expect(getNativeMultilineSequence('codex', false)).toBe('\n')
    expect(getNativeMultilineSequence('gemini', true)).toBe('\n')
  })

  it('encodes key down then key up with the Shift modifier', () => {
    const events = WIN32_SHIFT_ENTER.split('_').filter(Boolean).map((e) => e.replace('\x1b[', '').split(';').map(Number))
    expect(events).toEqual([
      [13, 28, 13, 1, 16, 1],
      [13, 28, 13, 0, 16, 1],
    ])
  })
})
