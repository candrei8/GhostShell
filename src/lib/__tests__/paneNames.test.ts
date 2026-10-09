import { describe, expect, it } from 'vitest'
import { PANE_NAMES, isGenericTitle, nextPaneName } from '../paneNames'

describe('isGenericTitle', () => {
  it('flags placeholder titles', () => {
    for (const title of ['', '  ', 'Terminal', 'terminal 3', 'New Session', 'Claude', 'Claude 2', 'Claude Code', 'Codex', 'Gemini 4', 'PowerShell']) {
      expect(isGenericTitle(title)).toBe(true)
    }
  })

  it('keeps real names', () => {
    for (const title of ['Emma', 'Backend API', 'Claude reviewer', 'Security Hawk']) {
      expect(isGenericTitle(title)).toBe(false)
    }
  })
})

describe('nextPaneName', () => {
  it('returns the first free name, case-insensitively', () => {
    expect(nextPaneName([])).toBe('Emma')
    expect(nextPaneName(['emma', 'James'])).toBe('Olivia')
  })

  it('continues with numbered names once every name is taken', () => {
    expect(nextPaneName(PANE_NAMES)).toBe('Emma 2')
    expect(nextPaneName([...PANE_NAMES, 'Emma 2'])).toBe('James 2')
  })
})
