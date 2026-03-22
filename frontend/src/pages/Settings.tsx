import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { useAuthStore } from '@/stores/authStore'
import { useUiStore } from '@/stores/uiStore'
import { vaiTroNhanVien } from '@/utils/display'

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Cài đặt</h1>
        <p className="mt-1 text-sm text-gray-500">
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
          <label className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">Thông báo trên máy tính</p>
              <p className="text-xs text-gray-500">Hiển thị thông báo hệ thống khi có đơn/chat mới.</p>
            </div>
            <input
              type="checkbox"
              checked={desktopNotifications}
              onChange={(e) => setDesktopNotifications(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
          </label>

          <label className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">Âm báo</p>
              <p className="text-xs text-gray-500">Phát âm báo khi có đơn mới hoặc tin nhắn mới.</p>
            </div>
            <input
              type="checkbox"
              checked={soundEnabled}
              onChange={(e) => setSoundEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
          </label>

          <label className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">Giao diện</p>
              <p className="text-xs text-gray-500">Chuyển nhanh giữa giao diện sáng và tối.</p>
            </div>
            <select
              value={darkMode ? 'dark' : 'light'}
              onChange={(e) => setDarkMode(e.target.value === 'dark')}
              className="rounded-lg border px-3 py-2 text-sm"
            >
              <option value="light">Sáng</option>
              <option value="dark">Tối</option>
            </select>
          </label>

          <label className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">Mật độ hiển thị</p>
              <p className="text-xs text-gray-500">Gọn phù hợp desktop, thoải mái dễ thao tác trên màn hình cảm ứng.</p>
            </div>
            <select
              value={density}
              onChange={(e) => setDensity(e.target.value as 'comfortable' | 'compact')}
              className="rounded-lg border px-3 py-2 text-sm"
            >
              <option value="comfortable">Thoải mái</option>
              <option value="compact">Gọn</option>
            </select>
          </label>

          <label className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 px-4 py-3 lg:col-span-2">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">Chuẩn ngôn ngữ</p>
              <p className="text-xs text-gray-500">
                Giao diện hiện đang chuẩn hóa 100% tiếng Việt. Hạ tầng đa ngôn ngữ vẫn được giữ lại để mở rộng sau.
              </p>
            </div>
            <span className="rounded-lg border px-3 py-2 text-sm text-gray-700 dark:text-gray-200">Tiếng Việt</span>
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
    </div>
  )
}
