import { useState } from 'react'
import Card from '@/components/ui/Card'
import { RoutePageSkeleton } from '@/components/ui/PageSkeleton'
import OrderCard from './OrderCard'
import { ManagerBoardColumn, ManagerBoardColumnKey, ManagerOrder, ManagerPayment } from './managerTypes'

type Tone = 'neutral' | 'warning' | 'danger'
const DEFAULT_VISIBLE_ORDERS = 6
const LOAD_MORE_STEP = 6
const INITIAL_VISIBLE_ORDERS_BY_COLUMN: Record<ManagerBoardColumnKey, number> = {
  PENDING: DEFAULT_VISIBLE_ORDERS,
  WORKING: DEFAULT_VISIBLE_ORDERS,
  COMPLETED: DEFAULT_VISIBLE_ORDERS,
}

interface OrderBoardProps {
  loading: boolean
  hasOrders: boolean
  columns: ManagerBoardColumn[]
  mobileColumn: ManagerBoardColumnKey
  setMobileColumn: (value: ManagerBoardColumnKey) => void
  paymentByOrderId: Record<string, ManagerPayment>
  canManagePosAdvanced: boolean
  getOrderAgeMinutes: (createdAt: string) => number
  getOrderTone: (order: ManagerOrder) => Tone
  orderTableLabel: (order: ManagerOrder) => string
  orderItemLabel: (item: ManagerOrder['orderItems'][number]) => string
  formatDateTime: (value?: string | null) => string
  onOpenEdit: (order: ManagerOrder) => void
  onOpenDetail: (order: ManagerOrder) => void
  onConfirmOrder: (orderId: string) => void
  onMarkReady: (orderId: string) => void
  onOpenPayment: (order: ManagerOrder) => void
}

export default function OrderBoard({
  loading,
  hasOrders,
  columns,
  mobileColumn,
  setMobileColumn,
  paymentByOrderId,
  canManagePosAdvanced,
  getOrderAgeMinutes,
  getOrderTone,
  orderTableLabel,
  orderItemLabel,
  formatDateTime,
  onOpenEdit,
  onOpenDetail,
  onConfirmOrder,
  onMarkReady,
  onOpenPayment,
}: OrderBoardProps) {
  const [visibleOrdersByColumn, setVisibleOrdersByColumn] =
    useState<Record<ManagerBoardColumnKey, number>>(INITIAL_VISIBLE_ORDERS_BY_COLUMN)

  return (
    <section className="space-y-3">
      <div className="grid grid-cols-3 gap-2 md:hidden">
        {columns.map((column) => (
          <button
            key={column.key}
            type="button"
            className={`min-h-12 rounded-xl border px-2 py-2 text-xs font-semibold ${
              mobileColumn === column.key ? 'border-[#33210d] bg-[#fedcbe] text-[#291806]' : 'border-[#d2c4ba] bg-white text-[#4e453d]'
            }`}
            onClick={() => setMobileColumn(column.key)}
          >
            {column.icon} {column.orders.length}
          </button>
        ))}
      </div>

      {loading && <RoutePageSkeleton kind="table" />}
      {!loading && !hasOrders && (
        <Card className="rounded-2xl border border-[#d2c4ba] bg-white">
          <p className="text-sm text-[#4e453d]">Không có đơn phù hợp với bộ lọc hiện tại.</p>
        </Card>
      )}

      {!loading && hasOrders && (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
          {columns.map((column) => {
            const hiddenOnMobile = mobileColumn !== column.key ? 'hidden md:flex' : 'flex'
            const visibleLimit = visibleOrdersByColumn[column.key] ?? DEFAULT_VISIBLE_ORDERS
            const visibleOrders = column.orders.slice(0, visibleLimit)
            const remainingOrders = Math.max(column.orders.length - visibleOrders.length, 0)
            return (
              <div key={column.key} className={`${hiddenOnMobile} min-h-[520px] flex-col rounded-2xl border border-[#d2c4ba] bg-[#fff8f5] p-3`}>
                <div className={`mb-3 flex items-center justify-between rounded-xl border px-3 py-2 ${column.accent}`}>
                  <p className="text-lg font-semibold uppercase tracking-wide text-[#291806]">
                    {column.icon} {column.title}
                  </p>
                  <span className="rounded-full bg-white px-2 py-0.5 text-sm font-semibold text-[#33210d]">{column.orders.length}</span>
                </div>
                <div className="flex-1 space-y-2 overflow-y-auto pr-1">
                  {column.orders.length === 0 && (
                    <div className="rounded-xl border border-dashed border-[#d2c4ba] bg-white/80 p-3 text-center text-xs text-[#4e453d]">
                      Chưa có đơn trong cột này.
                    </div>
                  )}
                  {visibleOrders.map((order) => {
                    const tone = getOrderTone(order)
                    const ageMinutes = getOrderAgeMinutes(order.createdAt)
                    const itemCount = order.orderItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0)
                    return (
                      <OrderCard
                        key={order.id}
                        order={order}
                        tone={tone}
                        ageMinutes={ageMinutes}
                        itemCount={itemCount}
                        payment={paymentByOrderId[order.id]}
                        canManagePosAdvanced={canManagePosAdvanced}
                        orderTableLabel={orderTableLabel}
                        orderItemLabel={orderItemLabel}
                        formatDateTime={formatDateTime}
                        onOpenEdit={onOpenEdit}
                        onOpenDetail={onOpenDetail}
                        onConfirmOrder={onConfirmOrder}
                        onMarkReady={onMarkReady}
                        onOpenPayment={onOpenPayment}
                      />
                    )
                  })}
                  {column.orders.length > DEFAULT_VISIBLE_ORDERS && (
                    <button
                      type="button"
                      className="w-full rounded-xl border border-[#d2c4ba] bg-white px-3 py-2 text-sm font-medium text-[#33210d] hover:bg-[#fef1e6]"
                      onClick={() =>
                        setVisibleOrdersByColumn((prev) => ({
                          ...prev,
                          [column.key]:
                            remainingOrders > 0
                              ? Math.min((prev[column.key] ?? DEFAULT_VISIBLE_ORDERS) + LOAD_MORE_STEP, column.orders.length)
                              : DEFAULT_VISIBLE_ORDERS,
                        }))
                      }
                    >
                      {remainingOrders > 0 ? `Xem thêm ${Math.min(LOAD_MORE_STEP, remainingOrders)} đơn` : 'Thu gọn'}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
