import { Bars3Icon, BellIcon, MoonIcon, SunIcon } from '@heroicons/react/24/outline'
import { useAuthStore } from '@/stores/authStore'
import { useI18n } from '@/utils/i18n'
import { useUiStore } from '@/stores/uiStore'
import { vaiTroNhanVien } from '@/utils/display'

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
  const dark = useUiStore((state) => state.darkMode)
  const toggleDark = useUiStore((state) => state.toggleDarkMode)
  const { t } = useI18n()

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-amber-100/80 bg-white/85 px-4 backdrop-blur dark:border-slate-700 dark:bg-slate-900/85">
      <div className="flex items-center gap-2">
        <button
          onClick={onToggleMobileSidebar || onToggleSidebar}
          className="rounded-xl p-2 text-gray-500 hover:bg-amber-50 dark:hover:bg-slate-800 lg:hidden"
          aria-label={t('mobileMenu')}
        >
          <Bars3Icon className="h-5 w-5" />
        </button>
        <button
          onClick={onToggleSidebar}
          className="hidden rounded-xl p-2 text-gray-500 hover:bg-amber-50 dark:hover:bg-slate-800 lg:inline-flex"
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
        <div className="hidden items-center rounded-xl border border-amber-100 bg-amber-50/70 px-3 py-1 text-xs font-medium text-amber-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 sm:flex">
          Chuẩn giao diện: Tiếng Việt
        </div>

        <button
          onClick={toggleDark}
          className="rounded-xl p-2 text-gray-500 hover:bg-amber-50 dark:hover:bg-slate-800"
          aria-label={t('darkMode')}
        >
          {dark ? <SunIcon className="h-5 w-5" /> : <MoonIcon className="h-5 w-5" />}
        </button>

        <button
          className="relative rounded-xl p-2 text-gray-500 hover:bg-amber-50 dark:hover:bg-slate-800"
          aria-label="Thông báo"
        >
          <BellIcon className="h-5 w-5" />
          {notificationsCount > 0 && (
            <span className="absolute -right-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
              {notificationsCount > 9 ? '9+' : notificationsCount}
            </span>
          )}
        </button>

        <div className="flex items-center gap-2 border-l border-amber-100 pl-3 dark:border-slate-700">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-500 text-sm font-bold text-white">
            {user?.name?.charAt(0) || 'U'}
          </div>
          <div className="hidden sm:block">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-200">{user?.name || 'Người dùng'}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{vaiTroNhanVien(user?.role)}</p>
          </div>
          <button
            onClick={logout}
            className="ml-2 text-xs text-gray-500 transition-colors hover:text-red-500"
          >
            {t('logout')}
          </button>
        </div>
      </div>
    </header>
  )
}
