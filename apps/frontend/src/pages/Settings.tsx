import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { useAuthStore } from '@/stores/authStore'
import { useUiStore } from '@/stores/uiStore'
import { vaiTroNhanVien } from '@/utils/display'
import { normalizeRole } from '@/utils/rbac'
import api from '@/utils/api'

type SepayEnv = 'sandbox' | 'production'

type AdminSystemConfig = {
  appBaseUrl: string
  sepayEnv: SepayEnv
  sepayMerchantId: string
  sepayQueryUrl: string
  sepayIpnAuthType: 'either' | 'apikey' | 'secret' | 'none'
}

const ADMIN_SYSTEM_CONFIG_KEY = 'admin-system-config'

function buildDefaultAdminConfig(): AdminSystemConfig {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  return {
    appBaseUrl: origin,
    sepayEnv: 'production',
    sepayMerchantId: '',
    sepayQueryUrl: 'https://pgapi.sepay.vn',
    sepayIpnAuthType: 'either',
  }
}

export default function Settings() {
  const { user, updateUser } = useAuthStore()
  const darkMode = useUiStore((state) => state.darkMode)
  const setDarkMode = useUiStore((state) => state.setDarkMode)
  const soundEnabled = useUiStore((state) => state.soundEnabled)
  const setSoundEnabled = useUiStore((state) => state.setSoundEnabled)
  const desktopNotifications = useUiStore((state) => state.desktopNotifications)
  const setDesktopNotifications = useUiStore((state) => state.setDesktopNotifications)
  const density = useUiStore((state) => state.density)
  const setDensity = useUiStore((state) => state.setDensity)
  const role = normalizeRole(user?.role)
  const isAdmin = role === 'ADMIN'
  const [adminConfig, setAdminConfig] = useState<AdminSystemConfig>(buildDefaultAdminConfig())
  const [profileForm, setProfileForm] = useState({
    name: user?.name || '',
    phone: user?.phone || '',
    avatarUrl: user?.avatarUrl || user?.avatar || '',
  })
  const [savingProfile, setSavingProfile] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })
  const [changingPassword, setChangingPassword] = useState(false)

  useEffect(() => {
    setProfileForm({
      name: user?.name || '',
      phone: user?.phone || '',
      avatarUrl: user?.avatarUrl || user?.avatar || '',
    })
  }, [user?.id, user?.name, user?.phone, user?.avatar, user?.avatarUrl])

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const { data } = await api.get('/users/profile')
        updateUser({
          name: data?.name || '',
          email: data?.email || '',
          phone: data?.phone || '',
          branchId: data?.branchId || null,
          employeeCode: data?.employeeCode || null,
          avatarUrl: data?.avatarUrl || null,
          avatar: data?.avatarUrl || null,
        })
      } catch {
        // ignore profile fetch errors on settings load
      }
    }
    void loadProfile()
  }, [updateUser])

  useEffect(() => {
    if (!isAdmin) return
    try {
      const raw = localStorage.getItem(ADMIN_SYSTEM_CONFIG_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as Partial<AdminSystemConfig>
      setAdminConfig((prev) => ({
        ...prev,
        appBaseUrl: String(parsed.appBaseUrl || prev.appBaseUrl).trim(),
        sepayEnv: parsed.sepayEnv === 'sandbox' ? 'sandbox' : 'production',
        sepayMerchantId: String(parsed.sepayMerchantId || '').trim(),
        sepayQueryUrl: String(parsed.sepayQueryUrl || prev.sepayQueryUrl).trim(),
        sepayIpnAuthType:
          parsed.sepayIpnAuthType === 'apikey' ||
          parsed.sepayIpnAuthType === 'secret' ||
          parsed.sepayIpnAuthType === 'none'
            ? parsed.sepayIpnAuthType
            : 'either',
      }))
    } catch {
      // ignore broken local config
    }
  }, [isAdmin])

  useEffect(() => {
    if (!isAdmin) return
    localStorage.setItem(ADMIN_SYSTEM_CONFIG_KEY, JSON.stringify(adminConfig))
  }, [isAdmin, adminConfig])

  const webhookUrl = useMemo(() => {
    const base = String(adminConfig.appBaseUrl || '').replace(/\/+$/, '')
    return base ? `${base}/api/payment/webhook/sepay` : '/api/payment/webhook/sepay'
  }, [adminConfig.appBaseUrl])

  const copyWebhookUrl = async () => {
    try {
      await navigator.clipboard.writeText(webhookUrl)
      alert('Đã copy webhook URL')
    } catch {
      alert('Không thể copy. Vui lòng sao chép thủ công.')
    }
  }

  const saveProfile = async () => {
    setSavingProfile(true)
    try {
      const payload = {
        name: profileForm.name,
        phone: profileForm.phone || null,
        avatarUrl: profileForm.avatarUrl || null,
      }
      const { data } = await api.patch('/users/profile', payload)
      updateUser({
        name: data?.name || profileForm.name,
        phone: data?.phone || profileForm.phone,
        employeeCode: data?.employeeCode || user?.employeeCode || null,
        avatarUrl: data?.avatarUrl || profileForm.avatarUrl || null,
        avatar: data?.avatarUrl || profileForm.avatarUrl || null,
      })
      toast.success('Đã cập nhật hồ sơ cá nhân')
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Không thể cập nhật hồ sơ')
    } finally {
      setSavingProfile(false)
    }
  }

  const submitChangePassword = async () => {
    if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
      toast.error('Vui lòng nhập đủ thông tin mật khẩu')
      return
    }
    if (passwordForm.newPassword.length < 6) {
      toast.error('Mật khẩu mới tối thiểu 6 ký tự')
      return
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error('Xác nhận mật khẩu mới không khớp')
      return
    }

    setChangingPassword(true)
    try {
      await api.post('/users/change-password', {
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      })
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
      toast.success('Đổi mật khẩu thành công')
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Đổi mật khẩu thất bại')
    } finally {
      setChangingPassword(false)
    }
  }

  const uploadAvatarFile = async (file?: File | null) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('Chỉ chấp nhận file ảnh')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Ảnh tối đa 5MB')
      return
    }
    setUploadingAvatar(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const { data } = await api.post('/users/profile/avatar', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      const avatarUrl = String(data?.avatarUrl || '')
      setProfileForm((prev) => ({ ...prev, avatarUrl }))
      updateUser({
        avatarUrl: avatarUrl || null,
        avatar: avatarUrl || null,
      })
      toast.success('Đã upload ảnh đại diện và lưu vào DB')
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Upload ảnh đại diện thất bại')
    } finally {
      setUploadingAvatar(false)
    }
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white sm:text-2xl">Cài đặt</h1>
        <p className="mt-1 text-sm text-slate-500">
          Tối ưu trải nghiệm theo thiết bị và chuẩn hóa giao diện tiếng Việt cho toàn bộ hệ thống.
        </p>
      </div>

      <Card title="Thông tin tài khoản">
        <div className="grid max-w-lg grid-cols-1 gap-4 sm:grid-cols-2">
          <Input id="name" label="Họ tên" value={profileForm.name} onChange={(e) => setProfileForm((prev) => ({ ...prev, name: e.target.value }))} />
          <Input id="email" label="Email" defaultValue={user?.email || ''} disabled />
          <Input id="employee-code" label="Mã nhân viên" defaultValue={user?.employeeCode || '-'} disabled />
          <Input id="phone" label="Số điện thoại" value={profileForm.phone} onChange={(e) => setProfileForm((prev) => ({ ...prev, phone: e.target.value }))} />
          <Input id="avatar-url" label="Ảnh đại diện (URL)" value={profileForm.avatarUrl} onChange={(e) => setProfileForm((prev) => ({ ...prev, avatarUrl: e.target.value }))} />
          <Input id="role" label="Vai trò" defaultValue={vaiTroNhanVien(user?.role)} disabled />
        </div>
        <div className="mt-3 max-w-lg">
          <label className="block text-sm font-medium text-slate-700 dark:text-gray-200">Upload ảnh đại diện từ máy</label>
          <input
            type="file"
            accept="image/*"
            className="mt-1 block w-full rounded-xl border border-amber-100 bg-white/95 px-3 py-2 text-sm"
            onChange={(e) => void uploadAvatarFile(e.target.files?.[0] || null)}
            disabled={uploadingAvatar}
          />
          {uploadingAvatar && <p className="mt-1 text-xs text-slate-500">Đang upload ảnh...</p>}
        </div>
        {profileForm.avatarUrl && (
          <div className="mt-4">
            <img src={profileForm.avatarUrl} alt="Avatar preview" className="h-16 w-16 rounded-full border border-amber-100 object-cover" />
          </div>
        )}
        <Button className="mt-4" size="sm" loading={savingProfile} onClick={saveProfile}>Lưu thay đổi</Button>
      </Card>

      <Card title="Tùy chọn giao diện" subtitle="Trải nghiệm sử dụng và khả năng tiếp cận">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <label className="flex items-center justify-between gap-3 rounded-xl border border-amber-100 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-slate-900 dark:text-white">Thông báo trên máy tính</p>
              <p className="text-xs text-slate-500">Hiển thị thông báo hệ thống khi có đơn/chat mới.</p>
            </div>
            <input
              type="checkbox"
              checked={desktopNotifications}
              onChange={(e) => setDesktopNotifications(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
          </label>

          <label className="flex items-center justify-between gap-3 rounded-xl border border-amber-100 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-slate-900 dark:text-white">Âm báo</p>
              <p className="text-xs text-slate-500">Phát âm báo khi có đơn mới hoặc tin nhắn mới.</p>
            </div>
            <input
              type="checkbox"
              checked={soundEnabled}
              onChange={(e) => setSoundEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
          </label>

          <label className="flex items-center justify-between gap-3 rounded-xl border border-amber-100 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-slate-900 dark:text-white">Giao diện</p>
              <p className="text-xs text-slate-500">Chuyển nhanh giữa giao diện sáng và tối.</p>
            </div>
            <select
              value={darkMode ? 'dark' : 'light'}
              onChange={(e) => setDarkMode(e.target.value === 'dark')}
              className="min-h-11 rounded-xl border border-amber-100 bg-white/90 px-3 py-2 text-sm"
            >
              <option value="light">Sáng</option>
              <option value="dark">Tối</option>
            </select>
          </label>

          <label className="flex items-center justify-between gap-3 rounded-xl border border-amber-100 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-slate-900 dark:text-white">Mật độ hiển thị</p>
              <p className="text-xs text-slate-500">Gọn phù hợp desktop, thoải mái dễ thao tác trên màn hình cảm ứng.</p>
            </div>
            <select
              value={density}
              onChange={(e) => setDensity(e.target.value as 'comfortable' | 'compact')}
              className="min-h-11 rounded-xl border border-amber-100 bg-white/90 px-3 py-2 text-sm"
            >
              <option value="comfortable">Thoải mái</option>
              <option value="compact">Gọn</option>
            </select>
          </label>

          <label className="flex items-center justify-between gap-3 rounded-xl border border-amber-100 px-4 py-3 lg:col-span-2">
            <div>
              <p className="text-sm font-medium text-slate-900 dark:text-white">Chuẩn ngôn ngữ</p>
              <p className="text-xs text-slate-500">
                Giao diện hiện đang chuẩn hóa 100% tiếng Việt. Hạ tầng đa ngôn ngữ vẫn được giữ lại để mở rộng sau.
              </p>
            </div>
            <span className="rounded-xl border border-amber-100 px-3 py-2 text-sm text-slate-700 dark:text-gray-200">Tiếng Việt</span>
          </label>
        </div>
      </Card>

      <Card title="Đổi mật khẩu">
        <div className="max-w-sm space-y-4">
          <Input id="current" label="Mật khẩu hiện tại" type="password" value={passwordForm.currentPassword} onChange={(e) => setPasswordForm((prev) => ({ ...prev, currentPassword: e.target.value }))} />
          <Input id="new" label="Mật khẩu mới" type="password" value={passwordForm.newPassword} onChange={(e) => setPasswordForm((prev) => ({ ...prev, newPassword: e.target.value }))} />
          <Input id="confirm" label="Xác nhận mật khẩu mới" type="password" value={passwordForm.confirmPassword} onChange={(e) => setPasswordForm((prev) => ({ ...prev, confirmPassword: e.target.value }))} />
        </div>
        <Button className="mt-4" size="sm" loading={changingPassword} onClick={submitChangePassword}>Cập nhật mật khẩu</Button>
      </Card>

      {isAdmin && (
        <Card
          title="Cấu hình hệ thống (Admin)"
          subtitle="Thiết lập thông tin môi trường SePay và webhook cho merchant"
        >
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Input
              id="app-base-url"
              label="APP_BASE_URL"
              value={adminConfig.appBaseUrl}
              onChange={(e) => setAdminConfig((prev) => ({ ...prev, appBaseUrl: e.target.value }))}
              placeholder="https://order.cafexuan.com"
            />

            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700 dark:text-gray-200">SEPAY_ENV</span>
              <select
                value={adminConfig.sepayEnv}
                onChange={(e) =>
                  setAdminConfig((prev) => ({
                    ...prev,
                    sepayEnv: e.target.value === 'sandbox' ? 'sandbox' : 'production',
                    sepayQueryUrl:
                      e.target.value === 'sandbox'
                        ? 'https://pgapi-sandbox.sepay.vn'
                        : 'https://pgapi.sepay.vn',
                  }))
                }
                className="min-h-11 rounded-xl border border-amber-100 bg-white/90 px-3 py-2 text-sm"
              >
                <option value="sandbox">sandbox</option>
                <option value="production">production</option>
              </select>
            </label>

            <Input
              id="sepay-merchant-id"
              label="SEPAY_MERCHANT_ID"
              value={adminConfig.sepayMerchantId}
              onChange={(e) => setAdminConfig((prev) => ({ ...prev, sepayMerchantId: e.target.value }))}
              placeholder="Merchant ID do SePay cấp"
            />

            <Input
              id="sepay-query-url"
              label="SEPAY_QUERY_URL"
              value={adminConfig.sepayQueryUrl}
              onChange={(e) => setAdminConfig((prev) => ({ ...prev, sepayQueryUrl: e.target.value }))}
              placeholder="https://pgapi.sepay.vn"
            />

            <label className="flex flex-col gap-1 lg:col-span-2">
              <span className="text-sm font-medium text-slate-700 dark:text-gray-200">SEPAY_IPN_AUTH_TYPE</span>
              <select
                value={adminConfig.sepayIpnAuthType}
                onChange={(e) =>
                  setAdminConfig((prev) => ({
                    ...prev,
                    sepayIpnAuthType:
                      e.target.value === 'apikey' ||
                      e.target.value === 'secret' ||
                      e.target.value === 'none'
                        ? e.target.value
                        : 'either',
                  }))
                }
                className="min-h-11 rounded-xl border border-amber-100 bg-white/90 px-3 py-2 text-sm"
              >
                <option value="either">either</option>
                <option value="apikey">apikey</option>
                <option value="secret">secret</option>
                <option value="none">none</option>
              </select>
            </label>

            <Input id="sepay-webhook-url" label="Webhook URL đăng ký trên SePay" value={webhookUrl} readOnly />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" onClick={copyWebhookUrl}>Copy Webhook URL</Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setAdminConfig(buildDefaultAdminConfig())}
            >
              Đặt lại mặc định
            </Button>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Lưu ý: UI này lưu cấu hình ở trình duyệt admin (localStorage) để phục vụ vận hành. Cấu hình runtime thật
            vẫn cần cập nhật trong file môi trường của server.
          </p>
        </Card>
      )}
    </div>
  )
}
