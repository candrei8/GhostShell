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

/**
 * Play a clean two-note chime for success notifications.
 * Uses two sine oscillators with harmonics for a rich, pleasant tone.
 */
function playSuccessChime(ctx: AudioContext, volume: number): void {
  const now = ctx.currentTime

  // Master gain
  const master = ctx.createGain()
  master.connect(ctx.destination)
  master.gain.setValueAtTime(0, now)
  master.gain.linearRampToValueAtTime(volume, now + 0.02)
  master.gain.setValueAtTime(volume, now + 0.35)
  master.gain.exponentialRampToValueAtTime(0.001, now + 0.55)

  // Note 1: C6 (1047 Hz) — bright, clear
  const osc1 = ctx.createOscillator()
  const gain1 = ctx.createGain()
  osc1.type = 'sine'
  osc1.frequency.setValueAtTime(1047, now)
  gain1.gain.setValueAtTime(0.7, now)
  gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.3)
  osc1.connect(gain1)
  gain1.connect(master)
  osc1.start(now)
  osc1.stop(now + 0.3)

  // Note 2: E6 (1319 Hz) — major third up, delayed slightly
  const osc2 = ctx.createOscillator()
  const gain2 = ctx.createGain()
  osc2.type = 'sine'
  osc2.frequency.setValueAtTime(1319, now + 0.1)
  gain2.gain.setValueAtTime(0, now)
  gain2.gain.setValueAtTime(0.6, now + 0.1)
  gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.5)
  osc2.connect(gain2)
  gain2.connect(master)
  osc2.start(now + 0.1)
  osc2.stop(now + 0.5)

  // Soft harmonic shimmer (octave of first note, very quiet)
  const osc3 = ctx.createOscillator()
  const gain3 = ctx.createGain()
  osc3.type = 'sine'
  osc3.frequency.setValueAtTime(2094, now)
  gain3.gain.setValueAtTime(0.15, now)
  gain3.gain.exponentialRampToValueAtTime(0.001, now + 0.25)
  osc3.connect(gain3)
  gain3.connect(master)
  osc3.start(now)
  osc3.stop(now + 0.25)
}

/**
 * Play a descending two-note tone for errors.
 */
function playErrorTone(ctx: AudioContext, volume: number): void {
  const now = ctx.currentTime

  const master = ctx.createGain()
  master.connect(ctx.destination)
  master.gain.setValueAtTime(volume, now)
  master.gain.exponentialRampToValueAtTime(0.001, now + 0.45)

  // Note 1: E5
  const osc1 = ctx.createOscillator()
  const gain1 = ctx.createGain()
  osc1.type = 'triangle'
  osc1.frequency.setValueAtTime(659, now)
  gain1.gain.setValueAtTime(0.8, now)
  gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.2)
  osc1.connect(gain1)
  gain1.connect(master)
  osc1.start(now)
  osc1.stop(now + 0.2)

  // Note 2: C5 — minor third down
  const osc2 = ctx.createOscillator()
  const gain2 = ctx.createGain()
  osc2.type = 'triangle'
  osc2.frequency.setValueAtTime(523, now + 0.12)
  gain2.gain.setValueAtTime(0, now)
  gain2.gain.setValueAtTime(0.7, now + 0.12)
  gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.4)
  osc2.connect(gain2)
  gain2.connect(master)
  osc2.start(now + 0.12)
  osc2.stop(now + 0.4)
}

/**
 * Play a single gentle ping for info notifications.
 */
function playInfoPing(ctx: AudioContext, volume: number): void {
  const now = ctx.currentTime

  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(880, now)
  osc.frequency.linearRampToValueAtTime(920, now + 0.06)
  gain.gain.setValueAtTime(volume * 0.5, now)
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(now)
  osc.stop(now + 0.15)
}

/**
 * Play a short buzz for warning notifications.
 */
function playWarningBuzz(ctx: AudioContext, volume: number): void {
  const now = ctx.currentTime

  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'triangle'
  osc.frequency.setValueAtTime(600, now)
  osc.frequency.linearRampToValueAtTime(560, now + 0.08)
  gain.gain.setValueAtTime(volume * 0.7, now)
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(now)
  osc.stop(now + 0.18)
}

export function playNotificationSound(type: SoundType = 'success'): void {
  const { muteNotifications, notificationVolume } = useSettingsStore.getState()
  if (muteNotifications || notificationVolume === 0) return

  const ctx = getContext()
  if (!ctx) return

  const volume = (notificationVolume / 100) * 0.35

  switch (type) {
    case 'success':
      playSuccessChime(ctx, volume)
      break
    case 'error':
      playErrorTone(ctx, volume)
      break
    case 'info':
      playInfoPing(ctx, volume)
      break
    case 'warning':
      playWarningBuzz(ctx, volume)
      break
  }
}
