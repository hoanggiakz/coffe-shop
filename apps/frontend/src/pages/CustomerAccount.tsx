import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import api from '@/utils/api'

type CustomerSession = {
  id: string
  email: string
  name: string
  role: string
  phone?: string | null
  loyaltyPoints: number
  memberTier: string
  totalSpent: number
}

type CustomerProfile = {
  id: string
  name: string
  email: string
  phone?: string | null
  avatarUrl?: string | null
  dateOfBirth?: string | null
  loyaltyPoints: number
  totalSpent: number
  membershipTier: string
  nextTier?: string | null
  amountToNextTier?: number | null
}

type OrderItem = {
  id: string
  menuItemName?: string
  quantity: number
}

type CustomerOrder = {
  id: string
  status: string
  totalAmount: number
  createdAt: string
  orderItems: OrderItem[]
}

type LoyaltyTx = {
  id: string
  type: string
  points: number
  balanceAfter: number
  description?: string | null
  createdAt: string
}

const authStorageKey = 'customer-auth-session'
const menuReturnUrlStorageKey = 'customer-menu-return-url'

const formatVnd = (value: number) => `${Number(value || 0).toLocaleString('vi-VN')}đ`

export default function CustomerAccount() {
  const [token, setToken] = useState('')
  const [session, setSession] = useState<CustomerSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<CustomerProfile | null>(null)
  const [orders, setOrders] = useState<CustomerOrder[]>([])
  const [txs, setTxs] = useState<LoyaltyTx[]>([])
  const [saving, setSaving] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)
  const [redeeming, setRedeeming] = useState(false)

  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    dateOfBirth: '',
    avatarUrl: '',
    verifyOtp: '',
    verifyPurpose: 'PROFILE_UPDATE',
  })
  const [passwordForm, setPasswordForm] = useState({
    oldPassword: '',
    newPassword: '',
  })
  const [redeemPoints, setRedeemPoints] = useState('100')
  const menuReturnUrl = useMemo(() => {
    try {
      const raw = String(localStorage.getItem(menuReturnUrlStorageKey) || '').trim()
      if (raw.startsWith('/menu')) return raw
    } catch {
      // ignore
    }
    return '/menu'
  }, [])
  const menuReturnQuery = useMemo(() => {
    const idx = menuReturnUrl.indexOf('?')
    return idx >= 0 ? menuReturnUrl.slice(idx) : ''
  }, [menuReturnUrl])

  useEffect(() => {
    try {
      const raw = localStorage.getItem(authStorageKey)
      if (!raw) return
      const parsed = JSON.parse(raw)
      const localToken = String(parsed?.token || '')
      const user = parsed?.user as CustomerSession | undefined
      if (!localToken || !user?.id || String(user.role || '').toUpperCase() !== 'CUSTOMER') return
      setToken(localToken)
      setSession(user)
    } finally {
      setLoading(false)
    }
  }, [])

  const authHeader = useMemo(() => (token ? { Authorization: `Bearer ${token}` } : undefined), [token])

  const loadAll = async () => {
    if (!token || !authHeader) return
    try {
      const [profileRes, ordersRes, txRes] = await Promise.all([
        api.get<CustomerProfile>('/customer/profile', { headers: authHeader }),
        api.get<{ data: CustomerOrder[] }>('/customer/orders', { headers: authHeader, params: { page: 1, limit: 10 } }),
        api.get<{ data: LoyaltyTx[] }>('/customer/loyalty/transactions', { headers: authHeader, params: { page: 1, limit: 10 } }),
      ])

      const p = profileRes.data
      setProfile(p)
      setOrders(Array.isArray(ordersRes.data?.data) ? ordersRes.data.data : [])
      setTxs(Array.isArray(txRes.data?.data) ? txRes.data.data : [])
      setForm({
        name: p.name || '',
        email: p.email || '',
        phone: p.phone || '',
        dateOfBirth: p.dateOfBirth || '',
        avatarUrl: p.avatarUrl || '',
        verifyOtp: '',
        verifyPurpose: 'PROFILE_UPDATE',
      })
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Không tải được dữ liệu tài khoản')
    }
  }

  useEffect(() => {
    void loadAll()
  }, [token])

  const onSaveProfile = async (e: FormEvent) => {
    e.preventDefault()
    if (!token || !authHeader) return
    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
        dateOfBirth: form.dateOfBirth.trim() || undefined,
        avatarUrl: form.avatarUrl.trim() || undefined,
        verifyOtp: form.verifyOtp.trim() || undefined,
        verifyPurpose: form.verifyPurpose,
      }
      await api.put('/customer/profile', payload, { headers: authHeader })
      toast.success('Đã cập nhật hồ sơ')
      await loadAll()
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Không cập nhật được hồ sơ')
    } finally {
      setSaving(false)
    }
  }

  const onChangePassword = async (e: FormEvent) => {
    e.preventDefault()
    if (!token || !authHeader) return
    setChangingPassword(true)
    try {
      await api.post('/customer/change-password', {
        oldPassword: passwordForm.oldPassword,
        newPassword: passwordForm.newPassword,
      }, { headers: authHeader })
      setPasswordForm({ oldPassword: '', newPassword: '' })
      toast.success('Đã đổi mật khẩu')
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Không đổi được mật khẩu')
    } finally {
      setChangingPassword(false)
    }
  }

  const onRedeem = async () => {
    if (!token || !authHeader) return
    const points = Number(redeemPoints)
    if (!Number.isFinite(points) || points <= 0) {
      toast.error('Điểm đổi không hợp lệ')
      return
    }
    setRedeeming(true)
    try {
      const { data } = await api.post('/customer/loyalty/redeem', {
        pointsToRedeem: points,
      }, { headers: authHeader })
      toast.success(data?.message || 'Đổi điểm thành công')
      await loadAll()
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Không đổi được điểm')
    } finally {
      setRedeeming(false)
    }
  }

  if (loading) return <div className="min-h-screen bg-amber-50 p-4">Đang tải...</div>

  if (!session || !token) {
    return (
      <div className="min-h-screen bg-amber-50 p-4">
        <div className="mx-auto max-w-xl rounded-2xl border border-amber-200 bg-white p-5">
          <p className="text-lg font-semibold text-slate-900">Bạn chưa đăng nhập tài khoản khách hàng</p>
          <p className="mt-2 text-sm text-slate-600">Vui lòng quay lại menu để đăng nhập rồi truy cập lại trang tài khoản.</p>
          <Link to={menuReturnUrl} className="mt-4 inline-flex rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white">
            Quay lại menu
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-amber-50 px-3 py-4">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="rounded-2xl border border-amber-200 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-lg font-bold text-slate-900">Tài khoản của tôi</p>
              <p className="text-sm text-slate-600">{profile?.name || session.name}</p>
            </div>
            <div className="flex gap-2">
              <Link to={`/menu/rewards${menuReturnQuery}`} className="rounded-xl border border-emerald-200 px-3 py-2 text-sm text-emerald-700">Rewards</Link>
              <Link to={menuReturnUrl} className="rounded-xl border border-amber-200 px-3 py-2 text-sm text-amber-700">Về menu</Link>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-xl bg-amber-50 p-2"><p className="font-semibold text-amber-700">{profile?.loyaltyPoints ?? 0}</p><p>Điểm</p></div>
            <div className="rounded-xl bg-sky-50 p-2"><p className="font-semibold text-sky-700">{profile?.membershipTier || 'BRONZE'}</p><p>Hạng</p></div>
            <div className="rounded-xl bg-emerald-50 p-2"><p className="font-semibold text-emerald-700">{formatVnd(profile?.totalSpent || 0)}</p><p>Chi tiêu</p></div>
          </div>
          {profile?.amountToNextTier !== undefined && profile?.nextTier && (
            <p className="mt-2 text-xs text-slate-600">Còn {formatVnd(profile.amountToNextTier || 0)} để lên hạng {profile.nextTier}</p>
          )}
        </div>

        <form onSubmit={onSaveProfile} className="rounded-2xl border border-amber-200 bg-white p-4">
          <p className="font-semibold text-slate-900">Hồ sơ cá nhân</p>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="Họ tên" className="rounded-xl border border-amber-100 px-3 py-2 text-sm" />
            <input value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} placeholder="Email" className="rounded-xl border border-amber-100 px-3 py-2 text-sm" />
            <input value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} placeholder="Số điện thoại" className="rounded-xl border border-amber-100 px-3 py-2 text-sm" />
            <input value={form.dateOfBirth} onChange={(e) => setForm((p) => ({ ...p, dateOfBirth: e.target.value }))} placeholder="Ngày sinh (YYYY-MM-DD)" className="rounded-xl border border-amber-100 px-3 py-2 text-sm" />
            <input value={form.avatarUrl} onChange={(e) => setForm((p) => ({ ...p, avatarUrl: e.target.value }))} placeholder="Avatar URL" className="rounded-xl border border-amber-100 px-3 py-2 text-sm sm:col-span-2" />
            <input value={form.verifyOtp} onChange={(e) => setForm((p) => ({ ...p, verifyOtp: e.target.value }))} placeholder="OTP xác thực (khi đổi email/sđt)" className="rounded-xl border border-amber-100 px-3 py-2 text-sm sm:col-span-2" />
          </div>
          <button type="submit" disabled={saving} className="mt-3 w-full rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
            {saving ? 'Đang lưu...' : 'Lưu hồ sơ'}
          </button>
        </form>

        <form onSubmit={onChangePassword} className="rounded-2xl border border-amber-200 bg-white p-4">
          <p className="font-semibold text-slate-900">Đổi mật khẩu</p>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input type="password" value={passwordForm.oldPassword} onChange={(e) => setPasswordForm((p) => ({ ...p, oldPassword: e.target.value }))} placeholder="Mật khẩu hiện tại" className="rounded-xl border border-amber-100 px-3 py-2 text-sm" />
            <input type="password" value={passwordForm.newPassword} onChange={(e) => setPasswordForm((p) => ({ ...p, newPassword: e.target.value }))} placeholder="Mật khẩu mới" className="rounded-xl border border-amber-100 px-3 py-2 text-sm" />
          </div>
          <button type="submit" disabled={changingPassword} className="mt-3 w-full rounded-xl border border-sky-300 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-700 disabled:opacity-60">
            {changingPassword ? 'Đang cập nhật...' : 'Cập nhật mật khẩu'}
          </button>
        </form>

        <div className="rounded-2xl border border-amber-200 bg-white p-4">
          <p className="font-semibold text-slate-900">Rewards & giao dịch điểm</p>
          <div className="mt-2 flex gap-2">
            <input value={redeemPoints} onChange={(e) => setRedeemPoints(e.target.value)} placeholder="Điểm muốn đổi (bội số 100)" className="flex-1 rounded-xl border border-amber-100 px-3 py-2 text-sm" />
            <button type="button" onClick={onRedeem} disabled={redeeming} className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">
              Đổi điểm
            </button>
          </div>
          <div className="mt-3 space-y-2 text-sm">
            {txs.length === 0 && <p className="text-slate-500">Chưa có giao dịch điểm.</p>}
            {txs.map((tx) => (
              <div key={tx.id} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-slate-800">{tx.type}</p>
                  <p className={`font-semibold ${tx.points >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{tx.points >= 0 ? '+' : ''}{tx.points} điểm</p>
                </div>
                <p className="text-xs text-slate-500">{tx.description || '-'}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-amber-200 bg-white p-4">
          <p className="font-semibold text-slate-900">Lịch sử đơn hàng</p>
          <div className="mt-2 space-y-2 text-sm">
            {orders.length === 0 && <p className="text-slate-500">Chưa có đơn hàng.</p>}
            {orders.map((order) => (
              <div key={order.id} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-slate-800">{order.id.slice(-8).toUpperCase()}</p>
                  <p className="font-semibold text-amber-700">{formatVnd(order.totalAmount)}</p>
                </div>
                <p className="text-xs text-slate-500">{new Date(order.createdAt).toLocaleString('vi-VN')} • {order.status}</p>
                <p className="mt-1 text-xs text-slate-600">{order.orderItems?.map((item) => `${item.quantity}x ${item.menuItemName || 'Món'}`).join(', ') || '-'}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
