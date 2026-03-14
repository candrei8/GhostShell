import { useEffect, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { AppLayout } from './components/layout/AppLayout'
import { LaunchScreen } from './components/layout/LaunchScreen'
import { ErrorBoundary } from './components/common/ErrorBoundary'
import { useSettingsStore } from './stores/settingsStore'
import { useModelStore } from './stores/modelStore'
import { buildSnapshot, saveTabSnapshot, clearTabSnapshot } from './lib/tabSnapshot'

export type LaunchMode = 'terminal' | 'swarm'

export default function App() {
  const initTheme = useSettingsStore((s) => s.initTheme)
  const fontSize = useSettingsStore((s) => s.fontSize)
  const [launchMode, setLaunchMode] = useState<LaunchMode | null>(null)

  useEffect(() => {
    initTheme()
  }, [initTheme])

  // Save tab snapshot on app close
  useEffect(() => {
    const api = window.ghostshell
    if (!api?.onBeforeClose) return

    const cleanup = api.onBeforeClose(async () => {
      const restoreTabs = useSettingsStore.getState().restoreTabs
      if (restoreTabs) {
        const snapshot = buildSnapshot()
        // Only save if there's something to restore
        if (snapshot.sessions.length > 0 || snapshot.agents.length > 0) {
          await saveTabSnapshot(snapshot)
        } else {
          await clearTabSnapshot()
        }
      } else {
        await clearTabSnapshot()
      }
      api.closeReady?.()
    })
    return cleanup
  }, [])

  // Start model auto-discovery (checks for new models every 30 min)
  useEffect(() => {
    try {
      useModelStore.getState().startAutoRefresh()
    } catch (error) {
      console.error('[GhostShell] Failed to start model auto-refresh:', error)
    }

    return () => {
      try {
        useModelStore.getState().stopAutoRefresh()
      } catch (error) {
        console.error('[GhostShell] Failed to stop model auto-refresh:', error)
      }
    }
  }, [])

  // Prevent Electron's default file-navigation on drag-and-drop.
  // Without this, dropping a file anywhere navigates the window to that file.
  // Terminal-level drop handlers in usePty.ts handle the actual file drop.
  useEffect(() => {
    const prevent = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
    }
    document.addEventListener('dragover', prevent)
    document.addEventListener('drop', prevent)
    return () => {
      document.removeEventListener('dragover', prevent)
      document.removeEventListener('drop', prevent)
    }
  }, [])

  // Apply UI font size globally
  useEffect(() => {
    document.documentElement.style.fontSize = `${fontSize}px`
  }, [fontSize])

  return (
    <ErrorBoundary>
      <AppLayout />
    </ErrorBoundary>
  )
}
