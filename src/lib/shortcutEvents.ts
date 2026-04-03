export const SHORTCUT_EVENTS = {
  newTerminal: 'ghostshell:shortcut-new-terminal',
  renameTab: 'ghostshell:shortcut-rename-tab',
  splitSession: 'ghostshell:shortcut-split-session',
  toggleTerminalSearch: 'ghostshell:shortcut-terminal-search',
  openMultiLineInput: 'ghostshell:shortcut-multiline-input',
  clearTerminal: 'ghostshell:shortcut-clear-terminal',
  clearScrollback: 'ghostshell:shortcut-clear-scrollback',
  scrollToTop: 'ghostshell:shortcut-scroll-to-top',
  scrollToBottom: 'ghostshell:shortcut-scroll-to-bottom',
  selectAll: 'ghostshell:shortcut-select-all',
  copyPath: 'ghostshell:shortcut-copy-path',
  focusTerminal: 'ghostshell:shortcut-focus-terminal',
} as const

export type ShortcutEventName = (typeof SHORTCUT_EVENTS)[keyof typeof SHORTCUT_EVENTS]
