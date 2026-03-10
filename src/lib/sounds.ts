import { useSettingsStore } from '../stores/settingsStore'

export type SoundType = 'success' | 'error' | 'warning' | 'info'

let audioCtx: AudioContext | null = null

function getContext(): AudioContext | null {
  if (!audioCtx) {
    try {
      audioCtx = new AudioContext()
    } catch {
      return null
    }
  }

  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {})
  }

  return audioCtx
}

export function playNotificationSound(type: SoundType = 'success'): void {
  const { muteNotifications, notificationVolume } = useSettingsStore.getState()
  if (muteNotifications || notificationVolume === 0) return

  const ctx = getContext()
  if (!ctx) return

  const gain = ctx.createGain()
  gain.connect(ctx.destination)

  const osc = ctx.createOscillator()
  osc.connect(gain)

  const now = ctx.currentTime
  const volume = (notificationVolume / 100) * 0.3

  switch (type) {
    case 'success':
      osc.type = 'sine'
      osc.frequency.setValueAtTime(620, now)
      osc.frequency.linearRampToValueAtTime(920, now + 0.08)
      gain.gain.setValueAtTime(volume, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12)
      osc.start(now)
      osc.stop(now + 0.12)
      break
    case 'info':
      osc.type = 'sine'
      osc.frequency.setValueAtTime(720, now)
      osc.frequency.linearRampToValueAtTime(820, now + 0.06)
      gain.gain.setValueAtTime(volume * 0.65, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11)
      osc.start(now)
      osc.stop(now + 0.11)
      break
    case 'warning':
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(540, now)
      gain.gain.setValueAtTime(volume * 0.85, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15)
      osc.start(now)
      osc.stop(now + 0.15)
      break
    case 'error':
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(500, now)
      osc.frequency.linearRampToValueAtTime(340, now + 0.12)
      gain.gain.setValueAtTime(volume, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18)
      osc.start(now)
      osc.stop(now + 0.18)
      break
  }
}
