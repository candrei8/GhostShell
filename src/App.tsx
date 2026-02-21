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
