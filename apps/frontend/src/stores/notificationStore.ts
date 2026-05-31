import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type RealtimeNotificationType =
  | 'NEW_ORDER'
  | 'CALL_WAITER'
  | 'NEW_MESSAGE'
  | 'ITEM_READY'
  | 'PAYMENT_SUCCESS'
  | 'LOW_INVENTORY'
  | 'CART_UPDATED'
  | 'SYSTEM'

export interface NotificationEntry {
  id: string
  type: RealtimeNotificationType
  title: string
  message: string
  createdAt: string
  read: boolean
}

interface NotificationState {
  entries: NotificationEntry[]
  unreadCount: number
  push: (entry: Omit<NotificationEntry, 'id' | 'createdAt' | 'read'>) => void
  markAllRead: () => void
  setUnreadCount: (count: number) => void
}

const MAX_ENTRIES = 120

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set, get) => ({
      entries: [],
      unreadCount: 0,
      push: (entry) => {
        const nextEntry: NotificationEntry = {
          id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          type: entry.type,
          title: entry.title,
          message: entry.message,
          createdAt: new Date().toISOString(),
          read: false,
        }
        const nextEntries = [nextEntry, ...get().entries].slice(0, MAX_ENTRIES)
        set({ entries: nextEntries, unreadCount: nextEntries.filter((item) => !item.read).length })
      },
      markAllRead: () => {
        const nextEntries = get().entries.map((item) => ({ ...item, read: true }))
        set({ entries: nextEntries, unreadCount: 0 })
      },
      setUnreadCount: (count) => set({ unreadCount: Math.max(0, Number(count || 0)) }),
    }),
    {
      name: 'notification-center',
    },
  ),
)
