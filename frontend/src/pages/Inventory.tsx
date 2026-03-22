import { FormEvent, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import api from '@/utils/api'
import { RoutePageSkeleton } from '@/components/ui/PageSkeleton'
import { useI18n } from '@/utils/i18n'
import { trangThaiHoatDong } from '@/utils/display'
import { disconnectSocket, getSocket } from '@/utils/socket'
import { showRealtimeNotification } from '@/utils/notifications'

type Ingredient = {
  id: string
  branchId?: string | null
  name: string
  unit: string
  stock: number
  minStock: number
  importPrice: number
  isActive: boolean
  isLowStock?: boolean
}

type StockMovement = {
  id: string
  branchId?: string | null
  ingredientId: string
  type: 'IMPORT' | 'EXPORT' | 'ADJUST'
  source: 'MANUAL' | 'RECEIPT' | 'ORDER' | 'STOCKTAKE' | 'SYNC_MENU' | 'SYSTEM'
  quantity: number
  unitPrice: number
  totalPrice: number
  beforeStock: number
  afterStock: number
  reason?: string | null
  note?: string | null
  referenceCode?: string | null
  createdBy?: string | null
  createdAt: string
  ingredient?: Ingredient | null
}

type MenuItem = {
  id: string
  name: string
}

type StaffNotificationType = 'KDS_ITEM_STATUS' | 'KDS_ORDER_READY' | 'LOW_STOCK'

type StaffNotificationPayload = {
  id: string
  type: StaffNotificationType
  title: string
  message: string
}

const defaultIngredientForm = {
  name: '',
  unit: '',
  minStock: '',
  importPrice: '',
}

const defaultQuickMovementForm = {
  ingredientId: '',
  type: 'IMPORT' as 'IMPORT' | 'EXPORT',
  quantity: '',
  unitPrice: '',
  reason: '',
  note: '',
}

const defaultAdjustForm = {
  ingredientId: '',
  actualStock: '',
  reason: '',
}

const defaultReceiptRow = {
  ingredientId: '',
  quantity: '',
  unitPrice: '',
  note: '',
}

function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10)
}

export default function Inventory() {
  const { tv } = useI18n()
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [socketConnected, setSocketConnected] = useState(false)

  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [movements, setMovements] = useState<StockMovement[]>([])
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])

  const [includeInactive, setIncludeInactive] = useState(false)
  const [lowOnly, setLowOnly] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [branchId, setBranchId] = useState('')
  const [editingIngredientId, setEditingIngredientId] = useState<string | null>(null)
  const [ingredientForm, setIngredientForm] = useState(defaultIngredientForm)

  const [quickMovementForm, setQuickMovementForm] = useState(defaultQuickMovementForm)

  const [receiptSupplier, setReceiptSupplier] = useState('')
  const [receiptNote, setReceiptNote] = useState('')
  const [receiptItems, setReceiptItems] = useState([defaultReceiptRow])

  const [adjustForm, setAdjustForm] = useState(defaultAdjustForm)

  const [historyIngredientId, setHistoryIngredientId] = useState('ALL')
  const [historyType, setHistoryType] = useState<'ALL' | 'IMPORT' | 'EXPORT' | 'ADJUST'>('ALL')
  const [historySource, setHistorySource] = useState<'ALL' | 'MANUAL' | 'RECEIPT' | 'ORDER' | 'STOCKTAKE' | 'SYNC_MENU' | 'SYSTEM'>('ALL')
  const [dateFrom, setDateFrom] = useState(toDateInputValue(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)))
  const [dateTo, setDateTo] = useState(toDateInputValue(new Date()))

  const normalizeIngredient = (item: any): Ingredient => ({
    id: item.id,
    branchId: item.branchId || null,
    name: item.name,
    unit: item.unit,
    stock: Number(item.stock || 0),
    minStock: Number(item.minStock || 0),
    importPrice: Number(item.importPrice || 0),
    isActive: Boolean(item.isActive),
    isLowStock: Boolean(item.isLowStock),
  })

  const loadIngredients = async () => {
    const { data } = await api.get('/v1/ingredients', {
      params: {
        includeInactive,
        lowOnly,
        branchId: branchId.trim() || undefined,
        keyword: keyword.trim() || undefined,
      },
    })
    const normalized = (data || []).map((item: any) => normalizeIngredient(item))
    setIngredients(normalized)
    if (!quickMovementForm.ingredientId && normalized.length) {
      setQuickMovementForm((prev) => ({ ...prev, ingredientId: normalized[0].id }))
    }
    if (!adjustForm.ingredientId && normalized.length) {
      setAdjustForm((prev) => ({ ...prev, ingredientId: normalized[0].id }))
    }
  }

  const loadMovements = async () => {
    const params: Record<string, string> = {
      limit: '200',
      dateFrom,
      dateTo,
    }
    if (historyIngredientId !== 'ALL') params.ingredientId = historyIngredientId
    if (branchId.trim()) params.branchId = branchId.trim()
    if (historyType !== 'ALL') params.type = historyType
    if (historySource !== 'ALL') params.source = historySource

    const { data } = await api.get('/v1/ingredients/stock/movements', { params })
    setMovements(
      (data || []).map((item: any) => ({
        ...item,
        quantity: Number(item.quantity || 0),
        unitPrice: Number(item.unitPrice || 0),
        totalPrice: Number(item.totalPrice || 0),
        beforeStock: Number(item.beforeStock || 0),
        afterStock: Number(item.afterStock || 0),
        ingredient: item.ingredient ? normalizeIngredient(item.ingredient) : null,
      })),
    )
  }

  const loadMenuItems = async () => {
    const { data } = await api.get('/orders/menu', {
      params: { branchId: branchId.trim() || undefined },
    })
    setMenuItems((data || []).map((item: any) => ({ id: item.id, name: item.name })))
  }

  const loadAll = async () => {
    try {
      setLoading(true)
      await Promise.all([loadIngredients(), loadMovements(), loadMenuItems()])
    } catch (error: any) {
      toast.error(error.response?.data?.message || tv('Không tải được dữ liệu kho', 'Unable to load inventory data'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadAll()
  }, [])

  useEffect(() => {
    const socket = getSocket()

    const refreshRealtimeData = () => {
      void Promise.all([loadIngredients(), loadMovements()]).catch((error: any) => {
        toast.error(error.response?.data?.message || tv('Không thể đồng bộ lại dữ liệu kho', 'Unable to refresh inventory data'))
      })
    }

    const onConnect = () => {
      setSocketConnected(true)
      socket.emit('join-staff')
    }

    const onDisconnect = () => setSocketConnected(false)

    const onNotification = (payload: StaffNotificationPayload) => {
      if (payload.type === 'LOW_STOCK') {
        void showRealtimeNotification(payload.title, payload.message)
        refreshRealtimeData()
        return
      }

      if (payload.type === 'KDS_ITEM_STATUS' || payload.type === 'KDS_ORDER_READY') {
        refreshRealtimeData()
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
  }, [branchId, historyIngredientId, historyType, historySource, dateFrom, dateTo])

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadIngredients().catch((error: any) => {
        toast.error(error.response?.data?.message || tv('Không tải được danh sách nguyên liệu', 'Unable to load ingredients'))
      })
    }, 250)
    return () => clearTimeout(timer)
  }, [includeInactive, lowOnly, keyword, branchId])

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadMovements().catch((error: any) => {
        toast.error(error.response?.data?.message || tv('Không tải được lịch sử kho', 'Unable to load stock history'))
      })
    }, 250)
    return () => clearTimeout(timer)
  }, [historyIngredientId, historyType, historySource, dateFrom, dateTo, branchId])

  const lowStocks = useMemo(
    () => ingredients.filter((item) => Number(item.stock) <= Number(item.minStock)),
    [ingredients],
  )

  const submitIngredient = async (e: FormEvent) => {
    e.preventDefault()
    if (!ingredientForm.name.trim() || !ingredientForm.unit.trim()) {
      toast.error('Nhập tên và đơn vị nguyên liệu')
      return
    }
    setSubmitting(true)
    try {
      const payload = {
        branchId: branchId.trim() || undefined,
        name: ingredientForm.name.trim(),
        unit: ingredientForm.unit.trim(),
        minStock: Number(ingredientForm.minStock || 0),
        importPrice: Number(ingredientForm.importPrice || 0),
      }
      if (editingIngredientId) {
        await api.patch(`/v1/ingredients/${editingIngredientId}`, payload)
        toast.success('Đã cập nhật nguyên liệu')
      } else {
        await api.post('/v1/ingredients', payload)
        toast.success('Đã thêm nguyên liệu')
      }
      setIngredientForm(defaultIngredientForm)
      setEditingIngredientId(null)
      await loadIngredients()
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Lưu nguyên liệu thất bại')
    } finally {
      setSubmitting(false)
    }
  }

  const editIngredient = (ingredient: Ingredient) => {
    setEditingIngredientId(ingredient.id)
    setIngredientForm({
      name: ingredient.name || '',
      unit: ingredient.unit || '',
      minStock: String(ingredient.minStock || 0),
      importPrice: String(ingredient.importPrice || 0),
    })
  }

  const deleteIngredient = async (ingredient: Ingredient) => {
    if (!window.confirm(`Xóa nguyên liệu "${ingredient.name}"?`)) return
    try {
      await api.delete(`/v1/ingredients/${ingredient.id}`)
      toast.success('Đã xóa nguyên liệu')
      if (editingIngredientId === ingredient.id) {
        setEditingIngredientId(null)
        setIngredientForm(defaultIngredientForm)
      }
      await loadIngredients()
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Xóa nguyên liệu thất bại')
    }
  }

  const submitQuickMovement = async (e: FormEvent) => {
    e.preventDefault()
    if (!quickMovementForm.ingredientId || !quickMovementForm.quantity) {
      toast.error('Chọn nguyên liệu và số lượng')
      return
    }
    setSubmitting(true)
    try {
      await api.post('/v1/ingredients/stock/import', {
        branchId: branchId.trim() || undefined,
        ingredientId: quickMovementForm.ingredientId,
        type: quickMovementForm.type,
        source: 'MANUAL',
        quantity: Number(quickMovementForm.quantity),
        unitPrice: quickMovementForm.type === 'IMPORT' ? Number(quickMovementForm.unitPrice || 0) : 0,
        reason: quickMovementForm.reason || null,
        note: quickMovementForm.note || null,
      })
      toast.success('Đã cập nhật kho')
      setQuickMovementForm((prev) => ({ ...prev, quantity: '', note: '', reason: '' }))
      await Promise.all([loadIngredients(), loadMovements()])
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Cập nhật kho thất bại')
    } finally {
      setSubmitting(false)
    }
  }

  const submitReceipt = async (e: FormEvent) => {
    e.preventDefault()
    const validItems = receiptItems
      .filter((item) => item.ingredientId && Number(item.quantity) > 0)
      .map((item) => ({
        ingredientId: item.ingredientId,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice || 0),
        note: item.note || null,
      }))

    if (!validItems.length) {
      toast.error('Phiếu nhập cần ít nhất 1 dòng hợp lệ')
      return
    }

    setSubmitting(true)
    try {
      const { data } = await api.post('/v1/ingredients/stock/receipts', {
        branchId: branchId.trim() || undefined,
        supplier: receiptSupplier || null,
        note: receiptNote || null,
        items: validItems,
      })
      toast.success(`Đã tạo phiếu nhập ${data.receiptCode}`)
      setReceiptSupplier('')
      setReceiptNote('')
      setReceiptItems([defaultReceiptRow])
      await Promise.all([loadIngredients(), loadMovements()])
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Tạo phiếu nhập thất bại')
    } finally {
      setSubmitting(false)
    }
  }

  const submitAdjustStock = async (e: FormEvent) => {
    e.preventDefault()
    if (!adjustForm.ingredientId || adjustForm.actualStock === '') {
      toast.error('Chọn nguyên liệu và nhập tồn kho thực tế')
      return
    }
    setSubmitting(true)
    try {
      await api.post('/v1/ingredients/stock/adjust', {
        branchId: branchId.trim() || undefined,
        ingredientId: adjustForm.ingredientId,
        actualStock: Number(adjustForm.actualStock),
        reason: adjustForm.reason || 'Kiểm kê',
      })
      toast.success('Đã điều chỉnh tồn kho')
      setAdjustForm((prev) => ({ ...prev, actualStock: '', reason: '' }))
      await Promise.all([loadIngredients(), loadMovements()])
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Điều chỉnh tồn kho thất bại')
    } finally {
      setSubmitting(false)
    }
  }

  const syncFromMenu = async () => {
    setSyncing(true)
    try {
      await api.post('/v1/ingredients/sync-menu', {
        branchId: branchId.trim() || undefined,
        items: menuItems.map((item) => ({ id: item.id, name: item.name, unit: 'portion' })),
      })
      toast.success('Đã đồng bộ thực đơn sang kho')
      await loadIngredients()
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Đồng bộ thực đơn thất bại')
    } finally {
      setSyncing(false)
    }
  }

  const formatMoney = (value: number) => `${new Intl.NumberFormat('vi-VN').format(Math.max(0, Number(value || 0)))}đ`

  if (loading) {
    return <RoutePageSkeleton kind="form" />
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{tv('Quản lý kho (M-07..M-11)', 'Inventory management (M-07..M-11)')}</h1>
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              socketConnected ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'
            }`}
          >
            {socketConnected ? 'Realtime tồn kho: Đã kết nối' : 'Realtime tồn kho: Ngoại tuyến'}
          </span>
          <Input
            placeholder="Mã chi nhánh"
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
          />
          <Button onClick={syncFromMenu} loading={syncing}>
            Đồng bộ thực đơn sang kho
          </Button>
        </div>
      </div>

      {lowStocks.length > 0 && (
        <Card className="border-l-4 border-amber-500 bg-amber-50 dark:bg-amber-900/20">
          <p className="font-medium text-amber-700 dark:text-amber-400">
            Cảnh báo tồn kho thấp: {lowStocks.map((item) => `${item.name} (${item.stock}/${item.minStock})`).join(', ')}
          </p>
        </Card>
      )}

      <Card title="M-07 Quản lý nguyên liệu">
        <form onSubmit={submitIngredient} className="grid grid-cols-1 gap-3 md:grid-cols-5">
          <Input
            placeholder="Tên nguyên liệu"
            value={ingredientForm.name}
            onChange={(e) => setIngredientForm((prev) => ({ ...prev, name: e.target.value }))}
          />
          <Input
            placeholder="Đơn vị"
            value={ingredientForm.unit}
            onChange={(e) => setIngredientForm((prev) => ({ ...prev, unit: e.target.value }))}
          />
          <Input
            type="number"
            min={0}
            step="0.01"
            placeholder="Tồn tối thiểu"
            value={ingredientForm.minStock}
            onChange={(e) => setIngredientForm((prev) => ({ ...prev, minStock: e.target.value }))}
          />
          <Input
            type="number"
            min={0}
            step="1"
            placeholder="Giá nhập"
            value={ingredientForm.importPrice}
            onChange={(e) => setIngredientForm((prev) => ({ ...prev, importPrice: e.target.value }))}
          />
          <div className="flex gap-2">
            <Button type="submit" loading={submitting}>
              {editingIngredientId ? 'Cập nhật' : 'Thêm mới'}
            </Button>
            {editingIngredientId && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setEditingIngredientId(null)
                  setIngredientForm(defaultIngredientForm)
                }}
              >
                Hủy
              </Button>
            )}
          </div>
        </form>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          <Input placeholder="Tìm theo tên hoặc đơn vị" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)} />
            Hiển thị mục đã ngừng hoạt động
          </label>
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} />
            Chỉ hiển thị tồn thấp
          </label>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="py-2 text-left">Tên</th>
                <th className="py-2 text-left">Chi nhánh</th>
                <th className="py-2 text-left">Tồn</th>
                <th className="py-2 text-left">Đơn vị</th>
                <th className="py-2 text-left">Min</th>
                <th className="py-2 text-left">Giá nhập</th>
                <th className="py-2 text-left">Trạng thái</th>
                <th className="py-2 text-left">Hành động</th>
              </tr>
            </thead>
            <tbody>
              {ingredients.map((ingredient) => {
                const isLow = Number(ingredient.stock) <= Number(ingredient.minStock)
                return (
                  <tr key={ingredient.id} className="border-b">
                    <td className="py-2">{ingredient.name}</td>
                    <td className="py-2">{ingredient.branchId || '-'}</td>
                    <td className="py-2">{ingredient.stock}</td>
                    <td className="py-2">{ingredient.unit}</td>
                    <td className="py-2">{ingredient.minStock}</td>
                    <td className="py-2">{formatMoney(ingredient.importPrice)}</td>
                    <td className="py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          !ingredient.isActive
                            ? 'bg-gray-100 text-gray-700'
                            : isLow
                              ? 'bg-red-100 text-red-700'
                              : 'bg-green-100 text-green-700'
                        }`}
                      >
                        {!ingredient.isActive ? trangThaiHoatDong(false) : isLow ? 'Sắp hết hàng' : 'Ổn định'}
                      </span>
                    </td>
                    <td className="py-2">
                      <div className="flex gap-2">
                        <Button size="sm" variant="secondary" onClick={() => editIngredient(ingredient)}>
                          Sửa
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => deleteIngredient(ingredient)}>
                          Xóa
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="M-08 Nhập hàng (tạo phiếu nhập)">
        <form onSubmit={submitReceipt} className="space-y-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Input placeholder="Nhà cung cấp" value={receiptSupplier} onChange={(e) => setReceiptSupplier(e.target.value)} />
            <Input placeholder="Ghi chú phiếu" value={receiptNote} onChange={(e) => setReceiptNote(e.target.value)} />
          </div>

          <div className="space-y-2">
            {receiptItems.map((item, index) => (
              <div key={`receipt-${index}`} className="grid grid-cols-1 gap-2 md:grid-cols-5">
                <select
                  className="rounded border px-3 py-2 text-sm"
                  value={item.ingredientId}
                  onChange={(e) =>
                    setReceiptItems((prev) =>
                      prev.map((row, idx) => (idx === index ? { ...row, ingredientId: e.target.value } : row)),
                    )
                  }
                >
                  <option value="">-- Chọn nguyên liệu --</option>
                  {ingredients
                    .filter((ingredient) => ingredient.isActive)
                    .map((ingredient) => (
                      <option key={ingredient.id} value={ingredient.id}>
                        {ingredient.name}
                      </option>
                    ))}
                </select>
                <Input
                  type="number"
                  min={0.01}
                  step="0.01"
                  placeholder="Số lượng"
                  value={item.quantity}
                  onChange={(e) =>
                    setReceiptItems((prev) => prev.map((row, idx) => (idx === index ? { ...row, quantity: e.target.value } : row)))
                  }
                />
                <Input
                  type="number"
                  min={0}
                  step="1"
                  placeholder="Đơn giá nhập"
                  value={item.unitPrice}
                  onChange={(e) =>
                    setReceiptItems((prev) => prev.map((row, idx) => (idx === index ? { ...row, unitPrice: e.target.value } : row)))
                  }
                />
                <Input
                  placeholder="Ghi chú dòng"
                  value={item.note}
                  onChange={(e) =>
                    setReceiptItems((prev) => prev.map((row, idx) => (idx === index ? { ...row, note: e.target.value } : row)))
                  }
                />
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setReceiptItems((prev) => [...prev, defaultReceiptRow])}
                  >
                    Thêm dòng
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    onClick={() => setReceiptItems((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== index) : prev))}
                  >
                    Xóa dòng
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <Button type="submit" loading={submitting}>
            Tạo phiếu nhập
          </Button>
        </form>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="M-09 Kiểm kê / điều chỉnh tồn kho">
          <form onSubmit={submitAdjustStock} className="grid grid-cols-1 gap-3">
            <select
              className="rounded border px-3 py-2 text-sm"
              value={adjustForm.ingredientId}
              onChange={(e) => setAdjustForm((prev) => ({ ...prev, ingredientId: e.target.value }))}
            >
              <option value="">-- Chọn nguyên liệu --</option>
              {ingredients
                .filter((ingredient) => ingredient.isActive)
                .map((ingredient) => (
                  <option key={ingredient.id} value={ingredient.id}>
                    {ingredient.name}
                  </option>
                ))}
            </select>
            <Input
              type="number"
              min={0}
              step="0.01"
              placeholder="Tồn kho thực tế"
              value={adjustForm.actualStock}
              onChange={(e) => setAdjustForm((prev) => ({ ...prev, actualStock: e.target.value }))}
            />
            <Input
              placeholder="Lý do kiểm kê"
              value={adjustForm.reason}
              onChange={(e) => setAdjustForm((prev) => ({ ...prev, reason: e.target.value }))}
            />
            <Button type="submit" loading={submitting}>
              Điều chỉnh tồn kho
            </Button>
          </form>
        </Card>

        <Card title="Nhập / xuất nhanh">
          <form onSubmit={submitQuickMovement} className="grid grid-cols-1 gap-3">
            <select
              className="rounded border px-3 py-2 text-sm"
              value={quickMovementForm.ingredientId}
              onChange={(e) => setQuickMovementForm((prev) => ({ ...prev, ingredientId: e.target.value }))}
            >
              <option value="">-- Chọn nguyên liệu --</option>
              {ingredients
                .filter((ingredient) => ingredient.isActive)
                .map((ingredient) => (
                  <option key={ingredient.id} value={ingredient.id}>
                    {ingredient.name}
                  </option>
                ))}
            </select>
            <select
              className="rounded border px-3 py-2 text-sm"
              value={quickMovementForm.type}
              onChange={(e) => setQuickMovementForm((prev) => ({ ...prev, type: e.target.value as 'IMPORT' | 'EXPORT' }))}
            >
              <option value="IMPORT">Nhập kho</option>
              <option value="EXPORT">Xuất kho</option>
            </select>
            <Input
              type="number"
              min={0.01}
              step="0.01"
              placeholder="Số lượng"
              value={quickMovementForm.quantity}
              onChange={(e) => setQuickMovementForm((prev) => ({ ...prev, quantity: e.target.value }))}
            />
            {quickMovementForm.type === 'IMPORT' && (
              <Input
                type="number"
                min={0}
                step="1"
                placeholder="Đơn giá nhập"
                value={quickMovementForm.unitPrice}
                onChange={(e) => setQuickMovementForm((prev) => ({ ...prev, unitPrice: e.target.value }))}
              />
            )}
            <Input
              placeholder="Lý do"
              value={quickMovementForm.reason}
              onChange={(e) => setQuickMovementForm((prev) => ({ ...prev, reason: e.target.value }))}
            />
            <Input
              placeholder="Ghi chú"
              value={quickMovementForm.note}
              onChange={(e) => setQuickMovementForm((prev) => ({ ...prev, note: e.target.value }))}
            />
            <Button type="submit" loading={submitting}>
              Cập nhật nhanh
            </Button>
          </form>
        </Card>
      </div>

      <Card title="M-11 Lịch sử nhập / xuất">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
          <select
            className="rounded border px-3 py-2 text-sm"
            value={historyIngredientId}
            onChange={(e) => setHistoryIngredientId(e.target.value)}
          >
            <option value="ALL">Tất cả nguyên liệu</option>
            {ingredients.map((ingredient) => (
              <option key={ingredient.id} value={ingredient.id}>
                {ingredient.name}
              </option>
            ))}
          </select>
          <select
            className="rounded border px-3 py-2 text-sm"
            value={historyType}
            onChange={(e) => setHistoryType(e.target.value as typeof historyType)}
          >
            <option value="ALL">Tất cả loại</option>
            <option value="IMPORT">Nhập kho</option>
            <option value="EXPORT">Xuất kho</option>
            <option value="ADJUST">Điều chỉnh</option>
          </select>
          <select
            className="rounded border px-3 py-2 text-sm"
            value={historySource}
            onChange={(e) => setHistorySource(e.target.value as typeof historySource)}
          >
            <option value="ALL">Tất cả nguồn</option>
            <option value="MANUAL">Thao tác tay</option>
            <option value="RECEIPT">Phiếu nhập</option>
            <option value="ORDER">Đơn hàng</option>
            <option value="STOCKTAKE">Kiểm kê</option>
            <option value="SYNC_MENU">Đồng bộ thực đơn</option>
            <option value="SYSTEM">Hệ thống</option>
          </select>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          <Button variant="secondary" onClick={() => void loadMovements()}>
            Tải lại
          </Button>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="border-b">
                <th className="py-2 text-left">Thời gian</th>
                <th className="py-2 text-left">Nguyên liệu</th>
                <th className="py-2 text-left">Chi nhánh</th>
                <th className="py-2 text-left">Loại / nguồn</th>
                <th className="py-2 text-left">Số lượng</th>
                <th className="py-2 text-left">Tồn trước / sau</th>
                <th className="py-2 text-left">Giá trị</th>
                <th className="py-2 text-left">Lý do</th>
                <th className="py-2 text-left">Ref</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((movement) => (
                <tr key={movement.id} className="border-b">
                  <td className="py-2">{new Date(movement.createdAt).toLocaleString()}</td>
                  <td className="py-2">{movement.ingredient?.name || movement.ingredientId}</td>
                  <td className="py-2">{movement.branchId || movement.ingredient?.branchId || '-'}</td>
                  <td className="py-2">
                    {movement.type} / {movement.source}
                  </td>
                  <td className="py-2">{movement.quantity}</td>
                  <td className="py-2">
                    {movement.beforeStock} → {movement.afterStock}
                  </td>
                  <td className="py-2">
                    {movement.unitPrice > 0 ? `${formatMoney(movement.unitPrice)} x ${movement.quantity}` : '-'}
                    {movement.totalPrice > 0 ? ` = ${formatMoney(movement.totalPrice)}` : ''}
                  </td>
                  <td className="py-2">{movement.reason || movement.note || '-'}</td>
                  <td className="py-2">{movement.referenceCode || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
