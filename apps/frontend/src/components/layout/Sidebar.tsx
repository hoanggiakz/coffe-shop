import { NavLink } from 'react-router-dom'
import { cn } from '@/utils/cn'
import { useAuthStore } from '@/stores/authStore'
import { getAllowedRolesForPath, normalizeRole, type StaffRole } from '@/utils/rbac'
import { useI18n } from '@/utils/i18n'
import {
  HomeIcon,
  ClipboardDocumentListIcon,
  TableCellsIcon,
  ShoppingCartIcon,
  CreditCardIcon,
  ArchiveBoxIcon,
  TicketIcon,
  ChartBarIcon,
  FireIcon,
  ChatBubbleLeftRightIcon,
  Cog6ToothIcon,
  UserGroupIcon,
  BuildingStorefrontIcon,
} from '@heroicons/react/24/outline'

type NavLabelKey =
  | 'dashboard'
  | 'menuManagement'
  | 'tables'
  | 'orders'
  | 'payments'
  | 'inventory'
  | 'promotions'
  | 'reports'
  | 'staff'
  | 'branches'
  | 'kitchen'
  | 'chat'

const navigation = [
  { key: 'dashboard', href: '/', icon: HomeIcon, roles: getAllowedRolesForPath('/') },
  { key: 'menuManagement', href: '/menu-management', icon: ClipboardDocumentListIcon, roles: getAllowedRolesForPath('/menu-management') },
  { key: 'tables', href: '/tables', icon: TableCellsIcon, roles: getAllowedRolesForPath('/tables') },
  { key: 'orders', href: '/orders', icon: ShoppingCartIcon, roles: getAllowedRolesForPath('/orders') },
  { key: 'payments', href: '/payments', icon: CreditCardIcon, roles: getAllowedRolesForPath('/payments') },
  { key: 'inventory', href: '/inventory', icon: ArchiveBoxIcon, roles: getAllowedRolesForPath('/inventory') },
  { key: 'promotions', href: '/promotions', icon: TicketIcon, roles: getAllowedRolesForPath('/promotions') },
  { key: 'reports', href: '/reports', icon: ChartBarIcon, roles: getAllowedRolesForPath('/reports') },
  { key: 'staff', href: '/staff', icon: UserGroupIcon, roles: getAllowedRolesForPath('/staff') },
  { key: 'branches', href: '/branches', icon: BuildingStorefrontIcon, roles: getAllowedRolesForPath('/branches') },
  { key: 'kitchen', href: '/kitchen', icon: FireIcon, roles: getAllowedRolesForPath('/kitchen') },
  { key: 'chat', href: '/chat', icon: ChatBubbleLeftRightIcon, roles: getAllowedRolesForPath('/chat') },
]

interface SidebarProps {
  collapsed: boolean
  mobileOpen?: boolean
  onNavigate?: () => void
}

export default function Sidebar({ collapsed, mobileOpen = false, onNavigate }: SidebarProps) {
  const role = normalizeRole(useAuthStore((state) => state.user?.role))
  const { t } = useI18n()
  const visibleNavigation = navigation.filter((item) => hasAccess(item.roles, role))
  const canViewSettings = hasAccess(getAllowedRolesForPath('/settings'), role)

  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-30 flex w-[min(18rem,86vw)] flex-col border-r border-amber-100/80 bg-white/95 shadow-xl backdrop-blur transition-all duration-300 dark:border-slate-700 dark:bg-slate-900/95 lg:w-72',
        collapsed && 'lg:w-16',
        mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
      )}
    >
      {/* Logo */}
      <div className="flex h-16 items-center justify-center border-b border-amber-100/80 px-4 dark:border-slate-700">
        {collapsed ? (
          <span className="text-2xl">☕</span>
        ) : (
          <div className="text-center">
            <h1 className="text-xl font-bold text-primary-600">{t('appName')}</h1>
            <p className="text-xs uppercase tracking-[0.2em] text-amber-700/80 dark:text-amber-300/80">Trung tâm vận hành</p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-4">
        <ul className="space-y-1">
          {visibleNavigation.map((item) => (
            <li key={item.href}>
              <NavLink
                to={item.href}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn(
                    'flex min-h-11 items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-amber-100 text-amber-800 shadow-sm dark:bg-amber-500/15 dark:text-amber-200'
                      : 'text-slate-600 hover:bg-amber-50 dark:text-slate-300 dark:hover:bg-slate-800',
                    collapsed && 'justify-center px-2',
                  )
                }
              >
                <item.icon className="h-5 w-5 flex-shrink-0" />
                {!collapsed && <span>{t(item.key as NavLabelKey)}</span>}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* Settings */}
      {canViewSettings && (
        <div className="border-t border-amber-100/80 p-2 dark:border-slate-700">
          <NavLink
            to="/settings"
            onClick={onNavigate}
            className={cn(
              'flex min-h-11 items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-slate-600 transition-colors hover:bg-amber-50 dark:text-slate-300 dark:hover:bg-slate-800',
              collapsed && 'justify-center px-2',
            )}
          >
            <Cog6ToothIcon className="h-5 w-5 flex-shrink-0" />
            {!collapsed && <span>{t('settings')}</span>}
          </NavLink>
        </div>
      )}
    </aside>
  )
}

function hasAccess(allowedRoles: readonly StaffRole[], role: StaffRole | null): boolean {
  if (!role) {
    return false
  }
  return allowedRoles.includes(role)
}
