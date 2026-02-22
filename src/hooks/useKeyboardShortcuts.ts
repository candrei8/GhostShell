import { useEffect, useCallback } from 'react'
import { useTerminalStore } from '../stores/terminalStore'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { useAgent } from './useAgent'

interface KeyboardShortcutsOptions {
  onToggleCommandPalette: () => void
  onNavigate?: (view: string) => void
  onToggleQuickLaunch?: () => void
  onToggleMonitor?: () => void
}

export function useKeyboardShortcuts({ onToggleCommandPalette, onNavigate, onToggleQuickLaunch, onToggleMonitor }: KeyboardShortcutsOptions) {
  const { stopAgent } = useAgent()

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey
      const shift = e.shiftKey
      const alt = e.altKey

      // Command Palette: Ctrl+Shift+P
      if (ctrl && shift && e.key === 'P') {
        e.preventDefault()
        onToggleCommandPalette()
        return
      }

      // New terminal: Ctrl+T or Ctrl+Shift+T
      if (ctrl && !alt && e.key.toLowerCase() === 't') {
        e.preventDefault()
        const currentPath = useWorkspaceStore.getState().currentPath
        useTerminalStore.getState().addSession({
          id: `term-standalone-${Date.now()}`,
          title: 'Terminal',
          cwd: currentPath,
        })
        return
      }

      // Split / Duplicate tab: Ctrl+Shift+D
      if (ctrl && shift && e.key === 'D') {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('ghostshell:split-request'))
        return
      }

      // Close tab: Ctrl+Shift+W
      if (ctrl && shift && e.key === 'W') {
        e.preventDefault()
        const state = useTerminalStore.getState()
        if (state.activeSessionId && state.sessions.length > 0) {
          const session = state.sessions.find((s) => s.id === state.activeSessionId)
          if (session?.agentId) {
            stopAgent(session.agentId)
          } else if (state.activeSessionId) {
            state.removeSession(state.activeSessionId)
          }
        }
        return
      }

      // Toggle maximize: Ctrl+Shift+Enter
      if (ctrl && shift && e.key === 'Enter') {
        e.preventDefault()
        const { activeSessionId, toggleMaximize } = useTerminalStore.getState()
        if (activeSessionId) toggleMaximize(activeSessionId)
        return
      }

      // Sync inputs: Ctrl+Alt+I
      if (ctrl && alt && e.key.toLowerCase() === 'i') {
        e.preventDefault()
        const { syncInputsMode, setSyncInputs } = useTerminalStore.getState()
        setSyncInputs(syncInputsMode === 'off' ? 'all' : 'off')
        return
      }

      // Navigate panes: Ctrl+Alt+Arrow
      if (ctrl && alt && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault()
        const { sessions, activeSessionId, setActiveSession } = useTerminalStore.getState()
        if (sessions.length < 2 || !activeSessionId) return

        const currentIndex = sessions.findIndex((s) => s.id === activeSessionId)
        let nextIndex = currentIndex

        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          nextIndex = (currentIndex + 1) % sessions.length
        } else {
          nextIndex = (currentIndex - 1 + sessions.length) % sessions.length
        }

        setActiveSession(sessions[nextIndex].id)
        return
      }

      // Switch to tab 1-9: Ctrl+1 through Ctrl+9
      // If index exceeds tab count, clamp to last tab (e.g. Ctrl+5 with 4 tabs → goes to tab 4)
      if (ctrl && !shift && !alt && e.key >= '1' && e.key <= '9') {
        e.preventDefault()
        const { sessions, setActiveSession } = useTerminalStore.getState()
        if (sessions.length === 0) return
        const index = parseInt(e.key) - 1
        if (index >= sessions.length) {
          setActiveSession(sessions[sessions.length - 1].id)
        } else {
          setActiveSession(sessions[index].id)
        }
        return
      }

      // Previous/Next tab: Ctrl+PgUp/PgDn
      if (ctrl && !shift && (e.key === 'PageUp' || e.key === 'PageDown')) {
        e.preventDefault()
        const { sessions, activeSessionId, setActiveSession } = useTerminalStore.getState()
        if (sessions.length < 2 || !activeSessionId) return
        const currentIndex = sessions.findIndex((s) => s.id === activeSessionId)
        const nextIndex = e.key === 'PageDown'
          ? (currentIndex + 1) % sessions.length
          : (currentIndex - 1 + sessions.length) % sessions.length
        setActiveSession(sessions[nextIndex].id)
        return
      }

      // Settings: Ctrl+,
      if (ctrl && e.key === ',') {
        e.preventDefault()
        onNavigate?.('settings')
        return
      }

      // History: Ctrl+H (when not in terminal focus)
      if (ctrl && shift && e.key === 'H') {
        e.preventDefault()
        onNavigate?.('history')
        return
      }

      // Sub-Agent Monitor: Ctrl+Shift+M
      if (ctrl && shift && e.key === 'M') {
        e.preventDefault()
        onToggleMonitor?.()
        return
      }
    },
    [onToggleCommandPalette, onNavigate, onToggleMonitor, stopAgent],
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])
}
