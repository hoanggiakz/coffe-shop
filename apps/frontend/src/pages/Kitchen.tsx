import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import api from '@/utils/api'
import { disconnectSocket, getSocket } from '@/utils/socket'
import { showRealtimeNotification } from '@/utils/notifications'
import { useUiStore } from '@/stores/uiStore'
import { RoutePageSkeleton } from '@/components/ui/PageSkeleton'
import { useI18n } from '@/utils/i18n'
import { maDonHangNgan } from '@/utils/display'

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
  status: 'WAITING' | 'PREPARING' | 'DONE'
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
}

const KITCHEN_ORDER_STATUSES = new Set<OrderApi['status']>(['CONFIRMED', 'PREPARING'])
const chipButtonClass =
  'inline-flex min-h-10 items-center justify-center rounded-xl border border-sky-200 bg-white/90 px-3 py-1.5 text-sm text-slate-700 transition-colors hover:bg-sky-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700'

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

  const loadData = async () => {
    try {
      const [ordersRes, tablesRes, menuRes] = await Promise.all([
        api.get('/orders'),
        api.get('/tables'),
        api.get('/orders/menu'),
      ])
      const normalizedOrders: OrderApi[] = (ordersRes.data || [])
        .filter((order: OrderApi) => KITCHEN_ORDER_STATUSES.has(order.status))
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
    const timer = setInterval(loadData, 15000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    const socket = getSocket()

    const onConnect = () => {
      setSocketConnected(true)
      socket.emit('join-staff')
    }

    const onDisconnect = () => setSocketConnected(false)

    const onNotification = (payload: StaffNotificationPayload) => {
      if (payload.type === 'ORDER_NEW') {
        showRealtimeNotification(payload.title || tv('Có đơn mới', 'New order'), payload.message || tv('KDS vừa nhận đơn mới', 'KDS received a new order'))
        loadData()
        return
      }

      if (payload.type === 'KDS_ITEM_STATUS' || payload.type === 'KDS_ORDER_READY') {
        loadData()
      }
    }

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('staff-notification', onNotification)

    if (!socket.connected) {
      socket.connect()
    } else {
      onConnect()
    }

    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('staff-notification', onNotification)
      disconnectSocket()
    }
  }, [soundEnabled])

  const updateItemStatus = async (
    orderId: string,
    itemId: string,
    status: 'PREPARING' | 'DONE',
  ) => {
    setUpdatingId(itemId)
    try {
      await api.patch(`/orders/${orderId}/items/${itemId}/status`, { status })
      await loadData()
      toast.success(tv(`Cập nhật món -> ${status}`, `Item updated -> ${status}`))
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Cập nhật món thất bại')
    } finally {
      setUpdatingId(null)
    }
  }

  const completeOrder = async (order: OrderApi) => {
    const pendingItems = order.orderItems.filter((item) => item.status !== 'DONE')
    if (!pendingItems.length) {
      toast.success(tv('Đơn đã hoàn thành đủ món', 'All items are already completed'))
      return
    }

    setUpdatingId(`order:${order.id}`)
    try {
      for (const item of pendingItems) {
        await api.patch(`/orders/${order.id}/items/${item.id}/status`, { status: 'DONE' })
      }
      await loadData()
      toast.success(tv(`Đã hoàn thành đơn ${maDonHangNgan(order.id)}`, `Order ${maDonHangNgan(order.id)} completed`))
    } catch (error: any) {
      toast.error(error.response?.data?.message || tv('Không thể hoàn thành đơn', 'Unable to complete order'))
    } finally {
      setUpdatingId(null)
    }
  }

  const tableLabel = (tableId: string) => {
    const table = tables.find((item) => item.id === tableId)
    return table ? `Bàn ${table.number}` : tableId
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
    () => orders.reduce((sum, order) => sum + order.orderItems.filter((item) => item.status !== 'DONE').length, 0),
    [orders],
  )

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
        <p className="rounded-xl border border-sky-100 bg-white/85 px-3 py-2 text-sm text-slate-600">
          {tv('S-12:', 'S-12:')} {orders.length} {tv('đơn đang chờ/đang làm', 'orders in queue/in progress')} · {totalPendingItems} {tv('món chưa hoàn thành', 'items not completed')}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {!loading && orders.length === 0 && (
          <Card>
            <p className="text-sm text-gray-500">{tv('Không có đơn đang chờ làm.', 'No orders waiting in kitchen.')}</p>
          </Card>
        )}
        {orders.map((order) => (
          <Card key={order.id}>
            <div className="flex items-start justify-between">
              <div>
                <p className="font-semibold text-slate-900 dark:text-white" title={order.id}>
                  {maDonHangNgan(order.id)}
                </p>
                <p className="text-xs text-slate-500">
                  {tableLabel(order.tableId)} · {new Date(order.createdAt).toLocaleString()}
                </p>
              </div>
              <span className="rounded-full bg-sky-100 px-2 py-1 text-xs font-medium text-sky-700">
                {order.status}
              </span>
            </div>

            <div className="mt-3 space-y-2">
              {order.orderItems.map((item) => (
                <div key={item.id} className="rounded-xl border border-sky-100 bg-white/85 p-3 dark:border-slate-700 dark:bg-slate-900/60">
                  <div className="flex items-center justify-between text-sm">
                    <span>
                      {item.quantity}x {itemLabel(item.menuItemId)}
                    </span>
                    <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700">{item.status}</span>
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
                        onClick={() => updateItemStatus(order.id, item.id, 'DONE')}
                        loading={updatingId === item.id}
                      >
                        {tv('Hoàn thành', 'Done')}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-sky-100 pt-3 text-sm">
              <span>
                Món chưa xong: <strong>{order.orderItems.filter((item) => item.status !== 'DONE').length}</strong>
              </span>
              <Button
                size="sm"
                variant="secondary"
                className="w-full sm:w-auto"
                onClick={() => completeOrder(order)}
                loading={updatingId === `order:${order.id}`}
              >
                {tv('Hoàn thành đơn', 'Complete order')}
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
