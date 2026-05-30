import { Bars3Icon, BellIcon, MoonIcon, SunIcon } from '@heroicons/react/24/outline'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { useI18n } from '@/utils/i18n'
import { useUiStore } from '@/stores/uiStore'
import { vaiTroNhanVien } from '@/utils/display'
import BranchScopeSelector from './BranchScopeSelector'
import { useBranchScopeStore } from '@/stores/branchScopeStore'
import { useNotificationStore } from '@/stores/notificationStore'
import api from '@/utils/api'

type NotificationApiItem = {
  id: string
  type: string
  payload?: {
    title?: string
    message?: string
    [key: string]: any
  } | null
  isRead: boolean
  createdAt: string
}

interface HeaderProps {
  onToggleSidebar: () => void
  onToggleMobileSidebar?: () => void
  notificationsCount?: number
}

export default function Header({
  onToggleSidebar,
  onToggleMobileSidebar,
  notificationsCount = 0,
}: HeaderProps) {
  const { user, logout } = useAuthStore()
  const resetBranchScope = useBranchScopeStore((state) => state.resetBranchScope)
  const selectedBranchId = useBranchScopeStore((state) => state.selectedBranchId)
  const dark = useUiStore((state) => state.darkMode)
  const toggleDark = useUiStore((state) => state.toggleDarkMode)
  const { t } = useI18n()
  const avatarSrc = useMemo(() => user?.avatarUrl || user?.avatar || '', [user?.avatarUrl, user?.avatar])
  const [avatarBroken, setAvatarBroken] = useState(false)
  const markAllNotificationsRead = useNotificationStore((state) => state.markAllRead)
  const [notifOpen, setNotifOpen] = useState(false)
  const [notifLoading, setNotifLoading] = useState(false)
  const [notifItems, setNotifItems] = useState<NotificationApiItem[]>([])
  const [notifOnlyUnread, setNotifOnlyUnread] = useState(true)
  const [notifError, setNotifError] = useState('')
  const bellPanelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setAvatarBroken(false)
  }, [avatarSrc])

  const fetchNotifications = async (onlyUnread = notifOnlyUnread) => {
    const branchId = String(selectedBranchId || user?.branchId || '').trim()
    if (!branchId) {
      setNotifItems([])
      return
    }
    setNotifLoading(true)
    setNotifError('')
    try {
      const { data } = await api.get('/notifications', {
        params: {
          branchId,
          isRead: onlyUnread ? 'false' : undefined,
          page: 1,
          limit: 20,
        },
      })
      setNotifItems(Array.isArray(data?.data) ? data.data : [])
    } catch (error: any) {
      setNotifError(error?.response?.data?.message || 'Không tải được lịch sử thông báo')
    } finally {
      setNotifLoading(false)
    }
  }

  useEffect(() => {
    if (!notifOpen) return
    void fetchNotifications(notifOnlyUnread)
  }, [notifOpen, notifOnlyUnread, selectedBranchId, user?.branchId])

  useEffect(() => {
    if (!notifOpen) return
    const onOutsideClick = (event: MouseEvent) => {
      const root = bellPanelRef.current
      if (!root) return
      if (!root.contains(event.target as Node)) {
        setNotifOpen(false)
      }
    }
    const onEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setNotifOpen(false)
    }
    document.addEventListener('mousedown', onOutsideClick)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onOutsideClick)
      document.removeEventListener('keydown', onEsc)
    }
  }, [notifOpen])

  return (
    <header className="sticky top-0 z-20 flex min-h-16 items-center justify-between border-b border-amber-100/85 bg-white/88 px-3 backdrop-blur-md dark:border-slate-700 dark:bg-slate-900/88 sm:px-4">
      <div className="flex items-center gap-2">
        <button
          onClick={onToggleMobileSidebar || onToggleSidebar}
          className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-slate-500 hover:bg-amber-50 dark:text-slate-200 dark:hover:bg-slate-800 lg:hidden"
          aria-label={t('mobileMenu')}
        >
          <Bars3Icon className="h-5 w-5" />
        </button>
        <button
          onClick={onToggleSidebar}
          className="hidden h-11 w-11 items-center justify-center rounded-xl text-slate-500 hover:bg-amber-50 dark:text-slate-200 dark:hover:bg-slate-800 lg:inline-flex"
          aria-label="Thu gọn hoặc mở rộng thanh điều hướng"
        >
          <Bars3Icon className="h-5 w-5" />
        </button>
        <div className="hidden sm:block">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">{t('appName')}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">{vaiTroNhanVien(user?.role)}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <BranchScopeSelector />

        <div className="hidden items-center rounded-xl border border-amber-100 bg-amber-50/80 px-3 py-1 text-xs font-medium text-amber-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 sm:flex">
          Chuẩn giao diện: Tiếng Việt
        </div>

        <button
          onClick={toggleDark}
          className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-slate-500 hover:bg-amber-50 dark:text-slate-200 dark:hover:bg-slate-800"
          aria-label={t('darkMode')}
        >
          {dark ? <SunIcon className="h-5 w-5" /> : <MoonIcon className="h-5 w-5" />}
        </button>

        <div ref={bellPanelRef} className="relative">
          <button
            onClick={() => setNotifOpen((prev) => !prev)}
            className="relative inline-flex h-11 w-11 items-center justify-center rounded-xl text-slate-500 hover:bg-amber-50 dark:text-slate-200 dark:hover:bg-slate-800"
            aria-label="Thông báo"
          >
            <BellIcon className="h-5 w-5" />
            {notificationsCount > 0 && (
              <span className="absolute -right-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
                {notificationsCount > 9 ? '9+' : notificationsCount}
              </span>
            )}
          </button>
          {notifOpen && (
            <div className="absolute right-0 top-12 z-50 w-80 max-w-[90vw] rounded-xl border border-amber-100 bg-white p-3 shadow-xl">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900">Thông báo</p>
                <button
                  type="button"
                  className="rounded border border-amber-200 px-2 py-1 text-[11px] text-amber-700"
                  onClick={async () => {
                    const branchId = String(selectedBranchId || user?.branchId || '').trim()
                    if (!branchId) return
                    await api.patch('/notifications/read-all', null, { params: { branchId } })
                    setNotifItems((prev) => prev.map((item) => ({ ...item, isRead: true })))
                    markAllNotificationsRead()
                  }}
                >
                  Đánh dấu đã đọc
                </button>
              </div>
              <div className="mb-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setNotifOnlyUnread(true)}
                  className={`rounded px-2 py-1 text-xs ${notifOnlyUnread ? 'bg-amber-100 text-amber-800' : 'border border-amber-200 text-slate-600'}`}
                >
                  Chưa đọc
                </button>
                <button
                  type="button"
                  onClick={() => setNotifOnlyUnread(false)}
                  className={`rounded px-2 py-1 text-xs ${!notifOnlyUnread ? 'bg-amber-100 text-amber-800' : 'border border-amber-200 text-slate-600'}`}
                >
                  Tất cả
                </button>
              </div>
              <div className="max-h-80 space-y-2 overflow-y-auto">
                {notifLoading && <p className="text-xs text-slate-500">Đang tải...</p>}
                {!notifLoading && notifError && <p className="text-xs text-red-600">{notifError}</p>}
                {!notifLoading && !notifError && notifItems.length === 0 && (
                  <p className="text-xs text-slate-500">Không có thông báo</p>
                )}
                {!notifLoading &&
                  !notifError &&
                  notifItems.map((item) => (
                    <div key={item.id} className={`rounded-lg border p-2 text-xs ${item.isRead ? 'border-slate-100 bg-slate-50' : 'border-amber-200 bg-amber-50/50'}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-slate-800">{item.payload?.title || item.type}</p>
                          <p className="mt-0.5 text-slate-600">{item.payload?.message || '-'}</p>
                          <p className="mt-1 text-[10px] text-slate-500">{new Date(item.createdAt).toLocaleString('vi-VN')}</p>
                        </div>
                        {!item.isRead && (
                          <button
                            type="button"
                            className="shrink-0 rounded border border-amber-200 px-1.5 py-0.5 text-[10px] text-amber-700"
                            onClick={async () => {
                              await api.patch(`/notifications/${item.id}/read`)
                              setNotifItems((prev) => prev.map((entry) => (entry.id === item.id ? { ...entry, isRead: true } : entry)))
                            }}
                          >
                            Đã đọc
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 border-l border-amber-100 pl-2 dark:border-slate-700 sm:pl-3">
          {avatarSrc && !avatarBroken ? (
            <img
              src={avatarSrc}
              alt={user?.name || 'Avatar'}
              className="h-9 w-9 rounded-full border border-amber-100 object-cover"
              onError={() => setAvatarBroken(true)}
            />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-500 text-sm font-bold text-white">
              {user?.name?.charAt(0) || 'U'}
            </div>
          )}
          <div className="hidden sm:block">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-200">{user?.name || 'Người dùng'}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{vaiTroNhanVien(user?.role)}</p>
          </div>
          <button
            onClick={() => {
              resetBranchScope()
              logout()
            }}
            className="ml-2 text-xs text-gray-500 transition-colors hover:text-red-500"
          >
            {t('logout')}
          </button>
        </div>
      </div>
    </header>
  )
}
