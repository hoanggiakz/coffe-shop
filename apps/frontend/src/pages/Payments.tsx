import Card from '@/components/ui/Card'
import { cn } from '@/utils/cn'
import type { PaymentMethod, PaymentStatus } from '@/types'
import { phuongThucThanhToan, trangThaiThanhToan } from '@/utils/display'

const statusColors: Record<PaymentStatus, string> = {
  PENDING: 'bg-amber-100 text-amber-700',
  COMPLETED: 'bg-green-100 text-green-700',
  FAILED: 'bg-red-100 text-red-700',
  REFUNDED: 'bg-gray-100 text-gray-700',
}

const methodIcons: Record<PaymentMethod, string> = {
  CASH: '💵',
  VIETQR: '🔳',
  VNPAY: '🏦',
  MOMO: '📱',
}

const mockPayments = Array.from({ length: 10 }, (_, i) => ({
  id: `PAY-${2001 + i}`,
  orderId: `ORD-${1001 + i}`,
  amount: 12.0 + i * 2.5,
  method: (['CASH', 'VIETQR', 'VNPAY', 'MOMO'] as PaymentMethod[])[i % 4],
  status: (['COMPLETED', 'COMPLETED', 'PENDING', 'COMPLETED'] as PaymentStatus[])[i % 4],
  time: `${10 + i}:${String((i * 13) % 60).padStart(2, '0')}`,
}))

export default function Payments() {
  const totalRevenue = mockPayments
    .filter((p) => p.status === 'COMPLETED')
    .reduce((sum, p) => sum + p.amount, 0)

  return (
    <div className="space-y-5 sm:space-y-6">
      <h1 className="text-xl font-bold text-slate-900 dark:text-white sm:text-2xl">Thanh toán</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="text-center">
          <p className="text-sm text-slate-500">Tổng doanh thu</p>
          <p className="text-3xl font-bold text-green-600">{totalRevenue.toLocaleString('vi-VN')}đ</p>
        </Card>
        <Card className="text-center">
          <p className="text-sm text-slate-500">Giao dịch</p>
          <p className="text-3xl font-bold text-slate-900 dark:text-white">{mockPayments.length}</p>
        </Card>
        <Card className="text-center">
          <p className="text-sm text-slate-500">Đang chờ</p>
          <p className="text-3xl font-bold text-amber-600">
            {mockPayments.filter((p) => p.status === 'PENDING').length}
          </p>
        </Card>
      </div>

      <Card>
        <div className="space-y-3 sm:hidden">
          {mockPayments.map((p) => (
            <div key={p.id} className="rounded-xl border border-sky-100 bg-white/90 p-3 text-sm dark:border-slate-700 dark:bg-slate-900/60">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-slate-900 dark:text-slate-100">{p.id}</p>
                <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', statusColors[p.status])}>
                  {trangThaiThanhToan(p.status)}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">{p.orderId} · {p.time}</p>
              <p className="mt-2 font-semibold text-slate-900 dark:text-slate-100">{p.amount.toLocaleString('vi-VN')}đ</p>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                {methodIcons[p.method]} {phuongThucThanhToan(p.method)}
              </p>
            </div>
          ))}
        </div>

        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="pb-3 font-medium text-gray-500">ID</th>
                <th className="pb-3 font-medium text-gray-500">Đơn hàng</th>
                <th className="pb-3 font-medium text-gray-500">Số tiền</th>
                <th className="pb-3 font-medium text-gray-500">Phương thức</th>
                <th className="pb-3 font-medium text-gray-500">Trạng thái</th>
                <th className="pb-3 font-medium text-gray-500">Thời gian</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {mockPayments.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                  <td className="py-3 font-medium text-gray-900 dark:text-white">{p.id}</td>
                  <td className="py-3 text-gray-500">{p.orderId}</td>
                  <td className="py-3 font-semibold text-gray-900 dark:text-white">{p.amount.toLocaleString('vi-VN')}đ</td>
                  <td className="py-3">
                    <span className="inline-flex items-center gap-1">
                      {methodIcons[p.method]} {phuongThucThanhToan(p.method)}
                    </span>
                  </td>
                  <td className="py-3">
                    <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', statusColors[p.status])}>
                      {trangThaiThanhToan(p.status)}
                    </span>
                  </td>
                  <td className="py-3 text-gray-500">{p.time}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
