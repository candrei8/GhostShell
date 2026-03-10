export const SHORTCUT_EVENTS = {
  renameTab: 'ghostshell:shortcut-rename-tab',
  splitSession: 'ghostshell:shortcut-split-session',
  toggleTerminalSearch: 'ghostshell:shortcut-terminal-search',
  openMultiLineInput: 'ghostshell:shortcut-multiline-input',
} as const

export type ShortcutEventName = (typeof SHORTCUT_EVENTS)[keyof typeof SHORTCUT_EVENTS]
