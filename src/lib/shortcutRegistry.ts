export type ShortcutCategory = 'terminal' | 'navigation' | 'tabs' | 'terminal-input'

export interface KeyCombo {
  ctrl: boolean
  shift: boolean
  alt: boolean
  key: string
}

export type ShortcutBindingSource = 'primary' | 'secondary'

export interface ShortcutDefinition {
  id: string
  category: ShortcutCategory
  label: string
  description: string
  defaultBinding: KeyCombo
  alternateBinding?: KeyCombo
  readonly?: boolean
}

export interface ShortcutBindingDescriptor {
  combo: KeyCombo
  source: ShortcutBindingSource
  readonly: boolean
}

const IS_MAC = /Mac|iPod|iPhone|iPad/.test(navigator.platform)

const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta'])

const SPECIAL_KEY_LABELS: Record<string, string> = {
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  PageUp: 'PgUp',
  PageDown: 'PgDn',
  Escape: 'Esc',
  Enter: 'Enter',
  Space: 'Space',
}

const SPECIAL_KEY_VALUES: Record<string, string> = {
  Left: 'ArrowLeft',
  Right: 'ArrowRight',
  Up: 'ArrowUp',
  Down: 'ArrowDown',
  PgUp: 'PageUp',
  PgDn: 'PageDown',
  Esc: 'Escape',
  Space: 'Space',
}

function normalizeRawKey(key: string): string {
  if (key === ' ') return 'Space'
  if (key === 'Esc') return 'Escape'
  if (key.length === 1) return key.toLowerCase()
  return key
}

export function normalizeKeyCombo(combo: KeyCombo): KeyCombo {
  return {
    ctrl: !!combo.ctrl,
    shift: !!combo.shift,
    alt: !!combo.alt,
    key: normalizeRawKey(combo.key),
  }
}

function normalizeKey(e: Pick<KeyboardEvent, 'key'>): string {
  return normalizeRawKey(e.key)
}

export function getKeyComboParts(combo: KeyCombo): string[] {
  const normalized = normalizeKeyCombo(combo)
  const parts: string[] = []

  if (normalized.ctrl) parts.push(IS_MAC ? '⌘' : 'Ctrl')
  if (normalized.shift) parts.push('Shift')
  if (normalized.alt) parts.push(IS_MAC ? '⌥' : 'Alt')

  const label =
    normalized.key.length === 1
      ? normalized.key.toUpperCase()
      : SPECIAL_KEY_LABELS[normalized.key] || normalized.key

  parts.push(label)
  return parts
}

export function formatKeyCombo(combo: KeyCombo): string {
  return getKeyComboParts(combo).join('+')
}

export function getKeyComboSignature(combo: KeyCombo): string {
  const normalized = normalizeKeyCombo(combo)
  return [
    normalized.ctrl ? '1' : '0',
    normalized.shift ? '1' : '0',
    normalized.alt ? '1' : '0',
    normalized.key,
  ].join(':')
}

export function parseKeyCombo(display: string): KeyCombo {
  const parts = display.split('+').map((part) => part.trim()).filter(Boolean)
  const rawKey = parts[parts.length - 1] || ''
  const resolvedKey = SPECIAL_KEY_VALUES[rawKey] || rawKey

  return normalizeKeyCombo({
    ctrl: parts.includes('Ctrl') || parts.includes('⌘'),
    shift: parts.includes('Shift'),
    alt: parts.includes('Alt') || parts.includes('⌥'),
    key: resolvedKey,
  })
}

export function matchesKeyCombo(e: KeyboardEvent, combo: KeyCombo): boolean {
  const normalized = normalizeKeyCombo(combo)

  // On Mac, Cmd (metaKey) is treated as the primary modifier (equivalent to Ctrl)
  const ctrlSatisfied = IS_MAC ? (e.metaKey || e.ctrlKey) : e.ctrlKey
  if (ctrlSatisfied !== normalized.ctrl) return false
  if (!!e.shiftKey !== normalized.shift) return false
  if (!!e.altKey !== normalized.alt) return false
  // On non-Mac, reject metaKey since it's not part of our shortcut system
  if (!IS_MAC && e.metaKey) return false

  return normalizeKey(e) === normalized.key
}

export function keyComboEquals(a: KeyCombo, b: KeyCombo): boolean {
  const left = normalizeKeyCombo(a)
  const right = normalizeKeyCombo(b)
  return (
    left.ctrl === right.ctrl &&
    left.shift === right.shift &&
    left.alt === right.alt &&
    left.key === right.key
  )
}

export function isModifierOnly(e: KeyboardEvent): boolean {
  return MODIFIER_KEYS.has(e.key)
}

export function eventToKeyCombo(e: KeyboardEvent): KeyCombo {
  return normalizeKeyCombo({
    ctrl: e.ctrlKey,
    shift: e.shiftKey,
    alt: e.altKey,
    key: normalizeKey(e),
  })
}

export const RESERVED_COMBOS: KeyCombo[] = [
  combo(true, false, false, 'c'),
  combo(true, true, false, 'c'),
  combo(true, false, false, 'v'),
  combo(false, true, false, 'Enter'),
]

export function isReservedCombo(comboToCheck: KeyCombo): boolean {
  const normalized = normalizeKeyCombo(comboToCheck)
  return RESERVED_COMBOS.some((comboItem) => keyComboEquals(comboItem, normalized))
}

function combo(ctrl: boolean, shift: boolean, alt: boolean, key: string): KeyCombo {
  return normalizeKeyCombo({ ctrl, shift, alt, key })
}

export function getDefaultBindings(definition: ShortcutDefinition): ShortcutBindingDescriptor[] {
  const bindings: ShortcutBindingDescriptor[] = [
    {
      combo: normalizeKeyCombo(definition.defaultBinding),
      source: 'primary',
      readonly: !!definition.readonly,
    },
  ]

  if (definition.alternateBinding) {
    bindings.push({
      combo: normalizeKeyCombo(definition.alternateBinding),
      source: 'secondary',
      readonly: true,
    })
  }

  return bindings
}

export function getResolvedBindings(
  definition: ShortcutDefinition,
  primaryBinding: KeyCombo | null,
  hasOverride: boolean,
): ShortcutBindingDescriptor[] {
  if (hasOverride) {
    return primaryBinding
      ? [
          {
            combo: normalizeKeyCombo(primaryBinding),
            source: 'primary',
            readonly: !!definition.readonly,
          },
        ]
      : []
  }

  return getDefaultBindings(definition)
}

export const SHORTCUT_REGISTRY: ShortcutDefinition[] = [
  {
    id: 'terminal.new',
    category: 'terminal',
    label: 'New Terminal',
    description: 'Open a new terminal tab',
    defaultBinding: combo(true, false, false, 't'),
  },
  {
    id: 'terminal.close',
    category: 'terminal',
    label: 'Close Tab',
    description: 'Close active tab or stop agent',
    defaultBinding: combo(true, true, false, 'w'),
  },
  {
    id: 'terminal.split',
    category: 'terminal',
    label: 'Split / Duplicate',
    description: 'Duplicate the active terminal pane',
    defaultBinding: combo(true, true, false, 'd'),
  },
  {
    id: 'terminal.maximize',
    category: 'terminal',
    label: 'Toggle Maximize',
    description: 'Maximize or restore active pane',
    defaultBinding: combo(true, true, false, 'Enter'),
  },
  {
    id: 'terminal.rename',
    category: 'terminal',
    label: 'Rename Tab',
    description: 'Rename the active terminal tab',
    defaultBinding: combo(false, false, false, 'F2'),
  },
  {
    id: 'terminal.search',
    category: 'terminal',
    label: 'Search in Terminal',
    description: 'Find text in the active terminal',
    defaultBinding: combo(true, true, false, 'f'),
  },
  {
    id: 'terminal.syncInputs',
    category: 'terminal',
    label: 'Sync Inputs',
    description: 'Toggle synchronized input to all panes',
    defaultBinding: combo(true, false, true, 'i'),
  },
  {
    id: 'terminal.clear',
    category: 'terminal',
    label: 'Clear Terminal',
    description: 'Clear terminal screen (keeps scrollback)',
    defaultBinding: combo(true, false, false, 'l'),
  },
  {
    id: 'terminal.clearScrollback',
    category: 'terminal',
    label: 'Clear Scrollback',
    description: 'Clear entire scrollback buffer',
    defaultBinding: combo(true, true, false, 'k'),
  },
  {
    id: 'terminal.scrollToTop',
    category: 'terminal',
    label: 'Scroll to Top',
    description: 'Scroll terminal to the top of output',
    defaultBinding: combo(true, false, false, 'Home'),
  },
  {
    id: 'terminal.scrollToBottom',
    category: 'terminal',
    label: 'Scroll to Bottom',
    description: 'Scroll terminal to the latest output',
    defaultBinding: combo(true, false, false, 'End'),
  },
  {
    id: 'terminal.zoomIn',
    category: 'terminal',
    label: 'Zoom In',
    description: 'Increase terminal font size',
    defaultBinding: combo(true, false, false, '='),
  },
  {
    id: 'terminal.zoomOut',
    category: 'terminal',
    label: 'Zoom Out',
    description: 'Decrease terminal font size',
    defaultBinding: combo(true, false, false, '-'),
  },
  {
    id: 'terminal.zoomReset',
    category: 'terminal',
    label: 'Reset Zoom',
    description: 'Reset terminal font size to default',
    defaultBinding: combo(true, true, false, '0'),
  },
  {
    id: 'terminal.selectAll',
    category: 'terminal',
    label: 'Select All Output',
    description: 'Select all text in terminal buffer',
    defaultBinding: combo(true, true, false, 'a'),
  },
  {
    id: 'terminal.moveTabLeft',
    category: 'terminal',
    label: 'Move Tab Left',
    description: 'Reorder active tab one position left',
    defaultBinding: combo(true, true, false, 'PageUp'),
  },
  {
    id: 'terminal.moveTabRight',
    category: 'terminal',
    label: 'Move Tab Right',
    description: 'Reorder active tab one position right',
    defaultBinding: combo(true, true, false, 'PageDown'),
  },
  {
    id: 'terminal.reopenClosed',
    category: 'terminal',
    label: 'Reopen Closed Tab',
    description: 'Restore the last closed terminal tab',
    defaultBinding: combo(true, true, false, 't'),
  },
  {
    id: 'terminal.killProcess',
    category: 'terminal',
    label: 'Kill Process',
    description: 'Force kill the active terminal process',
    defaultBinding: combo(true, true, false, 'x'),
  },
  {
    id: 'terminal.copyPath',
    category: 'terminal',
    label: 'Copy Path',
    description: 'Copy the current working directory path',
    defaultBinding: combo(true, true, false, '.'),
  },
  {
    id: 'terminal.newWithProfile',
    category: 'terminal',
    label: 'New Session (Quick Launch)',
    description: 'Open Quick Launch for a new agent session',
    defaultBinding: combo(true, true, false, 'n'),
  },
  {
    id: 'nav.commandPalette',
    category: 'navigation',
    label: 'Command Palette',
    description: 'Open the command palette',
    defaultBinding: combo(true, true, false, 'p'),
  },
  {
    id: 'nav.quickLaunch',
    category: 'navigation',
    label: 'Quick Launch',
    description: 'Toggle the Quick Launch panel',
    defaultBinding: combo(true, false, true, 'q'),
  },
  {
    id: 'nav.settings',
    category: 'navigation',
    label: 'Settings (Appearance)',
    description: 'Open settings - Appearance tab',
    defaultBinding: combo(true, false, false, ','),
  },
  {
    id: 'nav.settingsTerminal',
    category: 'navigation',
    label: 'Settings (Terminal)',
    description: 'Open settings - Terminal tab',
    defaultBinding: combo(true, true, false, ','),
  },
  {
    id: 'nav.settingsProviders',
    category: 'navigation',
    label: 'Settings (Providers)',
    description: 'Open settings - AI Providers tab',
    defaultBinding: combo(true, false, true, ','),
  },
  {
    id: 'nav.settingsShortcuts',
    category: 'navigation',
    label: 'Settings (Shortcuts)',
    description: 'Open settings - Shortcuts tab',
    defaultBinding: combo(true, false, true, 'k'),
  },
  {
    id: 'nav.history',
    category: 'navigation',
    label: 'History',
    description: 'Open command history panel',
    defaultBinding: combo(true, true, false, 'h'),
  },
  {
    id: 'nav.blocks',
    category: 'navigation',
    label: 'Command Blocks',
    description: 'Open Warp-style command timeline',
    defaultBinding: combo(true, true, false, 'b'),
  },
  {
    id: 'nav.monitor',
    category: 'navigation',
    label: 'Sub-Agent Monitor',
    description: 'Toggle the sub-agent monitor panel',
    defaultBinding: combo(true, true, false, 'm'),
  },
  {
    id: 'nav.sidebarSwarm',
    category: 'navigation',
    label: 'Sidebar: Swarm',
    description: 'Show swarm sidebar',
    defaultBinding: combo(true, false, true, '1'),
  },
  {
    id: 'nav.sidebarFiles',
    category: 'navigation',
    label: 'Sidebar: Files',
    description: 'Show files sidebar',
    defaultBinding: combo(true, false, true, '2'),
  },
  {
    id: 'nav.sidebarHistory',
    category: 'navigation',
    label: 'Sidebar: History',
    description: 'Show history sidebar',
    defaultBinding: combo(true, false, true, '3'),
  },
  {
    id: 'nav.sidebarBlocks',
    category: 'navigation',
    label: 'Sidebar: Blocks',
    description: 'Show blocks sidebar',
    defaultBinding: combo(true, false, true, '4'),
  },
  {
    id: 'nav.sidebarClose',
    category: 'navigation',
    label: 'Close Sidebar',
    description: 'Close the secondary sidebar',
    defaultBinding: combo(true, false, true, '0'),
  },
  {
    id: 'nav.swarmViewToggle',
    category: 'navigation',
    label: 'Toggle Swarm View',
    description: 'Switch between dashboard and terminal view during a swarm',
    defaultBinding: combo(true, false, true, 'd'),
  },
  {
    id: 'nav.toggleSidebar',
    category: 'navigation',
    label: 'Toggle Sidebar',
    description: 'Show or hide the sidebar panel',
    defaultBinding: combo(true, false, false, 'b'),
  },
  {
    id: 'nav.toggleFullscreen',
    category: 'navigation',
    label: 'Toggle Fullscreen',
    description: 'Toggle window fullscreen mode',
    defaultBinding: combo(false, false, false, 'F11'),
  },
  {
    id: 'nav.focusTerminal',
    category: 'navigation',
    label: 'Focus Terminal',
    description: 'Move focus to the active terminal pane',
    defaultBinding: combo(true, false, false, '`'),
  },
  {
    id: 'nav.lastTab',
    category: 'navigation',
    label: 'Last Tab',
    description: 'Switch to the last tab',
    defaultBinding: combo(true, true, false, '9'),
  },
  {
    id: 'tab.prev',
    category: 'tabs',
    label: 'Previous Tab',
    description: 'Switch to the previous tab',
    defaultBinding: combo(true, false, false, 'PageUp'),
  },
  {
    id: 'tab.next',
    category: 'tabs',
    label: 'Next Tab',
    description: 'Switch to the next tab',
    defaultBinding: combo(true, false, false, 'PageDown'),
  },
  {
    id: 'pane.prev',
    category: 'tabs',
    label: 'Previous Pane',
    description: 'Focus the previous pane',
    defaultBinding: combo(true, false, true, 'ArrowLeft'),
    alternateBinding: combo(true, false, true, 'ArrowUp'),
  },
  {
    id: 'pane.next',
    category: 'tabs',
    label: 'Next Pane',
    description: 'Focus the next pane',
    defaultBinding: combo(true, false, true, 'ArrowRight'),
    alternateBinding: combo(true, false, true, 'ArrowDown'),
  },
  ...Array.from({ length: 9 }, (_, index) => ({
    id: `tab.${index + 1}`,
    category: 'tabs' as ShortcutCategory,
    label: `Tab ${index + 1}`,
    description: `Switch to tab ${index + 1}`,
    defaultBinding: combo(true, false, false, `${index + 1}`),
  })),
  {
    id: 'xterm.copy',
    category: 'terminal-input',
    label: 'Copy Selection',
    description: 'Copy selected text from terminal',
    defaultBinding: combo(true, true, false, 'c'),
    readonly: true,
  },
  {
    id: 'xterm.sigint',
    category: 'terminal-input',
    label: 'SIGINT / Copy',
    description: 'Send interrupt signal or copy with selection',
    defaultBinding: combo(true, false, false, 'c'),
    readonly: true,
  },
  {
    id: 'xterm.paste',
    category: 'terminal-input',
    label: 'Paste',
    description: 'Paste into terminal',
    defaultBinding: combo(true, false, false, 'v'),
    readonly: true,
  },
  {
    id: 'xterm.multiline',
    category: 'terminal-input',
    label: 'Multiline Input',
    description: 'Insert newline without executing',
    defaultBinding: combo(false, true, false, 'Enter'),
    readonly: true,
  },
]

export function getShortcutDef(id: string): ShortcutDefinition | undefined {
  return SHORTCUT_REGISTRY.find((shortcut) => shortcut.id === id)
}

export function getRebindableShortcuts(): ShortcutDefinition[] {
  return SHORTCUT_REGISTRY.filter((shortcut) => !shortcut.readonly)
}

export const CATEGORY_LABELS: Record<ShortcutCategory, string> = {
  terminal: 'Terminal',
  navigation: 'Navigation',
  tabs: 'Tabs & Panes',
  'terminal-input': 'Terminal Input',
}

export const CATEGORY_DESCRIPTIONS: Record<ShortcutCategory, string> = {
  terminal: 'Create, duplicate, rename, and search active sessions.',
  navigation: 'Move between panels and open system surfaces.',
  tabs: 'Jump between workspaces and pane focus targets.',
  'terminal-input': 'Protected terminal-level bindings managed by xterm.',
}
