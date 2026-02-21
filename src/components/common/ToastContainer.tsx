import { useEffect, useState } from 'react'
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react'
import { useNotificationStore, Notification, NotificationType } from '../../stores/notificationStore'

const icons: Record<NotificationType, React.ReactNode> = {
  success: <CheckCircle className="w-4 h-4 text-green-400" />,
  error: <AlertCircle className="w-4 h-4 text-red-400" />,
  info: <Info className="w-4 h-4 text-blue-400" />,
  warning: <AlertTriangle className="w-4 h-4 text-yellow-400" />,
}

const borderColors: Record<NotificationType, string> = {
  success: 'border-l-green-400',
  error: 'border-l-red-400',
  info: 'border-l-blue-400',
  warning: 'border-l-yellow-400',
}

function Toast({ notification }: { notification: Notification }) {
  const remove = useNotificationStore((s) => s.removeNotification)
  const [isExiting, setIsExiting] = useState(false)

  useEffect(() => {
    if (notification.duration && notification.duration > 0) {
      const fadeTimer = setTimeout(() => setIsExiting(true), notification.duration - 300)
      return () => clearTimeout(fadeTimer)
    }
  }, [notification.duration])

  return (
    <div
      className={`flex items-start gap-3 px-3 py-3 bg-ghost-surface border border-ghost-border ${borderColors[notification.type]} border-l-2 rounded-lg shadow-lg max-w-xs transition-all duration-300 animate-fade-in ${
        isExiting ? 'opacity-0 translate-x-4' : 'opacity-100 translate-x-0'
      }`}
    >
      <div className="shrink-0 mt-0.5">{icons[notification.type]}</div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-ghost-text">{notification.title}</p>
        {notification.message && (
          <p className="text-2xs text-ghost-text-dim mt-0.5 truncate">{notification.message}</p>
        )}
      </div>
      <button
        onClick={() => remove(notification.id)}
        className="shrink-0 w-4 h-4 flex items-center justify-center rounded hover:bg-white/10 text-ghost-text-dim"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  )
}

export function ToastContainer() {
  const notifications = useNotificationStore((s) => s.notifications)

  if (notifications.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-3">
      {notifications.map((n) => (
        <Toast key={n.id} notification={n} />
      ))}
    </div>
  )
}
