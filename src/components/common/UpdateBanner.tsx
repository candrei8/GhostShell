import { useState, useEffect, useCallback } from 'react'
import { Download, RotateCcw, X, RefreshCw } from 'lucide-react'

type UpdateStatus =
  | { status: 'checking' }
  | { status: 'available'; version: string }
  | { status: 'not-available' }
  | { status: 'downloading'; progress: number }
  | { status: 'downloaded'; version: string }
  | { status: 'error'; error: string }

export function UpdateBanner() {
  const [update, setUpdate] = useState<UpdateStatus | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const cleanup = window.ghostshell.onUpdaterStatus((raw) => {
      const status = raw as UpdateStatus
      setUpdate(status)
      if (status.status === 'available' || status.status === 'downloaded') {
        setDismissed(false)
      }
    })
    return cleanup
  }, [])

  const handleDownload = useCallback(() => {
    window.ghostshell.updaterDownload()
  }, [])

  const handleInstall = useCallback(() => {
    window.ghostshell.updaterInstall()
  }, [])

  const handleRetry = useCallback(() => {
    window.ghostshell.updaterCheck()
  }, [])

  if (!update || dismissed) return null
  if (update.status === 'not-available' || update.status === 'checking') return null

  return (
    <div className="h-8 flex-shrink-0 flex items-center justify-between px-3 bg-ghost-accent text-white text-xs font-medium">
      <div className="flex items-center gap-2 min-w-0">
        {update.status === 'available' && (
          <>
            <span className="truncate">v{update.version} available</span>
            <button
              onClick={handleDownload}
              className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-white/20 hover:bg-white/30 transition-colors"
            >
              <Download size={12} />
              Download
            </button>
          </>
        )}

        {update.status === 'downloading' && (
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="flex-shrink-0">Downloading {update.progress}%</span>
            <div className="flex-1 max-w-[200px] h-1.5 bg-white/20 rounded-full overflow-hidden">
              <div
                className="h-full bg-white rounded-full transition-all duration-300"
                style={{ width: `${update.progress}%` }}
              />
            </div>
          </div>
        )}

        {update.status === 'downloaded' && (
          <>
            <span className="truncate">Update ready</span>
            <button
              onClick={handleInstall}
              className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-white/20 hover:bg-white/30 transition-colors"
            >
              <RotateCcw size={12} />
              Restart
            </button>
          </>
        )}

        {update.status === 'error' && (
          <>
            <span className="truncate" title={update.error}>
              Update failed{update.error ? `: ${update.error}` : ''}
            </span>
            <button
              onClick={handleRetry}
              className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-white/20 hover:bg-white/30 transition-colors"
            >
              <RefreshCw size={12} />
              Retry
            </button>
          </>
        )}
      </div>

      <button
        onClick={() => setDismissed(true)}
        className="flex-shrink-0 p-1 rounded-lg hover:bg-white/20 transition-colors ml-2"
      >
        <X size={14} />
      </button>
    </div>
  )
}
