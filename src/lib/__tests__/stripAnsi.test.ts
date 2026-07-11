import { describe, expect, it } from 'vitest'
import { stripAnsi } from '../claude-output-parser'

describe('stripAnsi', () => {
  it('removes basic SGR color sequences', () => {
    expect(stripAnsi('\x1b[31mred\x1b[0m')).toBe('red')
    expect(stripAnsi('\x1b[1m\x1b[95mbold magenta\x1b[0m')).toBe('bold magenta')
  })

  it('removes DEC private mode sequences the old regex leaked', () => {
    // These are emitted constantly by Claude Code and the old [0-9;]* pattern
    // could not consume the leading '?'.
    expect(stripAnsi('\x1b[?25lhidden\x1b[?25h')).toBe('hidden')
    expect(stripAnsi('\x1b[?2026hsync\x1b[?2026l')).toBe('sync')
    expect(stripAnsi('\x1b[?1049halt-screen')).toBe('alt-screen')
  })

  it('removes OSC terminated by BEL and by ST', () => {
    expect(stripAnsi('\x1b]0;title\x07after')).toBe('after')
    // ST-terminated OSC (ConPTY/Windows emits this form)
    expect(stripAnsi('\x1b]0;title\x1b\\after')).toBe('after')
  })

  it('removes cursor movement and erase-line sequences (preserving \\r)', () => {
    // Erase-line escape is stripped; the carriage return is a real control
    // char the terminal needs, so it is preserved.
    expect(stripAnsi('\x1b[2K\rReading foo.ts')).toBe('\rReading foo.ts')
    expect(stripAnsi('line\x1b[1A\x1b[2Kredraw')).toBe('lineredraw')
  })

  it('preserves ordinary text, tabs and newlines', () => {
    expect(stripAnsi('plain\ttext\nline2')).toBe('plain\ttext\nline2')
  })
})
