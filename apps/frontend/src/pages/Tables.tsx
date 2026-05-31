import { FormEvent, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { useNavigate } from 'react-router-dom'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import api from '@/utils/api'
import { TableStatus } from '@/types'
import { RoutePageSkeleton } from '@/components/ui/PageSkeleton'
import { maDonHangNgan, trangThaiBan, trangThaiDonHang } from '@/utils/display'
import { useBranchScopeStore } from '@/stores/branchScopeStore'
import { clearPosMenuCache, readPosMenuCache, writePosMenuCache } from '@/utils/posMenuCache'
import { disconnectSocket, getSocket } from '@/utils/socket'
import { showRealtimeNotification } from '@/utils/notifications'

interface TableApi {
  id: string
  number: number
  area?: string
  capacity: number
  status: TableStatus
  branchId?: string
  qrCode?: string
}

interface MenuItemApi {
  id: string
  name: string
  price: number
  available: boolean
}

type OrderStatus = 'PENDING' | 'CONFIRMED' | 'PREPARING' | 'READY' | 'COMPLETED' | 'CANCELLED'

interface OrderApi {
  id: string
  tableId: string
  status: OrderStatus
  totalAmount: number
  createdAt: string
  orderItems: Array<{ id: string; quantity: number; price: number }>
}

type TableActionMode = 'TRANSFER' | 'MERGE'
type TableGridState = 'AVAILABLE' | 'OCCUPIED' | 'WAITING_PAYMENT' | 'MAINTENANCE'
type StaffNotificationType = 'ORDER_NEW' | 'CALL_STAFF' | 'CHAT_MESSAGE' | 'CHAT_OPENED' | 'LOW_STOCK' | 'KDS_ITEM_STATUS' | 'KDS_ORDER_READY'

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

const statuses: TableStatus[] = ['AVAILABLE', 'OCCUPIED', 'RESERVED', 'CLEANING', 'MAINTENANCE']
const activeStatuses: OrderStatus[] = ['PENDING', 'CONFIRMED', 'PREPARING', 'READY']
const fieldClass =
  'min-h-11 w-full rounded-xl border border-amber-100/80 bg-white/95 px-3 py-2 text-sm text-slate-800 focus:border-amber-400 focus:ring-2 focus:ring-amber-300/60 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:focus:border-amber-400 dark:focus:ring-amber-500/30'

export default function Tables() {
  const navigate = useNavigate()
  const selectedBranchId = useBranchScopeStore((state) => state.selectedBranchId)
  const [tables, setTables] = useState<TableApi[]>([])
  const [orders, setOrders] = useState<OrderApi[]>([])
  const [menuItems, setMenuItems] = useState<MenuItemApi[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [deletingTableId, setDeletingTableId] = useState('')
  const [creatingWalkInOrder, setCreatingWalkInOrder] = useState(false)
  const [performingTableAction, setPerformingTableAction] = useState(false)
  const [printingBatch, setPrintingBatch] = useState(false)
  const [downloadingBatchZip, setDownloadingBatchZip] = useState(false)
  const [orderTableId, setOrderTableId] = useState('')
  const [orderCart, setOrderCart] = useState<Record<string, number>>({})
  const [selectedQrTableIds, setSelectedQrTableIds] = useState<string[]>([])
  const [editingTableId, setEditingTableId] = useState('')
  const [tableAction, setTableAction] = useState<{
    fromTableId: string
    toTableId: string
    mode: TableActionMode
  }>({ fromTableId: '', toTableId: '', mode: 'TRANSFER' })
  const [form, setForm] = useState({
    number: '',
    capacity: '',
    area: 'Indoor',
    branchId: '',
  })
  const [editForm, setEditForm] = useState({
    number: '',
    capacity: '',
    area: '',
    branchId: '',
    status: 'AVAILABLE' as TableStatus,
  })
  const [stateFilter, setStateFilter] = useState<'ALL' | TableGridState>('ALL')
  const [searchText, setSearchText] = useState('')

  const loadTables = async () => {
    try {
      const cachedMenu = readPosMenuCache<MenuItemApi>(selectedBranchId || undefined)
      const [tableRes, orderRes, menuRes] = await Promise.all([
        api.get('/tables', { params: { branchId: selectedBranchId || undefined } }),
        api.get('/orders', { params: { branchId: selectedBranchId || undefined } }),
        cachedMenu
          ? Promise.resolve({ data: cachedMenu })
          : api.get('/orders/menu', { params: { branchId: selectedBranchId || undefined } }),
      ])
      const nextTables = Array.isArray(tableRes.data) ? (tableRes.data as TableApi[]) : []
      const nextOrders = Array.isArray(orderRes.data) ? (orderRes.data as OrderApi[]) : []
      const nextMenu = Array.isArray(menuRes.data) ? (menuRes.data as MenuItemApi[]) : []

      setTables(nextTables.sort((a, b) => a.number - b.number))
      setOrders(nextOrders)
      setMenuItems(nextMenu)
      if (!cachedMenu) {
        writePosMenuCache(selectedBranchId || undefined, nextMenu)
      }

      if (!orderTableId && nextTables.length > 0) {
        setOrderTableId(nextTables[0].id)
      }
      if (!tableAction.fromTableId && nextTables.length > 0) {
        setTableAction((prev) => ({ ...prev, fromTableId: nextTables[0].id }))
      }
      if (!tableAction.toTableId && nextTables.length > 1) {
        setTableAction((prev) => ({ ...prev, toTableId: nextTables[1].id }))
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Không tải được danh sách bàn')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadTables()
  }, [selectedBranchId])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'F1') {
        event.preventDefault()
        navigate('/tables')
      }
      if (event.key === 'F2') {
        event.preventDefault()
        const firstAvailable = tables.find((table) => tableGridState(table) === 'AVAILABLE')
        if (firstAvailable) {
          setOrderTableId(firstAvailable.id)
          toast.success(`Đã chọn nhanh Bàn ${firstAvailable.number}`)
        }
      }
      if (event.key === 'F4') {
        event.preventDefault()
        navigate('/orders')
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [navigate, tables, orders])

  useEffect(() => {
    const socket = getSocket()

    const joinStaffRoom = () => {
      socket.emit('join-staff', {
        branchId: selectedBranchId || undefined,
      })
    }

    const onConnect = () => {
      joinStaffRoom()
    }

    const onStaffNotification = (payload: StaffNotificationPayload) => {
      if (payload.branchId && selectedBranchId && payload.branchId !== selectedBranchId) {
        return
      }
      if (payload.type === 'KDS_ORDER_READY' || payload.type === 'ORDER_NEW' || payload.type === 'KDS_ITEM_STATUS') {
        showRealtimeNotification(
          payload.title,
          payload.message,
          payload.type === 'ORDER_NEW' ? 'NEW_ORDER' : 'ITEM_READY',
        )
        void loadTables()
      }
    }

    const onOrderItemReady = () => {
      void loadTables()
    }

    const onTableStatusChanged = () => {
      void loadTables()
    }

    const onPaymentConfirmed = () => {
      void loadTables()
    }

    const onMenuUpdated = () => {
      clearPosMenuCache(selectedBranchId || undefined)
      toast.success('Menu vừa được cập nhật')
      void loadTables()
    }

    socket.on('connect', onConnect)
    socket.on('staff-notification', onStaffNotification)
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
      socket.off('order-item-ready', onOrderItemReady)
      socket.off('table-status-changed', onTableStatusChanged)
      socket.off('payment-confirmed', onPaymentConfirmed)
      socket.off('menu-updated', onMenuUpdated)
      disconnectSocket()
    }
  }, [selectedBranchId])

  const createTable = async (e: FormEvent) => {
    e.preventDefault()
    if (!form.number || !form.capacity) {
      toast.error('Vui lòng nhập số bàn và sức chứa')
      return
    }
    setCreating(true)
    try {
      await api.post('/tables', {
        number: Number(form.number),
        capacity: Number(form.capacity),
        area: form.area,
        branchId: form.branchId || selectedBranchId || undefined,
      })
      setForm({
        number: '',
        capacity: '',
        area: 'Indoor',
        branchId: '',
      })
      toast.success('Tạo bàn thành công')
      await loadTables()
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Tạo bàn thất bại')
    } finally {
      setCreating(false)
    }
  }

  const updateStatus = async (id: string, status: TableStatus) => {
    try {
      await api.patch(`/tables/${id}/status`, { status })
      setTables((prev) => prev.map((table) => (table.id === id ? { ...table, status } : table)))
      toast.success('Cập nhật trạng thái bàn thành công')
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Cập nhật trạng thái thất bại')
    }
  }

  const startEditTable = (table: TableApi) => {
    setEditingTableId(table.id)
    setEditForm({
      number: String(table.number),
      capacity: String(table.capacity),
      area: table.area || '',
      branchId: table.branchId || '',
      status: table.status,
    })
  }

  const submitEditTable = async (e: FormEvent) => {
    e.preventDefault()
    if (!editingTableId) return
    if (!editForm.number || !editForm.capacity) {
      toast.error('Vui lòng nhập số bàn và sức chứa')
      return
    }

    setUpdating(true)
    try {
      await api.patch(`/tables/${editingTableId}`, {
        number: Number(editForm.number),
        capacity: Number(editForm.capacity),
        area: editForm.area,
        branchId: editForm.branchId || selectedBranchId || null,
        status: editForm.status,
      })
      toast.success('Đã cập nhật thông tin bàn')
      setEditingTableId('')
      await loadTables()
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Cập nhật bàn thất bại')
    } finally {
      setUpdating(false)
    }
  }

  const deleteTable = async (table: TableApi) => {
    if (!window.confirm(`Xóa bàn ${table.number}?`)) {
      return
    }
    setDeletingTableId(table.id)
    try {
      await api.delete(`/tables/${table.id}`)
      toast.success(`Đã xóa bàn ${table.number}`)
      setSelectedQrTableIds((prev) => prev.filter((id) => id !== table.id))
      if (editingTableId === table.id) {
        setEditingTableId('')
      }
      await loadTables()
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Xóa bàn thất bại')
    } finally {
      setDeletingTableId('')
    }
  }

  const increaseItem = (menuItemId: string) => {
    setOrderCart((prev) => ({ ...prev, [menuItemId]: (prev[menuItemId] || 0) + 1 }))
  }

  const decreaseItem = (menuItemId: string) => {
    setOrderCart((prev) => {
      const next = { ...prev }
      if (!next[menuItemId]) return prev
      if (next[menuItemId] <= 1) {
        delete next[menuItemId]
      } else {
        next[menuItemId] -= 1
      }
      return next
    })
  }

  const createWalkInOrder = async (e: FormEvent) => {
    e.preventDefault()
    if (!orderTableId) {
      toast.error('Vui lòng chọn bàn')
      return
    }

    const items = Object.entries(orderCart)
      .filter(([, quantity]) => quantity > 0)
      .map(([menuItemId, quantity]) => ({ menuItemId, quantity }))

    if (!items.length) {
      toast.error('Vui lòng chọn món trước khi tạo đơn')
      return
    }

    setCreatingWalkInOrder(true)
    try {
      await api.post('/orders', {
        tableId: orderTableId,
        customerName: 'Khách tại quán',
        items,
      })
      toast.success('Đã tạo đơn hộ khách thành công')
      setOrderCart({})
      await loadTables()
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Tạo đơn hộ khách thất bại')
    } finally {
      setCreatingWalkInOrder(false)
    }
  }

  const executeTableAction = async (e: FormEvent) => {
    e.preventDefault()
    if (!tableAction.fromTableId || !tableAction.toTableId) {
      toast.error('Vui lòng chọn bàn nguồn và bàn đích')
      return
    }
    if (tableAction.fromTableId === tableAction.toTableId) {
      toast.error('Bàn nguồn và bàn đích không được trùng nhau')
      return
    }

    setPerformingTableAction(true)
    try {
      await api.post('/orders/table-actions/transfer', tableAction)
      toast.success(tableAction.mode === 'MERGE' ? 'Đã ghép bàn thành công' : 'Đã chuyển bàn thành công')
      await loadTables()
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Thao tác bàn thất bại')
    } finally {
      setPerformingTableAction(false)
    }
  }

  const openQr = async (table: TableApi) => {
    try {
      const qr = (await api.get(`/tables/${table.id}/qr`)).data?.qrCode
      if (!qr) {
        toast.error('Không lấy được QR')
        return
      }
      const win = window.open('', '_blank')
      if (win) {
        win.document.write(`<img src="${qr}" alt="Mã QR bàn ${table.number}" style="max-width:100%" />`)
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Không mở được QR')
    }
  }

  const downloadQr = async (table: TableApi) => {
    try {
      const qr = (await api.get(`/tables/${table.id}/qr`)).data?.qrCode
      if (!qr) {
        toast.error('Không lấy được QR')
        return
      }
      const anchor = document.createElement('a')
      anchor.href = qr
      anchor.download = `table-${table.number}-qr.png`
      anchor.click()
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Không tải được QR')
    }
  }

  const toggleQrSelection = (tableId: string) => {
    setSelectedQrTableIds((prev) =>
      prev.includes(tableId) ? prev.filter((id) => id !== tableId) : [...prev, tableId],
    )
  }

  const toggleSelectAllQrs = () => {
    if (selectedQrTableIds.length === tables.length) {
      setSelectedQrTableIds([])
      return
    }
    setSelectedQrTableIds(tables.map((table) => table.id))
  }

  const printSelectedQrs = async () => {
    if (!selectedQrTableIds.length) {
      toast.error('Vui lòng chọn bàn để in QR')
      return
    }

    setPrintingBatch(true)
    try {
      const { data } = await api.post('/tables/qr/batch', { tableIds: selectedQrTableIds })
      const rows = Array.isArray(data) ? data : []
      if (!rows.length) {
        toast.error('Không lấy được danh sách QR để in')
        return
      }

      const win = window.open('', '_blank')
      if (!win) {
        toast.error('Trình duyệt đã chặn cửa sổ in')
        return
      }

      const html = rows
        .map(
          (row: any) => `
            <div style="width: 48%; margin: 1%; text-align: center; page-break-inside: avoid; border: 1px solid #e2e8f0; padding: 10px; box-sizing: border-box;">
              <img src="${row.qrCode}" alt="Mã QR bàn ${row.number}" style="width: 200px; height: 200px;" />
              <div style="font-size: 16px; margin-top: 8px; font-weight: 600;">Bàn ${row.number}</div>
            </div>
          `,
        )
        .join('')

      win.document.write(`
        <html>
          <head>
            <title>In mã QR bàn</title>
            <style>
              @media print {
                @page { size: A4 portrait; margin: 12mm; }
              }
            </style>
          </head>
          <body style="display:flex; flex-wrap:wrap; align-items:flex-start; margin:0;">
            ${html}
            <script>window.onload = function() { window.print(); }</script>
          </body>
        </html>
      `)
      win.document.close()
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'In QR hàng loạt thất bại')
    } finally {
      setPrintingBatch(false)
    }
  }

  const downloadSelectedQrsZip = async () => {
    if (!selectedQrTableIds.length) {
      toast.error('Vui lòng chọn bàn để tải QR')
      return
    }

    setDownloadingBatchZip(true)
    try {
      const response = await api.post(
        '/tables/qr/batch/download',
        { tableIds: selectedQrTableIds },
        { responseType: 'blob' },
      )

      const blob = new Blob([response.data], { type: 'application/zip' })
      const url = window.URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = 'table-qr-batch.zip'
      anchor.click()
      window.URL.revokeObjectURL(url)
      toast.success('Đã tải gói QR + CSV mapping')
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Tải gói QR thất bại')
    } finally {
      setDownloadingBatchZip(false)
    }
  }

  const activeOrdersByTable = useMemo(() => {
    const map = new Map<string, OrderApi[]>()
    orders
      .filter((order) => activeStatuses.includes(order.status))
      .forEach((order) => {
        const current = map.get(order.tableId) || []
        current.push(order)
        map.set(order.tableId, current)
      })
    return map
  }, [orders])

  const tableGridState = (table: TableApi): TableGridState => {
    if (table.status === 'MAINTENANCE') {
      return 'MAINTENANCE'
    }
    const tableOrders = activeOrdersByTable.get(table.id) || []
    const waitingPayment = tableOrders.some((order) => order.status === 'READY')
    if (waitingPayment) {
      return 'WAITING_PAYMENT'
    }
    if (tableOrders.length > 0 || table.status === 'OCCUPIED') {
      return 'OCCUPIED'
    }
    return 'AVAILABLE'
  }

  const stateMeta = (state: TableGridState) => {
    if (state === 'MAINTENANCE') {
      return {
        label: 'Bảo trì',
        className: 'bg-red-100 text-red-700',
        borderClass: 'border-red-200',
      }
    }
    if (state === 'WAITING_PAYMENT') {
      return {
        label: 'Chờ thanh toán',
        className: 'bg-red-100 text-red-700',
        borderClass: 'border-red-200',
      }
    }
    if (state === 'OCCUPIED') {
      return {
        label: 'Đang dùng',
        className: 'bg-yellow-100 text-yellow-700',
        borderClass: 'border-yellow-200',
      }
    }
    return {
      label: 'Trống',
      className: 'bg-emerald-100 text-emerald-700',
      borderClass: 'border-emerald-200',
    }
  }

  const cartTotal = useMemo(
    () =>
      Object.entries(orderCart).reduce((sum, [menuItemId, quantity]) => {
        const item = menuItems.find((entry) => entry.id === menuItemId)
        return sum + (item ? item.price * quantity : 0)
      }, 0),
    [orderCart, menuItems],
  )

  const tableStateCounts = useMemo(() => {
    const counts: Record<TableGridState, number> = {
      AVAILABLE: 0,
      OCCUPIED: 0,
      WAITING_PAYMENT: 0,
      MAINTENANCE: 0,
    }
    for (const table of tables) {
      counts[tableGridState(table)] += 1
    }
    return counts
  }, [tables, orders])

  const filteredTables = useMemo(() => {
    const keyword = searchText.trim().toLowerCase()
    return tables.filter((table) => {
      const state = tableGridState(table)
      if (stateFilter !== 'ALL' && state !== stateFilter) return false
      if (!keyword) return true
      return String(table.number).includes(keyword) || String(table.area || '').toLowerCase().includes(keyword)
    })
  }, [tables, orders, stateFilter, searchText])

  return (
    <div className="space-y-5 sm:space-y-6">
      <h1 className="text-xl font-bold text-slate-900 dark:text-white sm:text-2xl">Quản lý bàn</h1>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card className="text-center"><p className="text-xs text-slate-500">Trống</p><p className="text-xl font-bold text-emerald-600">{tableStateCounts.AVAILABLE}</p></Card>
        <Card className="text-center"><p className="text-xs text-slate-500">Đang dùng</p><p className="text-xl font-bold text-amber-600">{tableStateCounts.OCCUPIED}</p></Card>
        <Card className="text-center"><p className="text-xs text-slate-500">Chờ TT</p><p className="text-xl font-bold text-red-600">{tableStateCounts.WAITING_PAYMENT}</p></Card>
        <Card className="text-center"><p className="text-xs text-slate-500">Bảo trì</p><p className="text-xl font-bold text-slate-600">{tableStateCounts.MAINTENANCE}</p></Card>
      </div>

      <Card>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
          <input
            className={fieldClass}
            placeholder="Tìm bàn..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
          <select className={fieldClass} value={stateFilter} onChange={(e) => setStateFilter(e.target.value as any)}>
            <option value="ALL">Tất cả</option>
            <option value="AVAILABLE">Trống</option>
            <option value="OCCUPIED">Đang dùng</option>
            <option value="WAITING_PAYMENT">Chờ thanh toán</option>
            <option value="MAINTENANCE">Bảo trì</option>
          </select>
          <Button variant="secondary" onClick={() => { clearPosMenuCache(selectedBranchId || undefined); void loadTables() }}>
            Làm mới menu cache
          </Button>
        </div>
      </Card>

      <Card>
        <form onSubmit={createTable} className="grid grid-cols-1 gap-3 md:grid-cols-5">
          <input
            type="number"
            placeholder="Số bàn"
            className={fieldClass}
            value={form.number}
            onChange={(e) => setForm((prev) => ({ ...prev, number: e.target.value }))}
          />
          <input
            type="number"
            placeholder="Sức chứa"
            className={fieldClass}
            value={form.capacity}
            onChange={(e) => setForm((prev) => ({ ...prev, capacity: e.target.value }))}
          />
          <input
            type="text"
            placeholder="Khu vực (trong nhà / ngoài trời)"
            className={fieldClass}
            value={form.area}
            onChange={(e) => setForm((prev) => ({ ...prev, area: e.target.value }))}
          />
          <input
            type="text"
            placeholder="Mã chi nhánh (tùy chọn)"
            className={fieldClass}
            value={form.branchId}
            onChange={(e) => setForm((prev) => ({ ...prev, branchId: e.target.value }))}
          />
          <Button type="submit" loading={creating}>
            Tạo bàn + QR
          </Button>
        </form>
      </Card>

      {editingTableId && (
        <Card title="M-14 Sửa bàn">
        <form onSubmit={submitEditTable} className="grid grid-cols-1 gap-3 md:grid-cols-6">
          <input
            type="number"
            placeholder="Số bàn"
            className={fieldClass}
            value={editForm.number}
            onChange={(e) => setEditForm((prev) => ({ ...prev, number: e.target.value }))}
          />
          <input
            type="number"
            placeholder="Sức chứa"
            className={fieldClass}
            value={editForm.capacity}
            onChange={(e) => setEditForm((prev) => ({ ...prev, capacity: e.target.value }))}
          />
          <input
            type="text"
            placeholder="Khu vực"
            className={fieldClass}
            value={editForm.area}
            onChange={(e) => setEditForm((prev) => ({ ...prev, area: e.target.value }))}
          />
          <input
            type="text"
            placeholder="Mã chi nhánh"
            className={fieldClass}
            value={editForm.branchId}
            onChange={(e) => setEditForm((prev) => ({ ...prev, branchId: e.target.value }))}
          />
          <select
              className={fieldClass}
              value={editForm.status}
              onChange={(e) => setEditForm((prev) => ({ ...prev, status: e.target.value as TableStatus }))}
            >
              {statuses.map((status) => (
                <option key={`edit-${status}`} value={status}>
                  {trangThaiBan(status)}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <Button type="submit" loading={updating}>
                Lưu
              </Button>
              <Button type="button" variant="secondary" onClick={() => setEditingTableId('')}>
                Hủy
              </Button>
            </div>
          </form>
        </Card>
      )}

      <Card title="Chuyển / Ghép Bàn" subtitle="S-06">
        <form onSubmit={executeTableAction} className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <select
            className={fieldClass}
            value={tableAction.fromTableId}
            onChange={(e) => setTableAction((prev) => ({ ...prev, fromTableId: e.target.value }))}
          >
            <option value="">-- Bàn nguồn --</option>
            {tables.map((table) => (
              <option key={`from-${table.id}`} value={table.id}>
                Bàn {table.number}
              </option>
            ))}
          </select>
          <select
            className={fieldClass}
            value={tableAction.toTableId}
            onChange={(e) => setTableAction((prev) => ({ ...prev, toTableId: e.target.value }))}
          >
            <option value="">-- Bàn đích --</option>
            {tables.map((table) => (
              <option key={`to-${table.id}`} value={table.id}>
                Bàn {table.number}
              </option>
            ))}
          </select>
          <select
            className={fieldClass}
            value={tableAction.mode}
            onChange={(e) => setTableAction((prev) => ({ ...prev, mode: e.target.value as TableActionMode }))}
          >
            <option value="TRANSFER">Chuyển bàn</option>
            <option value="MERGE">Ghép bàn</option>
          </select>
          <Button type="submit" loading={performingTableAction}>
            Thực hiện
          </Button>
        </form>
      </Card>

      <Card title="Tạo Đơn Hộ Khách" subtitle="S-07">
        <form onSubmit={createWalkInOrder} className="space-y-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <select
              className={fieldClass}
              value={orderTableId}
              onChange={(e) => setOrderTableId(e.target.value)}
            >
              <option value="">-- Chọn bàn --</option>
              {tables
                .filter((table) => table.status !== 'MAINTENANCE')
                .map((table) => (
                <option key={table.id} value={table.id}>
                  Bàn {table.number}
                </option>
                ))}
            </select>
            <div className="rounded-xl border border-amber-100 bg-white/90 px-3 py-2 text-sm text-slate-600">
              Tổng tạm tính: <span className="font-semibold text-amber-700">{cartTotal.toLocaleString()}đ</span>
            </div>
            <Button type="submit" loading={creatingWalkInOrder}>
              Tạo đơn cho khách
            </Button>
          </div>

          <div className="max-h-72 space-y-2 overflow-y-auto rounded-xl border border-amber-100 p-2">
            {menuItems
              .filter((item) => item.available)
              .map((item) => (
                <div key={item.id} className="flex items-center justify-between rounded-lg bg-white/85 px-2 py-1.5 text-sm dark:bg-slate-900/60">
                  <div>
                    <p className="font-medium">{item.name}</p>
                    <p className="text-xs text-slate-500">{item.price.toLocaleString()}đ</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" className="inline-flex h-9 min-w-9 items-center justify-center rounded-lg border border-amber-200 px-2" onClick={() => decreaseItem(item.id)}>
                      -
                    </button>
                    <span>{orderCart[item.id] || 0}</span>
                    <button type="button" className="inline-flex h-9 min-w-9 items-center justify-center rounded-lg border border-amber-200 px-2" onClick={() => increaseItem(item.id)}>
                      +
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </form>
      </Card>

      {loading && <RoutePageSkeleton kind="table" />}

      <Card title="M-15 / M-16 QR">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={tables.length > 0 && selectedQrTableIds.length === tables.length}
              onChange={toggleSelectAllQrs}
            />
            Chọn tất cả
          </label>
          <span className="text-slate-500">Đã chọn: {selectedQrTableIds.length} bàn</span>
          <Button size="sm" variant="secondary" onClick={printSelectedQrs} loading={printingBatch}>
            In QR đã chọn
          </Button>
          <Button size="sm" variant="secondary" onClick={downloadSelectedQrsZip} loading={downloadingBatchZip}>
            Tải ZIP + CSV
          </Button>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filteredTables.map((table) => (
          <Card key={table.id} className={`${stateMeta(tableGridState(table)).borderClass}`}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-lg font-bold text-slate-900 dark:text-white">Bàn {table.number}</p>
                <p className="text-sm text-slate-500">
                  {table.area || 'Chưa phân khu'} · {table.capacity} chỗ
                </p>
                {table.branchId && <p className="text-xs text-slate-400">Chi nhánh: {table.branchId}</p>}
              </div>
              <div className="flex flex-col items-end gap-2">
                <label className="inline-flex items-center gap-2 text-xs text-slate-500">
                  <input
                    type="checkbox"
                    checked={selectedQrTableIds.includes(table.id)}
                    onChange={() => toggleQrSelection(table.id)}
                  />
                  QR
                </label>
                <select
                  className="min-h-9 rounded-lg border border-amber-200 bg-white/90 px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-800"
                  value={table.status}
                  onChange={(e) => updateStatus(table.id, e.target.value as TableStatus)}
                >
                  {statuses.map((status) => (
                    <option key={status} value={status}>
                      {trangThaiBan(status)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between gap-2">
              <span className={`rounded-full px-2 py-1 text-xs font-medium ${stateMeta(tableGridState(table)).className}`}>
                {stateMeta(tableGridState(table)).label}
              </span>
              <span className="text-xs text-slate-500">
                {(activeOrdersByTable.get(table.id) || []).length} đơn đang xử lý
              </span>
            </div>
            {(activeOrdersByTable.get(table.id) || []).slice(0, 2).map((order) => (
              <div key={order.id} className="mt-2 rounded-lg border border-amber-100 bg-white/90 px-2 py-1 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900/60">
                {maDonHangNgan(order.id)} · {trangThaiDonHang(order.status)} · {order.totalAmount.toLocaleString()}đ
              </div>
            ))}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => openQr(table)}>
                Xem / In QR
              </Button>
              <Button size="sm" variant="secondary" onClick={() => downloadQr(table)}>
                Tải QR
              </Button>
              <Button size="sm" variant="secondary" onClick={() => startEditTable(table)}>
                Sửa
              </Button>
              <Button
                size="sm"
                variant="danger"
                loading={deletingTableId === table.id}
                onClick={() => deleteTable(table)}
              >
                Xóa
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <div className="rounded-xl border border-amber-100 bg-white/85 px-4 py-2 text-xs text-slate-600">
        F1: Sơ đồ bàn | F2: Chọn bàn trống nhanh | F4: Màn hình đơn hàng
      </div>
    </div>
  )
}
