import { Provider } from './types'

/**
 * Shift+Enter as a real Win32 key event, in ConPTY's win32-input-mode encoding
 * (`CSI Vk ; Sc ; Uc ; Kd ; Cs ; Rc _`): VK_RETURN (13), scan code 28, char 13,
 * key down then key up, SHIFT_PRESSED (0x10), repeat 1. ConPTY decodes it into
 * a KEY_EVENT with the Shift modifier — exactly what Windows Terminal sends.
 */
export const WIN32_SHIFT_ENTER = '\x1b[13;28;13;1;16;1_\x1b[13;28;13;0;16;1_'

export function isWindowsHost(): boolean {
  return typeof navigator !== 'undefined' && /Windows/i.test(navigator.userAgent)
}

/** Bytes that make an AI CLI insert a newline in its prompt without submitting. */
export function getNativeMultilineSequence(provider: Provider, windows = isWindowsHost()): string {
  // Claude Code: ESC+CR (Alt+Enter) inserts a newline without submitting.
  if (provider === 'claude') return '\x1b\r'
  // Codex on Windows reads console key events, not bytes. ConPTY turns a raw
  // LF into Ctrl+Enter, which Codex ignores; a real Shift+Enter inserts the
  // newline.
  if (provider === 'codex' && windows) return WIN32_SHIFT_ENTER
  // Gemini, and Codex on a Unix PTY: raw LF (Ctrl+J) inserts a newline.
  return '\n'
}
