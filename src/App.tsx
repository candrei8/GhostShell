import { useEffect } from 'react'
import { AppLayout } from './components/layout/AppLayout'
import { ErrorBoundary } from './components/common/ErrorBoundary'
import { useSettingsStore } from './stores/settingsStore'

export default function App() {
  const initTheme = useSettingsStore((s) => s.initTheme)
  const fontSize = useSettingsStore((s) => s.fontSize)

  useEffect(() => {
    initTheme()
  }, [initTheme])

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
