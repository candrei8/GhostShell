import { create } from 'zustand'
import { useSettingsStore } from './settingsStore'
import { playNotificationSound } from '../lib/sounds'

export type NotificationType = 'success' | 'error' | 'info' | 'warning'
export type NotificationTier = 'full' | 'toast'

export interface Notification {
  id: string
  type: NotificationType
  title: string
  message?: string
  source?: string
  createdAt: number
  timestamp: number
  duration?: number
  expiresAt: number | null
  remainingMs: number | null
  persistent: boolean
  tier: NotificationTier
  dedupeKey: string
  count: number
}

export interface AddNotificationInput {
  type: NotificationType
  title: string
  message?: string
  source?: string
  duration?: number
  tier?: NotificationTier
  dedupeKey?: string
  dedupeWindowMs?: number
  persistent?: boolean
  allowWhileMuted?: boolean
}

interface NotificationState {
  notifications: Notification[]
  addNotification: (input: AddNotificationInput) => string | null
  removeNotification: (id: string) => void
  pauseNotification: (id: string) => void
  resumeNotification: (id: string) => void
  clearAll: () => void
}

const DEFAULT_DURATION_BY_TYPE: Record<NotificationType, number> = {
  success: 4200,
  info: 5000,
  warning: 6500,
  error: 8000,
}
const DEFAULT_DEDUPE_WINDOW_MS = 10000
const MAX_DEDUPE_CACHE_AGE_MS = 120000
const MAX_VISIBLE_NOTIFICATIONS = 5

const removalTimers = new Map<string, ReturnType<typeof setTimeout>>()
const dedupeLastSeenAt = new Map<string, number>()

function clearRemovalTimer(id: string): void {
  const timer = removalTimers.get(id)
  if (!timer) return
  clearTimeout(timer)
  removalTimers.delete(id)
}

function cleanupDedupeCache(now: number): void {
  for (const [key, timestamp] of dedupeLastSeenAt.entries()) {
    if (now - timestamp > MAX_DEDUPE_CACHE_AGE_MS) {
      dedupeLastSeenAt.delete(key)
    }
  }
}

function buildDefaultDedupeKey(input: AddNotificationInput, tier: NotificationTier): string {
  return `${input.type}:${input.title}:${input.message || ''}:${tier}`
}

function resolveDuration(input: AddNotificationInput, tier: NotificationTier): number {
  if (input.persistent) return 0
  if (typeof input.duration === 'number') return Math.max(0, input.duration)
  const baseDuration = DEFAULT_DURATION_BY_TYPE[input.type]
  return tier === 'full' ? baseDuration + 1000 : baseDuration
}

function isAutoDismissible(notification: Notification): boolean {
  return !notification.persistent && !!notification.duration && notification.duration > 0
}

function scheduleRemoval(
  id: string,
  delayMs: number,
  get: () => NotificationState,
): void {
  clearRemovalTimer(id)
  if (delayMs <= 0) return
  const timer = setTimeout(() => {
    get().removeNotification(id)
  }, delayMs)
  removalTimers.set(id, timer)
}

function trimVisibleNotifications(notifications: Notification[]): Notification[] {
  const next = [...notifications]
  while (next.length > MAX_VISIBLE_NOTIFICATIONS) {
    const dropIndex = next.findIndex((item) => !item.persistent)
    const [dropped] = next.splice(dropIndex >= 0 ? dropIndex : 0, 1)
    clearRemovalTimer(dropped.id)
  }
  return next
}

export const useNotificationStore = create<NotificationState>()((set, get) => ({
  notifications: [],

  addNotification: (input) => {
    const {
      type,
      title,
      message,
      source,
      tier = 'toast',
      dedupeWindowMs = DEFAULT_DEDUPE_WINDOW_MS,
      allowWhileMuted = false,
    } = input
    const duration = resolveDuration(input, tier)
    const persistent = Boolean(input.persistent) || duration === 0
    const dedupeKey = input.dedupeKey || buildDefaultDedupeKey(input, tier)

    if (useSettingsStore.getState().muteNotifications && !allowWhileMuted) return null

    const now = Date.now()
    cleanupDedupeCache(now)

    const lastSeen = dedupeLastSeenAt.get(dedupeKey)
    if (typeof lastSeen === 'number' && now - lastSeen < Math.max(0, dedupeWindowMs)) {
      let mergedId: string | null = null
      set((state) => {
        const existing = state.notifications.find((n) => n.dedupeKey === dedupeKey)
        if (!existing) return state
        mergedId = existing.id
        const updated: Notification = {
          ...existing,
          type,
          title,
          message: message ?? existing.message,
          source: source ?? existing.source,
          createdAt: existing.createdAt,
          timestamp: now,
          duration,
          expiresAt: persistent ? null : now + duration,
          remainingMs: persistent ? null : duration,
          persistent,
          tier,
          count: existing.count + 1,
        }
        return {
          notifications: [...state.notifications.filter((n) => n.id !== existing.id), updated],
        }
      })

      if (mergedId) {
        const latest = get().notifications.find((n) => n.id === mergedId)
        if (latest && isAutoDismissible(latest)) {
          scheduleRemoval(mergedId, latest.remainingMs || 0, get)
        } else {
          clearRemovalTimer(mergedId)
        }
        dedupeLastSeenAt.set(dedupeKey, now)
        return mergedId
      }
    }

    const id = `notif-${now}-${Math.random().toString(36).slice(2, 6)}`
    const notification: Notification = {
      id,
      type,
      title,
      message,
      source,
      createdAt: now,
      timestamp: now,
      duration,
      expiresAt: persistent ? null : now + duration,
      remainingMs: persistent ? null : duration,
      persistent,
      tier,
      dedupeKey,
      count: 1,
    }
    set((state) => {
      return {
        notifications: trimVisibleNotifications([...state.notifications, notification]),
      }
    })
    dedupeLastSeenAt.set(dedupeKey, now)

    // Always play sound on new notifications
    playNotificationSound(type)

    // Tier "full": show native OS notification + flash taskbar
    if (tier === 'full') {
      window.ghostshell?.showNotification(title, message)
    }

    if (isAutoDismissible(notification)) {
      scheduleRemoval(id, notification.remainingMs || 0, get)
    }

    return id
  },

  removeNotification: (id) => {
    clearRemovalTimer(id)
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    }))
  },

  pauseNotification: (id) => {
    const now = Date.now()
    let paused = false
    set((state) => ({
      notifications: state.notifications.map((notification) => {
        if (notification.id !== id || notification.expiresAt === null) {
          return notification
        }
        paused = true
        return {
          ...notification,
          expiresAt: null,
          remainingMs: Math.max(0, notification.expiresAt - now),
        }
      }),
    }))
    if (paused) {
      clearRemovalTimer(id)
    }
  },

  resumeNotification: (id) => {
    const now = Date.now()
    let remainingMs = 0
    set((state) => ({
      notifications: state.notifications.map((notification) => {
        if (notification.id !== id || notification.expiresAt !== null || notification.remainingMs === null) {
          return notification
        }
        remainingMs = Math.max(0, notification.remainingMs)
        return {
          ...notification,
          expiresAt: now + remainingMs,
        }
      }),
    }))

    if (remainingMs > 0) {
      scheduleRemoval(id, remainingMs, get)
    }
  },

  clearAll: () => {
    for (const timer of removalTimers.values()) {
      clearTimeout(timer)
    }
    removalTimers.clear()
    dedupeLastSeenAt.clear()
    set({ notifications: [] })
  },
}))
