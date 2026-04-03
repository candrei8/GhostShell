import { useCallback, useEffect } from 'react'
import { SHORTCUT_EVENTS } from '../lib/shortcutEvents'
import { matchesKeyCombo } from '../lib/shortcutRegistry'
import { useAgent } from './useAgent'
import { useShortcutStore } from '../stores/shortcutStore'
import { useTerminalStore } from '../stores/terminalStore'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useSwarmStore } from '../stores/swarmStore'

// Stack of recently closed sessions for reopen (module-level, survives re-renders)
const closedTabStack: Array<{ title: string; cwd?: string; shell?: string }> = []
const MAX_CLOSED_TABS = 20

interface KeyboardShortcutsOptions {
  onToggleCommandPalette: () => void
  onNavigate?: (view: string) => void
  onClearNavigation?: () => void
  onToggleQuickLaunch?: () => void
  onOpenSettingsTab?: (tab: 'appearance' | 'providers' | 'terminal' | 'shortcuts') => void
  onToggleMonitor?: () => void
  onToggleSidebar?: () => void
  isSettingsOpen?: boolean
  isCommandPaletteOpen?: boolean
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  if (target.closest('.xterm')) return true
  if (target.closest('[data-allow-global-shortcuts="true"]')) return false
  if (target.closest('[contenteditable="true"]')) return true

  const tagName = target.tagName
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    tagName === 'INPUT' ||
    tagName === 'TEXTAREA' ||
    tagName === 'SELECT' ||
    target instanceof HTMLElement && target.isContentEditable
  )
}

export function useKeyboardShortcuts({
  onToggleCommandPalette,
  onNavigate,
  onClearNavigation,
  onToggleQuickLaunch,
  onOpenSettingsTab,
  onToggleMonitor,
  onToggleSidebar,
  isSettingsOpen = false,
  isCommandPaletteOpen = false,
}: KeyboardShortcutsOptions) {
  const { stopAgent } = useAgent()

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      if (isSettingsOpen || isCommandPaletteOpen) return
      if (isEditableTarget(event.target)) return

      const getActiveBindings = useShortcutStore.getState().getActiveBindings
      const matches = (shortcutId: string) =>
        getActiveBindings(shortcutId).some((binding) => matchesKeyCombo(event, binding.combo))

      const run = (shortcutId: string, action: () => void) => {
        if (!matches(shortcutId)) return false
        event.preventDefault()
        action()
        return true
      }

      if (run('nav.commandPalette', onToggleCommandPalette)) return

      if (
        run('terminal.rename', () => {
          window.dispatchEvent(new CustomEvent(SHORTCUT_EVENTS.renameTab))
        })
      ) {
        return
      }

      if (
        run('terminal.new', () => {
          const currentPath = useWorkspaceStore.getState().currentPath
          useTerminalStore.getState().addSession({
            id: `term-standalone-${Date.now()}`,
            title: 'Terminal',
            cwd: currentPath,
          })
        })
      ) {
        return
      }

      if (
        run('terminal.split', () => {
          window.dispatchEvent(new CustomEvent(SHORTCUT_EVENTS.splitSession))
        })
      ) {
        return
      }

      // Close tab — push to closedTabStack before removing
      if (
        run('terminal.close', () => {
          const state = useTerminalStore.getState()
          if (!state.activeSessionId || state.sessions.length === 0) return

          const session = state.sessions.find((item) => item.id === state.activeSessionId)
          if (session?.agentId) {
            stopAgent(session.agentId)
            return
          }

          // Remember closed tab for reopen
          if (session) {
            closedTabStack.push({ title: session.title, cwd: session.cwd, shell: session.shell })
            if (closedTabStack.length > MAX_CLOSED_TABS) closedTabStack.shift()
          }

          state.removeSession(state.activeSessionId)
        })
      ) {
        return
      }

      if (
        run('terminal.maximize', () => {
          const { activeSessionId, toggleMaximize } = useTerminalStore.getState()
          if (activeSessionId) toggleMaximize(activeSessionId)
        })
      ) {
        return
      }

      if (
        run('terminal.syncInputs', () => {
          const { syncInputsMode, setSyncInputs } = useTerminalStore.getState()
          setSyncInputs(syncInputsMode === 'off' ? 'all' : 'off')
        })
      ) {
        return
      }

      if (
        run('terminal.search', () => {
          window.dispatchEvent(new CustomEvent(SHORTCUT_EVENTS.toggleTerminalSearch))
        })
      ) {
        return
      }

      // ── New Warp-style terminal shortcuts ──────────────────────────────

      if (
        run('terminal.clear', () => {
          window.dispatchEvent(new CustomEvent(SHORTCUT_EVENTS.clearTerminal))
        })
      ) {
        return
      }

      if (
        run('terminal.clearScrollback', () => {
          window.dispatchEvent(new CustomEvent(SHORTCUT_EVENTS.clearScrollback))
        })
      ) {
        return
      }

      if (
        run('terminal.scrollToTop', () => {
          window.dispatchEvent(new CustomEvent(SHORTCUT_EVENTS.scrollToTop))
        })
      ) {
        return
      }

      if (
        run('terminal.scrollToBottom', () => {
          window.dispatchEvent(new CustomEvent(SHORTCUT_EVENTS.scrollToBottom))
        })
      ) {
        return
      }

      if (
        run('terminal.zoomIn', () => {
          const settings = useSettingsStore.getState()
          const current = settings.terminalFontSize
          if (current < 24) settings.setTerminalFontSize(current + 1)
        })
      ) {
        return
      }

      if (
        run('terminal.zoomOut', () => {
          const settings = useSettingsStore.getState()
          const current = settings.terminalFontSize
          if (current > 10) settings.setTerminalFontSize(current - 1)
        })
      ) {
        return
      }

      if (
        run('terminal.zoomReset', () => {
          useSettingsStore.getState().setTerminalFontSize(14)
        })
      ) {
        return
      }

      if (
        run('terminal.selectAll', () => {
          window.dispatchEvent(new CustomEvent(SHORTCUT_EVENTS.selectAll))
        })
      ) {
        return
      }

      if (
        run('terminal.moveTabLeft', () => {
          const state = useTerminalStore.getState()
          if (!state.activeSessionId) return
          const idx = state.sessions.findIndex((s) => s.id === state.activeSessionId)
          if (idx > 0) state.moveSession(idx, idx - 1)
        })
      ) {
        return
      }

      if (
        run('terminal.moveTabRight', () => {
          const state = useTerminalStore.getState()
          if (!state.activeSessionId) return
          const idx = state.sessions.findIndex((s) => s.id === state.activeSessionId)
          if (idx >= 0 && idx < state.sessions.length - 1) state.moveSession(idx, idx + 1)
        })
      ) {
        return
      }

      if (
        run('terminal.reopenClosed', () => {
          const entry = closedTabStack.pop()
          if (!entry) return
          const cwd = entry.cwd || useWorkspaceStore.getState().currentPath
          useTerminalStore.getState().addSession({
            id: `term-reopen-${Date.now()}`,
            title: entry.title,
            cwd,
            shell: entry.shell,
          })
        })
      ) {
        return
      }

      if (
        run('terminal.killProcess', () => {
          const state = useTerminalStore.getState()
          if (!state.activeSessionId) return
          try {
            window.ghostshell.ptyKill(state.activeSessionId)
          } catch {}
        })
      ) {
        return
      }

      if (
        run('terminal.copyPath', () => {
          window.dispatchEvent(new CustomEvent(SHORTCUT_EVENTS.copyPath))
        })
      ) {
        return
      }

      if (
        run('terminal.newWithProfile', () => {
          onToggleQuickLaunch?.()
        })
      ) {
        return
      }

      // ── Navigation shortcuts ──────────────────────────────────────────

      if (run('nav.toggleSidebar', () => onToggleSidebar?.())) return

      if (
        run('nav.toggleFullscreen', () => {
          // Electron fullscreen toggle
          try {
            ;(window as any).ghostshell?.toggleFullscreen?.()
          } catch {}
        })
      ) {
        return
      }

      if (
        run('nav.focusTerminal', () => {
          window.dispatchEvent(new CustomEvent(SHORTCUT_EVENTS.focusTerminal))
        })
      ) {
        return
      }

      if (
        run('nav.lastTab', () => {
          const { sessions, setActiveSession, viewMode, getWorkspaces, setActiveWorkspace } =
            useTerminalStore.getState()
          if (viewMode === 'tabs') {
            const workspaces = getWorkspaces()
            if (workspaces.length > 0) setActiveWorkspace(workspaces[workspaces.length - 1].id)
          } else if (sessions.length > 0) {
            setActiveSession(sessions[sessions.length - 1].id)
          }
        })
      ) {
        return
      }

      // ── Pane navigation ───────────────────────────────────────────────

      if (matches('pane.prev') || matches('pane.next')) {
        event.preventDefault()
        const {
          sessions,
          activeSessionId,
          activeWorkspaceId,
          viewMode,
          getWorkspaces,
          setActiveSession,
        } = useTerminalStore.getState()

        if (!activeSessionId) return

        const workspace = activeWorkspaceId
          ? getWorkspaces().find((item) => item.id === activeWorkspaceId)
          : undefined

        const visibleSessions =
          viewMode === 'tabs' && activeWorkspaceId
            ? sessions.filter((session) => !!workspace?.sessionIds.includes(session.id))
            : sessions

        if (visibleSessions.length < 2) return

        const currentIndex = visibleSessions.findIndex((session) => session.id === activeSessionId)
        if (currentIndex < 0) return

        const nextIndex = matches('pane.prev')
          ? (currentIndex - 1 + visibleSessions.length) % visibleSessions.length
          : (currentIndex + 1) % visibleSessions.length

        setActiveSession(visibleSessions[nextIndex].id)
        return
      }

      for (let index = 1; index <= 9; index += 1) {
        if (!matches(`tab.${index}`)) continue

        event.preventDefault()
        const { sessions, viewMode, getWorkspaces, setActiveSession, setActiveWorkspace } =
          useTerminalStore.getState()

        if (sessions.length === 0) return

        const shortcutIndex = index - 1
        if (viewMode === 'tabs') {
          const workspaces = getWorkspaces()
          if (workspaces.length === 0) return

          const clampedIndex = Math.min(shortcutIndex, workspaces.length - 1)
          setActiveWorkspace(workspaces[clampedIndex].id)
          return
        }

        const clampedIndex = Math.min(shortcutIndex, sessions.length - 1)
        setActiveSession(sessions[clampedIndex].id)
        return
      }

      if (matches('tab.prev') || matches('tab.next')) {
        event.preventDefault()
        const {
          sessions,
          activeSessionId,
          activeWorkspaceId,
          viewMode,
          getWorkspaces,
          setActiveSession,
          setActiveWorkspace,
        } = useTerminalStore.getState()

        if (matches('tab.next')) {
          if (viewMode === 'tabs') {
            const workspaces = getWorkspaces()
            if (workspaces.length < 2) return

            const currentIndex = workspaces.findIndex((workspace) => workspace.id === activeWorkspaceId)
            const nextIndex = (Math.max(currentIndex, 0) + 1) % workspaces.length
            setActiveWorkspace(workspaces[nextIndex].id)
            return
          }

          if (sessions.length < 2 || !activeSessionId) return

          const currentIndex = sessions.findIndex((session) => session.id === activeSessionId)
          if (currentIndex < 0) return
          setActiveSession(sessions[(currentIndex + 1) % sessions.length].id)
          return
        }

        if (viewMode === 'tabs') {
          const workspaces = getWorkspaces()
          if (workspaces.length < 2) return

          const currentIndex = workspaces.findIndex((workspace) => workspace.id === activeWorkspaceId)
          const nextIndex = (Math.max(currentIndex, 0) - 1 + workspaces.length) % workspaces.length
          setActiveWorkspace(workspaces[nextIndex].id)
          return
        }

        if (sessions.length < 2 || !activeSessionId) return

        const currentIndex = sessions.findIndex((session) => session.id === activeSessionId)
        if (currentIndex < 0) return
        setActiveSession(sessions[(currentIndex - 1 + sessions.length) % sessions.length].id)
        return
      }

      // ── Settings shortcuts ────────────────────────────────────────────

      if (
        run('nav.settings', () => {
          onOpenSettingsTab?.('appearance') ?? onNavigate?.('settings')
        })
      ) {
        return
      }

      if (
        run('nav.settingsTerminal', () => {
          onOpenSettingsTab?.('terminal') ?? onNavigate?.('settings')
        })
      ) {
        return
      }

      if (
        run('nav.settingsProviders', () => {
          onOpenSettingsTab?.('providers') ?? onNavigate?.('settings')
        })
      ) {
        return
      }

      if (
        run('nav.settingsShortcuts', () => {
          onOpenSettingsTab?.('shortcuts') ?? onNavigate?.('settings')
        })
      ) {
        return
      }

      if (run('nav.history', () => onNavigate?.('history'))) return
      if (run('nav.blocks', () => onNavigate?.('blocks'))) return
      if (run('nav.quickLaunch', () => onToggleQuickLaunch?.())) return
      if (run('nav.monitor', () => onToggleMonitor?.())) return
      if (
        run('nav.swarmViewToggle', () => {
          const swarmState = useSwarmStore.getState()
          if (swarmState.activeSwarmId) {
            swarmState.toggleSwarmViewMode()
          }
        })
      ) {
        return
      }

      if (run('nav.sidebarSwarm', () => onNavigate?.('swarm'))) return
      if (run('nav.sidebarFiles', () => onNavigate?.('files'))) return
      if (run('nav.sidebarHistory', () => onNavigate?.('history'))) return
      if (run('nav.sidebarBlocks', () => onNavigate?.('blocks'))) return
      run('nav.sidebarClose', () => onClearNavigation?.())
    },
    [
      isCommandPaletteOpen,
      isSettingsOpen,
      onClearNavigation,
      onNavigate,
      onOpenSettingsTab,
      onToggleCommandPalette,
      onToggleMonitor,
      onToggleQuickLaunch,
      onToggleSidebar,
      stopAgent,
    ],
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])
}
