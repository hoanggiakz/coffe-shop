import { FormEvent, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import api from '@/utils/api'
import { RoutePageSkeleton } from '@/components/ui/PageSkeleton'
import { loaiGiamGia, phamViKhuyenMai, trangThaiHoatDong } from '@/utils/display'

type DiscountType = 'PERCENT' | 'FIXED'
type PromotionScope = 'ORDER' | 'ITEM'

interface PromotionApi {
  id: string
  code: string
  description?: string | null
  discountType: DiscountType
  discountValue: number
  appliesTo: PromotionScope
  menuItemIds: string[]
  minOrderAmount: number
  maxDiscount?: number | null
  isActive: boolean
  startAt?: string | null
  endAt?: string | null
  usageLimit?: number | null
  usedCount: number
  createdAt: string
}

interface MenuItemApi {
  id: string
  name: string
  available: boolean
}

type PromotionFormState = {
  code: string
  description: string
  discountType: DiscountType
  discountValue: string
  appliesTo: PromotionScope
  selectedMenuItemIds: string[]
  minOrderAmount: string
  maxDiscount: string
  usageLimit: string
  startAt: string
  endAt: string
  isActive: boolean
}

const initialForm: PromotionFormState = {
  code: '',
  description: '',
  discountType: 'PERCENT',
  discountValue: '',
  appliesTo: 'ORDER',
  selectedMenuItemIds: [],
  minOrderAmount: '0',
  maxDiscount: '',
  usageLimit: '',
  startAt: '',
  endAt: '',
  isActive: true,
}
const fieldClass =
  'min-h-11 w-full rounded-xl border border-sky-100/80 bg-white/95 px-3 py-2 text-sm text-slate-800 focus:border-sky-400 focus:ring-2 focus:ring-sky-300/60 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:focus:border-sky-400 dark:focus:ring-sky-500/30'

export default function Promotions() {
  const [promotions, setPromotions] = useState<PromotionApi[]>([])
  const [menuItems, setMenuItems] = useState<MenuItemApi[]>([])
  const [includeInactive, setIncludeInactive] = useState(false)
  const [scopeFilter, setScopeFilter] = useState<'ALL' | PromotionScope>('ALL')
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState('')
  const [form, setForm] = useState<PromotionFormState>(initialForm)

  const loadPromotions = async () => {
    const params: Record<string, string | boolean> = { includeInactive }
    if (keyword.trim()) params.keyword = keyword.trim()
    if (scopeFilter !== 'ALL') params.appliesTo = scopeFilter
    const { data } = await api.get('/orders/admin/promotions', { params })
    setPromotions(Array.isArray(data) ? data : [])
  }

  const loadMenuItems = async () => {
    const { data } = await api.get('/orders/admin/menu/items')
    setMenuItems(Array.isArray(data) ? data : [])
  }

  useEffect(() => {
    const run = async () => {
      setLoading(true)
      try {
        await Promise.all([loadPromotions(), loadMenuItems()])
      } catch (error: any) {
        toast.error(error.response?.data?.message || 'Không tải được dữ liệu khuyến mãi')
      } finally {
        setLoading(false)
      }
    }
    run()
  }, [includeInactive, scopeFilter])

  const menuNameById = useMemo(() => {
    const map = new Map<string, string>()
    menuItems.forEach((item) => map.set(item.id, item.name))
    return map
  }, [menuItems])

  const toDateTimeInput = (iso?: string | null) => {
    if (!iso) return ''
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) return ''
    const tzOffset = date.getTimezoneOffset() * 60000
    return new Date(date.getTime() - tzOffset).toISOString().slice(0, 16)
  }

  const startEdit = (promotion: PromotionApi) => {
    setEditingId(promotion.id)
    setForm({
      code: promotion.code,
      description: promotion.description || '',
      discountType: promotion.discountType,
      discountValue: String(promotion.discountValue),
      appliesTo: promotion.appliesTo || 'ORDER',
      selectedMenuItemIds: Array.isArray(promotion.menuItemIds) ? promotion.menuItemIds : [],
      minOrderAmount: String(promotion.minOrderAmount || 0),
      maxDiscount: promotion.maxDiscount === null || promotion.maxDiscount === undefined ? '' : String(promotion.maxDiscount),
      usageLimit: promotion.usageLimit === null || promotion.usageLimit === undefined ? '' : String(promotion.usageLimit),
      startAt: toDateTimeInput(promotion.startAt),
      endAt: toDateTimeInput(promotion.endAt),
      isActive: promotion.isActive,
    })
  }

  const resetForm = () => {
    setEditingId('')
    setForm(initialForm)
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const code = form.code.trim().toUpperCase()
    if (!code) {
      toast.error('Nhập mã khuyến mãi')
      return
    }
    if (!form.discountValue) {
      toast.error('Nhập giá trị giảm')
      return
    }
    if (form.appliesTo === 'ITEM' && form.selectedMenuItemIds.length === 0) {
      toast.error('Khuyến mãi theo món cần chọn ít nhất 1 món')
      return
    }

    const payload = {
      code,
      description: form.description.trim() || undefined,
      discountType: form.discountType,
      discountValue: Number(form.discountValue),
      appliesTo: form.appliesTo,
      menuItemIds: form.appliesTo === 'ITEM' ? form.selectedMenuItemIds : [],
      minOrderAmount: Number(form.minOrderAmount || 0),
      maxDiscount: form.maxDiscount ? Number(form.maxDiscount) : null,
      usageLimit: form.usageLimit ? Number(form.usageLimit) : null,
      startAt: form.startAt ? new Date(form.startAt).toISOString() : null,
      endAt: form.endAt ? new Date(form.endAt).toISOString() : null,
      isActive: form.isActive,
    }

    setSaving(true)
    try {
      if (editingId) {
        await api.patch(`/orders/admin/promotions/${editingId}`, payload)
        toast.success('Đã cập nhật khuyến mãi')
      } else {
        await api.post('/orders/admin/promotions', payload)
        toast.success('Đã tạo mã khuyến mãi')
      }
      resetForm()
      await loadPromotions()
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Lưu khuyến mãi thất bại')
    } finally {
      setSaving(false)
    }
  }

  const disablePromotion = async (promotion: PromotionApi) => {
    if (!window.confirm(`Vô hiệu hóa mã ${promotion.code}?`)) return
    try {
      await api.post(`/orders/admin/promotions/${promotion.id}/disable`)
      toast.success(`Đã vô hiệu hóa ${promotion.code}`)
      await loadPromotions()
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Không vô hiệu hóa được mã')
    }
  }

  const filteredPromotions = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    if (!kw) return promotions
    return promotions.filter(
      (promo) =>
        promo.code.toLowerCase().includes(kw) ||
        String(promo.description || '').toLowerCase().includes(kw),
    )
  }, [promotions, keyword])

  return (
    <div className="space-y-5 sm:space-y-6">
      <h1 className="text-xl font-bold text-slate-900 dark:text-white sm:text-2xl">Quản lý khuyến mãi (M-17/M-18)</h1>

      <Card title={editingId ? 'Cập nhật khuyến mãi' : 'M-17 Tạo mã giảm giá'}>
        <form onSubmit={onSubmit} className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <input
            className={fieldClass}
            placeholder="Mã (ví dụ: WELCOME10)"
            value={form.code}
            onChange={(e) => setForm((prev) => ({ ...prev, code: e.target.value.toUpperCase() }))}
          />
          <input
            className={fieldClass}
            placeholder="Mô tả"
            value={form.description}
            onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
          />
          <select
            className={fieldClass}
            value={form.discountType}
            onChange={(e) => setForm((prev) => ({ ...prev, discountType: e.target.value as DiscountType }))}
          >
            <option value="PERCENT">Phần trăm (%)</option>
            <option value="FIXED">Số tiền cố định (VND)</option>
          </select>
          <input
            type="number"
            className={fieldClass}
            placeholder="Giá trị giảm"
            value={form.discountValue}
            onChange={(e) => setForm((prev) => ({ ...prev, discountValue: e.target.value }))}
          />
          <select
            className={fieldClass}
            value={form.appliesTo}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                appliesTo: e.target.value as PromotionScope,
                selectedMenuItemIds: e.target.value === 'ITEM' ? prev.selectedMenuItemIds : [],
              }))
            }
          >
            <option value="ORDER">Áp dụng toàn đơn</option>
            <option value="ITEM">Áp dụng món cụ thể</option>
          </select>
          <input
            type="number"
            className={fieldClass}
            placeholder="Đơn tối thiểu"
            value={form.minOrderAmount}
            onChange={(e) => setForm((prev) => ({ ...prev, minOrderAmount: e.target.value }))}
          />
          <input
            type="number"
            className={fieldClass}
            placeholder="Giảm tối đa (không bắt buộc)"
            value={form.maxDiscount}
            onChange={(e) => setForm((prev) => ({ ...prev, maxDiscount: e.target.value }))}
          />
          <input
            type="number"
            className={fieldClass}
            placeholder="Số lượt giới hạn (không bắt buộc)"
            value={form.usageLimit}
            onChange={(e) => setForm((prev) => ({ ...prev, usageLimit: e.target.value }))}
          />
          <input
            type="datetime-local"
            className={fieldClass}
            value={form.startAt}
            onChange={(e) => setForm((prev) => ({ ...prev, startAt: e.target.value }))}
          />
          <input
            type="datetime-local"
            className={fieldClass}
            value={form.endAt}
            onChange={(e) => setForm((prev) => ({ ...prev, endAt: e.target.value }))}
          />
          <label className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-sky-100 bg-white/90 px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm((prev) => ({ ...prev, isActive: e.target.checked }))}
            />
            Đang hoạt động
          </label>
          <div className="flex gap-2">
            <Button type="submit" loading={saving}>
              {editingId ? 'Cập nhật' : 'Tạo mã'}
            </Button>
            {editingId && (
              <Button type="button" variant="secondary" onClick={resetForm}>
                Hủy
              </Button>
            )}
          </div>
        </form>

        {form.appliesTo === 'ITEM' && (
          <div className="mt-4 rounded border p-3">
            <p className="mb-2 text-sm font-medium">Món áp dụng</p>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
              {menuItems.map((item) => (
                <label key={item.id} className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.selectedMenuItemIds.includes(item.id)}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        selectedMenuItemIds: e.target.checked
                          ? [...prev.selectedMenuItemIds, item.id]
                          : prev.selectedMenuItemIds.filter((id) => id !== item.id),
                      }))
                    }
                  />
                  {item.name}
                </label>
              ))}
            </div>
          </div>
        )}
      </Card>

      <Card title="M-18 Quản lý chương trình">
        <div className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-4">
          <input
            className={fieldClass}
            placeholder="Tìm theo mã hoặc mô tả"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
          <select
            className={fieldClass}
            value={scopeFilter}
            onChange={(e) => setScopeFilter(e.target.value as 'ALL' | PromotionScope)}
          >
            <option value="ALL">Tất cả phạm vi</option>
            <option value="ORDER">Toàn đơn</option>
            <option value="ITEM">Món cụ thể</option>
          </select>
          <label className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-sky-100 bg-white/90 px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(e) => setIncludeInactive(e.target.checked)}
            />
            Hiển thị cả mã đã vô hiệu hóa
          </label>
          <Button type="button" variant="secondary" onClick={() => void loadPromotions()}>
            Làm mới
          </Button>
        </div>

        {loading ? (
          <RoutePageSkeleton kind="form" />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="py-2 text-left">Mã</th>
                  <th className="py-2 text-left">Loại</th>
                  <th className="py-2 text-left">Phạm vi</th>
                  <th className="py-2 text-left">Hiệu lực</th>
                  <th className="py-2 text-left">Trạng thái</th>
                  <th className="py-2 text-left">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {filteredPromotions.map((promotion) => (
                  <tr key={promotion.id} className="border-b align-top">
                    <td className="py-2">
                      <p className="font-semibold">{promotion.code}</p>
                      <p className="text-xs text-gray-500">{promotion.description || '-'}</p>
                    </td>
                    <td className="py-2">
                      {promotion.discountType === 'PERCENT'
                        ? `${promotion.discountValue}%`
                        : `${Number(promotion.discountValue).toLocaleString('vi-VN')}đ`}
                      {promotion.maxDiscount ? (
                        <p className="text-xs text-gray-500">Giảm tối đa: {Number(promotion.maxDiscount).toLocaleString('vi-VN')}đ</p>
                      ) : null}
                      <p className="text-xs text-gray-500">{loaiGiamGia(promotion.discountType)}</p>
                    </td>
                    <td className="py-2">
                      <p>{phamViKhuyenMai(promotion.appliesTo)}</p>
                      {promotion.appliesTo === 'ITEM' && (
                        <p className="max-w-xs text-xs text-gray-500">
                          {(promotion.menuItemIds || [])
                            .map((id) => menuNameById.get(id) || id)
                            .join(', ') || '-'}
                        </p>
                      )}
                    </td>
                    <td className="py-2 text-xs text-gray-600">
                      <p>Từ: {promotion.startAt ? new Date(promotion.startAt).toLocaleString() : 'Chưa cấu hình'}</p>
                      <p>Đến: {promotion.endAt ? new Date(promotion.endAt).toLocaleString() : 'Chưa cấu hình'}</p>
                      <p>Giới hạn: {promotion.usageLimit ?? 'Không giới hạn'}</p>
                      <p>Đã dùng: {promotion.usedCount}</p>
                    </td>
                    <td className="py-2">
                      <span
                        className={
                          promotion.isActive
                            ? 'rounded bg-emerald-100 px-2 py-1 text-xs text-emerald-700'
                            : 'rounded bg-gray-200 px-2 py-1 text-xs text-gray-700'
                        }
                      >
                        {trangThaiHoatDong(promotion.isActive)}
                      </span>
                    </td>
                    <td className="py-2">
                      <div className="flex gap-2">
                        <Button size="sm" variant="secondary" onClick={() => startEdit(promotion)}>
                          Sửa
                        </Button>
                        {promotion.isActive && (
                          <Button size="sm" variant="danger" onClick={() => void disablePromotion(promotion)}>
                            Vô hiệu hóa
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
