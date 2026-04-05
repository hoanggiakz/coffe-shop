import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import api from '@/utils/api'
import toast from 'react-hot-toast'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import { getDefaultPathForRole, normalizeRole } from '@/utils/rbac'
import { useI18n } from '@/utils/i18n'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const login = useAuthStore((s) => s.login)
  const navigate = useNavigate()
  const { tv } = useI18n()

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const { data } = await api.post('/users/login', { email, password })
      login(data.accessToken, data.user)
      toast.success(tv('Chào mừng quay lại!', 'Welcome back!'))
      const role = normalizeRole(data.user?.role)
      navigate(getDefaultPathForRole(role))
    } catch (err: any) {
      toast.error(err.response?.data?.message || tv('Đăng nhập thất bại', 'Login failed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50">
      <div className="max-w-md w-full space-y-8 p-8 bg-white/90 backdrop-blur-lg rounded-2xl shadow-2xl">
        <div className="text-center">
          <span className="text-5xl">☕</span>
          <h2 className="mt-4 text-3xl font-bold tracking-tight text-gray-900">{tv('Coffee Shop POS', 'Coffee Shop POS')}</h2>
          <p className="mt-2 text-sm text-gray-500">{tv('Đăng nhập để quản lý cửa hàng', 'Sign in to manage your shop')}</p>
        </div>
        <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
          <Input
            id="email"
            label={tv('Email', 'Email')}
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="staff@coffeeshop.com"
          />
          <Input
            id="password"
            label={tv('Mật khẩu', 'Password')}
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={tv('Nhập mật khẩu', 'Enter password')}
          />
          <Button type="submit" loading={loading} className="w-full" size="lg">
            {tv('Đăng nhập', 'Sign in')}
          </Button>
        </form>
        <p className="text-center text-sm text-gray-500">
          {tv(
            'Tai khoan nhan vien do ADMIN hoac MANAGER cap. Neu chua co tai khoan, vui long lien he quan ly.',
            'Employee accounts are provisioned by an ADMIN or MANAGER. Contact your manager if you need access.',
          )}
        </p>
      </div>
    </div>
  )
}
