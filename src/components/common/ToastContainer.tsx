import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react'
import { formatClockTime } from '../../lib/formatUtils'
import { useNotificationStore, Notification, NotificationType } from '../../stores/notificationStore'

const icons: Record<NotificationType, React.ReactNode> = {
  success: <CheckCircle className="w-4 h-4 text-green-300" />,
  error: <AlertCircle className="w-4 h-4 text-red-300" />,
  info: <Info className="w-4 h-4 text-sky-300" />,
  warning: <AlertTriangle className="w-4 h-4 text-amber-300" />,
}

const accentClasses: Record<NotificationType, string> = {
  success: 'border-l-green-400/90',
  error: 'border-l-red-400/90',
  info: 'border-l-sky-400/90',
  warning: 'border-l-amber-400/90',
}

const iconShellClasses: Record<NotificationType, string> = {
  success: 'bg-green-500/12 ring-1 ring-green-400/20',
  error: 'bg-red-500/12 ring-1 ring-red-400/20',
  info: 'bg-sky-500/12 ring-1 ring-sky-400/20',
  warning: 'bg-amber-500/12 ring-1 ring-amber-400/20',
}

const progressClasses: Record<NotificationType, string> = {
  success: 'bg-green-400',
  error: 'bg-red-400',
  info: 'bg-sky-400',
  warning: 'bg-amber-400',
}

function Toast({ notification }: { notification: Notification }) {
  const removeNotification = useNotificationStore((s) => s.removeNotification)
  const pauseNotification = useNotificationStore((s) => s.pauseNotification)
  const resumeNotification = useNotificationStore((s) => s.resumeNotification)
  const [remainingMs, setRemainingMs] = useState(notification.remainingMs || notification.duration || 0)

  useEffect(() => {
    if (notification.expiresAt === null) {
      setRemainingMs(notification.remainingMs || 0)
      return
    }

    let frameId = 0
    const tick = () => {
      const nextRemaining = Math.max(0, notification.expiresAt! - Date.now())
      setRemainingMs(nextRemaining)
      if (nextRemaining > 0) {
        frameId = requestAnimationFrame(tick)
      }
    }

    tick()
    return () => cancelAnimationFrame(frameId)
  }, [notification.expiresAt, notification.remainingMs, notification.timestamp])

  const hasCountdown = !notification.persistent && !!notification.duration && notification.duration > 0
  const progress = hasCountdown
    ? Math.max(0, Math.min(1, remainingMs / notification.duration!))
    : 0
  const sourceLabel = notification.source || (notification.tier === 'full' ? 'Background' : 'GhostShell')

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20, x: 18, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, x: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, x: 18, scale: 0.97 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      onMouseEnter={() => pauseNotification(notification.id)}
      onMouseLeave={() => resumeNotification(notification.id)}
      onFocusCapture={() => pauseNotification(notification.id)}
      onBlurCapture={() => resumeNotification(notification.id)}
      className={`ghost-floating-panel pointer-events-auto overflow-hidden rounded-2xl border border-l-[3px] ${accentClasses[notification.type]}`}
    >
      <div className="flex items-start gap-3 px-4 py-3.5">
        <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${iconShellClasses[notification.type]}`}>
          {icons[notification.type]}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-ghost-text-dim/75">
                <span>{sourceLabel}</span>
                {notification.tier === 'full' && (
                  <span className="ghost-soft-pill rounded-full px-2 py-0.5 text-[9px] text-ghost-text-dim">
                    OS
                  </span>
                )}
                {notification.persistent && (
                  <span className="ghost-soft-pill rounded-full px-2 py-0.5 text-[9px] text-ghost-text-dim">
                    Pinned
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm font-semibold leading-tight text-ghost-text">{notification.title}</p>
            </div>

            <button
              onClick={() => removeNotification(notification.id)}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-ghost-text-dim transition-colors hover:bg-white/5 hover:text-ghost-text"
              aria-label="Dismiss notification"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {notification.message && (
            <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-relaxed text-ghost-text-dim">
              {notification.message}
            </p>
          )}

          <div className="mt-3 flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-ghost-text-dim/70">
            <span>{formatClockTime(notification.timestamp)}</span>
              {notification.count > 1 && (
              <span className="ghost-soft-pill rounded-full px-2 py-0.5 text-[9px] text-ghost-text-dim">
                x{notification.count}
              </span>
            )}
          </div>
        </div>
      </div>

      {hasCountdown && (
        <div className="h-[3px] w-full bg-ghost-border/35">
          <div
            className={`h-full origin-left transition-[width] duration-75 ease-linear ${progressClasses[notification.type]}`}
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      )}
    </motion.div>
  )
}

export function ToastContainer() {
  const notifications = useNotificationStore((s) => s.notifications)
  const clearAll = useNotificationStore((s) => s.clearAll)

  if (notifications.length === 0) return null

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[9999] flex w-[min(24rem,calc(100vw-1.5rem))] flex-col gap-3">
      <AnimatePresence initial={false}>
        {notifications.map((notification) => (
          <Toast key={notification.id} notification={notification} />
        ))}
      </AnimatePresence>

      {notifications.length >= 2 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          className="pointer-events-auto flex justify-end"
        >
          <button
            onClick={clearAll}
            className="ghost-soft-pill rounded-xl px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] text-ghost-text-dim transition-colors hover:bg-white/5 hover:text-ghost-text"
          >
            Clear {notifications.length}
          </button>
        </motion.div>
      )}
    </div>
  )
}
