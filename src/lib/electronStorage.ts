import { StateStorage } from 'zustand/middleware'

/**
 * Custom storage adapter for Zustand persist middleware
 * Uses Electron IPC to save data to filesystem instead of localStorage
 * This ensures data persists reliably in packaged apps
 */
export const electronStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    try {
      if (typeof window !== 'undefined' && window.ghostshell?.storageGet) {
        const value = await window.ghostshell.storageGet(name)
        return value ? JSON.stringify(value) : null
      }
      if (typeof localStorage !== 'undefined') {
        return localStorage.getItem(name)
      }
      return null
    } catch (error) {
      console.error(`Error getting item from storage: ${name}`, error)
      return null
    }
  },

  setItem: async (name: string, value: string): Promise<void> => {
    try {
      if (typeof window !== 'undefined' && window.ghostshell?.storageSet) {
        const parsed = JSON.parse(value)
        await window.ghostshell.storageSet(name, parsed)
        return
      }
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(name, value)
      }
    } catch (error) {
      console.error(`Error setting item in storage: ${name}`, error)
    }
  },

  removeItem: async (name: string): Promise<void> => {
    try {
      if (typeof window !== 'undefined' && window.ghostshell?.storageRemove) {
        await window.ghostshell.storageRemove(name)
        return
      }
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(name)
      }
    } catch (error) {
      console.error(`Error removing item from storage: ${name}`, error)
    }
  },
}
