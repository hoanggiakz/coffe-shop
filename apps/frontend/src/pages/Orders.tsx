import { FormEvent, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import api from '@/utils/api'
import { PaymentMethod } from '@/types'
import { RoutePageSkeleton } from '@/components/ui/PageSkeleton'
import { useI18n } from '@/utils/i18n'
import { maDonHangNgan, phuongThucThanhToan, trangThaiDonHang, trangThaiThanhToan } from '@/utils/display'
import { useBranchScopeStore } from '@/stores/branchScopeStore'

interface TableApi {
  id: string
  number: number
}

interface MenuItemApi {
  id: string
  name: string
  price: number
  available: boolean
}

interface OrderItemApi {
  id: string
  menuItemId: string
  menuItemName?: string | null
  quantity: number
  price: number
  note?: string | null
  status: 'WAITING' | 'PREPARING' | 'DONE' | 'READY'
}

interface OrderApi {
  id: string
  tableId: string
  tableNumber?: number | null
  status: 'PENDING' | 'CONFIRMED' | 'PREPARING' | 'READY' | 'COMPLETED' | 'CANCELLED'
  subtotalAmount?: number
  discountAmount?: number
  promotionCode?: string | null
  totalAmount: number
  createdAt: string
  orderItems: OrderItemApi[]
}

interface PaymentApi {
  paymentId: string
  orderId: string
  status: 'PENDING' | 'WAITING_TRANSFER' | 'WAITING_CASH' | 'PAID' | 'FAILED' | 'EXPIRED' | 'CANCELLED'
  provider: 'CASH' | 'VIETQR' | 'VNPAY'
  paymentUrl?: string | null
  vietQr?: {
    qrImageUrl: string
  } | null
  amountReceived?: number | null
  changeDue?: number | null
}

const paymentMethods: PaymentMethod[] = ['CASH', 'VIETQR', 'VNPAY']
const orderStatuses: Array<OrderApi['status']> = ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED']
const selectClass =
  'min-h-11 w-full rounded-xl border border-sky-100/80 bg-white/95 px-3 py-2 text-sm text-slate-800 focus:border-sky-400 focus:ring-2 focus:ring-sky-300/60 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:focus:border-sky-400 dark:focus:ring-sky-500/30'

export default function Orders() {
  const { tv } = useI18n()
  const selectedBranchId = useBranchScopeStore((state) => state.selectedBranchId)
  const [tables, setTables] = useState<TableApi[]>([])
  const [menuItems, setMenuItems] = useState<MenuItemApi[]>([])
  const [orders, setOrders] = useState<OrderApi[]>([])
  const [selectedStatus, setSelectedStatus] = useState<'ALL' | OrderApi['status']>('ALL')
  const [filterTableId, setFilterTableId] = useState('ALL')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [selectedTableId, setSelectedTableId] = useState('')
  const [cart, setCart] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [detailOrder, setDetailOrder] = useState<OrderApi | null>(null)
  const [editingOrder, setEditingOrder] = useState<OrderApi | null>(null)
  const [editCart, setEditCart] = useState<Record<string, number>>({})
  const [editNotes, setEditNotes] = useState<Record<string, string>>({})
  const [updatingOrder, setUpdatingOrder] = useState(false)
  const [payingOrder, setPayingOrder] = useState<OrderApi | null>(null)
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>('CASH')
  const [cashReceived, setCashReceived] = useState('')
  const [processingPayment, setProcessingPayment] = useState(false)
  const [createdPayment, setCreatedPayment] = useState<PaymentApi | null>(null)

  const loadData = async () => {
    setLoading(true)
    try {
      const params: Record<string, string> = {}
      if (selectedStatus !== 'ALL') {
        params.status = selectedStatus
      }
      if (filterTableId !== 'ALL') {
        params.tableId = filterTableId
      }
      if (dateFrom) {
        params.dateFrom = `${dateFrom}T00:00:00.000Z`
      }
      if (dateTo) {
        params.dateTo = `${dateTo}T23:59:59.999Z`
      }
      if (selectedBranchId) {
        params.branchId = selectedBranchId
      }

      const [tablesRes, menuRes, ordersRes] = await Promise.all([
        api.get('/tables', { params: { branchId: selectedBranchId || undefined } }),
        api.get('/orders/menu', { params: { branchId: selectedBranchId || undefined } }),
        api.get('/orders', { params }),
      ])
      setTables(tablesRes.data || [])
      setMenuItems(menuRes.data || [])
      setOrders(ordersRes.data || [])
      if (!selectedTableId && tablesRes.data?.length > 0) {
        setSelectedTableId(tablesRes.data[0].id)
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || tv('Không tải được dữ liệu order', 'Unable to load order data'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [selectedStatus, filterTableId, dateFrom, dateTo, selectedBranchId])

  const increase = (menuItemId: string) => {
    setCart((prev) => ({ ...prev, [menuItemId]: (prev[menuItemId] || 0) + 1 }))
  }

  const decrease = (menuItemId: string) => {
    setCart((prev) => {
      const next = { ...prev }
      if (!next[menuItemId]) return prev
      if (next[menuItemId] === 1) {
        delete next[menuItemId]
      } else {
        next[menuItemId] -= 1
      }
      return next
    })
  }

  const cartTotal = useMemo(
    () =>
      Object.entries(cart).reduce((sum, [id, qty]) => {
        const item = menuItems.find((m) => m.id === id)
        return sum + (item ? item.price * qty : 0)
      }, 0),
    [cart, menuItems],
  )

  const createOrder = async (e: FormEvent) => {
    e.preventDefault()
    if (!selectedTableId) {
      toast.error(tv('Chưa chọn bàn', 'No table selected'))
      return
    }
    const items = Object.entries(cart).map(([menuItemId, quantity]) => ({
      menuItemId,
      quantity,
    }))
    if (items.length === 0) {
      toast.error(tv('Chưa có món trong giỏ', 'Cart is empty'))
      return
    }

    setCreating(true)
    try {
      await api.post('/orders', {
        tableId: selectedTableId,
        customerName: 'Khách tại quầy',
        items,
      })
      setCart({})
      toast.success(tv('Tạo đơn thành công', 'Order created successfully'))
      await loadData()
    } catch (error: any) {
      toast.error(error.response?.data?.message || tv('Tạo đơn thất bại', 'Failed to create order'))
    } finally {
      setCreating(false)
    }
  }

  const updateOrderStatus = async (orderId: string, status: OrderApi['status']) => {
    try {
      await api.patch(`/orders/${orderId}/status`, { status })
      await loadData()
      toast.success(`Đơn ${maDonHangNgan(orderId)} -> ${trangThaiDonHang(status)}`)
    } catch (error: any) {
      toast.error(error.response?.data?.message || tv('Cập nhật trạng thái thất bại', 'Failed to update order status'))
    }
  }

  const openEditOrder = (order: OrderApi) => {
    const grouped = order.orderItems.reduce<Record<string, number>>((acc, item) => {
      acc[item.menuItemId] = (acc[item.menuItemId] || 0) + item.quantity
      return acc
    }, {})
    const noteByMenuItem = order.orderItems.reduce<Record<string, string>>((acc, item) => {
      const existing = String(acc[item.menuItemId] || '').trim()
      const current = String(item.note || '').trim()
      if (!existing && current) {
        acc[item.menuItemId] = current
      }
      return acc
    }, {})
    setEditingOrder(order)
    setEditCart(grouped)
    setEditNotes(noteByMenuItem)
  }

  const updateEditQuantity = (menuItemId: string, delta: number) => {
    setEditCart((prev) => {
      const next = { ...prev }
      const current = Number(next[menuItemId] || 0)
      const updated = current + delta
      if (updated <= 0) {
        delete next[menuItemId]
        setEditNotes((prev) => {
          const nextNotes = { ...prev }
          delete nextNotes[menuItemId]
          return nextNotes
        })
      } else {
        next[menuItemId] = updated
      }
      return next
    })
  }

  const saveOrderItems = async () => {
    if (!editingOrder) return
    const items = Object.entries(editCart)
      .filter(([, quantity]) => quantity > 0)
      .map(([menuItemId, quantity]) => ({
        menuItemId,
        quantity,
        note: String(editNotes[menuItemId] || '').trim() || undefined,
      }))

    if (!items.length) {
      toast.error(tv('Đơn phải còn ít nhất 1 món', 'Order must contain at least one item'))
      return
    }

    setUpdatingOrder(true)
    try {
      await api.patch(`/orders/${editingOrder.id}/items`, { items })
      toast.success('Cập nhật món trong đơn thành công')
      setEditingOrder(null)
      setEditCart({})
      setEditNotes({})
      await loadData()
    } catch (error: any) {
      toast.error(error.response?.data?.message || tv('Không cập nhật được đơn', 'Unable to update order'))
    } finally {
      setUpdatingOrder(false)
    }
  }

  const refreshPaymentAndCompleteIfPaid = async (orderId: string) => {
    try {
      const { data } = await api.get(`/v1/payments/orders/${orderId}?allowMissing=true`)
      if (!data) {
        setCreatedPayment(null)
        return null
      }
      let payment = data as PaymentApi
      const needsOnlineVerification =
        payment.provider !== 'CASH' &&
        !['PAID', 'FAILED', 'EXPIRED', 'CANCELLED'].includes(payment.status)

      if (needsOnlineVerification) {
        const { data: verifiedPayment } = await api.post(
          `/v1/payments/${payment.paymentId}/verify`,
          payment.transactionId ? { transactionId: payment.transactionId } : {},
        )
        payment = verifiedPayment as PaymentApi
      }

      setCreatedPayment(payment)
      if (payment.status === 'PAID') {
        await updateOrderStatus(orderId, 'COMPLETED')
      }
      return payment
    } catch (error: any) {
      if (error.response?.status !== 404) {
        toast.error(error.response?.data?.message || tv('Không thể kiểm tra trạng thái thanh toán', 'Unable to verify payment status'))
      }
      return null
    }
  }

  const fetchExistingPayment = async (orderId: string) => {
    try {
      const { data } = await api.get(`/v1/payments/orders/${orderId}?allowMissing=true`)
      if (!data) {
        return null
      }
      return data as PaymentApi
    } catch (error: any) {
      if (error.response?.status === 404) {
        return null
      }
      throw error
    }
  }

  const confirmPayment = async () => {
    if (!payingOrder) return

    setProcessingPayment(true)
    try {
      const existingPayment = await fetchExistingPayment(payingOrder.id)

      if (existingPayment && existingPayment.provider !== selectedMethod) {
        setCreatedPayment(existingPayment)
        setSelectedMethod(existingPayment.provider)
        toast.error(
          tv(
            `Đơn đã có phương thức ${phuongThucThanhToan(existingPayment.provider)}. Không thể đổi sang ${phuongThucThanhToan(selectedMethod)}.`,
            `Order already uses ${phuongThucThanhToan(existingPayment.provider)}. Cannot switch to ${phuongThucThanhToan(selectedMethod)}.`,
          ),
        )
        return
      }

      let payment = existingPayment
      if (!payment) {
        const { data } = await api.post('/v1/payments', {
          orderId: payingOrder.id,
          amount: payingOrder.totalAmount,
          provider: selectedMethod,
          tableId: payingOrder.tableId,
        })
        payment = data as PaymentApi
      }

      if (!payment) {
        throw new Error('Payment creation failed')
      }

      setCreatedPayment(payment)

      if (payment.provider === 'CASH') {
        const paidAmount = Math.round(Number(cashReceived || '0'))
        if (!Number.isFinite(paidAmount) || paidAmount < payingOrder.totalAmount) {
          toast.error(tv(`Số tiền khách đưa phải >= ${payingOrder.totalAmount.toLocaleString()}đ`, `Amount received must be >= ${payingOrder.totalAmount.toLocaleString()}đ`))
          return
        }

        const { data: paid } = await api.post(
          `/v1/payments/${payment.paymentId}/confirm-cash`,
          { confirmedBy: 'POS Staff', amountReceived: paidAmount },
        )
        setCreatedPayment(paid as PaymentApi)
        await updateOrderStatus(payingOrder.id, 'COMPLETED')
        const changeDue = Number((paid as PaymentApi).changeDue || 0)
        toast.success(tv('Đã xác nhận thu tiền mặt', 'Cash payment confirmed'))
        if (changeDue > 0) {
          toast.success(tv(`Tiền thừa: ${changeDue.toLocaleString()}đ`, `Change due: ${changeDue.toLocaleString()}đ`))
        }
        setPayingOrder(null)
      } else {
        if (!existingPayment) {
          if (payment.paymentUrl) {
            window.open(payment.paymentUrl, '_blank')
          } else if (payment.provider === 'VIETQR' && payment.vietQr?.qrImageUrl) {
            window.open(payment.vietQr.qrImageUrl, '_blank')
          }
          toast.success(tv('Đã tạo giao dịch online. Chờ webhook hoặc đối soát thanh toán', 'Online payment created. Waiting for webhook or reconciliation'))
        }
        const verified = await refreshPaymentAndCompleteIfPaid(payingOrder.id)
        if (!verified || verified.status === 'WAITING_TRANSFER' || verified.status === 'PENDING') {
          toast(tv('Chưa ghi nhận giao dịch hợp lệ. Tiếp tục trạng thái chờ chuyển khoản.', 'No valid transaction detected yet. Payment remains waiting transfer.'))
        }
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || tv('Thanh toán thất bại', 'Payment failed'))
    } finally {
      setProcessingPayment(false)
    }
  }

  useEffect(() => {
    if (!payingOrder) return

    let cancelled = false
    const loadExistingPayment = async () => {
      try {
        const existing = await fetchExistingPayment(payingOrder.id)
        if (cancelled) return
        if (existing) {
          setCreatedPayment(existing)
          setSelectedMethod(existing.provider)
        }
      } catch (error: any) {
        if (!cancelled) {
          toast.error(error.response?.data?.message || tv('Không thể tải thông tin thanh toán hiện tại', 'Unable to load current payment info'))
        }
      }
    }

    void loadExistingPayment()
    return () => {
      cancelled = true
    }
  }, [payingOrder?.id])

  const tableLabel = (tableId: string) => {
    const table = tables.find((t) => t.id === tableId)
    return table ? `Bàn ${table.number}` : 'Bàn không xác định'
  }

  const orderTableLabel = (order: OrderApi) => {
    if (order.tableNumber !== null && order.tableNumber !== undefined) {
      return `Bàn ${order.tableNumber}`
    }
    return tableLabel(order.tableId)
  }

  const orderItemLabel = (item: OrderItemApi) => {
    const menu = menuItems.find((m) => m.id === item.menuItemId)
    return item.menuItemName || menu?.name || 'Món đã xóa'
  }

  const resetFilters = () => {
    setSelectedStatus('ALL')
    setFilterTableId('ALL')
    setDateFrom('')
    setDateTo('')
  }

  const editCartTotal = useMemo(
    () =>
      Object.entries(editCart).reduce((sum, [id, qty]) => {
        const item = menuItems.find((m) => m.id === id)
        return sum + (item ? item.price * qty : 0)
      }, 0),
    [editCart, menuItems],
  )

  const cashChange = useMemo(() => {
    if (!payingOrder || selectedMethod !== 'CASH') return 0
    const paid = Math.round(Number(cashReceived || '0'))
    if (!Number.isFinite(paid)) return 0
    return Math.max(paid - payingOrder.totalAmount, 0)
  }, [cashReceived, payingOrder, selectedMethod])

  const lockedProvider = payingOrder && createdPayment?.orderId === payingOrder.id ? createdPayment.provider : null

  return (
    <div className="space-y-5 sm:space-y-6">
      <h1 className="text-xl font-bold text-slate-900 dark:text-white sm:text-2xl">{tv('Đơn hàng / POS', 'Orders / POS')}</h1>

      <Card className="sticky top-16 z-10" title={tv('Bộ lọc đơn hàng', 'Order filters')} subtitle="S-08">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <select
            className={selectClass}
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value as 'ALL' | OrderApi['status'])}
          >
            <option value="ALL">{tv('Tất cả trạng thái', 'All statuses')}</option>
            {orderStatuses.map((status) => (
              <option key={status} value={status}>
                {trangThaiDonHang(status)}
              </option>
            ))}
          </select>
          <select
            className={selectClass}
            value={filterTableId}
            onChange={(e) => setFilterTableId(e.target.value)}
          >
            <option value="ALL">{tv('Tất cả bàn', 'All tables')}</option>
            {tables.map((table) => (
              <option key={table.id} value={table.id}>
                Bàn {table.number}
              </option>
            ))}
          </select>
          <input
            type="date"
            className={selectClass}
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
          <input
            type="date"
            className={selectClass}
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
          <Button variant="secondary" className="w-full xl:w-auto" onClick={resetFilters}>
            {tv('Xóa lọc', 'Clear filters')}
          </Button>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-1">
          <form onSubmit={createOrder} className="space-y-3">
            <p className="text-base font-semibold text-slate-900 dark:text-white">{tv('Tạo đơn tại quầy (S-07)', 'Create walk-in order (S-07)')}</p>
            <select
              className={selectClass}
              value={selectedTableId}
              onChange={(e) => setSelectedTableId(e.target.value)}
            >
              <option value="">{tv('-- Chọn bàn --', '-- Select table --')}</option>
              {tables.map((table) => (
                <option key={table.id} value={table.id}>
                  Bàn {table.number}
                </option>
              ))}
            </select>

            <div className="max-h-80 space-y-2 overflow-y-auto rounded-xl border border-sky-100 p-2">
              {menuItems
                .filter((item) => item.available)
                .map((item) => (
                  <div key={item.id} className="flex items-center justify-between rounded-lg bg-white/80 px-2 py-1.5 text-sm dark:bg-slate-900/40">
                    <div>
                      <p className="font-medium">{item.name}</p>
                      <p className="text-xs text-slate-500">{item.price.toLocaleString()}đ</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="inline-flex h-9 min-w-9 items-center justify-center rounded-lg border border-sky-200 px-2"
                        onClick={() => decrease(item.id)}
                      >
                        -
                      </button>
                      <span>{cart[item.id] || 0}</span>
                      <button
                        type="button"
                        className="inline-flex h-9 min-w-9 items-center justify-center rounded-lg border border-sky-200 px-2"
                        onClick={() => increase(item.id)}
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))}
            </div>

            <div className="flex items-center justify-between border-t pt-2">
              <span className="font-semibold">{tv('Tổng', 'Total')}</span>
              <span className="font-bold text-amber-700">{cartTotal.toLocaleString()}đ</span>
            </div>

            <Button type="submit" className="w-full" loading={creating}>
              {tv('Tạo đơn cho bàn', 'Create order')}
            </Button>
          </form>
        </Card>

        <div className="space-y-4 xl:col-span-2">
          {loading && <RoutePageSkeleton kind="table" />}
          {!loading && orders.length === 0 && (
            <p className="text-sm text-gray-500">{tv('Không có đơn phù hợp với bộ lọc hiện tại.', 'No orders match the current filters.')}</p>
          )}
          {orders.map((order) => (
            <Card key={order.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white" title={order.id}>
                    Đơn {maDonHangNgan(order.id)}
                  </p>
                  <p className="text-sm text-gray-500">
                    {orderTableLabel(order)} · {new Date(order.createdAt).toLocaleString()}
                  </p>
                </div>
                <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
                  {trangThaiDonHang(order.status)}
                </span>
              </div>

              <div className="mt-3 space-y-1 text-sm">
                {order.orderItems.map((item) => {
                  return (
                    <div key={item.id} className="flex justify-between">
                      <span>
                        {item.quantity}x {orderItemLabel(item)}
                      </span>
                      <span>{(item.quantity * item.price).toLocaleString()}đ</span>
                    </div>
                  )
                })}
                {(order.discountAmount || 0) > 0 && (
                  <div className="flex justify-between text-xs text-emerald-700">
                    <span>Khuyến mãi {order.promotionCode ? `(${order.promotionCode})` : ''}</span>
                    <span>-{(order.discountAmount || 0).toLocaleString()}đ</span>
                  </div>
                )}
              </div>

              <div className="mt-3 flex items-center justify-between border-t pt-3">
                <span className="font-bold text-amber-700">{order.totalAmount.toLocaleString()}đ</span>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => setDetailOrder(order)}>
                  Chi tiết
                  </Button>
                  {!['COMPLETED', 'CANCELLED'].includes(order.status) && (
                    <Button size="sm" variant="secondary" onClick={() => openEditOrder(order)}>
                      Sửa món
                    </Button>
                  )}
                  {order.status === 'PENDING' && (
                    <Button size="sm" onClick={() => updateOrderStatus(order.id, 'CONFIRMED')}>
                      Xác nhận đơn
                    </Button>
                  )}
                  {(order.status === 'CONFIRMED' || order.status === 'PREPARING') && (
                    <Button size="sm" variant="secondary" onClick={() => updateOrderStatus(order.id, 'READY')}>
                      Chuyển sang sẵn sàng
                    </Button>
                  )}
                  {order.status === 'READY' && (
                    <Button
                      size="sm"
                      onClick={() => {
                        setCreatedPayment(null)
                        setPayingOrder(order)
                        setSelectedMethod('CASH')
                        setCashReceived(String(order.totalAmount))
                      }}
                    >
                      Thanh toán
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {payingOrder && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 sm:items-center sm:p-4">
          <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 dark:bg-slate-900">
            <p className="text-lg font-bold" title={payingOrder.id}>Thanh toán và đối soát đơn {maDonHangNgan(payingOrder.id)}</p>
            <p className="mt-1 text-sm text-slate-500">Tổng tiền: {payingOrder.totalAmount.toLocaleString()}đ</p>

            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {paymentMethods.map((method) => (
                <button
                  key={method}
                  className={`min-h-11 rounded-xl border px-3 py-2 text-sm ${
                    selectedMethod === method ? 'border-sky-500 bg-sky-50' : 'border-sky-100'
                  }`}
                  disabled={Boolean(lockedProvider && lockedProvider !== method)}
                  onClick={() => setSelectedMethod(method)}
                >
                  {phuongThucThanhToan(method)}
                </button>
              ))}
            </div>

            {lockedProvider && (
              <p className="mt-2 text-xs text-amber-700">
                Đơn này đã có phương thức thanh toán: <span className="font-semibold">{phuongThucThanhToan(lockedProvider)}</span>. Không thể đổi phương thức.
              </p>
            )}

            {selectedMethod === 'CASH' && (
              <div className="mt-4 space-y-2 rounded border border-gray-200 bg-gray-50 p-3 text-sm">
                <label className="block text-xs font-medium text-slate-600">Số tiền khách đưa</label>
                <input
                  type="number"
                  min={0}
                  className={selectClass}
                  value={cashReceived}
                  onChange={(e) => setCashReceived(e.target.value)}
                />
                <p>
                  Tiền thừa: <span className="font-semibold">{cashChange.toLocaleString()}đ</span>
                </p>
              </div>
            )}

            {createdPayment?.orderId === payingOrder.id && (
              <div className="mt-4 rounded border border-gray-200 bg-gray-50 p-3 text-sm">
                <p>
                  Trạng thái: <span className="font-semibold">{trangThaiThanhToan(createdPayment.status)}</span>
                </p>
                <p>
                  Phương thức: <span className="font-semibold">{phuongThucThanhToan(createdPayment.provider)}</span>
                </p>
                {createdPayment.provider === 'CASH' && createdPayment.amountReceived !== null && createdPayment.amountReceived !== undefined && (
                  <p>
                    Đã thu: <span className="font-semibold">{Number(createdPayment.amountReceived || 0).toLocaleString()}đ</span>
                    {' · '}
                    Tiền thừa: <span className="font-semibold">{Number(createdPayment.changeDue || 0).toLocaleString()}đ</span>
                  </p>
                )}
                {createdPayment.status !== 'PAID' && (
                  <button
                    type="button"
                    className="mt-2 rounded border px-3 py-1 text-xs"
                    onClick={() => refreshPaymentAndCompleteIfPaid(payingOrder.id)}
                  >
                    Kiểm tra giao dịch thật
                  </button>
                )}
              </div>
            )}

            <div className="mt-4 flex gap-2">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => {
                  setPayingOrder(null)
                  setCreatedPayment(null)
                }}
              >
                Hủy
              </Button>
              <Button className="flex-1" loading={processingPayment} onClick={confirmPayment}>
                {selectedMethod === 'CASH'
                  ? 'Xác nhận thu tiền mặt'
                  : createdPayment?.orderId === payingOrder.id
                    ? 'Kiểm tra giao dịch thật'
                    : 'Tạo giao dịch online'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {detailOrder && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 sm:items-center sm:p-4">
          <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 dark:bg-slate-900">
            <p className="text-lg font-bold" title={detailOrder.id}>Chi tiết đơn {maDonHangNgan(detailOrder.id)}</p>
            <div className="mt-2 space-y-1 text-sm text-slate-600 dark:text-slate-300">
              <p>Bàn: {orderTableLabel(detailOrder)}</p>
              <p>Trạng thái: {trangThaiDonHang(detailOrder.status)}</p>
              <p>Tạo lúc: {new Date(detailOrder.createdAt).toLocaleString()}</p>
            </div>

            <div className="mt-4 max-h-72 space-y-2 overflow-y-auto rounded-xl border border-sky-100 p-2 text-sm">
              {detailOrder.orderItems.map((item) => {
                return (
                  <div key={item.id} className="space-y-0.5">
                    <div className="flex items-center justify-between">
                      <span>
                        {item.quantity}x {orderItemLabel(item)} ({item.status === 'WAITING' ? 'Chờ làm' : item.status === 'PREPARING' ? 'Đang chuẩn bị' : 'Hoàn thành'})
                      </span>
                      <span>{(item.quantity * item.price).toLocaleString()}đ</span>
                    </div>
                    {!!item.note && <p className="text-xs text-slate-500">Ghi chú: {item.note}</p>}
                  </div>
                )
              })}
            </div>

            <div className="mt-4 flex justify-end">
              <Button variant="secondary" onClick={() => setDetailOrder(null)}>
                Đóng
              </Button>
            </div>
          </div>
        </div>
      )}

      {editingOrder && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 sm:items-center sm:p-4">
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 dark:bg-slate-900">
            <p className="text-lg font-bold" title={editingOrder.id}>Sửa món đơn {maDonHangNgan(editingOrder.id)}</p>
            <p className="mt-1 text-sm text-slate-500">S-09: Sửa số lượng, thêm/xóa món trong đơn</p>

            <div className="mt-4 max-h-80 space-y-2 overflow-y-auto rounded-xl border border-sky-100 p-2">
              {menuItems
                .filter((item) => item.available || editCart[item.id])
                .map((item) => (
                  <div key={item.id} className="space-y-2 rounded-xl border border-sky-100 bg-white/80 p-2 text-sm dark:border-slate-700 dark:bg-slate-900/40">
                    <div className="flex items-center justify-between">
                      <div>
                      <p className="font-medium">{item.name}</p>
                      <p className="text-xs text-gray-500">{item.price.toLocaleString()}đ</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button type="button" className="inline-flex h-9 min-w-9 items-center justify-center rounded-lg border border-sky-200 px-2" onClick={() => updateEditQuantity(item.id, -1)}>
                          -
                        </button>
                        <span>{editCart[item.id] || 0}</span>
                        <button type="button" className="inline-flex h-9 min-w-9 items-center justify-center rounded-lg border border-sky-200 px-2" onClick={() => updateEditQuantity(item.id, 1)}>
                          +
                        </button>
                      </div>
                    </div>
                    {(editCart[item.id] || 0) > 0 && (
                      <input
                        type="text"
                        className={selectClass}
                        placeholder="Ghi chú cho món (ít đá, ít ngọt...)"
                        value={editNotes[item.id] || ''}
                        onChange={(e) =>
                          setEditNotes((prev) => ({
                            ...prev,
                            [item.id]: e.target.value,
                          }))
                        }
                      />
                    )}
                  </div>
                ))}
            </div>

            <div className="mt-3 flex items-center justify-between text-sm">
              <span>Tổng tạm tính mới</span>
              <span className="font-semibold text-amber-700">{editCartTotal.toLocaleString()}đ</span>
            </div>

            <div className="mt-4 flex gap-2">
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() => {
                    setEditingOrder(null)
                    setEditCart({})
                    setEditNotes({})
                  }}
                >
                  Hủy
              </Button>
              <Button className="flex-1" onClick={saveOrderItems} loading={updatingOrder}>
                Lưu thay đổi
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
