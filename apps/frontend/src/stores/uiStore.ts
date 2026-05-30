import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type UiDensity = 'comfortable' | 'compact'
export type UiLanguage = 'vi' | 'en'

interface UiState {
  darkMode: boolean
  soundEnabled: boolean
  notificationMasterVolume: number
  notificationSoundPrefs: Record<string, boolean>
  desktopNotifications: boolean
  density: UiDensity
  language: UiLanguage
  setDarkMode: (enabled: boolean) => void
  toggleDarkMode: () => void
  setSoundEnabled: (enabled: boolean) => void
  setNotificationMasterVolume: (value: number) => void
  setNotificationSoundPreference: (type: string, enabled: boolean) => void
  setDesktopNotifications: (enabled: boolean) => void
  setDensity: (density: UiDensity) => void
  setLanguage: (language: UiLanguage) => void
}

export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      darkMode: false,
      soundEnabled: true,
      notificationMasterVolume: 0.8,
      notificationSoundPrefs: {
        NEW_ORDER: true,
        CALL_WAITER: true,
        NEW_MESSAGE: true,
        ITEM_READY: true,
        LOW_INVENTORY: true,
        PAYMENT_SUCCESS: true,
        CART_UPDATED: false,
        SYSTEM: true,
      },
      desktopNotifications: false,
      density: 'comfortable',
      language: 'vi',
      setDarkMode: (enabled) => set({ darkMode: enabled }),
      toggleDarkMode: () => set({ darkMode: !get().darkMode }),
      setSoundEnabled: (enabled) => set({ soundEnabled: enabled }),
      setNotificationMasterVolume: (value) => {
        const normalized = Math.max(0, Math.min(1, Number(value || 0)))
        set({ notificationMasterVolume: normalized })
      },
      setNotificationSoundPreference: (type, enabled) =>
        set((state) => ({
          notificationSoundPrefs: {
            ...state.notificationSoundPrefs,
            [String(type || '').toUpperCase()]: enabled,
          },
        })),
      setDesktopNotifications: (enabled) => set({ desktopNotifications: enabled }),
      setDensity: (density) => set({ density }),
      setLanguage: (language) => set({ language }),
    }),
    { name: 'ui-preferences' },
  ),
)
