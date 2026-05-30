import { Bars3Icon, BellIcon, MoonIcon, SunIcon } from '@heroicons/react/24/outline'
import { useEffect, useMemo, useState } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { useI18n } from '@/utils/i18n'
import { useUiStore } from '@/stores/uiStore'
import { vaiTroNhanVien } from '@/utils/display'
import BranchScopeSelector from './BranchScopeSelector'
import { useBranchScopeStore } from '@/stores/branchScopeStore'
import { useNotificationStore } from '@/stores/notificationStore'

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
  const dark = useUiStore((state) => state.darkMode)
  const toggleDark = useUiStore((state) => state.toggleDarkMode)
  const { t } = useI18n()
  const avatarSrc = useMemo(() => user?.avatarUrl || user?.avatar || '', [user?.avatarUrl, user?.avatar])
  const [avatarBroken, setAvatarBroken] = useState(false)
  const markAllNotificationsRead = useNotificationStore((state) => state.markAllRead)

  useEffect(() => {
    setAvatarBroken(false)
  }, [avatarSrc])

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

        <button
          onClick={() => markAllNotificationsRead()}
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
