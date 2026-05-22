import { useEffect, useMemo, useState } from 'react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { useAuthStore } from '@/stores/authStore'
import { useUiStore } from '@/stores/uiStore'
import { vaiTroNhanVien } from '@/utils/display'
import { normalizeRole } from '@/utils/rbac'

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
  const { user } = useAuthStore()
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
          <Input id="name" label="Họ tên" defaultValue={user?.name || ''} />
          <Input id="email" label="Email" defaultValue={user?.email || ''} disabled />
          <Input id="role" label="Vai trò" defaultValue={vaiTroNhanVien(user?.role)} disabled />
        </div>
        <Button className="mt-4" size="sm">Lưu thay đổi</Button>
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
          <Input id="current" label="Mật khẩu hiện tại" type="password" />
          <Input id="new" label="Mật khẩu mới" type="password" />
          <Input id="confirm" label="Xác nhận mật khẩu mới" type="password" />
        </div>
        <Button className="mt-4" size="sm">Cập nhật mật khẩu</Button>
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
