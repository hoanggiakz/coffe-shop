import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Suspense, lazy } from 'react'
import { useLocation } from 'react-router-dom'
import DashboardLayout from './components/layout/DashboardLayout'
import { RoutePageSkeleton } from './components/ui/PageSkeleton'
import { useI18n } from './utils/i18n'

const Login = lazy(() => import('./pages/auth/Login'))
const Register = lazy(() => import('./pages/auth/Register'))
const CustomerMenu = lazy(() => import('./pages/CustomerMenu'))
const PaymentReturn = lazy(() => import('./pages/PaymentReturn'))
const PublicInvoice = lazy(() => import('./pages/PublicInvoice'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Menu = lazy(() => import('./pages/Menu'))
const Tables = lazy(() => import('./pages/Tables'))
const Orders = lazy(() => import('./pages/Orders'))
const Payments = lazy(() => import('./pages/Payments'))
const Invoices = lazy(() => import('./pages/Invoices'))
const Inventory = lazy(() => import('./pages/Inventory'))
const Promotions = lazy(() => import('./pages/Promotions'))
const Reports = lazy(() => import('./pages/Reports'))
const Kitchen = lazy(() => import('./pages/Kitchen'))
const ChatPage = lazy(() => import('./pages/ChatPage'))
const Settings = lazy(() => import('./pages/Settings'))
const StaffManagement = lazy(() => import('./pages/StaffManagement'))
const Branches = lazy(() => import('./pages/Branches'))

function RouteFallback() {
  const location = useLocation()
  const { t } = useI18n()
  const path = location.pathname

  const kind =
    path.startsWith('/reports') ? 'reports'
    : path.startsWith('/chat') ? 'chat'
    : path.startsWith('/inventory') || path.startsWith('/promotions') || path.startsWith('/branches') || path.startsWith('/staff')
      ? 'form'
      : path.startsWith('/tables') || path.startsWith('/orders') || path.startsWith('/menu-management')
        ? 'table'
        : path === '/' || path.startsWith('/kitchen')
          ? 'dashboard'
          : 'default'

  return (
    <div className="space-y-4 smooth-page">
      <div className="rounded-2xl border border-amber-100 bg-white/90 px-5 py-3 text-sm font-medium text-slate-700 shadow-sm backdrop-blur">
        {t('loadingInterface')}
      </div>
      <RoutePageSkeleton kind={kind} />
    </div>
  )
}

function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/menu" element={<CustomerMenu />} />
          <Route path="/payment/return" element={<PaymentReturn />} />
          <Route path="/invoice/public/:id" element={<PublicInvoice />} />

          <Route element={<DashboardLayout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/menu-management" element={<Menu />} />
            <Route path="/tables" element={<Tables />} />
            <Route path="/orders" element={<Orders />} />
            <Route path="/payments" element={<Payments />} />
            <Route path="/invoices" element={<Invoices />} />
            <Route path="/inventory" element={<Inventory />} />
            <Route path="/promotions" element={<Promotions />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/kitchen" element={<Kitchen />} />
            <Route path="/chat" element={<ChatPage />} />
            <Route path="/staff" element={<StaffManagement />} />
            <Route path="/branches" element={<Branches />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}

export default App
