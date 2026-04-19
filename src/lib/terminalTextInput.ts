export function normalizeTerminalPasteText(text: string): string {
  return text.replace(/\r?\n/g, '\r')
}

export function shouldCaptureStructuredTextInsertion(
  inputType?: string | null,
  data?: string | null,
): boolean {
  const normalizedType = inputType || ''
  const normalizedData = data || ''

  if (!normalizedData) return false

  // Voice dictation / text expansion tools (Wispr Flow, etc.) inject full
  // phrases as a single insertText event. We intercept these so they hit the
  // PTY as one atomic write instead of being typed character by character.
  //
  // We deliberately do NOT intercept `insertFromPaste` — xterm.js handles
  // clipboard pastes natively via its own textarea listener, wrapping text in
  // bracketed-paste and firing onData. Intercepting here caused double writes
  // that Claude's CLI registered as multiple paste blocks.
  if (normalizedType === 'insertText' && normalizedData.length > 1) {
    return true
  }

  return false
}
