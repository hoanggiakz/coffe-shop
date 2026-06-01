import { useEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import api from '@/utils/api'
import { showRealtimeNotification } from '@/utils/notifications'
import { useUiStore } from '@/stores/uiStore'
import { useAuthStore } from '@/stores/authStore'
import { useBranchScopeStore } from '@/stores/branchScopeStore'
import { RoutePageSkeleton } from '@/components/ui/PageSkeleton'
import { useI18n } from '@/utils/i18n'
import { maDonHangNgan, trangThaiDonHang } from '@/utils/display'
import { resolveWebsocketBaseUrl } from '@/utils/runtime-endpoints'
import { io, type Socket } from 'socket.io-client'

interface TableApi {
  id: string
  number: number
}

interface MenuItemApi {
  id: string
  name: string
}

interface OrderItemApi {
  id: string
  menuItemId: string
  quantity: number
  status: 'WAITING' | 'PREPARING' | 'DONE' | 'READY'
  note?: string | null
  options?: string | null
}

interface OrderApi {
  id: string
  tableId: string
  status: 'PENDING' | 'CONFIRMED' | 'PREPARING' | 'READY' | 'COMPLETED' | 'CANCELLED'
  createdAt: string
  orderItems: OrderItemApi[]
}

type StaffNotificationType =
  | 'ORDER_NEW'
  | 'CALL_STAFF'
  | 'CHAT_MESSAGE'
  | 'CHAT_OPENED'
  | 'KDS_ITEM_STATUS'
  | 'KDS_ORDER_READY'
  | 'LOW_STOCK'

interface StaffNotificationPayload {
  id: string
  type: StaffNotificationType
  title: string
  message: string
  branchId?: string
}

interface KdsSocketPayload {
  type?: string
  title?: string
  message?: string
  orderId?: string
  itemId?: string
  status?: string
}

type KdsStage = 'WAITING' | 'PREPARING' | 'READY'

const KITCHEN_ORDER_STATUSES = new Set<OrderApi['status']>(['CONFIRMED', 'PREPARING', 'READY'])
const chipButtonClass =
  'inline-flex min-h-10 items-center justify-center rounded-xl border border-amber-200 bg-white/90 px-3 py-1.5 text-sm text-slate-700 transition-colors hover:bg-amber-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700'

function playKitchenOrderSound(enabled: boolean) {
  if (!enabled || typeof window === 'undefined') return
  try {
    const AudioContextCtor =
      (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ||
      (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextCtor) return
    const audioContext = new AudioContextCtor()
    const oscillator = audioContext.createOscillator()
    const gain = audioContext.createGain()

    oscillator.type = 'triangle'
    oscillator.frequency.setValueAtTime(880, audioContext.currentTime)
    oscillator.frequency.exponentialRampToValueAtTime(660, audioContext.currentTime + 0.22)
    gain.gain.setValueAtTime(0.0001, audioContext.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.18, audioContext.currentTime + 0.04)
    gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.24)

    oscillator.connect(gain)
    gain.connect(audioContext.destination)
    oscillator.start()
    oscillator.stop(audioContext.currentTime + 0.25)
    oscillator.onended = () => {
      audioContext.close().catch(() => undefined)
    }
  } catch {
    // ignore audio errors
  }
}

function itemStatusLabel(status: OrderItemApi['status']) {
  if (status === 'WAITING') return 'Chờ làm'
  if (status === 'PREPARING') return 'Đang chuẩn bị'
  return 'Sẵn sàng phục vụ'
}

function normalizeItemStatus(status: string): OrderItemApi['status'] {
  const normalized = String(status || '').trim().toUpperCase()
  if (normalized === 'DONE') return 'READY'
  if (normalized === 'PREPARING' || normalized === 'WAITING' || normalized === 'READY') return normalized
  return 'WAITING'
}

function orderKdsStage(order: OrderApi): KdsStage {
  if (order.status === 'READY') return 'READY'
  const hasPreparing = order.orderItems.some((item) => item.status === 'PREPARING')
  if (order.status === 'PREPARING' || hasPreparing) return 'PREPARING'
  return 'WAITING'
}

function readKitchenSocketToken(fallback?: string | null): string {
  const direct = String(fallback || '').trim()
  if (direct) return direct
  if (typeof window === 'undefined') return ''
  try {
    const raw = sessionStorage.getItem('auth-storage')
    if (!raw) return ''
    const parsed = JSON.parse(raw)
    const firstState = parsed?.state ?? parsed
    const secondState = firstState?.state ?? firstState
    const candidates = [firstState?.token, secondState?.token]
    for (const token of candidates) {
      const normalized = String(token || '').trim()
      if (normalized) return normalized
    }
    return ''
  } catch {
    return ''
  }
}

export default function Kitchen() {
  const { tv } = useI18n()
  const [orders, setOrders] = useState<OrderApi[]>([])
  const [tables, setTables] = useState<TableApi[]>([])
  const [menuItems, setMenuItems] = useState<MenuItemApi[]>([])
  const [loading, setLoading] = useState(true)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [socketConnected, setSocketConnected] = useState(false)
  const soundEnabled = useUiStore((state) => state.soundEnabled)
  const setSoundEnabled = useUiStore((state) => state.setSoundEnabled)
  const currentUser = useAuthStore((state) => state.user)
  const authToken = useAuthStore((state) => state.token)
  const selectedBranchId = useBranchScopeStore((state) => state.selectedBranchId)
  const effectiveBranchId = String(selectedBranchId || currentUser?.branchId || '').trim()
  const wsBaseUrl = resolveWebsocketBaseUrl()
  const kdsSocketRef = useRef<Socket | null>(null)
  const soundEnabledRef = useRef(soundEnabled)

  useEffect(() => {
    soundEnabledRef.current = soundEnabled
  }, [soundEnabled])

  const loadData = async () => {
    try {
      const [ordersRes, tablesRes, menuRes] = await Promise.all([
        api.get('/orders', { params: { branchId: effectiveBranchId || undefined } }),
        api.get('/tables', { params: { branchId: effectiveBranchId || undefined } }),
        api.get('/orders/menu', { params: { branchId: effectiveBranchId || undefined } }),
      ])
      const normalizedOrders: OrderApi[] = (ordersRes.data || [])
        .filter((order: OrderApi) => KITCHEN_ORDER_STATUSES.has(order.status))
        .map((order: OrderApi) => ({
          ...order,
          orderItems: (order.orderItems || []).map((item) => ({
            ...item,
            status: normalizeItemStatus(item.status),
          })),
        }))
        .sort((a: OrderApi, b: OrderApi) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      setOrders(normalizedOrders)
      setTables(tablesRes.data || [])
      setMenuItems(menuRes.data || [])
    } catch (error: any) {
      toast.error(error.response?.data?.message || tv('Không tải được dữ liệu bếp', 'Unable to load kitchen data'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
    return () => undefined
  }, [effectiveBranchId])

  useEffect(() => {
    const token = readKitchenSocketToken(authToken)
    const socket: Socket = io(`${wsBaseUrl}/kds`, {
      transports: ['websocket', 'polling'],
      upgrade: true,
      rememberUpgrade: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
      auth: token ? { token } : undefined,
      query: token ? { access_token: token } : undefined,
    })
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null
    kdsSocketRef.current = socket

    const onConnect = () => {
      setSocketConnected(true)
      socket.emit('join-kds', {
        branchId: effectiveBranchId || undefined,
        stationCode: 'ALL',
        stationId: `${currentUser?.id || 'kds'}-all`,
      })
      socket.emit('sync-request', {})
      heartbeatTimer = setInterval(() => {
        socket.emit('heartbeat', { stationId: `${currentUser?.id || 'kds'}-all`, ts: Date.now() })
      }, 30000)
    }

    const onDisconnect = () => {
      setSocketConnected(false)
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer)
        heartbeatTimer = null
      }
    }
    const onConnectError = (error: Error & { message?: string }) => {
      const message = String(error?.message || '').trim()
      if (/unauthorized|forbidden/i.test(message)) {
        toast.error('KDS không xác thực được phiên đăng nhập. Vui lòng đăng nhập lại.')
        return
      }
      toast.error(`KDS realtime lỗi kết nối: ${message || 'unknown'}`)
    }

    const onRealtimeEvent = (payload: StaffNotificationPayload | KdsSocketPayload) => {
      const type = String(payload?.type || '').toUpperCase()
      if (type === 'ORDER_NEW' || type === 'ORDER_CREATED') {
        showRealtimeNotification(
          String(payload?.title || '') || tv('Có đơn mới', 'New order'),
          String(payload?.message || '') || tv('KDS vừa nhận đơn mới', 'KDS received a new order'),
          'NEW_ORDER',
        )
        playKitchenOrderSound(soundEnabledRef.current)
        loadData()
        return
      }
      if (type === 'KDS_ITEM_STATUS' || type === 'KDS_ORDER_READY') {
        loadData()
        return
      }
      if ((payload as KdsSocketPayload)?.orderId || (payload as KdsSocketPayload)?.itemId || (payload as KdsSocketPayload)?.status) {
        loadData()
      }
    }
    const onSync = () => loadData()
    const onKdsError = (payload?: { message?: string }) => {
      const message = String(payload?.message || '').trim()
      toast.error(message || tv('KDS cập nhật thất bại', 'KDS update failed'))
      void loadData()
    }

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('connect_error', onConnectError)
    socket.on('sync-response', onSync)
    socket.on('new-order', onRealtimeEvent)
    socket.on('order-confirmed', onRealtimeEvent)
    socket.on('item-updated', onRealtimeEvent)
    socket.on('order-status-updated', onRealtimeEvent)
    socket.on('kds:error', onKdsError)

    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('connect_error', onConnectError)
      socket.off('sync-response', onSync)
      socket.off('new-order', onRealtimeEvent)
      socket.off('order-confirmed', onRealtimeEvent)
      socket.off('item-updated', onRealtimeEvent)
      socket.off('order-status-updated', onRealtimeEvent)
      socket.off('kds:error', onKdsError)
      if (heartbeatTimer) clearInterval(heartbeatTimer)
      socket.disconnect()
      if (kdsSocketRef.current === socket) {
        kdsSocketRef.current = null
      }
    }
  }, [currentUser?.id, effectiveBranchId, wsBaseUrl, authToken])

  useEffect(() => {
    if (socketConnected) return
    const intervalId = window.setInterval(() => {
      void loadData()
    }, 5000)
    return () => window.clearInterval(intervalId)
  }, [socketConnected, effectiveBranchId])

  const updateItemStatusFallback = async (orderId: string, itemId: string, status: 'PREPARING' | 'READY') => {
    await api.patch(`/orders/${orderId}/items/${itemId}/status`, { status })
  }

  const applyLocalItemStatus = (
    orderId: string,
    predicate: (item: OrderItemApi) => boolean,
    status: 'PREPARING' | 'READY',
  ) => {
    setOrders((prev) =>
      prev.map((order) => {
        if (order.id !== orderId) return order
        const orderItems = order.orderItems.map((item) =>
          predicate(item) ? { ...item, status } : item,
        )
        const allReady = orderItems.length > 0 && orderItems.every((item) => item.status === 'READY')
        const anyPreparing = orderItems.some((item) => item.status === 'PREPARING')
        return {
          ...order,
          status: allReady ? 'READY' : anyPreparing ? 'PREPARING' : order.status,
          orderItems,
        }
      }),
    )
  }

  const updateOrderItemsBatchFallback = async (order: OrderApi, targetStatus: 'PREPARING' | 'READY') => {
    const items = order.orderItems
      .filter((item) =>
        targetStatus === 'PREPARING'
          ? item.status === 'WAITING'
          : item.status !== 'READY',
      )
      .map((item) => ({ itemId: item.id, status: targetStatus }))
    if (items.length === 0) return
    await api.patch(`/orders/${order.id}/items/batch-status`, { items })
  }

  const updateItemStatus = async (
    orderId: string,
    itemId: string,
    status: 'PREPARING' | 'READY',
  ) => {
    setUpdatingId(itemId)
    try {
      const socket = kdsSocketRef.current
      if (socket?.connected) {
        socket.emit(status === 'PREPARING' ? 'start-item' : 'complete-item', { orderId, itemId })
        applyLocalItemStatus(orderId, (item) => item.id === itemId, status)
      } else {
        await updateItemStatusFallback(orderId, itemId, status)
      }
      await loadData()
      toast.success(tv(`Cập nhật món -> ${status}`, `Item updated -> ${status}`))
    } catch (error: any) {
      toast.error(error?.message || error.response?.data?.message || 'Cập nhật món thất bại')
    } finally {
      setUpdatingId(null)
    }
  }

  const completeOrder = async (order: OrderApi) => {
    const hasPendingItems = order.orderItems.some((item) => item.status !== 'READY')
    if (hasPendingItems || order.status !== 'READY') {
      toast.error(tv('Chỉ hoàn thành đơn khi tất cả món đã sẵn sàng', 'Complete order only when all items are ready'))
      return
    }

    setUpdatingId(`order:${order.id}`)
    try {
      const socket = kdsSocketRef.current
      if (socket?.connected) {
        socket.emit('complete-order', { orderId: order.id })
        applyLocalItemStatus(order.id, (item) => item.status !== 'READY', 'READY')
      } else {
        await updateOrderItemsBatchFallback(order, 'READY')
      }
      await loadData()
      toast.success(tv(`Đã cập nhật đơn ${maDonHangNgan(order.id)}`, `Order ${maDonHangNgan(order.id)} updated`))
    } catch (error: any) {
      toast.error(error?.message || error.response?.data?.message || tv('Không thể hoàn thành đơn', 'Unable to complete order'))
    } finally {
      setUpdatingId(null)
    }
  }

  const startOrder = async (order: OrderApi) => {
    setUpdatingId(`order:start:${order.id}`)
    try {
      const socket = kdsSocketRef.current
      if (socket?.connected) {
        socket.emit('start-order', { orderId: order.id })
        applyLocalItemStatus(order.id, (item) => item.status === 'WAITING', 'PREPARING')
      } else {
        await updateOrderItemsBatchFallback(order, 'PREPARING')
      }
      await loadData()
      toast.success(tv(`Đã bắt đầu đơn ${maDonHangNgan(order.id)}`, `Order ${maDonHangNgan(order.id)} started`))
    } catch (error: any) {
      toast.error(error?.message || error.response?.data?.message || tv('Không thể bắt đầu đơn', 'Unable to start order'))
    } finally {
      setUpdatingId(null)
    }
  }

  const tableLabel = (tableId: string) => {
    const table = tables.find((item) => item.id === tableId)
    return table ? `Bàn ${table.number}` : tableId
  }
  const tableNumberById = useMemo(
    () => new Map((tables || []).map((table) => [table.id, table.number])),
    [tables],
  )

  const remindStaff = (order: OrderApi) => {
    const socket = kdsSocketRef.current
    if (!socket?.connected) {
      toast.error(tv('KDS realtime đang ngắt kết nối', 'KDS realtime is disconnected'))
      return
    }
    socket.emit('remind-staff', {
      orderId: order.id,
      tableNumber: Number(tableNumberById.get(order.tableId) || 0),
    })
    toast.success(tv('Đã gửi nhắc nhân viên phục vụ', 'Staff reminder sent'))
  }

  const itemLabel = (menuItemId: string) => menuItems.find((m) => m.id === menuItemId)?.name || menuItemId

  const formatOptions = (options?: string | null) => {
    if (!options) return ''
    try {
      const parsed = JSON.parse(options) as Record<string, unknown>
      if (!parsed || typeof parsed !== 'object') return options
      const entries = Object.entries(parsed)
        .filter(([key]) => key !== 'extraAmount')
        .map(([key, value]) => `${key}: ${String(value)}`)
      return entries.join(' | ')
    } catch {
      return options
    }
  }

  const totalPendingItems = useMemo(
    () => orders.reduce((sum, order) => sum + order.orderItems.filter((item) => item.status !== 'READY').length, 0),
    [orders],
  )

  const kdsColumns = useMemo(() => {
    const grouped: Record<KdsStage, OrderApi[]> = {
      WAITING: [],
      PREPARING: [],
      READY: [],
    }

    orders.forEach((order) => {
      grouped[orderKdsStage(order)].push(order)
    })

    return [
      { key: 'WAITING' as const, title: tv('Chờ làm', 'Waiting'), orders: grouped.WAITING },
      { key: 'PREPARING' as const, title: tv('Đang làm', 'Preparing'), orders: grouped.PREPARING },
      { key: 'READY' as const, title: tv('Hoàn thành', 'Completed'), orders: grouped.READY },
    ]
  }, [orders, tv])

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white sm:text-2xl">{tv('Màn hình bếp (KDS)', 'Kitchen Display (KDS)')}</h1>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span
            className={`rounded-full px-2 py-1 ${
              socketConnected ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'
            }`}
          >
            {socketConnected ? tv('Realtime ON', 'Realtime ON') : tv('Realtime OFF', 'Realtime OFF')}
          </span>
          <button
            type="button"
            className={chipButtonClass}
            onClick={() => setSoundEnabled(!soundEnabled)}
          >
            {soundEnabled ? tv('Âm thanh: Bật', 'Sound: On') : tv('Âm thanh: Tắt', 'Sound: Off')}
          </button>
        </div>
      </div>

      {loading && <RoutePageSkeleton kind="dashboard" />}
      {!loading && (
        <p className="rounded-xl border border-amber-100 bg-white/85 px-3 py-2 text-sm text-slate-600">
          {tv('S-12:', 'S-12:')} {orders.length} {tv('đơn đang chờ/đang làm', 'orders in queue/in progress')} · {totalPendingItems} {tv('món chưa hoàn thành', 'items not completed')}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {kdsColumns.map((column) => (
          <Card key={column.key} className="min-h-[320px]">
            <div className="mb-3 flex items-center justify-between border-b border-amber-100 pb-2">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">{column.title}</p>
              <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-700">{column.orders.length}</span>
            </div>

            {column.orders.length === 0 && (
              <p className="text-sm text-slate-500">{tv('Không có đơn', 'No orders')}</p>
            )}

            <div className="space-y-3">
              {column.orders.map((order) => (
                <div key={order.id} className="rounded-2xl border border-amber-100 bg-white/90 p-3 dark:border-slate-700 dark:bg-slate-900/60">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-white" title={order.id}>
                        {maDonHangNgan(order.id)}
                      </p>
                      <p className="text-xs text-slate-500">
                        {tableLabel(order.tableId)} · {new Date(order.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-700">
                      {trangThaiDonHang(order.status)}
                    </span>
                  </div>

                  <div className="mt-3 space-y-2">
                    {order.orderItems.map((item) => (
                      <div key={item.id} className="rounded-xl border border-amber-100 bg-white/85 p-3 dark:border-slate-700 dark:bg-slate-900/60">
                        <div className="flex items-center justify-between text-sm">
                          <span>
                            {item.quantity}x {itemLabel(item.menuItemId)}
                          </span>
                          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">{itemStatusLabel(item.status)}</span>
                        </div>
                        {(item.note || item.options) && (
                          <div className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                            {item.note && <p>Ghi chú: {item.note}</p>}
                            {item.options && <p>Tùy chọn: {formatOptions(item.options)}</p>}
                          </div>
                        )}
                        <div className="mt-2 flex flex-wrap gap-2">
                          {item.status === 'WAITING' && (
                            <Button
                              size="sm"
                              className="w-full sm:w-auto"
                              onClick={() => updateItemStatus(order.id, item.id, 'PREPARING')}
                              loading={updatingId === item.id}
                            >
                              {tv('Bắt đầu', 'Start')}
                            </Button>
                          )}
                          {item.status === 'PREPARING' && (
                            <Button
                              size="sm"
                              variant="secondary"
                              className="w-full sm:w-auto"
                              onClick={() => updateItemStatus(order.id, item.id, 'READY')}
                              loading={updatingId === item.id}
                            >
                              {tv('Sẵn sàng phục vụ', 'Ready to serve')}
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-amber-100 pt-3 text-sm">
                    <span>
                      Món chưa xong: <strong>{order.orderItems.filter((item) => item.status !== 'READY').length}</strong>
                    </span>
                    <div className="flex w-full flex-wrap justify-end gap-2 sm:w-auto">
                      {orderKdsStage(order) === 'WAITING' && (
                        <Button
                          size="sm"
                          className="w-full sm:w-auto"
                          onClick={() => startOrder(order)}
                          loading={updatingId === `order:start:${order.id}`}
                        >
                          {tv('Bắt đầu tất cả', 'Start all')}
                        </Button>
                      )}
                      {order.status === 'READY' && (
                        <Button
                          size="sm"
                          variant="secondary"
                          className="w-full sm:w-auto"
                          onClick={() => remindStaff(order)}
                        >
                          {tv('Nhắc nhân viên', 'Remind staff')}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="secondary"
                        className="w-full sm:w-auto"
                        onClick={() => completeOrder(order)}
                        loading={updatingId === `order:${order.id}`}
                        disabled={order.status !== 'READY' || order.orderItems.some((item) => item.status !== 'READY')}
                      >
                        {tv('Hoàn thành đơn', 'Complete order')}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
