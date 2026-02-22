import { create } from 'zustand'
import { useSettingsStore } from './settingsStore'

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

export const useNotificationStore = create<NotificationState>()((set, get) => ({
  notifications: [],

  addNotification: (type, title, message, duration = 4000) => {
    if (useSettingsStore.getState().muteNotifications) return

    // Title-based dedup: skip if same title exists within last 10 seconds
    const now = Date.now()
    const existing = get().notifications
    const duplicate = existing.find((n) => n.title === title && now - n.timestamp < 10000)
    if (duplicate) return

    const id = `notif-${now}-${Math.random().toString(36).slice(2, 6)}`
    const notification: Notification = { id, type, title, message, timestamp: now, duration }
    set((state) => ({
      notifications: [...state.notifications.slice(-2), notification],
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
