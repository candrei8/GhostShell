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

  if (
    normalizedType === 'insertFromPaste' ||
    normalizedType === 'insertFromDrop' ||
    normalizedType === 'insertReplacementText'
  ) {
    return true
  }

  // Voice dictation / text expansion tools often inject full phrases as one insertText.
  if (normalizedType === 'insertText' && normalizedData.length > 1) {
    return true
  }

  return false
}
