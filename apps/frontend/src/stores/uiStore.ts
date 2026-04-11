import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type UiDensity = 'comfortable' | 'compact'
export type UiLanguage = 'vi' | 'en'

interface UiState {
  darkMode: boolean
  soundEnabled: boolean
  desktopNotifications: boolean
  density: UiDensity
  language: UiLanguage
  setDarkMode: (enabled: boolean) => void
  toggleDarkMode: () => void
  setSoundEnabled: (enabled: boolean) => void
  setDesktopNotifications: (enabled: boolean) => void
  setDensity: (density: UiDensity) => void
  setLanguage: (language: UiLanguage) => void
}

export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      darkMode: false,
      soundEnabled: true,
      desktopNotifications: false,
      density: 'comfortable',
      language: 'vi',
      setDarkMode: (enabled) => set({ darkMode: enabled }),
      toggleDarkMode: () => set({ darkMode: !get().darkMode }),
      setSoundEnabled: (enabled) => set({ soundEnabled: enabled }),
      setDesktopNotifications: (enabled) => set({ desktopNotifications: enabled }),
      setDensity: (density) => set({ density }),
      setLanguage: (language) => set({ language }),
    }),
    { name: 'ui-preferences' },
  ),
)
