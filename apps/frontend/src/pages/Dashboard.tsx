import { useEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import Card from '@/components/ui/Card'
import api from '@/utils/api'
import { getSocket, disconnectSocket } from '@/utils/socket'
import { useAuthStore } from '@/stores/authStore'
import { showRealtimeNotification } from '@/utils/notifications'
import { StatsCardsSkeleton, TableSkeleton } from '@/components/ui/PageSkeleton'
import { useI18n } from '@/utils/i18n'
import { maDonHangNgan, trangThaiDonHang } from '@/utils/display'
import { useBranchScopeStore } from '@/stores/branchScopeStore'
import {
  BellAlertIcon,
  CheckBadgeIcon,
  CurrencyDollarIcon,
  ShoppingCartIcon,
  TableCellsIcon,
} from '@heroicons/react/24/outline'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

type OrderStatus = 'PENDING' | 'CONFIRMED' | 'PREPARING' | 'READY' | 'COMPLETED' | 'CANCELLED'

interface TableApi {
  id: string
  number?: number | null
  status: 'AVAILABLE' | 'OCCUPIED' | 'RESERVED' | 'CLEANING'
}

interface OrderApi {
  id: string
  tableId: string
  tableNumber?: number | null
  status: OrderStatus
  totalAmount: number
  createdAt: string
  orderItems?: Array<{
    id: string
    quantity: number
    menuItemId?: string
    menuItemName?: string | null
  }>
}

type StaffNotificationType = 'ORDER_NEW' | 'CALL_STAFF' | 'CHAT_MESSAGE' | 'CHAT_OPENED' | 'LOW_STOCK'

interface StaffNotificationPayload {
  id: string
  type: StaffNotificationType
  title: string
  message: string
  chatId?: string
  tableId?: string
  messageId?: string
  orderId?: string
  createdAt: string
}

interface StaffNotification extends StaffNotificationPayload {
  source: 'SOCKET' | 'POLL'
}

const PENDING_STATUSES = new Set<OrderStatus>(['PENDING', 'CONFIRMED', 'PREPARING', 'READY'])

function formatMoney(amount: number): string {
  return `${new Intl.NumberFormat('vi-VN').format(Math.max(0, amount))}đ`
}

function isToday(dateString: string): boolean {
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return false
  const now = new Date()
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  )
}

function formatDateTime(dateString: string): string {
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString()
}

function statusBadgeClass(status: OrderStatus): string {
  if (status === 'COMPLETED') {
    return 'bg-emerald-100 text-emerald-700'
  }
  if (status === 'CANCELLED') {
    return 'bg-red-100 text-red-700'
  }
  if (status === 'READY') {
    return 'bg-amber-100 text-amber-700'
  }
  return 'bg-amber-100 text-amber-700'
}

export default function Dashboard() {
  const user = useAuthStore((state) => state.user)
  const selectedBranchId = useBranchScopeStore((state) => state.selectedBranchId)
  const { tv } = useI18n()
  const [tables, setTables] = useState<TableApi[]>([])
  const [orders, setOrders] = useState<OrderApi[]>([])
  const [notifications, setNotifications] = useState<StaffNotification[]>([])
  const [loading, setLoading] = useState(true)
  const [socketConnected, setSocketConnected] = useState(false)

  const knownOrderIdsRef = useRef<Set<string>>(new Set())
  const bootstrappedOrdersRef = useRef(false)
  const seenNotificationsRef = useRef<Set<string>>(new Set())

  const orderTableLabel = (order: OrderApi) => {
    if (order.tableNumber !== null && order.tableNumber !== undefined) {
      return `Bàn ${order.tableNumber}`
    }
    const matchedTable = tables.find((table) => table.id === order.tableId)
    if (matchedTable?.number !== null && matchedTable?.number !== undefined) {
      return `Bàn ${matchedTable.number}`
    }
    return 'Bàn không xác định'
  }

  const tableLabelById = (tableId?: string) => {
    if (!tableId) return 'Bàn không xác định'
    const matchedTable = tables.find((table) => table.id === tableId)
    if (matchedTable?.number !== null && matchedTable?.number !== undefined) {
      return `Bàn ${matchedTable.number}`
    }
    return 'Bàn không xác định'
  }

  const notificationTitle = (item: StaffNotification) => {
    if (!item.tableId) return item.title
    const matchedTable = tables.find((table) => table.id === item.tableId)
    if (matchedTable?.number === null || matchedTable?.number === undefined) {
      return item.title
    }
    return item.title.replace(item.tableId, String(matchedTable.number))
  }

  const recentOrderItemsLabel = (order: OrderApi) => {
    const items = Array.isArray(order.orderItems) ? order.orderItems : []
    if (!items.length) {
      return 'Chưa có món'
    }

    const visibleItems = items.slice(0, 2).map((item) => {
      const itemName = item.menuItemName || item.menuItemId || 'Món đã xóa'
      return `${item.quantity}x ${itemName}`
    })

    const remaining = items.length - visibleItems.length
    return remaining > 0
      ? `${visibleItems.join(', ')} + ${remaining} món khác`
      : visibleItems.join(', ')
  }

  const pushNotification = (payload: StaffNotificationPayload, source: 'SOCKET' | 'POLL', showToast = false) => {
    const stableId =
      payload.id ||
      `${payload.type}:${payload.orderId || payload.messageId || payload.createdAt}:${payload.tableId || ''}`

    if (seenNotificationsRef.current.has(stableId)) {
      return
    }

    seenNotificationsRef.current.add(stableId)
    setNotifications((prev) => [{ ...payload, id: stableId, source }, ...prev].slice(0, 20))

    if (showToast) {
      const mappedType =
        payload.type === 'ORDER_NEW'
          ? 'NEW_ORDER'
          : payload.type === 'CALL_STAFF'
            ? 'CALL_WAITER'
            : payload.type === 'CHAT_MESSAGE' || payload.type === 'CHAT_OPENED'
              ? 'NEW_MESSAGE'
              : payload.type === 'LOW_STOCK'
                ? 'LOW_INVENTORY'
                : 'SYSTEM'
      showRealtimeNotification(payload.title, payload.message, mappedType)
    }
  }

  const loadOverview = async (fromPolling = false) => {
    try {
      const [tableRes, orderRes] = await Promise.all([
        api.get('/tables', { params: { branchId: selectedBranchId || undefined } }),
        api.get('/orders', { params: { branchId: selectedBranchId || undefined } }),
      ])

      const nextTables = Array.isArray(tableRes.data) ? (tableRes.data as TableApi[]) : []
      const nextOrders = Array.isArray(orderRes.data) ? (orderRes.data as OrderApi[]) : []

      if (!bootstrappedOrdersRef.current) {
        knownOrderIdsRef.current = new Set(nextOrders.map((order) => order.id))
        bootstrappedOrdersRef.current = true
      } else {
        const newOrders = nextOrders.filter((order) => !knownOrderIdsRef.current.has(order.id))
        newOrders.forEach((order) => knownOrderIdsRef.current.add(order.id))

        if (fromPolling) {
          newOrders.forEach((order) => {
            pushNotification(
              {
                id: `order-poll:${order.id}`,
                type: 'ORDER_NEW',
                title: `Đơn mới từ ${orderTableLabel(order)}`,
                message: `Đơn ${maDonHangNgan(order.id)} - ${formatMoney(Number(order.totalAmount || 0))}`,
                tableId: order.tableId,
                orderId: order.id,
                createdAt: order.createdAt || new Date().toISOString(),
              },
              'POLL',
              true,
            )
          })
        }
      }

      setTables(nextTables)
      setOrders(nextOrders)
    } catch (error: any) {
      toast.error(error.response?.data?.message || tv('Không tải được dữ liệu dashboard', 'Unable to load dashboard data'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadOverview(false)
    const timer = window.setInterval(() => {
      loadOverview(true)
    }, 10000)
    return () => window.clearInterval(timer)
  }, [selectedBranchId])

  useEffect(() => {
    const socket = getSocket()

    const joinStaffRoom = () => {
      socket.emit('join-staff', {
        staffId: user?.id,
        staffName: user?.name,
      })
    }

    const onConnect = () => {
      setSocketConnected(true)
      joinStaffRoom()
    }

    const onDisconnect = () => {
      setSocketConnected(false)
    }

    const onStaffNotification = (payload: StaffNotificationPayload) => {
      pushNotification(payload, 'SOCKET', true)
      if (payload.type === 'ORDER_NEW') {
        loadOverview(false)
      }
    }

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('staff-notification', onStaffNotification)

    if (!socket.connected) {
      socket.connect()
    } else {
      onConnect()
    }

    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('staff-notification', onStaffNotification)
      disconnectSocket()
    }
  }, [selectedBranchId, user?.id, user?.name])

  const activeTables = useMemo(
    () => tables.filter((table) => table.status === 'OCCUPIED').length,
    [tables],
  )

  const pendingOrders = useMemo(
    () => orders.filter((order) => PENDING_STATUSES.has(order.status)).length,
    [orders],
  )

  const completedOrders = useMemo(
    () => orders.filter((order) => order.status === 'COMPLETED').length,
    [orders],
  )

  const temporaryRevenue = useMemo(
    () =>
      orders
        .filter((order) => order.status === 'COMPLETED' && isToday(order.createdAt))
        .reduce((sum, order) => sum + Number(order.totalAmount || 0), 0),
    [orders],
  )

  const recentOrders = useMemo(
    () =>
      [...orders]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 5),
    [orders],
  )

  const stats = [
    { name: tv('Bàn đang có khách', 'Occupied tables'), value: `${activeTables}`, icon: TableCellsIcon, color: 'text-amber-600' },
    { name: tv('Đơn chờ xử lý', 'Pending orders'), value: `${pendingOrders}`, icon: ShoppingCartIcon, color: 'text-blue-600' },
    { name: tv('Đơn hoàn thành', 'Completed orders'), value: `${completedOrders}`, icon: CheckBadgeIcon, color: 'text-emerald-600' },
    { name: tv('Doanh thu tạm thời', 'Temporary revenue'), value: formatMoney(temporaryRevenue), icon: CurrencyDollarIcon, color: 'text-green-600' },
  ]

  const orderStatusChartData = useMemo(
    () => [
      { name: tv('Chờ nhận', 'Pending'), value: orders.filter((order) => order.status === 'PENDING').length },
      { name: tv('Đang làm', 'Preparing'), value: orders.filter((order) => order.status === 'PREPARING').length },
      { name: tv('Sẵn sàng', 'Ready'), value: orders.filter((order) => order.status === 'READY').length },
      { name: tv('Hoàn tất', 'Completed'), value: orders.filter((order) => order.status === 'COMPLETED').length },
    ],
    [orders],
  )

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white sm:text-2xl">{tv('Tổng quan', 'Dashboard')}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-200">
            {notifications.length} {tv('thông báo mới', 'new notifications')}
          </span>
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${
            socketConnected ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'
            }`}
          >
            {socketConnected ? tv('Realtime: Đã kết nối', 'Realtime: Connected') : tv('Realtime: Ngoại tuyến', 'Realtime: Offline')}
          </span>
        </div>
      </div>

      {loading && <StatsCardsSkeleton />}
      {!loading && <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.name} className="flex items-center gap-4">
            <div className={`rounded-xl bg-amber-50 p-3 dark:bg-slate-700 ${stat.color}`}>
              <stat.icon className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-300">{stat.name}</p>
              <p className="text-xl font-bold text-slate-900 dark:text-white">{stat.value}</p>
            </div>
          </Card>
        ))}
      </div>}

      {!loading && (
        <Card title={tv('Biểu đồ đơn theo trạng thái', 'Order status chart')} subtitle={tv('Biểu đồ cột đơn giản', 'Simple bar chart')}>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={orderStatusChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="value" fill="#0284c7" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title={tv('Đơn gần nhất', 'Recent orders')} subtitle={tv('5 đơn mới nhất', 'Latest 5 orders')}>
          {loading && <TableSkeleton rows={4} cols={2} />}
          {!loading && recentOrders.length === 0 && <p className="text-sm text-gray-500">{tv('Chưa có đơn hàng.', 'No orders yet.')}</p>}
          <div className="space-y-3">
            {recentOrders.map((order) => (
              <div key={order.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-100 bg-white/90 p-3 dark:border-slate-700 dark:bg-gray-700/50">
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-white" title={order.id}>
                    {maDonHangNgan(order.id)}
                  </p>
                  <p className="text-xs text-slate-500">
                    {orderTableLabel(order)} · {formatMoney(Number(order.totalAmount || 0))}
                  </p>
                  <p className="mt-1 text-xs text-slate-600 dark:text-gray-300">
                    {recentOrderItemsLabel(order)}
                  </p>
                </div>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadgeClass(order.status)}`}>
                  {trangThaiDonHang(order.status)}
                </span>
              </div>
            ))}
          </div>
        </Card>

        <Card title={tv('Thông báo realtime', 'Realtime notifications')} subtitle={tv('Đơn mới, gọi phục vụ, tin nhắn khách', 'New orders, staff calls, customer chat')}>
          <div className="space-y-3">
            {notifications.length === 0 && (
              <div className="rounded-xl border border-amber-100 bg-white/90 p-3 text-sm text-slate-500 dark:border-slate-700 dark:bg-gray-700/50">
                {tv('Chưa có thông báo mới.', 'No new notifications.')}
              </div>
            )}
            {notifications.map((item) => (
              <div key={item.id} className="rounded-xl border border-amber-100 p-3 text-sm dark:border-slate-700">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-slate-900 dark:text-slate-100">{notificationTitle(item)}</p>
                  <span className="text-xs text-slate-500">{item.source}</span>
                </div>
                <p className="mt-1 text-slate-700 dark:text-slate-200">{item.message}</p>
                <div className="mt-1 flex flex-wrap items-center justify-between gap-1 text-xs text-slate-500">
                  <span>{item.tableId ? tableLabelById(item.tableId) : '---'}</span>
                  <span>{formatDateTime(item.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 border-t border-amber-100 pt-3">
            <button
              type="button"
              onClick={() => {
                setNotifications([])
                seenNotificationsRef.current.clear()
              }}
              className="inline-flex items-center gap-1 rounded-xl border border-amber-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-amber-50"
            >
              <BellAlertIcon className="h-4 w-4" />
              {tv('Xóa danh sách thông báo', 'Clear notifications')}
            </button>
          </div>
        </Card>
      </div>
    </div>
  )
}
