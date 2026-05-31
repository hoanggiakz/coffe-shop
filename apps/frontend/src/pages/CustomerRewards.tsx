import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import api from '@/utils/api'

type CustomerProfile = {
  loyaltyPoints: number
  membershipTier: 'BRONZE' | 'STANDARD' | 'SILVER' | 'GOLD' | 'PLATINUM'
  totalSpent: number
  nextTier?: string | null
  amountToNextTier?: number | null
}

type LoyaltyTx = {
  id: string
  type: string
  points: number
  description?: string | null
  createdAt: string
}

const authStorageKey = 'customer-auth-session'
const menuReturnUrlStorageKey = 'customer-menu-return-url'

const formatVnd = (value: number) => `${Number(value || 0).toLocaleString('vi-VN')}đ`

const tierBenefits: Record<string, string[]> = {
  BRONZE: ['Tích điểm cơ bản x1.0', 'Nâng hạng từ 1.000.000đ chi tiêu'],
  STANDARD: ['Tích điểm cơ bản x1.0', 'Nâng hạng từ 1.000.000đ chi tiêu'],
  SILVER: ['Giảm 5% cho đơn >= 200.000đ', 'Tích điểm x1.2', 'Ưu đãi sinh nhật 10%'],
  GOLD: ['Giảm 10% cho đơn >= 200.000đ', 'Tích điểm x1.5', 'Sinh nhật 15% + free drink'],
  PLATINUM: ['Giảm 15% cho đơn >= 200.000đ', 'Tích điểm x2.0', 'Ưu tiên phục vụ + quà sinh nhật'],
}

export default function CustomerRewards() {
  const [token, setToken] = useState('')
  const [profile, setProfile] = useState<CustomerProfile | null>(null)
  const [txs, setTxs] = useState<LoyaltyTx[]>([])
  const [loading, setLoading] = useState(true)
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
      if (localToken) setToken(localToken)
    } finally {
      setLoading(false)
    }
  }, [])

  const authHeader = useMemo(() => (token ? { Authorization: `Bearer ${token}` } : undefined), [token])

  useEffect(() => {
    const load = async () => {
      if (!authHeader) return
      try {
        const [profileRes, txRes] = await Promise.all([
          api.get<CustomerProfile>('/customer/profile', { headers: authHeader }),
          api.get<{ data: LoyaltyTx[] }>('/customer/loyalty/transactions', { headers: authHeader, params: { page: 1, limit: 20 } }),
        ])
        setProfile(profileRes.data)
        setTxs(Array.isArray(txRes.data?.data) ? txRes.data.data : [])
      } catch (error: any) {
        toast.error(error?.response?.data?.message || 'Không tải được dữ liệu rewards')
      }
    }
    void load()
  }, [authHeader])

  if (loading) return <div className="min-h-screen bg-amber-50 p-4">Đang tải...</div>

  if (!token) {
    return (
      <div className="min-h-screen bg-amber-50 p-4">
        <div className="mx-auto max-w-xl rounded-2xl border border-amber-200 bg-white p-5">
          <p className="text-lg font-semibold text-slate-900">Bạn chưa đăng nhập</p>
          <p className="mt-2 text-sm text-slate-600">Đăng nhập tại trang menu để xem rewards và ưu đãi theo hạng.</p>
          <Link to={menuReturnUrl} className="mt-4 inline-flex rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white">
            Về menu
          </Link>
        </div>
      </div>
    )
  }

  const tier = profile?.membershipTier || 'BRONZE'
  const benefits = tierBenefits[tier] || tierBenefits.BRONZE

  return (
    <div className="min-h-screen bg-amber-50 px-3 py-4">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="rounded-2xl border border-amber-200 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-lg font-bold text-slate-900">Ưu đãi thành viên</p>
              <p className="text-sm text-slate-600">Hạng hiện tại: <span className="font-semibold text-amber-700">{tier}</span></p>
            </div>
            <div className="flex gap-2">
              <Link to={`/menu/account${menuReturnQuery}`} className="rounded-xl border border-sky-200 px-3 py-2 text-sm text-sky-700">Hồ sơ</Link>
              <Link to={menuReturnUrl} className="rounded-xl border border-amber-200 px-3 py-2 text-sm text-amber-700">Menu</Link>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <div className="rounded-xl bg-amber-50 p-2"><p className="text-xs text-slate-500">Điểm</p><p className="font-semibold">{profile?.loyaltyPoints || 0}</p></div>
            <div className="rounded-xl bg-emerald-50 p-2"><p className="text-xs text-slate-500">Đổi tối đa/đơn</p><p className="font-semibold">30%</p></div>
            <div className="rounded-xl bg-sky-50 p-2"><p className="text-xs text-slate-500">Tỷ lệ đổi</p><p className="font-semibold">100 điểm = 10.000đ</p></div>
            <div className="rounded-xl bg-violet-50 p-2"><p className="text-xs text-slate-500">Tổng chi tiêu</p><p className="font-semibold">{formatVnd(profile?.totalSpent || 0)}</p></div>
          </div>
          {profile?.nextTier && profile?.amountToNextTier !== undefined && (
            <p className="mt-2 text-xs text-slate-600">Cần thêm {formatVnd(profile.amountToNextTier || 0)} để lên hạng {profile.nextTier}.</p>
          )}
        </div>

        <div className="rounded-2xl border border-amber-200 bg-white p-4">
          <p className="font-semibold text-slate-900">Quyền lợi theo hạng của bạn</p>
          <ul className="mt-2 space-y-1 text-sm text-slate-700">
            {benefits.map((item) => (
              <li key={item} className="rounded-lg bg-slate-50 px-3 py-2">{item}</li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-amber-200 bg-white p-4">
          <p className="font-semibold text-slate-900">Lịch sử điểm gần đây</p>
          <div className="mt-2 space-y-2 text-sm">
            {txs.length === 0 && <p className="text-slate-500">Chưa có giao dịch điểm.</p>}
            {txs.map((tx) => (
              <div key={tx.id} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-slate-800">{tx.type}</p>
                  <p className={tx.points >= 0 ? 'font-semibold text-emerald-700' : 'font-semibold text-rose-700'}>
                    {tx.points >= 0 ? '+' : ''}{tx.points} điểm
                  </p>
                </div>
                <p className="text-xs text-slate-500">{tx.description || '-'}</p>
                <p className="text-xs text-slate-400">{new Date(tx.createdAt).toLocaleString('vi-VN')}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
