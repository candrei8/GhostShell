import { create } from 'zustand'

export type NotificationType = 'success' | 'error' | 'info' | 'warning'

export interface Notification {
  id: string
  type: NotificationType
  title: string
  message?: string
  timestamp: number
  duration?: number
}

interface NotificationState {
  notifications: Notification[]
  addNotification: (type: NotificationType, title: string, message?: string, duration?: number) => void
  removeNotification: (id: string) => void
  clearAll: () => void
}

export const useNotificationStore = create<NotificationState>()((set) => ({
  notifications: [],

  addNotification: (type, title, message, duration = 4000) => {
    const id = `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const notification: Notification = { id, type, title, message, timestamp: Date.now(), duration }
    set((state) => ({
      notifications: [...state.notifications.slice(-9), notification],
    }))

    // Native OS notification
    window.ghostshell?.showNotification(title, message)

    if (duration > 0) {
      setTimeout(() => {
        set((state) => ({
          notifications: state.notifications.filter((n) => n.id !== id),
        }))
      }, duration)
    }
  },

  removeNotification: (id) => {
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    }))
  },

  clearAll: () => set({ notifications: [] }),
}))
