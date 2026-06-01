import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { useNavigate } from 'react-router-dom'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import api from '@/utils/api'
import { PaymentMethod } from '@/types'
import { RoutePageSkeleton } from '@/components/ui/PageSkeleton'
import { useI18n } from '@/utils/i18n'
import { maDonHangNgan, phuongThucThanhToan, trangThaiDonHang, trangThaiThanhToan } from '@/utils/display'
import { useBranchScopeStore } from '@/stores/branchScopeStore'
import { clearPosMenuCache, readPosMenuCache, writePosMenuCache } from '@/utils/posMenuCache'
import { readPosOfflineQueue, writePosOfflineQueue } from '@/utils/posOfflineQueue'
import { disconnectSocket, getSocket } from '@/utils/socket'
import { showRealtimeNotification } from '@/utils/notifications'
import { useAuthStore } from '@/stores/authStore'

interface TableApi {
  id: string
  number: number
}

interface MenuItemApi {
  id: string
  name: string
  price: number
  available: boolean
  options?: unknown
  customOptions?: unknown
  custom_options?: unknown
  customizations?: unknown
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
  tableId?: string | null
  amount: number
  status: 'PENDING' | 'WAITING_TRANSFER' | 'WAITING_CASH' | 'PAID' | 'FAILED' | 'EXPIRED' | 'CANCELLED'
  provider: 'CASH' | 'SEPAY'
  paymentUrl?: string | null
  transferContent?: string | null
  vietQr?: {
    qrImageUrl: string
    transferContent?: string
    accountNo?: string
    accountName?: string
  } | null
  amountReceived?: number | null
  changeDue?: number | null
  paidBy?: string | null
  customerName?: string | null
  paidAt?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  expiresAt?: string | null
}

type StaffNotificationType =
  | 'ORDER_NEW'
  | 'CALL_STAFF'
  | 'CHAT_MESSAGE'
  | 'CHAT_OPENED'
  | 'LOW_STOCK'
  | 'KDS_ITEM_STATUS'
  | 'KDS_ORDER_READY'
  | 'CART_UPDATED'

interface StaffNotificationPayload {
  id: string
  type: StaffNotificationType
  title: string
  message: string
  branchId?: string
  tableId?: string
  orderId?: string
  createdAt: string
}

interface OfflineOrderQueueItem {
  localId: string
  createdAt: string
  syncStatus: 'PENDING_SYNC'
  branchId?: string
  tableId: string
  customerName: string
  items: Array<{
    menuItemId: string
    quantity: number
  }>
}

const paymentMethods: PaymentMethod[] = ['CASH', 'SEPAY']
const orderStatuses: Array<OrderApi['status']> = ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED']
type PosBoardColumnKey = 'PENDING' | 'WORKING' | 'COMPLETED'
type PosBoardTone = 'neutral' | 'warning' | 'danger'
const selectClass =
  'min-h-11 w-full rounded-xl border border-amber-100/80 bg-white/95 px-3 py-2 text-sm text-slate-800 focus:border-amber-400 focus:ring-2 focus:ring-amber-300/60 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:focus:border-amber-400 dark:focus:ring-amber-500/30'
const formatDateTimeFull = (value?: string | null) => {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString('vi-VN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

const fallbackOrderItemName = (menuItemId?: string | null) => {
  const raw = String(menuItemId || '').trim()
  if (!raw) return 'Món không xác định'
  const cleaned = raw
    .replace(/^menu[-_]/i, '')
    .replace(/^mnu[-_]/i, '')
    .replace(/[-_]+/g, ' ')
    .trim()
  if (!cleaned) return raw
  return cleaned
    .split(' ')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function normalizeCustomizations(raw: unknown): CustomizationGroup[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((entry: any) => ({
      id: String(entry?.id || ''),
      label: String(entry?.label || ''),
      type: entry?.type === 'multi' ? 'multi' : 'single',
      options: Array.isArray(entry?.options)
        ? entry.options.map((opt: any) => ({
            value: String(opt?.value || ''),
            label: String(opt?.label || ''),
            priceDelta: Number(opt?.priceDelta || 0),
          }))
        : [],
    }))
    .filter((entry) => entry.id && entry.label)
}

function normalizeSpecOptionsToCustomizations(raw: unknown): CustomizationGroup[] {
  const options = raw && typeof raw === 'object' ? (raw as Record<string, any>) : {}
  const sizes = Array.isArray(options.sizes) ? options.sizes : []
  const toppings = Array.isArray(options.toppings) ? options.toppings : []
  const groups: CustomizationGroup[] = []

  if (sizes.length > 0) {
    groups.push({
      id: 'size',
      label: 'Size',
      type: 'single',
      options: sizes.map((size: any) => ({
        value: String(size?.name || ''),
        label: String(size?.name || ''),
        priceDelta: Number(size?.priceModifier || 0),
      })),
    })
  }

  if (toppings.length > 0) {
    groups.push({
      id: 'toppings',
      label: 'Topping',
      type: 'multi',
      options: toppings.map((topping: any) => ({
        value: String(topping?.name || ''),
        label: String(topping?.name || ''),
        priceDelta: Number(topping?.priceModifier || 0),
      })),
    })
  }

  return groups
}

function extractCustomizations(menuItem: MenuItemApi): CustomizationGroup[] {
  const fromCustomizations = normalizeCustomizations(menuItem.customizations)
  if (fromCustomizations.length > 0) return fromCustomizations
  const options = menuItem.customOptions ?? menuItem.custom_options ?? menuItem.options
  return normalizeSpecOptionsToCustomizations(options)
}

export default function Orders() {
  const navigate = useNavigate()
  const { tv } = useI18n()
  const selectedBranchId = useBranchScopeStore((state) => state.selectedBranchId)
  const user = useAuthStore((state) => state.user)
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
  const [showAddItemPicker, setShowAddItemPicker] = useState(false)
  const [updatingOrder, setUpdatingOrder] = useState(false)
  const [payingOrder, setPayingOrder] = useState<OrderApi | null>(null)
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>('CASH')
  const [cashReceived, setCashReceived] = useState('')
  const [processingPayment, setProcessingPayment] = useState(false)
  const [createdPayment, setCreatedPayment] = useState<PaymentApi | null>(null)
  const [paymentHistory, setPaymentHistory] = useState<PaymentApi[]>([])
  const [loadingPaymentHistory, setLoadingPaymentHistory] = useState(false)
  const [expandedHistoryRows, setExpandedHistoryRows] = useState<Record<string, boolean>>({})
  const [historyOrderDetails, setHistoryOrderDetails] = useState<Record<string, OrderApi>>({})
  const tableSelectRef = useRef<HTMLSelectElement | null>(null)
  const [offlineQueue, setOfflineQueue] = useState<OfflineOrderQueueItem[]>([])
  const [syncingOfflineQueue, setSyncingOfflineQueue] = useState(false)
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true)
  const [cartHistory, setCartHistory] = useState<Record<string, number>[]>([])
  const [customCartLines, setCustomCartLines] = useState<CustomCartLine[]>([])
  const [customizingItem, setCustomizingItem] = useState<MenuItemApi | null>(null)
  const [customSize, setCustomSize] = useState('')
  const [customToppings, setCustomToppings] = useState<string[]>([])
  const [customNote, setCustomNote] = useState('')
  const [mobileBoardColumn, setMobileBoardColumn] = useState<PosBoardColumnKey>('PENDING')
  const [boardNow, setBoardNow] = useState(() => Date.now())
  const [sepayExpiresAt, setSepayExpiresAt] = useState<string | null>(null)
  const [sepaySecondsLeft, setSepaySecondsLeft] = useState(0)
  const [sepayExpiredNotified, setSepayExpiredNotified] = useState(false)
  const [autoPrintInvoiceAfterPaid, setAutoPrintInvoiceAfterPaid] = useState(true)
  const notifSyncKey = useMemo(() => `notif_last_received_at_${String(user?.id || 'guest')}`, [user?.id])
  const normalizedRole = String(user?.role || '').toUpperCase()
  const canManagePosAdvanced = normalizedRole === 'ADMIN' || normalizedRole === 'MANAGER'
  const lastPrintedPaymentRef = useRef<string | null>(null)
  const processedRealtimeIdsRef = useRef<Record<string, number>>({})

  const alreadyHandledRealtime = (id?: string) => {
    const key = String(id || '').trim()
    if (!key) return false
    const now = Date.now()
    const cache = processedRealtimeIdsRef.current
    for (const cacheKey of Object.keys(cache)) {
      if (now - cache[cacheKey] > 5 * 60 * 1000) {
        delete cache[cacheKey]
      }
    }
    if (cache[key]) return true
    cache[key] = now
    return false
  }

  const printCurrentView = () => {
    if (typeof window === 'undefined') return
    window.print()
  }

  const escapeHtml = (value?: string | null) =>
    String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')

  const openPrintWindow = (title: string, body: string) => {
    if (typeof window === 'undefined') return
    const popup = window.open('', '_blank', 'width=760,height=900')
    if (!popup) {
      toast.error('Không mở được cửa sổ in. Hãy kiểm tra popup blocker.')
      return
    }
    popup.document.write(`<!doctype html><html><head><meta charset="utf-8" />
      <title>${escapeHtml(title)}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 16px; color: #111; }
        h1 { font-size: 20px; margin: 0 0 8px; }
        .meta { font-size: 12px; color: #444; margin-bottom: 10px; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th, td { border: 1px solid #ddd; padding: 6px 8px; font-size: 12px; }
        th { background: #f5f5f5; text-align: left; }
        .right { text-align: right; }
        .total { font-weight: bold; font-size: 14px; }
      </style></head><body>${body}</body></html>`)
    popup.document.close()
    popup.focus()
    popup.print()
  }

  const printOrderSlip = (order: OrderApi) => {
    const rows = (order.orderItems || [])
      .map((item) => {
        const lineTotal = Number(item.quantity || 0) * Number(item.price || 0)
        return `<tr>
          <td>${escapeHtml(orderItemLabel(item))}</td>
          <td class="right">${Number(item.quantity || 0)}</td>
          <td class="right">${Number(item.price || 0).toLocaleString('vi-VN')}đ</td>
          <td class="right">${lineTotal.toLocaleString('vi-VN')}đ</td>
        </tr>`
      })
      .join('')
    const html = `
      <h1>PHIẾU ORDER - ${escapeHtml(maDonHangNgan(order.id))}</h1>
      <div class="meta">Bàn: ${escapeHtml(orderTableLabel(order))} | Thời gian: ${escapeHtml(formatDateTimeFull(order.createdAt))}</div>
      <table>
        <thead><tr><th>Món</th><th class="right">SL</th><th class="right">Đơn giá</th><th class="right">Thành tiền</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p class="total right">TỔNG: ${Number(order.totalAmount || 0).toLocaleString('vi-VN')}đ</p>
    `
    openPrintWindow(`Order-${maDonHangNgan(order.id)}`, html)
  }

  const printInvoice = (order: OrderApi, payment?: PaymentApi | null) => {
    const rows = (order.orderItems || [])
      .map((item) => {
        const lineTotal = Number(item.quantity || 0) * Number(item.price || 0)
        return `<tr>
          <td>${escapeHtml(orderItemLabel(item))}</td>
          <td class="right">${Number(item.quantity || 0)}</td>
          <td class="right">${Number(item.price || 0).toLocaleString('vi-VN')}đ</td>
          <td class="right">${lineTotal.toLocaleString('vi-VN')}đ</td>
        </tr>`
      })
      .join('')
    const status = payment ? trangThaiThanhToan(payment.status) : 'Chưa thanh toán'
    const method = payment ? phuongThucThanhToan(payment.provider) : phuongThucThanhToan(selectedMethod)
    const html = `
      <h1>HÓA ĐƠN TẠM - ${escapeHtml(maDonHangNgan(order.id))}</h1>
      <div class="meta">Bàn: ${escapeHtml(orderTableLabel(order))} | Trạng thái TT: ${escapeHtml(status)} | Phương thức: ${escapeHtml(method)}</div>
      <table>
        <thead><tr><th>Món</th><th class="right">SL</th><th class="right">Đơn giá</th><th class="right">Thành tiền</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p class="right">Giảm giá: ${Number(order.discountAmount || 0).toLocaleString('vi-VN')}đ</p>
      <p class="total right">TỔNG: ${Number(order.totalAmount || 0).toLocaleString('vi-VN')}đ</p>
    `
    openPrintWindow(`Invoice-${maDonHangNgan(order.id)}`, html)
  }

  const switchPaymentMethodByShortcut = () => {
    if (!payingOrder) return
    if (lockedProvider) return
    setSelectedMethod((prev) => (prev === 'CASH' ? 'SEPAY' : 'CASH'))
  }

  const pushCartHistory = (snapshot: Record<string, number>) => {
    setCartHistory((prev) => [snapshot, ...prev].slice(0, 30))
  }

  const undoCartChange = () => {
    setCartHistory((prev) => {
      if (!prev.length) return prev
      const [latest, ...rest] = prev
      setCart(latest)
      return rest
    })
  }

  const refreshOfflineQueue = async () => {
    const queue = await readPosOfflineQueue<OfflineOrderQueueItem>(selectedBranchId || undefined)
    setOfflineQueue(queue)
  }

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

      const cachedMenu = readPosMenuCache<MenuItemApi>(selectedBranchId || undefined)
      const [tablesRes, menuRes, ordersRes] = await Promise.all([
        api.get('/tables', { params: { branchId: selectedBranchId || undefined } }),
        cachedMenu
          ? Promise.resolve({ data: cachedMenu })
          : api.get('/orders/menu', { params: { branchId: selectedBranchId || undefined } }),
        api.get('/orders', { params }),
      ])
      setTables(tablesRes.data || [])
      setMenuItems(menuRes.data || [])
      if (!cachedMenu) {
        writePosMenuCache(selectedBranchId || undefined, Array.isArray(menuRes.data) ? menuRes.data : [])
      }
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

  useEffect(() => {
    void refreshOfflineQueue()
  }, [selectedBranchId])

  const loadPaymentHistory = async () => {
    setLoadingPaymentHistory(true)
    try {
      const { data } = await api.get<PaymentApi[]>('/v1/payments', {
        params: { limit: 100, reconcileOnline: true },
      })
      setPaymentHistory(Array.isArray(data) ? data : [])
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Không tải được lịch sử thanh toán')
    } finally {
      setLoadingPaymentHistory(false)
    }
  }

  useEffect(() => {
    void loadPaymentHistory()
  }, [])

  useEffect(() => {
    const intervalId = window.setInterval(() => setBoardNow(Date.now()), 30_000)
    return () => window.clearInterval(intervalId)
  }, [])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (payingOrder && (event.key === 'F5' || (event.ctrlKey && event.key.toLowerCase() === 'p'))) {
        event.preventDefault()
        printCurrentView()
        return
      }
      if (payingOrder && event.key === 'Tab') {
        event.preventDefault()
        switchPaymentMethodByShortcut()
        return
      }
      if (event.ctrlKey && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        undoCartChange()
        return
      }
      if (event.key === 'F1') {
        event.preventDefault()
        navigate('/tables')
      }
      if (event.key === 'F3') {
        event.preventDefault()
        tableSelectRef.current?.focus()
      }
      if (event.key === 'F4' || event.key === 'Enter') {
        if (payingOrder) {
          const inlineCashDeficit = selectedMethod === 'CASH'
            ? Math.max(0, Math.round(payingOrder.totalAmount - Number(cashReceived || '0')))
            : 0
          if (event.key === 'Enter' && !(selectedMethod === 'CASH' && inlineCashDeficit > 0) && !processingPayment) {
            event.preventDefault()
            void confirmPayment()
          }
          return
        }
        const openOrder = orders.find((order) => order.status === 'READY')
        if (!openOrder) return
        event.preventDefault()
        setCreatedPayment(null)
        setPayingOrder(openOrder)
        setSelectedMethod('CASH')
        setCashReceived(String(openOrder.totalAmount))
        setAutoPrintInvoiceAfterPaid(true)
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        setDetailOrder(null)
        setEditingOrder(null)
        setPayingOrder(null)
        lastPrintedPaymentRef.current = null
        setSepayExpiresAt(null)
        setSepaySecondsLeft(0)
        setSepayExpiredNotified(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [navigate, orders, payingOrder, selectedMethod, cashReceived, processingPayment])

  useEffect(() => {
    const socket = getSocket()

    const joinStaffRoom = () => {
      socket.emit('join-staff', {
        branchId: selectedBranchId || undefined,
        staffId: user?.id,
        staffName: user?.name,
      })
    }

    const onConnect = () => {
      joinStaffRoom()
      const lastReceivedAt = typeof window !== 'undefined' ? localStorage.getItem(notifSyncKey) || undefined : undefined
      socket.emit('sync-notifications', {
        branchId: selectedBranchId || user?.branchId,
        lastReceivedAt,
        limit: 100,
      })
    }

    const onStaffNotification = (payload: StaffNotificationPayload) => {
      if (payload.branchId && selectedBranchId && payload.branchId !== selectedBranchId) {
        return
      }
      if (alreadyHandledRealtime(payload.id)) {
        return
      }
      if (
        payload.type === 'KDS_ORDER_READY' ||
        payload.type === 'ORDER_NEW' ||
        payload.type === 'KDS_ITEM_STATUS' ||
        payload.type === 'CART_UPDATED'
      ) {
        showRealtimeNotification(
          payload.title,
          payload.message,
          payload.type === 'ORDER_NEW'
            ? 'NEW_ORDER'
            : payload.type === 'CART_UPDATED'
              ? 'CART_UPDATED'
              : 'ITEM_READY',
        )
        if (typeof window !== 'undefined' && payload.createdAt) {
          localStorage.setItem(notifSyncKey, payload.createdAt)
        }
        void loadData()
      }
    }

    const onNotificationBatch = (batch: StaffNotificationPayload[]) => {
      if (!Array.isArray(batch) || batch.length === 0) return
      const latest = batch.at(-1)?.createdAt
      if (typeof window !== 'undefined' && latest) {
        localStorage.setItem(notifSyncKey, latest)
      }
      const hasOrderRelated = batch.some(
        (item) => item?.type === 'KDS_ORDER_READY' || item?.type === 'ORDER_NEW' || item?.type === 'KDS_ITEM_STATUS',
      )
      if (hasOrderRelated) {
        void loadData()
      }
    }

    const onOrderItemReady = (payload?: Partial<StaffNotificationPayload>) => {
      if (payload?.branchId && selectedBranchId && payload.branchId !== selectedBranchId) {
        return
      }
      const type = String(payload?.type || '').toUpperCase()
      if (!alreadyHandledRealtime(payload?.id) && (type === 'KDS_ORDER_READY' || type === 'ORDER_NEW' || type === 'KDS_ITEM_STATUS' || type === 'CART_UPDATED')) {
        showRealtimeNotification(
          String(payload?.title || 'Thông báo'),
          String(payload?.message || 'Có cập nhật mới'),
          type === 'ORDER_NEW'
            ? 'NEW_ORDER'
            : type === 'CART_UPDATED'
              ? 'CART_UPDATED'
              : 'ITEM_READY',
        )
        if (typeof window !== 'undefined' && payload?.createdAt) {
          localStorage.setItem(notifSyncKey, payload.createdAt)
        }
      }
      void loadData()
    }

    const onTableStatusChanged = () => {
      void loadData()
    }

    const onPaymentConfirmed = () => {
      void loadData()
      void loadPaymentHistory()
    }

    const onMenuUpdated = () => {
      clearPosMenuCache(selectedBranchId || undefined)
      toast.success('Menu vừa được cập nhật')
      void loadData()
    }

    socket.on('connect', onConnect)
    socket.on('staff-notification', onStaffNotification)
    socket.on('notification-batch', onNotificationBatch)
    socket.on('order-item-ready', onOrderItemReady)
    socket.on('table-status-changed', onTableStatusChanged)
    socket.on('payment-confirmed', onPaymentConfirmed)
    socket.on('menu-updated', onMenuUpdated)

    if (!socket.connected) {
      socket.connect()
    } else {
      onConnect()
    }

    return () => {
      socket.off('connect', onConnect)
      socket.off('staff-notification', onStaffNotification)
      socket.off('notification-batch', onNotificationBatch)
      socket.off('order-item-ready', onOrderItemReady)
      socket.off('table-status-changed', onTableStatusChanged)
      socket.off('payment-confirmed', onPaymentConfirmed)
      socket.off('menu-updated', onMenuUpdated)
      disconnectSocket()
    }
  }, [dateFrom, dateTo, filterTableId, notifSyncKey, selectedBranchId, selectedStatus, user?.branchId, user?.id, user?.name])

  const syncOfflineQueue = async () => {
    const currentQueue = await readPosOfflineQueue<OfflineOrderQueueItem>(selectedBranchId || undefined)
    if (!currentQueue.length) return

    setSyncingOfflineQueue(true)
    let successCount = 0
    let nextQueue = [...currentQueue]

    for (const item of currentQueue) {
      try {
        await api.post('/orders', {
          tableId: item.tableId,
          customerName: item.customerName,
          items: item.items,
        })
        nextQueue = nextQueue.filter((queued) => queued.localId !== item.localId)
        await writePosOfflineQueue(selectedBranchId || undefined, nextQueue)
        successCount += 1
      } catch (error: any) {
        const message = String(error?.response?.data?.message || '')
        const isNetworkFailure = !error?.response
        if (isNetworkFailure) {
          break
        }
        if (message) {
          toast.error(`Queue #${item.localId.slice(-6)} lỗi: ${message}`)
        }
        nextQueue = nextQueue.filter((queued) => queued.localId !== item.localId)
        await writePosOfflineQueue(selectedBranchId || undefined, nextQueue)
      }
    }

    setOfflineQueue(nextQueue)
    if (successCount > 0) {
      toast.success(`Đã đồng bộ ${successCount} đơn offline`)
      await loadData()
    }
    setSyncingOfflineQueue(false)
  }

  useEffect(() => {
    const onOnline = () => {
      setIsOnline(true)
      void syncOfflineQueue()
    }
    const onOffline = () => {
      setIsOnline(false)
    }
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [selectedBranchId])

  const increase = (menuItemId: string) => {
    const item = menuItems.find((entry) => entry.id === menuItemId)
    if (!item) return
    const customGroups = extractCustomizations(item)
    if (customGroups.length > 0) {
      const sizeGroup = customGroups.find((group) => group.type === 'single')
      setCustomizingItem(item)
      setCustomSize(String(sizeGroup?.options?.[0]?.value || ''))
      setCustomToppings([])
      setCustomNote('')
      return
    }
    pushCartHistory({ ...cart })
    setCart((prev) => ({ ...prev, [menuItemId]: (prev[menuItemId] || 0) + 1 }))
  }

  const decrease = (menuItemId: string) => {
    pushCartHistory({ ...cart })
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

  const customCartTotal = useMemo(
    () =>
      customCartLines.reduce((sum, line) => {
        const basePrice = Number(menuItems.find((entry) => entry.id === line.menuItemId)?.price || 0)
        const sizeExtra = Number(line.selectedOptions.size?.priceModifier || 0)
        const toppingsExtra = Array.isArray(line.selectedOptions.toppings)
          ? line.selectedOptions.toppings.reduce((acc, item) => acc + Number(item.priceModifier || 0), 0)
          : 0
        return sum + (basePrice + sizeExtra + toppingsExtra) * line.quantity
      }, 0),
    [customCartLines, menuItems],
  )

  const applyCustomization = () => {
    if (!customizingItem) return
    const groups = extractCustomizations(customizingItem)
    const sizeGroup = groups.find((group) => group.type === 'single')
    const toppingGroup = groups.find((group) => group.type === 'multi')
    const size = sizeGroup?.options?.find((option) => option.value === customSize)
    const toppings = (toppingGroup?.options || []).filter((option) => customToppings.includes(option.value))
    const selectedOptions: StaffSelectedOptions = {
      ...(size ? { size: { name: size.label, priceModifier: Number(size.priceDelta || 0) } } : {}),
      ...(toppings.length
        ? {
            toppings: toppings.map((item) => ({
              name: item.label,
              priceModifier: Number(item.priceDelta || 0),
            })),
          }
        : {}),
      ...(customNote.trim() ? { note: customNote.trim() } : {}),
    }

    const key = JSON.stringify({ menuItemId: customizingItem.id, selectedOptions })
    setCustomCartLines((prev) => {
      const existingIndex = prev.findIndex(
        (line) =>
          JSON.stringify({
            menuItemId: line.menuItemId,
            selectedOptions: line.selectedOptions,
          }) === key,
      )
      if (existingIndex >= 0) {
        return prev.map((line, index) => (index === existingIndex ? { ...line, quantity: line.quantity + 1 } : line))
      }
      return [
        ...prev,
        {
          localId: `custom_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          menuItemId: customizingItem.id,
          menuItemName: customizingItem.name,
          quantity: 1,
          selectedOptions,
        },
      ]
    })
    setCustomizingItem(null)
  }

  const createOrder = async (e: FormEvent) => {
    e.preventDefault()
    if (!selectedTableId) {
      toast.error(tv('Chưa chọn bàn', 'No table selected'))
      return
    }
    const baseItems = Object.entries(cart).map(([menuItemId, quantity]) => ({
      menuItemId,
      quantity,
    }))
    const customItems = customCartLines.map((line) => ({
      menuItemId: line.menuItemId,
      quantity: line.quantity,
      note: line.selectedOptions.note,
      selectedOptions: line.selectedOptions,
    }))
    const items = [...baseItems, ...customItems]
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
      setCustomCartLines([])
      toast.success(tv('Tạo đơn thành công', 'Order created successfully'))
      await loadData()
    } catch (error: any) {
      const isNetworkFailure = !error?.response || !navigator.onLine
      if (isNetworkFailure) {
        const queuedItem: OfflineOrderQueueItem = {
          localId: `q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          createdAt: new Date().toISOString(),
          syncStatus: 'PENDING_SYNC',
          branchId: selectedBranchId || undefined,
          tableId: selectedTableId,
          customerName: 'Khách tại quầy',
          items,
        }
        const existingQueue = await readPosOfflineQueue<OfflineOrderQueueItem>(selectedBranchId || undefined)
        const nextQueue = [...existingQueue, queuedItem]
        await writePosOfflineQueue(selectedBranchId || undefined, nextQueue)
        setOfflineQueue(nextQueue)
        setCart({})
        setCustomCartLines([])
        toast.success('Mất mạng: đã đưa đơn vào offline queue, sẽ tự đồng bộ khi có mạng')
      } else {
        toast.error(error.response?.data?.message || tv('Tạo đơn thất bại', 'Failed to create order'))
      }
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
    setShowAddItemPicker(false)
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
      setShowAddItemPicker(false)
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
      if (payment.provider === 'SEPAY') {
        setSepayExpiresAt(String(payment.expiresAt || new Date(Date.now() + 5 * 60 * 1000).toISOString()))
        setSepayExpiredNotified(false)
      }
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
          branchId: selectedBranchId || undefined,
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
        lastPrintedPaymentRef.current = null
        setSepayExpiresAt(null)
        setSepaySecondsLeft(0)
        setSepayExpiredNotified(false)
      } else {
        if (!existingPayment) {
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
          if (existing.provider === 'SEPAY') {
            setSepayExpiresAt(String(existing.expiresAt || new Date(Date.now() + 5 * 60 * 1000).toISOString()))
            setSepayExpiredNotified(false)
          }
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

  useEffect(() => {
    if (!payingOrder || !createdPayment || !sepayExpiresAt) return
    if (createdPayment.orderId !== payingOrder.id) return
    if (createdPayment.provider !== 'SEPAY') return
    if (!['PENDING', 'WAITING_TRANSFER'].includes(createdPayment.status)) return

    const tick = () => {
      const left = Math.max(0, Math.floor((new Date(sepayExpiresAt).getTime() - Date.now()) / 1000))
      setSepaySecondsLeft(left)
      if (left === 0 && !sepayExpiredNotified) {
        setSepayExpiredNotified(true)
        toast.error('Chưa nhận được xác nhận - kiểm tra lại ngân hàng')
      }
    }

    tick()
    const intervalId = window.setInterval(tick, 1000)
    return () => window.clearInterval(intervalId)
  }, [createdPayment?.orderId, createdPayment?.provider, createdPayment?.status, payingOrder?.id, sepayExpiresAt, sepayExpiredNotified])

  useEffect(() => {
    if (!payingOrder || !createdPayment) return
    if (createdPayment.orderId !== payingOrder.id) return
    if (createdPayment.status !== 'PAID') return

    if (autoPrintInvoiceAfterPaid && lastPrintedPaymentRef.current !== createdPayment.paymentId) {
      printInvoice(payingOrder, createdPayment)
      lastPrintedPaymentRef.current = createdPayment.paymentId
    }

    toast.success(tv('Thanh toán thành công', 'Payment completed'))
    const timeoutId = window.setTimeout(() => {
      setPayingOrder(null)
      setCreatedPayment(null)
      lastPrintedPaymentRef.current = null
      setSepayExpiresAt(null)
      setSepaySecondsLeft(0)
      setSepayExpiredNotified(false)
      void loadPaymentHistory()
    }, 1200)

    return () => window.clearTimeout(timeoutId)
  }, [createdPayment?.orderId, createdPayment?.status, createdPayment?.paymentId, payingOrder?.id, tv, autoPrintInvoiceAfterPaid])

  const toggleHistoryRow = async (payment: PaymentApi) => {
    const key = payment.paymentId
    const isExpanded = !!expandedHistoryRows[key]
    setExpandedHistoryRows((prev) => ({ ...prev, [key]: !isExpanded }))
    if (isExpanded || historyOrderDetails[payment.orderId]) return

    try {
      const { data } = await api.get<OrderApi>(`/orders/${payment.orderId}`)
      setHistoryOrderDetails((prev) => ({ ...prev, [payment.orderId]: data }))
    } catch {
      // ignore fetch errors to keep history usable
    }
  }

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
    return item.menuItemName || menu?.name || fallbackOrderItemName(item.menuItemId)
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
        if (item) return sum + item.price * qty
        const fallbackOrderItem = editingOrder?.orderItems.find((oi) => oi.menuItemId === id)
        const fallbackPrice = Number(fallbackOrderItem?.price || 0)
        return sum + fallbackPrice * qty
      }, 0),
    [editCart, menuItems, editingOrder],
  )

  const editMenuCandidates = useMemo(() => {
    const byId = new Map<string, MenuItemApi>()
    for (const item of menuItems) {
      byId.set(item.id, item)
    }
    for (const orderItem of editingOrder?.orderItems || []) {
      if (byId.has(orderItem.menuItemId)) continue
      byId.set(orderItem.menuItemId, {
        id: orderItem.menuItemId,
        name: orderItem.menuItemName || orderItem.menuItemId,
        price: Number(orderItem.price || 0),
        available: true,
      })
    }
    return Array.from(byId.values())
  }, [menuItems, editingOrder])

  const currentEditItems = useMemo(
    () => editMenuCandidates.filter((item) => (editCart[item.id] || 0) > 0),
    [editMenuCandidates, editCart],
  )

  const addableEditItems = useMemo(
    () => editMenuCandidates.filter((item) => item.available !== false && !editCart[item.id]),
    [editMenuCandidates, editCart],
  )

  const cashChange = useMemo(() => {
    if (!payingOrder || selectedMethod !== 'CASH') return 0
    const paid = Math.round(Number(cashReceived || '0'))
    if (!Number.isFinite(paid)) return 0
    return Math.max(paid - payingOrder.totalAmount, 0)
  }, [cashReceived, payingOrder, selectedMethod])
  const cashDeficit = useMemo(() => {
    if (!payingOrder || selectedMethod !== 'CASH') return 0
    const paid = Math.round(Number(cashReceived || '0'))
    if (!Number.isFinite(paid)) return payingOrder.totalAmount
    return Math.max(payingOrder.totalAmount - paid, 0)
  }, [cashReceived, payingOrder, selectedMethod])

  const lockedProvider = payingOrder && createdPayment?.orderId === payingOrder.id ? createdPayment.provider : null
  const posBoardOrders = useMemo(() => ({
    pending: orders.filter((order) => order.status === 'PENDING'),
    working: orders.filter((order) => ['CONFIRMED', 'PREPARING', 'READY'].includes(order.status)),
    completed: orders.filter((order) => order.status === 'COMPLETED'),
  }), [orders])

  const paymentByOrderId = useMemo(() => {
    const byOrderId: Record<string, PaymentApi> = {}
    for (const payment of paymentHistory) {
      if (!payment?.orderId) continue
      const current = byOrderId[payment.orderId]
      const paymentTime = new Date(payment.paidAt || payment.updatedAt || payment.createdAt || 0).getTime()
      const currentTime = current ? new Date(current.paidAt || current.updatedAt || current.createdAt || 0).getTime() : 0
      if (!current || paymentTime >= currentTime) {
        byOrderId[payment.orderId] = payment
      }
    }
    return byOrderId
  }, [paymentHistory])

  const boardColumns: Array<{
    key: PosBoardColumnKey
    title: string
    icon: string
    orders: OrderApi[]
    accent: string
  }> = useMemo(
    () => [
      {
        key: 'PENDING',
        title: 'Chờ xác nhận',
        icon: '📋',
        orders: posBoardOrders.pending,
        accent: 'border-amber-300 bg-amber-50/70',
      },
      {
        key: 'WORKING',
        title: 'Đang làm',
        icon: '🔧',
        orders: posBoardOrders.working,
        accent: 'border-sky-300 bg-sky-50/70',
      },
      {
        key: 'COMPLETED',
        title: 'Hoàn thành',
        icon: '✅',
        orders: posBoardOrders.completed,
        accent: 'border-emerald-300 bg-emerald-50/70',
      },
    ],
    [posBoardOrders.completed, posBoardOrders.pending, posBoardOrders.working],
  )

  const quickItems = useMemo(() => menuItems.filter((item) => item.available).slice(0, 8), [menuItems])

  const getOrderAgeMinutes = (createdAt: string) => {
    const created = new Date(createdAt).getTime()
    if (!Number.isFinite(created) || created <= 0) return 0
    return Math.max(0, Math.floor((boardNow - created) / 60_000))
  }

  const getOrderTone = (order: OrderApi): PosBoardTone => {
    if (order.status === 'COMPLETED') return 'neutral'
    const age = getOrderAgeMinutes(order.createdAt)
    if (age >= 10) return 'danger'
    if (age >= 5) return 'warning'
    return 'neutral'
  }

  const openPaymentDialog = (order: OrderApi) => {
    setCreatedPayment(null)
    setPayingOrder(order)
    setSelectedMethod('CASH')
    setCashReceived(String(order.totalAmount))
    setAutoPrintInvoiceAfterPaid(true)
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="sticky top-16 z-20 overflow-hidden rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-100 via-orange-50 to-amber-100">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
          <div>
            <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">{tv('Coffee Shop POS', 'Coffee Shop POS')}</h1>
            <p className="text-sm text-slate-600">
              {tv('Chi nhánh', 'Branch')}: {selectedBranchId || tv('Toàn hệ thống', 'All branches')}
              {' · '}
              {tv('Vai trò', 'Role')}: {normalizedRole || 'N/A'}
            </p>
          </div>
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Kanban POS v2.0</p>
        </div>
      </div>

      <Card className="border border-amber-200/80 bg-amber-50/70">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-full bg-amber-200 px-2 py-1 text-xs font-semibold text-amber-800">Offline Queue</span>
          <span className={`rounded-full px-2 py-1 text-xs font-medium ${isOnline ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
            {isOnline ? 'Online' : 'Offline'}
          </span>
          <span>{offlineQueue.length} đơn đang chờ đồng bộ</span>
          <Button size="sm" variant="secondary" onClick={() => void syncOfflineQueue()} loading={syncingOfflineQueue} disabled={!offlineQueue.length}>
            Đồng bộ ngay
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              void writePosOfflineQueue(selectedBranchId || undefined, [])
              setOfflineQueue([])
              toast.success('Đã xóa offline queue')
            }}
            disabled={!offlineQueue.length}
          >
            Xóa queue
          </Button>
        </div>
        {offlineQueue.length > 0 && (
          <div className="mt-3 max-h-32 space-y-2 overflow-y-auto rounded-xl border border-amber-200/70 bg-white/80 p-2 text-xs">
            {offlineQueue.map((item) => {
              const table = tables.find((t) => t.id === item.tableId)
              const quantity = item.items.reduce((sum, i) => sum + Number(i.quantity || 0), 0)
              return (
                <div key={item.localId} className="rounded-lg border border-amber-100 bg-white px-2 py-1.5">
                  <p className="font-semibold">#{item.localId.slice(-6)} · Bàn {table?.number ?? item.tableId}</p>
                  <p>{quantity} món · {formatDateTimeFull(item.createdAt)}</p>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      <Card className="sticky top-[8.8rem] z-10" title={tv('Bộ lọc đơn hàng', 'Order filters')} subtitle="S-08">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
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
          <Button variant="secondary" className="w-full xl:w-auto" onClick={() => { clearPosMenuCache(selectedBranchId || undefined); void loadData() }}>
            Refresh menu cache
          </Button>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,2.6fr)_minmax(320px,1fr)]">
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2 md:hidden">
            {boardColumns.map((column) => (
              <button
                key={column.key}
                type="button"
                className={`rounded-xl border px-2 py-2 text-xs font-semibold ${
                  mobileBoardColumn === column.key ? 'border-amber-400 bg-amber-100 text-amber-900' : 'border-amber-200 bg-white text-slate-600'
                }`}
                onClick={() => setMobileBoardColumn(column.key)}
              >
                {column.icon} {column.orders.length}
              </button>
            ))}
          </div>

          {loading && <RoutePageSkeleton kind="table" />}
          {!loading && orders.length === 0 && (
            <Card>
              <p className="text-sm text-slate-500">{tv('Không có đơn phù hợp với bộ lọc hiện tại.', 'No orders match the current filters.')}</p>
            </Card>
          )}

          {!loading && orders.length > 0 && (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
              {boardColumns.map((column) => {
                const hiddenOnMobile = mobileBoardColumn !== column.key ? 'hidden md:flex' : 'flex'
                return (
                  <div key={column.key} className={`${hiddenOnMobile} min-h-[520px] flex-col rounded-2xl border border-slate-200 bg-white/90 p-3 shadow-sm`}>
                    <div className={`mb-3 flex items-center justify-between rounded-xl border px-3 py-2 ${column.accent}`}>
                      <p className="text-sm font-bold uppercase tracking-wide text-slate-700">
                        {column.icon} {column.title}
                      </p>
                      <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-slate-700">{column.orders.length}</span>
                    </div>

                    <div className="flex-1 space-y-2 overflow-y-auto pr-1">
                      {column.orders.length === 0 && (
                        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 p-3 text-center text-xs text-slate-500">
                          Chưa có đơn trong cột này.
                        </div>
                      )}

                      {column.orders.map((order) => {
                        const tone = getOrderTone(order)
                        const ageMinutes = getOrderAgeMinutes(order.createdAt)
                        const payment = paymentByOrderId[order.id]
                        const itemCount = order.orderItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0)
                        const toneClass = tone === 'danger'
                          ? 'border-red-300 bg-red-50/90'
                          : tone === 'warning'
                            ? 'border-amber-300 bg-amber-50/90'
                            : order.status === 'COMPLETED'
                              ? 'border-emerald-200 bg-emerald-50/70'
                              : order.status === 'PENDING'
                                ? 'border-amber-200 bg-amber-50/60'
                                : 'border-sky-200 bg-sky-50/60'

                        return (
                          <article key={order.id} className={`rounded-2xl border p-3 ${toneClass}`}>
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="font-semibold text-slate-900" title={order.id}>
                                  {order.status === 'COMPLETED' ? '✅' : order.status === 'PENDING' ? '🟡' : '🔵'} ĐH-{maDonHangNgan(order.id)}
                                </p>
                                <p className="text-xs text-slate-600">
                                  {orderTableLabel(order)} · {formatDateTimeFull(order.createdAt)}
                                </p>
                              </div>
                              <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                                {trangThaiDonHang(order.status)}
                              </span>
                            </div>

                            {order.status !== 'COMPLETED' && (
                              <p className={`mt-2 text-xs ${tone === 'danger' ? 'font-semibold text-red-700' : tone === 'warning' ? 'text-amber-700' : 'text-slate-500'}`}>
                                ⏱ Đã chờ: {ageMinutes} phút
                              </p>
                            )}

                            <div className="mt-2 space-y-1 text-sm">
                              {order.orderItems.slice(0, 3).map((item) => (
                                <div key={item.id} className="flex items-start justify-between gap-2">
                                  <span>{item.quantity}x {orderItemLabel(item)}</span>
                                  <span>{(item.quantity * item.price).toLocaleString()}đ</span>
                                </div>
                              ))}
                              {order.orderItems.length > 3 && (
                                <p className="text-xs text-slate-500">+{order.orderItems.length - 3} món khác</p>
                              )}
                              {(order.discountAmount || 0) > 0 && (
                                <div className="flex items-center justify-between rounded-lg bg-emerald-100 px-2 py-1 text-xs text-emerald-700">
                                  <span>🎁 Khuyến mãi {order.promotionCode ? `(${order.promotionCode})` : ''}</span>
                                  <span>-{Number(order.discountAmount || 0).toLocaleString()}đ</span>
                                </div>
                              )}
                            </div>

                            <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-2">
                              <div>
                                <p className="text-xs text-slate-500">{itemCount} món</p>
                                <p className="font-bold text-amber-700">{Number(order.totalAmount || 0).toLocaleString()}đ</p>
                              </div>
                              {order.status === 'COMPLETED' && (
                                <p className="text-right text-[11px] text-slate-500">
                                  {payment ? `✓ ${phuongThucThanhToan(payment.provider)}` : 'Đã hoàn thành'}
                                </p>
                              )}
                            </div>

                            <div className="mt-2 flex flex-wrap justify-end gap-2">
                              {order.status === 'PENDING' && (
                                <>
                                  <Button size="sm" variant="secondary" onClick={() => (canManagePosAdvanced ? openEditOrder(order) : setDetailOrder(order))}>
                                    {canManagePosAdvanced ? 'Sửa món' : 'Chi tiết'}
                                  </Button>
                                  <Button
                                    size="sm"
                                    className={tone === 'danger' ? 'bg-red-600 text-white hover:bg-red-700' : ''}
                                    onClick={() => updateOrderStatus(order.id, 'CONFIRMED')}
                                  >
                                    {tone === 'danger' ? 'Xác nhận ngay' : 'Xác nhận'}
                                  </Button>
                                </>
                              )}

                              {(order.status === 'CONFIRMED' || order.status === 'PREPARING') && (
                                <>
                                  <Button size="sm" variant="secondary" onClick={() => setDetailOrder(order)}>
                                    Chi tiết
                                  </Button>
                                  {canManagePosAdvanced && (
                                    <Button size="sm" onClick={() => updateOrderStatus(order.id, 'READY')}>
                                      Sẵn sàng
                                    </Button>
                                  )}
                                </>
                              )}

                              {order.status === 'READY' && (
                                <>
                                  <Button size="sm" variant="secondary" onClick={() => setDetailOrder(order)}>
                                    Chi tiết
                                  </Button>
                                  <Button size="sm" onClick={() => openPaymentDialog(order)}>
                                    Thanh toán
                                  </Button>
                                </>
                              )}

                              {order.status === 'COMPLETED' && (
                                <Button size="sm" variant="secondary" onClick={() => setDetailOrder(order)}>
                                  Chi tiết
                                </Button>
                              )}
                            </div>
                          </article>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <Card title="➕ Tạo đơn nhanh" subtitle="S-07">
            <form onSubmit={createOrder} className="space-y-3">
              <select
                ref={tableSelectRef}
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

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Món gợi ý</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {quickItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="rounded-xl border border-amber-100 bg-amber-50/60 px-3 py-2 text-left transition hover:border-amber-300 hover:bg-amber-100/70"
                      onClick={() => increase(item.id)}
                    >
                      <p className="text-sm font-semibold text-slate-800">{item.name}</p>
                      <p className="text-xs text-slate-500">{item.price.toLocaleString()}đ</p>
                      <p className="mt-1 text-xs font-semibold text-amber-700">+ Thêm</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="max-h-56 space-y-2 overflow-y-auto rounded-xl border border-amber-100 p-2">
                {menuItems.filter((item) => item.available).map((item) => (
                  <div key={item.id} className="flex items-center justify-between rounded-lg bg-white/80 px-2 py-1.5 text-sm">
                    <div>
                      <p className="font-medium">{item.name}</p>
                      <p className="text-xs text-slate-500">{item.price.toLocaleString()}đ</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="inline-flex h-8 min-w-8 items-center justify-center rounded-lg border border-amber-200 px-2"
                        onClick={() => decrease(item.id)}
                      >
                        -
                      </button>
                      <span className="min-w-4 text-center">{cart[item.id] || 0}</span>
                      <button
                        type="button"
                        className="inline-flex h-8 min-w-8 items-center justify-center rounded-lg border border-amber-200 px-2"
                        onClick={() => increase(item.id)}
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {customCartLines.length > 0 && (
                <div className="rounded-xl border border-amber-100 p-2 text-xs">
                  <p className="mb-1 font-semibold">Món đã tùy chỉnh</p>
                  <div className="space-y-1">
                    {customCartLines.map((line) => (
                      <div key={line.localId} className="flex items-start justify-between gap-2">
                        <div>
                          <p>{line.quantity}x {line.menuItemName}</p>
                          <p className="text-slate-500">
                            {line.selectedOptions.size?.name ? `Size ${line.selectedOptions.size.name}. ` : ''}
                            {Array.isArray(line.selectedOptions.toppings) && line.selectedOptions.toppings.length > 0
                              ? `Topping: ${line.selectedOptions.toppings.map((item) => item.name).join(', ')}. `
                              : ''}
                            {line.selectedOptions.note ? `Ghi chú: ${line.selectedOptions.note}` : ''}
                          </p>
                        </div>
                        <button
                          type="button"
                          className="rounded border border-amber-200 px-2 py-1"
                          onClick={() => setCustomCartLines((prev) => prev.filter((entry) => entry.localId !== line.localId))}
                        >
                          Xóa
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between border-t pt-2">
                <span className="font-semibold">Tổng cộng</span>
                <span className="font-bold text-amber-700">{(cartTotal + customCartTotal).toLocaleString()}đ</span>
              </div>

              <Button type="submit" className="w-full" loading={creating}>
                {tv('Tạo đơn cho bàn', 'Create order')}
              </Button>
            </form>
          </Card>

          <Card title="🧾 Lịch sử thanh toán gần đây" subtitle="Dành cho nhân viên">
            {loadingPaymentHistory && <p className="text-sm text-slate-500">Đang tải lịch sử...</p>}
            {!loadingPaymentHistory && paymentHistory.length === 0 && (
              <p className="text-sm text-slate-500">Chưa có giao dịch thanh toán.</p>
            )}
            {!loadingPaymentHistory && paymentHistory.length > 0 && (
              <div className="space-y-2">
                {paymentHistory.slice(0, 8).map((payment) => {
                  const order = historyOrderDetails[payment.orderId]
                  const expanded = !!expandedHistoryRows[payment.paymentId]
                  return (
                    <div key={payment.paymentId} className="rounded-xl border border-amber-100 p-2.5 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="font-semibold" title={payment.paymentId}>
                            {maDonHangNgan(payment.orderId)} · {phuongThucThanhToan(payment.provider)}
                          </p>
                          <p className="text-xs text-slate-500">
                            {payment.paidAt ? new Date(payment.paidAt).toLocaleString() : '-'} · {trangThaiThanhToan(payment.status)}
                          </p>
                        </div>
                        <p className="font-semibold text-amber-700">{Number(payment.amount || 0).toLocaleString()}đ</p>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        Bàn: {payment.tableId ? tableLabel(payment.tableId) : 'Không xác định'} · {payment.paidBy || payment.customerName || 'Khách hàng'}
                      </p>
                      <button
                        type="button"
                        className="mt-2 rounded border px-2 py-1 text-xs"
                        onClick={() => void toggleHistoryRow(payment)}
                      >
                        {expanded ? 'Ẩn chi tiết đơn' : 'Xem chi tiết đơn'}
                      </button>
                      {expanded && order && (
                        <div className="mt-2 rounded bg-slate-50 p-2 text-xs">
                          {order.orderItems.map((item) => (
                            <div key={item.id} className="flex justify-between gap-2">
                              <span>{item.quantity}x {orderItemLabel(item)}</span>
                              <span>{(item.quantity * item.price).toLocaleString()}đ</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </Card>
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
                    selectedMethod === method ? 'border-amber-500 bg-amber-50' : 'border-amber-100'
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
                {cashDeficit > 0 && (
                  <p className="text-red-600">
                    Thiếu: <span className="font-semibold">{cashDeficit.toLocaleString()}đ</span>
                  </p>
                )}
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
                {createdPayment.provider === 'SEPAY' && createdPayment.vietQr?.qrImageUrl && (
                  <div className="mt-2 rounded border border-amber-200 bg-white p-2">
                    <p className="mb-2 text-xs text-slate-600">Khách quét mã QR để chuyển khoản</p>
                    <img
                      src={createdPayment.vietQr.qrImageUrl}
                      alt="SePay QR"
                      className="mx-auto h-44 w-44 rounded border border-slate-200 object-contain"
                    />
                    {(createdPayment.vietQr.transferContent || createdPayment.transferContent) && (
                      <p className="mt-2 text-xs text-slate-600">
                        Nội dung CK:{' '}
                        <span className="font-semibold">{createdPayment.vietQr.transferContent || createdPayment.transferContent}</span>
                      </p>
                    )}
                    <p className="mt-1 text-xs text-amber-700">
                      Chờ xác nhận: <span className="font-semibold">{Math.floor(sepaySecondsLeft / 60)}:{String(sepaySecondsLeft % 60).padStart(2, '0')}</span>
                    </p>
                    {sepaySecondsLeft === 0 && (
                      <p className="mt-1 text-xs text-red-600">Quá thời gian chờ xác nhận. Vui lòng kiểm tra lại ngân hàng.</p>
                    )}
                  </div>
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

            <div className="mt-3 space-y-2">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={autoPrintInvoiceAfterPaid}
                  onChange={(e) => setAutoPrintInvoiceAfterPaid(e.target.checked)}
                />
                In hóa đơn sau khi thanh toán thành công
              </label>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() => printOrderSlip(payingOrder)}
                >
                  In order
                </Button>
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() => printInvoice(payingOrder, createdPayment)}
                >
                  In trước
                </Button>
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => {
                  setPayingOrder(null)
                  setCreatedPayment(null)
                  lastPrintedPaymentRef.current = null
                  setSepayExpiresAt(null)
                  setSepaySecondsLeft(0)
                  setSepayExpiredNotified(false)
                }}
              >
                Hủy
              </Button>
              <Button
                className="flex-1"
                loading={processingPayment}
                onClick={confirmPayment}
                disabled={selectedMethod === 'CASH' && cashDeficit > 0}
              >
                {selectedMethod === 'CASH'
                  ? 'Xác nhận thu tiền mặt'
                  : createdPayment?.orderId === payingOrder.id
                    ? 'Kiểm tra giao dịch thật'
                    : 'Tạo giao dịch online'}
              </Button>
            </div>
            <div className="mt-2 text-xs text-slate-500">
              F1: Sơ đồ bàn | F3: Focus chọn bàn | F4/Enter: Mở thanh toán đơn READY | Tab: Đổi phương thức | F5/Ctrl+P: In | Ctrl+Z: Undo giỏ | Esc: Đóng
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
              <p>Tạo lúc: {formatDateTimeFull(detailOrder.createdAt)}</p>
              {detailOrder.status === 'COMPLETED' && (
                <p>Hoàn thành lúc: {formatDateTimeFull(detailOrder.updatedAt)}</p>
              )}
            </div>

            <div className="mt-4 max-h-72 space-y-2 overflow-y-auto rounded-xl border border-amber-100 p-2 text-sm">
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

      {customizingItem && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 sm:items-center sm:p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 dark:bg-slate-900">
            <p className="text-lg font-bold">Tùy chỉnh món: {customizingItem.name}</p>
            {extractCustomizations(customizingItem).map((group) => (
              <div key={group.id} className="mt-3">
                <p className="mb-1 text-sm font-semibold">{group.label}</p>
                {group.type === 'single' ? (
                  <select className={selectClass} value={customSize} onChange={(e) => setCustomSize(e.target.value)}>
                    {(group.options || []).map((option) => (
                      <option key={`${group.id}-${option.value}`} value={option.value}>
                        {option.label}{option.priceDelta ? ` (+${Number(option.priceDelta).toLocaleString()}đ)` : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="space-y-1 text-sm">
                    {(group.options || []).map((option) => (
                      <label key={`${group.id}-${option.value}`} className="flex items-center justify-between rounded border border-amber-100 px-2 py-1">
                        <span>{option.label}</span>
                        <span className="flex items-center gap-2">
                          <span className="text-xs text-slate-500">{option.priceDelta ? `+${Number(option.priceDelta).toLocaleString()}đ` : ''}</span>
                          <input
                            type="checkbox"
                            checked={customToppings.includes(option.value)}
                            onChange={(e) =>
                              setCustomToppings((prev) =>
                                e.target.checked ? [...prev, option.value] : prev.filter((item) => item !== option.value),
                              )
                            }
                          />
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            ))}
            <div className="mt-3">
              <p className="mb-1 text-sm font-semibold">Ghi chú</p>
              <input className={selectClass} value={customNote} onChange={(e) => setCustomNote(e.target.value)} placeholder="Ít đá, ít ngọt..." />
            </div>
            <div className="mt-4 flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => setCustomizingItem(null)}>
                Hủy
              </Button>
              <Button className="flex-1" onClick={applyCustomization}>
                Thêm vào giỏ
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

            <div className="mt-3">
              <Button size="sm" variant="secondary" onClick={() => setShowAddItemPicker((prev) => !prev)}>
                {showAddItemPicker ? 'Đóng danh sách thêm món' : 'Thêm món mới vào đơn'}
              </Button>
            </div>

            {showAddItemPicker && (
              <div className="mt-3 max-h-52 space-y-2 overflow-y-auto rounded-xl border border-amber-100 p-2">
                {addableEditItems.length === 0 && (
                  <p className="text-sm text-slate-500">Không còn món khả dụng để thêm.</p>
                )}
                {addableEditItems.map((item) => (
                  <div key={item.id} className="flex items-center justify-between rounded-lg bg-white/80 px-2 py-1.5 text-sm dark:bg-slate-900/40">
                    <div>
                      <p className="font-medium">{item.name}</p>
                      <p className="text-xs text-slate-500">{item.price.toLocaleString()}đ</p>
                    </div>
                    <Button size="sm" onClick={() => updateEditQuantity(item.id, 1)}>
                      Thêm
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 max-h-80 space-y-2 overflow-y-auto rounded-xl border border-amber-100 p-2">
              {currentEditItems.map((item) => (
                  <div key={item.id} className="space-y-2 rounded-xl border border-amber-100 bg-white/80 p-2 text-sm dark:border-slate-700 dark:bg-slate-900/40">
                    <div className="flex items-center justify-between">
                      <div>
                      <p className="font-medium">{item.name}</p>
                      <p className="text-xs text-gray-500">{item.price.toLocaleString()}đ</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button type="button" className="inline-flex h-9 min-w-9 items-center justify-center rounded-lg border border-amber-200 px-2" onClick={() => updateEditQuantity(item.id, -1)}>
                          -
                        </button>
                        <span>{editCart[item.id] || 0}</span>
                        <button type="button" className="inline-flex h-9 min-w-9 items-center justify-center rounded-lg border border-amber-200 px-2" onClick={() => updateEditQuantity(item.id, 1)}>
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
                    setShowAddItemPicker(false)
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
