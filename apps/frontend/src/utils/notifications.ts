import toast from 'react-hot-toast'
import { useUiStore } from '@/stores/uiStore'

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

export function playNotificationTone() {
  if (!useUiStore.getState().soundEnabled) return

  try {
    const context = getAudioContext()
    if (!context) return

    const oscillator = context.createOscillator()
    const gainNode = context.createGain()

    oscillator.connect(gainNode)
    gainNode.connect(context.destination)

    oscillator.type = 'triangle'
    oscillator.frequency.setValueAtTime(740, context.currentTime)
    oscillator.frequency.linearRampToValueAtTime(988, context.currentTime + 0.12)

    gainNode.gain.setValueAtTime(0.0001, context.currentTime)
    gainNode.gain.exponentialRampToValueAtTime(0.05, context.currentTime + 0.02)
    gainNode.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.24)

    oscillator.start()
    oscillator.stop(context.currentTime + 0.24)
  } catch {
    // ignore unsupported audio API
  }
}

export async function showRealtimeNotification(title: string, message: string) {
  toast(`${title}: ${message}`)
  playNotificationTone()

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
