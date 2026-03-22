import { Link } from 'react-router-dom'
import Button from '@/components/ui/Button'
import { useAuthStore } from '@/stores/authStore'
import { normalizeRole } from '@/utils/rbac'
import { useI18n } from '@/utils/i18n'

export default function Register() {
  const user = useAuthStore((state) => state.user)
  const role = normalizeRole(user?.role)
  const canProvisionAccounts = role === 'ADMIN' || role === 'MANAGER'
  const { tv } = useI18n()

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50">
      <div className="max-w-lg w-full space-y-6 p-8 bg-white/90 backdrop-blur-lg rounded-2xl shadow-2xl">
        <div className="text-center space-y-3">
          <span className="text-5xl">☕</span>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            {tv('Cap tai khoan nhan vien', 'Provision employee accounts')}
          </h1>
          <p className="text-sm text-gray-600">
            {tv(
              'Tai khoan nhan vien khong duoc tu dang ky. Chi ADMIN hoac MANAGER moi duoc tao tai khoan trong man hinh Quan ly nhan su.',
              'Employee accounts are not self-registered. Only an ADMIN or MANAGER can create them from Staff Management.',
            )}
          </p>
        </div>

        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
          <p>
            {tv(
              'Nhan vien thuong chi duoc su dung tai khoan da cap san va khong co quyen them, sua hoac xoa tai khoan.',
              'Regular staff must use pre-provisioned accounts and cannot create, edit, or delete accounts.',
            )}
          </p>
        </div>

        <div className="flex flex-col gap-3">
          {canProvisionAccounts ? (
            <Link to="/staff">
              <Button className="w-full" size="lg">
                {tv('Mo Quan ly nhan su', 'Open Staff Management')}
              </Button>
            </Link>
          ) : (
            <Link to="/login">
              <Button className="w-full" size="lg">
                {tv('Quay lai dang nhap', 'Back to login')}
              </Button>
            </Link>
          )}

          {canProvisionAccounts && (
            <Link to="/login" className="text-center text-sm text-gray-500 hover:text-gray-700">
              {tv('Dang nhap bang tai khoan khac', 'Sign in with another account')}
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
