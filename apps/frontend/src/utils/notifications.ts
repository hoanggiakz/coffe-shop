import toast from 'react-hot-toast'
import { useUiStore } from '@/stores/uiStore'
import { RealtimeNotificationType, useNotificationStore } from '@/stores/notificationStore'

let audioContext: AudioContext | null = null

function getAudioContext() {
  if (typeof window === 'undefined') return null
  const AudioCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioCtor) return null
  if (!audioContext) {
    audioContext = new AudioCtor()
  }
  return audioContext
}

const toneProfile: Record<RealtimeNotificationType, { from: number; to: number; duration: number }> = {
  NEW_ORDER: { from: 740, to: 988, duration: 0.24 },
  CALL_WAITER: { from: 560, to: 820, duration: 0.3 },
  NEW_MESSAGE: { from: 680, to: 820, duration: 0.2 },
  ITEM_READY: { from: 900, to: 1120, duration: 0.2 },
  PAYMENT_SUCCESS: { from: 720, to: 900, duration: 0.2 },
  LOW_INVENTORY: { from: 440, to: 660, duration: 0.34 },
  CART_UPDATED: { from: 620, to: 740, duration: 0.18 },
  SYSTEM: { from: 700, to: 860, duration: 0.2 },
}

export async function playNotificationTone(type: RealtimeNotificationType = 'SYSTEM') {
  const uiState = useUiStore.getState()
  if (!uiState.soundEnabled) return
  if (uiState.notificationSoundPrefs[String(type || 'SYSTEM').toUpperCase()] === false) return

  try {
    const context = getAudioContext()
    if (!context) return
    if (context.state === 'suspended') {
      try {
        await context.resume()
      } catch {
        return
      }
    }

    const oscillator = context.createOscillator()
    const gainNode = context.createGain()

    oscillator.connect(gainNode)
    gainNode.connect(context.destination)

    const profile = toneProfile[type] || toneProfile.SYSTEM
    const volume = Math.max(0.05, Math.min(1, Number(uiState.notificationMasterVolume || 0.8)))

    oscillator.type = 'triangle'
    oscillator.frequency.setValueAtTime(profile.from, context.currentTime)
    oscillator.frequency.linearRampToValueAtTime(profile.to, context.currentTime + profile.duration / 2)

    gainNode.gain.setValueAtTime(0.0001, context.currentTime)
    gainNode.gain.exponentialRampToValueAtTime(0.05 * volume, context.currentTime + 0.02)
    gainNode.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + profile.duration)

    oscillator.start()
    oscillator.stop(context.currentTime + profile.duration)
  } catch {
    // ignore unsupported audio API
  }
}

export async function showRealtimeNotification(title: string, message: string, type: RealtimeNotificationType = 'SYSTEM') {
  useNotificationStore.getState().push({ title, message, type })
  toast(`${title}: ${message}`)
  void playNotificationTone(type)

  if (typeof window === 'undefined') return
  if (!useUiStore.getState().desktopNotifications) return
  if (!('Notification' in window)) return

  if (Notification.permission === 'granted') {
    new Notification(title, { body: message })
    return
  }

  if (Notification.permission === 'default') {
    const permission = await Notification.requestPermission()
    if (permission === 'granted') {
      new Notification(title, { body: message })
    }
  }
}
