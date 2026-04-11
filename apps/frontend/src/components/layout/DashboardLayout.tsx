import { Outlet, Navigate, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useAuthStore } from '@/stores/authStore'
import Sidebar from './Sidebar'
import Header from './Header'
import { cn } from '@/utils/cn'
import { canAccessPath, getDefaultPathForRole, normalizeRole } from '@/utils/rbac'
import toast from 'react-hot-toast'

function AccessDeniedRedirect({ to, message }: { to: string; message: string }) {
  useEffect(() => {
    toast.error(message)
  }, [message])

  return <Navigate to={to} replace />
}

export default function DashboardLayout() {
  const { isAuthenticated, user } = useAuthStore()
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  const role = normalizeRole(user?.role)
  if (!role) {
    return <Navigate to="/login" replace />
  }

  if (!canAccessPath(location.pathname, role)) {
    const fallback = getDefaultPathForRole(role)
    if (fallback !== location.pathname) {
      return (
        <AccessDeniedRedirect
          to={fallback}
          message={`Tai khoan ${role} khong co quyen truy cap ${location.pathname}.`}
        />
      )
    }
    return <Navigate to="/login" replace />
  }

  const sidebarWidth = collapsed ? 'lg:ml-16' : 'lg:ml-72'

  return (
    <div className="min-h-screen bg-transparent">
      <Sidebar
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        onNavigate={() => setMobileOpen(false)}
      />

      {mobileOpen && (
        <button
          type="button"
          className="fixed inset-0 z-20 bg-slate-900/45 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-label="Đóng menu điều hướng trên di động"
        />
      )}

      <div className={cn('transition-all duration-300', sidebarWidth)}>
        <Header
          onToggleSidebar={() => setCollapsed((prev) => !prev)}
          onToggleMobileSidebar={() => setMobileOpen((prev) => !prev)}
        />
        <main className="safe-bottom px-3 py-3 sm:px-5 sm:py-5 lg:px-6 lg:py-6">
          <div className="smooth-page mx-auto w-full max-w-[1480px]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
