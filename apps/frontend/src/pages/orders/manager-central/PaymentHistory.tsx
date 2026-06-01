import { maDonHangNgan, phuongThucThanhToan, trangThaiThanhToan } from '@/utils/display'
import { ManagerOrder, ManagerPayment } from './managerTypes'

interface PaymentHistoryProps {
  loading: boolean
  payments: ManagerPayment[]
  expandedRows: Record<string, boolean>
  historyOrderDetails: Record<string, ManagerOrder>
  onToggleRow: (payment: ManagerPayment) => Promise<void>
  orderItemLabel: (item: ManagerOrder['orderItems'][number]) => string
  tableLabel: (tableId: string) => string
}

export default function PaymentHistory({
  loading,
  payments,
  expandedRows,
  historyOrderDetails,
  onToggleRow,
  orderItemLabel,
  tableLabel,
}: PaymentHistoryProps) {
  return (
    <div className="rounded-2xl border border-[#d2c4ba] bg-[#fff8f5] p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-2xl font-semibold text-[#291806]">🧾 Lịch sử thanh toán gần đây</h3>
      </div>
      {loading && <p className="text-sm text-[#4e453d]">Đang tải lịch sử...</p>}
      {!loading && payments.length === 0 && <p className="text-sm text-[#4e453d]">Chưa có giao dịch thanh toán.</p>}
      {!loading && payments.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-[#d2c4ba] bg-white">
          <div className="hidden grid-cols-[1.3fr_1fr_1fr_1fr_1fr_0.8fr] gap-2 border-b border-[#d2c4ba] bg-[#f4ece9] px-4 py-3 text-sm font-semibold text-[#33210d] md:grid">
            <span>Mã đơn</span>
            <span>Phương thức</span>
            <span>Thời gian</span>
            <span>Số tiền</span>
            <span>Vị trí</span>
            <span />
          </div>
          <div className="divide-y divide-[#e8e1dd]">
            {payments.slice(0, 8).map((payment) => {
              const order = historyOrderDetails[payment.orderId]
              const expanded = Boolean(expandedRows[payment.paymentId])
              return (
                <div key={payment.paymentId} className="px-4 py-3 text-sm text-[#33210d]">
                  <div className="grid grid-cols-1 items-start gap-2 md:grid-cols-[1.3fr_1fr_1fr_1fr_1fr_0.8fr] md:items-center">
                    <p className="font-semibold">{maDonHangNgan(payment.orderId)}</p>
                    <p>{phuongThucThanhToan(payment.provider)}</p>
                    <p>{payment.paidAt ? new Date(payment.paidAt).toLocaleString('vi-VN') : '-'}</p>
                    <p className="font-semibold">{Number(payment.amount || 0).toLocaleString('vi-VN')}đ</p>
                    <p>{payment.tableId ? tableLabel(payment.tableId) : 'Mang đi'}</p>
                    <button
                      type="button"
                      className="justify-self-start rounded-lg border border-[#d2c4ba] px-2 py-1 text-xs hover:bg-[#f4ece9] md:justify-self-end"
                      onClick={() => void onToggleRow(payment)}
                    >
                      {expanded ? 'Ẩn chi tiết' : 'Xem chi tiết'}
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-[#4e453d]">
                    {trangThaiThanhToan(payment.status)} · {payment.paidBy || payment.customerName || 'Khách hàng'}
                  </p>
                  {expanded && order && (
                    <div className="mt-2 space-y-1 rounded-lg border border-[#e8e1dd] bg-[#faf2ee] p-2 text-xs">
                      {order.orderItems.map((item) => (
                        <div key={item.id} className="flex items-center justify-between gap-2">
                          <span>{item.quantity}x {orderItemLabel(item)}</span>
                          <span>{(item.quantity * item.price).toLocaleString('vi-VN')}đ</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
