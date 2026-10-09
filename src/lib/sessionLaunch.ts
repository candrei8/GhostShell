import { useTerminalStore } from '../stores/terminalStore'
import { useWorkspaceStore } from '../stores/workspaceStore'

/**
 * Open a new pane on the agent setup screen (QuickLaunch). This is the single
 * entry point for "new session": the dock's +, the empty state and app start.
 */
export function openQuickLaunchSession(): void {
  const cwd = useWorkspaceStore.getState().currentPath
  useTerminalStore.getState().addSession({
    id: `term-quicklaunch-${Date.now()}`,
    title: 'New Session',
    cwd,
    showQuickLaunch: true,
    sessionType: 'ghostcode',
  })
}
