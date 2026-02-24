import { useSettingsStore } from '../stores/settingsStore'

type SoundType = 'success' | 'error' | 'warning'

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
  const volume = (notificationVolume / 100) * 0.3 // Max 0.3 to stay pleasant

  const osc = ctx.createOscillator()
  osc.connect(gain)

  const now = ctx.currentTime

  switch (type) {
    case 'success': {
      // Rising sine 600→900Hz, 80ms — pleasant pop
      osc.type = 'sine'
      osc.frequency.setValueAtTime(600, now)
      osc.frequency.linearRampToValueAtTime(900, now + 0.08)
      gain.gain.setValueAtTime(volume, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12)
      osc.start(now)
      osc.stop(now + 0.12)
      break
    }
    case 'error': {
      // Descending triangle 500→350Hz, 120ms — attention
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(500, now)
      osc.frequency.linearRampToValueAtTime(350, now + 0.12)
      gain.gain.setValueAtTime(volume, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18)
      osc.start(now)
      osc.stop(now + 0.18)
      break
    }
    case 'warning': {
      // Flat sine 550Hz, 100ms — neutral alert
      osc.type = 'sine'
      osc.frequency.setValueAtTime(550, now)
      gain.gain.setValueAtTime(volume * 0.8, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15)
      osc.start(now)
      osc.stop(now + 0.15)
      break
    }
  }
}
