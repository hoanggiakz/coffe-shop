import type { User } from '@/types'

export const STAFF_ROLES = ['ADMIN', 'MANAGER', 'WAITER', 'BARISTA', 'STAFF'] as const
export type StaffRole = (typeof STAFF_ROLES)[number]

const STAFF_ROLE_SET = new Set<string>(STAFF_ROLES)
const NO_ROLES: readonly StaffRole[] = []

const routeAccessMap: Record<string, readonly StaffRole[]> = {
  '/': STAFF_ROLES,
  '/menu-management': ['ADMIN', 'MANAGER'],
  '/tables': ['ADMIN', 'MANAGER', 'WAITER', 'STAFF'],
  '/orders': ['ADMIN', 'MANAGER', 'WAITER', 'STAFF'],
  '/payments': ['ADMIN', 'MANAGER', 'WAITER', 'STAFF'],
  '/inventory': ['ADMIN', 'MANAGER'],
  '/promotions': ['ADMIN', 'MANAGER'],
  '/reports': ['ADMIN', 'MANAGER'],
  '/staff': STAFF_ROLES,
  '/branches': ['ADMIN'],
  '/kitchen': ['ADMIN', 'MANAGER', 'BARISTA'],
  '/chat': STAFF_ROLES,
  '/settings': STAFF_ROLES,
}

const defaultPathMap: Record<StaffRole, string> = {
  ADMIN: '/',
  MANAGER: '/',
  WAITER: '/orders',
  BARISTA: '/kitchen',
  STAFF: '/orders',
}

export function normalizeRole(role?: User['role'] | string | null): StaffRole | null {
  if (!role) return null
  const normalized = String(role).toUpperCase()

  // Legacy alias
  if (normalized === 'CHEF') return 'BARISTA'

  if (!STAFF_ROLE_SET.has(normalized)) {
    return null
  }

  return normalized as StaffRole
}

export function canAccessPath(pathname: string, role?: User['role'] | string | null): boolean {
  const normalizedRole = normalizeRole(role)
  if (!normalizedRole) return false

  const allowed = routeAccessMap[pathname]
  if (!allowed) return false
  return allowed.includes(normalizedRole)
}

export function getDefaultPathForRole(role?: User['role'] | string | null): string {
  const normalizedRole = normalizeRole(role)
  if (!normalizedRole) return '/login'
  return defaultPathMap[normalizedRole]
}

export function getAllowedRolesForPath(pathname: string): readonly StaffRole[] {
  return routeAccessMap[pathname] || NO_ROLES
}
