import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { X, CheckCircle, AlertCircle, Info, AlertTriangle, Sparkles } from 'lucide-react'
import { formatClockTime } from '../../lib/formatUtils'
import { useNotificationStore, Notification, NotificationType } from '../../stores/notificationStore'

const icons: Record<NotificationType, React.ReactNode> = {
  success: <CheckCircle className="w-5 h-5 text-emerald-400" />,
  error: <AlertCircle className="w-5 h-5 text-red-400" />,
  info: <Info className="w-5 h-5 text-sky-400" />,
  warning: <AlertTriangle className="w-5 h-5 text-amber-400" />,
}

const iconBg: Record<NotificationType, string> = {
  success: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
  error: 'bg-red-500/10 border-red-500/20 text-red-400',
  info: 'bg-sky-500/10 border-sky-500/20 text-sky-400',
  warning: 'bg-amber-500/10 border-amber-500/20 text-amber-400',
}


function Toast({ notification }: { notification: Notification }) {
  const removeNotification = useNotificationStore((s) => s.removeNotification)
  const pauseNotification = useNotificationStore((s) => s.pauseNotification)
  const resumeNotification = useNotificationStore((s) => s.resumeNotification)

  const sourceLabel = notification.source || (notification.tier === 'full' ? 'Background' : 'GhostShell')
  const isSuccess = notification.type === 'success'

  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, x: 60, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
      transition={{ type: 'spring', damping: 25, stiffness: 350, mass: 0.8 }}
      className="pointer-events-auto w-full origin-right"
    >
      <div
        onMouseEnter={() => pauseNotification(notification.id)}
        onMouseLeave={() => resumeNotification(notification.id)}
        className="relative w-full rounded-2xl cursor-default"
      >
        {/* Background Glass */}
        <div
          className="absolute inset-0 rounded-2xl bg-white/[0.03] backdrop-blur-2xl border border-white/[0.08] shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
        />

        {/* Main Content */}
        <div className="relative p-5 w-full flex gap-4 pointer-events-none">
          {/* Icon Container */}
          <div className={`shrink-0 flex items-center justify-center w-10 h-10 rounded-xl border ${iconBg[notification.type]}`}>
             {icons[notification.type]}
          </div>

          <div className="flex-1 min-w-0 flex flex-col justify-center">
            <div className="flex items-start justify-between gap-3">
               <div className="flex items-center gap-2 min-w-0">
                 {isSuccess && <Sparkles className="w-3.5 h-3.5 text-emerald-400" />}
                 <h4 className="text-[13.5px] font-semibold tracking-wide text-white/95 truncate leading-none pt-0.5">
                   {notification.title}
                 </h4>
               </div>
            </div>

            {notification.message && (
              <p className="text-[12.5px] text-white/50 leading-relaxed font-medium mt-1.5 pr-6 break-words">
                {notification.message}
              </p>
            )}
            
            <div className="flex flex-wrap gap-2.5 items-center mt-3 text-[9px] uppercase tracking-[0.2em] font-bold text-white/30">
                <span>{formatClockTime(notification.timestamp)}</span>
                <span className="w-1 h-1 rounded-full bg-white/10" />
                <span>{sourceLabel}</span>
                
                {notification.tier === 'full' && (
                  <>
                    <span className="w-1 h-1 rounded-full bg-white/10" />
                    <span className="text-[#38bdf8]">OS</span>
                  </>
                )}
                {notification.persistent && (
                  <>
                    <span className="w-1 h-1 rounded-full bg-white/10" />
                    <span className="text-emerald-400">PINNED</span>
                  </>
                )}
                {notification.count > 1 && (
                  <>
                    <span className="w-1 h-1 rounded-full bg-white/10" />
                    <span className="text-white/80">{notification.count} REPEATS</span>
                  </>
                )}
            </div>
          </div>
        </div>

        {/* Close Button */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            removeNotification(notification.id)
          }}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-white/30 hover:text-white/70 pointer-events-auto"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </motion.div>
  )
}

export function ToastContainer() {
  const notifications = useNotificationStore((s) => s.notifications)
  const clearAll = useNotificationStore((s) => s.clearAll)

  if (notifications.length === 0) return null

  return createPortal(
    <div className="pointer-events-none fixed top-8 right-8 z-[99999] flex w-[min(26rem,calc(100vw-2rem))] flex-col gap-4">
      <AnimatePresence initial={false} mode="popLayout">
        {notifications.map((notification) => (
          <Toast key={notification.id} notification={notification} />
        ))}
      </AnimatePresence>

      <AnimatePresence>
        {notifications.length >= 2 && (
          <motion.div
            layout="position"
            initial={{ opacity: 0, scale: 0.9, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -10 }}
            className="pointer-events-auto flex justify-end mt-2"
          >
            <button
              onClick={clearAll}
              className="relative px-5 py-2.5 rounded-xl text-[10.5px] font-bold uppercase tracking-[0.2em] text-white/50 overflow-hidden"
            >
              <div className="absolute inset-0 bg-white/[0.03] backdrop-blur-2xl border border-white/10 rounded-xl" />
              <span className="relative z-10 flex items-center gap-2.5">
                <span>Clear All</span>
                <span className="bg-white/10 px-1.5 py-0.5 rounded-md text-[9px] text-white/80">{notifications.length}</span>
              </span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>,
    document.body
  )
}
