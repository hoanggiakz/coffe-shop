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
  MOMO: '📱',
  VNPAY: '🏦',
  VIETQR: '🔳',
}

const mockPayments = Array.from({ length: 10 }, (_, i) => ({
  id: `PAY-${2001 + i}`,
  orderId: `ORD-${1001 + i}`,
  amount: 12.0 + i * 2.5,
  method: (['CASH', 'MOMO', 'VNPAY', 'VIETQR'] as PaymentMethod[])[i % 4],
  status: (['COMPLETED', 'COMPLETED', 'PENDING', 'COMPLETED'] as PaymentStatus[])[i % 4],
  time: `${10 + i}:${String((i * 13) % 60).padStart(2, '0')}`,
}))

export default function Payments() {
  const totalRevenue = mockPayments
    .filter((p) => p.status === 'COMPLETED')
    .reduce((sum, p) => sum + p.amount, 0)

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Thanh toán</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="text-center">
          <p className="text-sm text-gray-500">Tổng doanh thu</p>
          <p className="text-3xl font-bold text-green-600">{totalRevenue.toLocaleString('vi-VN')}đ</p>
        </Card>
        <Card className="text-center">
          <p className="text-sm text-gray-500">Giao dịch</p>
          <p className="text-3xl font-bold text-gray-900 dark:text-white">{mockPayments.length}</p>
        </Card>
        <Card className="text-center">
          <p className="text-sm text-gray-500">Đang chờ</p>
          <p className="text-3xl font-bold text-amber-600">
            {mockPayments.filter((p) => p.status === 'PENDING').length}
          </p>
        </Card>
      </div>

      <Card>
        <div className="overflow-x-auto">
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
