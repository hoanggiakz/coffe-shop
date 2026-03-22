import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import api from '@/utils/api'
import { loaiTuyChonMon, trangThaiHoatDong } from '@/utils/display'

type MenuCategory = {
  id: string
  name: string
  branchId?: string | null
  description?: string | null
  sortOrder: number
  isActive: boolean
  _count?: { menuItems?: number }
}

type OptionValue = {
  id: string
  value: string
  label: string
  priceDelta: number
  isDefault: boolean
  isActive: boolean
}

type OptionGroup = {
  id: string
  name: string
  branchId?: string | null
  type: 'SINGLE' | 'MULTI' | 'TEXT'
  isGlobal: boolean
  isActive: boolean
  sortOrder: number
  values: OptionValue[]
}

type IngredientOption = {
  id: string
  name: string
  unit: string
  isActive: boolean
}

type RecipeRow = {
  ingredientId: string
  ingredientName: string
  quantity: string
  unit: string
}

type MenuItem = {
  id: string
  branchId?: string | null
  name: string
  price: number
  description?: string | null
  category?: string | null
  categoryId?: string | null
  available: boolean
  optionGroups: Array<{ id: string; name: string }>
  recipe: Array<{ ingredientId: string; ingredientName?: string; quantity: number; unit?: string }>
}

const emptyRecipeRow = (): RecipeRow => ({
  ingredientId: '',
  ingredientName: '',
  quantity: '',
  unit: '',
})

const defaultItemForm = {
  name: '',
  price: '',
  description: '',
  image: '',
  categoryId: '',
  available: true,
}

export default function Menu() {
  const [includeInactive, setIncludeInactive] = useState(false)
  const [categories, setCategories] = useState<MenuCategory[]>([])
  const [groups, setGroups] = useState<OptionGroup[]>([])
  const [items, setItems] = useState<MenuItem[]>([])
  const [ingredients, setIngredients] = useState<IngredientOption[]>([])
  const [keyword, setKeyword] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('ALL')
  const [branchId, setBranchId] = useState('')

  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null)
  const [categoryForm, setCategoryForm] = useState({ name: '', description: '', sortOrder: '0', isActive: true })

  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
  const [groupForm, setGroupForm] = useState({
    name: '',
    type: 'SINGLE' as 'SINGLE' | 'MULTI' | 'TEXT',
    sortOrder: '0',
    isGlobal: true,
    isActive: true,
  })
  const [valueForm, setValueForm] = useState({
    groupId: '',
    value: '',
    label: '',
    priceDelta: '0',
    isDefault: false,
    isActive: true,
  })

  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [itemForm, setItemForm] = useState(defaultItemForm)
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([])
  const [recipeRows, setRecipeRows] = useState<RecipeRow[]>([emptyRecipeRow()])

  const loadCategories = async () => {
    const { data } = await api.get('/orders/admin/menu/categories', {
      params: { includeInactive, branchId: branchId.trim() || undefined },
    })
    setCategories(data || [])
  }

  const loadGroups = async () => {
    const { data } = await api.get('/orders/admin/menu/options/groups', {
      params: { includeInactive, branchId: branchId.trim() || undefined },
    })
    setGroups(data || [])
  }

  const loadItems = async () => {
    const params: Record<string, string | boolean> = { includeInactive }
    if (branchId.trim()) params.branchId = branchId.trim()
    if (keyword.trim()) params.keyword = keyword.trim()
    if (categoryFilter !== 'ALL') params.categoryId = categoryFilter
    const { data } = await api.get('/orders/admin/menu/items', { params })
    setItems(data || [])
  }

  const loadIngredients = async () => {
    const { data } = await api.get('/v1/ingredients', {
      params: {
        branchId: branchId.trim() || undefined,
      },
    })

    setIngredients(
      (data || []).map((item: any) => ({
        id: item.id,
        name: item.name,
        unit: item.unit,
        isActive: Boolean(item.isActive),
      })),
    )
  }

  const loadAll = async () => {
    try {
      await Promise.all([loadCategories(), loadGroups(), loadItems(), loadIngredients()])
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Không tải được dữ liệu thực đơn')
    }
  }

  useEffect(() => {
    void loadAll()
  }, [includeInactive, branchId])

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadItems()
    }, 250)
    return () => clearTimeout(timer)
  }, [keyword, categoryFilter, includeInactive, branchId])

  const resetItemForm = () => {
    setEditingItemId(null)
    setItemForm(defaultItemForm)
    setSelectedGroupIds([])
    setRecipeRows([emptyRecipeRow()])
  }

  const submitCategory = async () => {
    const payload = {
      ...categoryForm,
      branchId: branchId.trim() || undefined,
      sortOrder: Number(categoryForm.sortOrder || 0),
      description: categoryForm.description || null,
    }

    try {
      if (editingCategoryId) await api.patch(`/orders/admin/menu/categories/${editingCategoryId}`, payload)
      else await api.post('/orders/admin/menu/categories', payload)
      toast.success('Đã lưu danh mục')
      setEditingCategoryId(null)
      setCategoryForm({ name: '', description: '', sortOrder: '0', isActive: true })
      await Promise.all([loadCategories(), loadItems()])
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Không lưu được danh mục')
    }
  }

  const submitGroup = async () => {
    const payload = {
      ...groupForm,
      branchId: branchId.trim() || undefined,
      sortOrder: Number(groupForm.sortOrder || 0),
    }

    try {
      if (editingGroupId) await api.patch(`/orders/admin/menu/options/groups/${editingGroupId}`, payload)
      else await api.post('/orders/admin/menu/options/groups', payload)
      toast.success('Đã lưu nhóm tùy chọn')
      setEditingGroupId(null)
      setGroupForm({ name: '', type: 'SINGLE', sortOrder: '0', isGlobal: true, isActive: true })
      await loadGroups()
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Không lưu được nhóm tùy chọn')
    }
  }

  const submitValue = async () => {
    if (!valueForm.groupId) return toast.error('Chọn nhóm trước')
    const payload = { ...valueForm, priceDelta: Number(valueForm.priceDelta || 0) }

    try {
      await api.post(`/orders/admin/menu/options/groups/${valueForm.groupId}/values`, payload)
      toast.success('Đã thêm giá trị tùy chọn')
      setValueForm((prev) => ({ ...prev, value: '', label: '', priceDelta: '0', isDefault: false, isActive: true }))
      await loadGroups()
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Không thêm được giá trị tùy chọn')
    }
  }

  const editValue = async (valueId: string, currentLabel: string, currentPrice: number) => {
    const label = window.prompt('Nhãn mới', currentLabel)
    if (!label) return

    const priceRaw = window.prompt('Giá cộng thêm', String(currentPrice)) || '0'
    try {
      await api.patch(`/orders/admin/menu/options/values/${valueId}`, { label, priceDelta: Number(priceRaw || 0) })
      toast.success('Đã cập nhật giá trị tùy chọn')
      await loadGroups()
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Không cập nhật được')
    }
  }

  const updateRecipeRow = (index: number, patch: Partial<RecipeRow>) => {
    setRecipeRows((prev) =>
      prev.map((row, rowIndex) => {
        if (rowIndex !== index) return row
        const nextRow = { ...row, ...patch }

        if (patch.ingredientId !== undefined) {
          const ingredient = ingredients.find((item) => item.id === patch.ingredientId)
          return {
            ...nextRow,
            ingredientName: ingredient?.name || '',
            unit: ingredient?.unit || nextRow.unit || '',
          }
        }

        return nextRow
      }),
    )
  }

  const addRecipeRow = () => {
    setRecipeRows((prev) => [...prev, emptyRecipeRow()])
  }

  const removeRecipeRow = (index: number) => {
    setRecipeRows((prev) => (prev.length > 1 ? prev.filter((_, rowIndex) => rowIndex !== index) : [emptyRecipeRow()]))
  }

  const submitItem = async () => {
    const validRecipeRows = recipeRows
      .map((row) => ({
        ingredientId: row.ingredientId.trim(),
        ingredientName: row.ingredientName.trim(),
        quantity: Number(row.quantity || 0),
        unit: row.unit.trim(),
      }))
      .filter((row) => row.ingredientId && Number.isFinite(row.quantity) && row.quantity > 0)

    if (!validRecipeRows.length) {
      toast.error('Cần khai báo ít nhất 1 nguyên liệu và định lượng để tự động trừ kho')
      return
    }

    const duplicatedIngredientId = validRecipeRows.find(
      (row, index) => validRecipeRows.findIndex((entry) => entry.ingredientId === row.ingredientId) !== index,
    )?.ingredientId

    if (duplicatedIngredientId) {
      toast.error('Công thức bị trùng nguyên liệu')
      return
    }

    const payload = {
      ...itemForm,
      branchId: branchId.trim() || undefined,
      price: Number(itemForm.price || 0),
      categoryId: itemForm.categoryId || null,
      description: itemForm.description || null,
      image: itemForm.image || null,
      optionGroups: selectedGroupIds.map((groupId, index) => ({ groupId, required: false, sortOrder: index })),
      recipe: validRecipeRows,
    }

    try {
      if (editingItemId) await api.patch(`/orders/admin/menu/items/${editingItemId}`, payload)
      else await api.post('/orders/admin/menu/items', payload)
      toast.success('Đã lưu món')
      resetItemForm()
      await loadItems()
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Không lưu được món')
    }
  }

  const recipeSummary = (item: MenuItem) => {
    if (!Array.isArray(item.recipe) || !item.recipe.length) {
      return 'Chưa khai báo'
    }

    return item.recipe
      .slice(0, 2)
      .map((entry) => `${entry.ingredientName || entry.ingredientId} (${entry.quantity} ${entry.unit || ''})`.trim())
      .join(', ')
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Quản lý thực đơn (M-04/M-05/M-06)</h1>
        <div className="flex items-center gap-2">
          <Input placeholder="Mã chi nhánh" value={branchId} onChange={(e) => setBranchId(e.target.value)} />
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)} />
            Hiển thị cả mục đã ngừng hoạt động
          </label>
        </div>
      </div>

      <Card title="M-04 Danh mục">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <Input placeholder="Tên danh mục" value={categoryForm.name} onChange={(e) => setCategoryForm((p) => ({ ...p, name: e.target.value }))} />
          <Input placeholder="Mô tả" value={categoryForm.description} onChange={(e) => setCategoryForm((p) => ({ ...p, description: e.target.value }))} />
          <Input type="number" placeholder="Thứ tự" value={categoryForm.sortOrder} onChange={(e) => setCategoryForm((p) => ({ ...p, sortOrder: e.target.value }))} />
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={categoryForm.isActive} onChange={(e) => setCategoryForm((p) => ({ ...p, isActive: e.target.checked }))} />
            Đang hoạt động
          </label>
        </div>
        <div className="mt-3 flex gap-2">
          <Button onClick={submitCategory}>{editingCategoryId ? 'Cập nhật' : 'Thêm'}</Button>
          <Button
            variant="secondary"
            onClick={() => {
              setEditingCategoryId(null)
              setCategoryForm({ name: '', description: '', sortOrder: '0', isActive: true })
            }}
          >
            Làm mới
          </Button>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="py-2 text-left">Tên</th>
                <th className="py-2 text-left">Số món</th>
                <th className="py-2 text-left">Trạng thái</th>
                <th className="py-2 text-left">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((category) => (
                <tr key={category.id} className="border-b">
                  <td className="py-2">{category.name}</td>
                  <td>{category._count?.menuItems || 0}</td>
                  <td>{trangThaiHoatDong(category.isActive)}</td>
                  <td className="flex gap-2 py-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setEditingCategoryId(category.id)
                        setCategoryForm({
                          name: category.name,
                          description: category.description || '',
                          sortOrder: String(category.sortOrder),
                          isActive: category.isActive,
                        })
                      }}
                    >
                      Sửa
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={async () => {
                        if (!window.confirm('Xóa danh mục?')) return
                        await api.delete(`/orders/admin/menu/categories/${category.id}`)
                        await Promise.all([loadCategories(), loadItems()])
                      }}
                    >
                      Xóa
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="M-06 Tùy chọn toàn cục">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
          <Input placeholder="Tên nhóm" value={groupForm.name} onChange={(e) => setGroupForm((p) => ({ ...p, name: e.target.value }))} />
          <label className="text-sm">
            Loại
            <select className="mt-1 block w-full rounded-lg border px-3 py-2" value={groupForm.type} onChange={(e) => setGroupForm((p) => ({ ...p, type: e.target.value as 'SINGLE' | 'MULTI' | 'TEXT' }))}>
              <option value="SINGLE">Chọn một</option>
              <option value="MULTI">Chọn nhiều</option>
              <option value="TEXT">Nhập nội dung</option>
            </select>
          </label>
          <Input type="number" placeholder="Thứ tự" value={groupForm.sortOrder} onChange={(e) => setGroupForm((p) => ({ ...p, sortOrder: e.target.value }))} />
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={groupForm.isGlobal} onChange={(e) => setGroupForm((p) => ({ ...p, isGlobal: e.target.checked }))} />
            Dùng chung toàn hệ thống
          </label>
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={groupForm.isActive} onChange={(e) => setGroupForm((p) => ({ ...p, isActive: e.target.checked }))} />
            Đang hoạt động
          </label>
        </div>
        <div className="mt-3 flex gap-2">
          <Button onClick={submitGroup}>{editingGroupId ? 'Cập nhật' : 'Thêm nhóm'}</Button>
          <Button
            variant="secondary"
            onClick={() => {
              setEditingGroupId(null)
              setGroupForm({ name: '', type: 'SINGLE', sortOrder: '0', isGlobal: true, isActive: true })
            }}
          >
            Làm mới
          </Button>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-6">
          <label className="text-sm md:col-span-2">
            Nhóm
            <select className="mt-1 block w-full rounded-lg border px-3 py-2" value={valueForm.groupId} onChange={(e) => setValueForm((p) => ({ ...p, groupId: e.target.value }))}>
              <option value="">-- Chọn --</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </label>
          <Input placeholder="Giá trị hệ thống" value={valueForm.value} onChange={(e) => setValueForm((p) => ({ ...p, value: e.target.value }))} />
          <Input placeholder="Nhãn hiển thị" value={valueForm.label} onChange={(e) => setValueForm((p) => ({ ...p, label: e.target.value }))} />
          <Input type="number" placeholder="Giá cộng thêm" value={valueForm.priceDelta} onChange={(e) => setValueForm((p) => ({ ...p, priceDelta: e.target.value }))} />
          <Button onClick={submitValue}>Thêm giá trị</Button>
        </div>
        <div className="mt-3 space-y-2">
          {groups.map((group) => (
            <div key={group.id} className="rounded-lg border p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="font-semibold">
                  {group.name} ({loaiTuyChonMon(group.type)})
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setEditingGroupId(group.id)
                      setGroupForm({
                        name: group.name,
                        type: group.type,
                        sortOrder: String(group.sortOrder),
                        isGlobal: group.isGlobal,
                        isActive: group.isActive,
                      })
                    }}
                  >
                    Sửa nhóm
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={async () => {
                      if (!window.confirm('Xóa nhóm?')) return
                      await api.delete(`/orders/admin/menu/options/groups/${group.id}`)
                      await loadGroups()
                    }}
                  >
                    Xóa nhóm
                  </Button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="border-b">
                      <th className="py-1 text-left">Giá trị</th>
                      <th className="py-1 text-left">Nhãn</th>
                      <th className="py-1 text-left">Giá cộng</th>
                      <th className="py-1 text-left">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(group.values || []).map((value) => (
                      <tr key={value.id} className="border-b">
                        <td className="py-1">{value.value}</td>
                        <td>{value.label}</td>
                        <td>{Number(value.priceDelta || 0).toLocaleString('vi-VN')}đ</td>
                        <td className="flex gap-1 py-1">
                          <Button size="sm" variant="secondary" onClick={() => void editValue(value.id, value.label, value.priceDelta)}>
                            Sửa
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={async () => {
                              if (!window.confirm('Xóa giá trị?')) return
                              await api.delete(`/orders/admin/menu/options/values/${value.id}`)
                              await loadGroups()
                            }}
                          >
                            Xóa
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card title="M-05 Quản lý món">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Input placeholder="Tên món" value={itemForm.name} onChange={(e) => setItemForm((p) => ({ ...p, name: e.target.value }))} />
          <Input type="number" placeholder="Giá bán (VND)" value={itemForm.price} onChange={(e) => setItemForm((p) => ({ ...p, price: e.target.value }))} />
          <label className="text-sm">
            Danh mục
            <select className="mt-1 block w-full rounded-lg border px-3 py-2" value={itemForm.categoryId} onChange={(e) => setItemForm((p) => ({ ...p, categoryId: e.target.value }))}>
              <option value="">-- Chọn --</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <Input placeholder="Mô tả" value={itemForm.description} onChange={(e) => setItemForm((p) => ({ ...p, description: e.target.value }))} />
          <Input placeholder="Đường dẫn ảnh" value={itemForm.image} onChange={(e) => setItemForm((p) => ({ ...p, image: e.target.value }))} />
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={itemForm.available} onChange={(e) => setItemForm((p) => ({ ...p, available: e.target.checked }))} />
            Đang bán
          </label>
        </div>

        <div className="mt-3 rounded-lg border p-3">
          <p className="mb-2 text-sm font-medium">Gán nhóm tùy chọn</p>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            {groups.map((group) => (
              <label key={group.id} className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selectedGroupIds.includes(group.id)}
                  onChange={(e) =>
                    setSelectedGroupIds((prev) => (e.target.checked ? [...prev, group.id] : prev.filter((id) => id !== group.id)))
                  }
                />
                {group.name}
              </label>
            ))}
          </div>
        </div>

        <div className="mt-3 rounded-lg border p-3">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Công thức nguyên liệu</p>
              <p className="text-xs text-gray-500">Khai báo định lượng để hệ thống tự động trừ kho khi món hoàn thành.</p>
            </div>
            <Button type="button" variant="secondary" onClick={addRecipeRow}>
              Thêm nguyên liệu
            </Button>
          </div>

          {ingredients.length === 0 && (
            <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Chưa có nguyên liệu trong kho cho chi nhánh này. Hãy tạo nguyên liệu trước khi thêm món.
            </div>
          )}

          <div className="mt-3 space-y-2">
            {recipeRows.map((row, index) => (
              <div key={`recipe-${index}`} className="grid grid-cols-1 gap-2 md:grid-cols-5">
                <select
                  className="rounded border px-3 py-2 text-sm"
                  value={row.ingredientId}
                  onChange={(e) => updateRecipeRow(index, { ingredientId: e.target.value })}
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
                  min={0.0001}
                  step="0.01"
                  placeholder="Định lượng"
                  value={row.quantity}
                  onChange={(e) => updateRecipeRow(index, { quantity: e.target.value })}
                />

                <Input
                  placeholder="Đơn vị"
                  value={row.unit}
                  onChange={(e) => updateRecipeRow(index, { unit: e.target.value })}
                />

                <Input value={row.ingredientName} disabled placeholder="Tên nguyên liệu" />

                <div className="flex gap-2">
                  <Button type="button" variant="secondary" onClick={addRecipeRow}>
                    Thêm dòng
                  </Button>
                  <Button type="button" variant="danger" onClick={() => removeRecipeRow(index)}>
                    Xóa dòng
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-3 flex gap-2">
          <Button onClick={submitItem}>{editingItemId ? 'Cập nhật món' : 'Thêm món'}</Button>
          <Button variant="secondary" onClick={resetItemForm}>
            Làm mới
          </Button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          <Input placeholder="Tìm món" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
          <label className="text-sm">
            Lọc danh mục
            <select className="mt-1 block w-full rounded-lg border px-3 py-2" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
              <option value="ALL">Tất cả</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <Button variant="secondary" onClick={() => void loadItems()}>
              Tải lại
            </Button>
          </div>
        </div>

        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="py-2 text-left">Tên</th>
                <th className="py-2 text-left">Giá</th>
                <th className="py-2 text-left">Danh mục</th>
                <th className="py-2 text-left">Tùy chọn</th>
                <th className="py-2 text-left">Công thức</th>
                <th className="py-2 text-left">Trạng thái</th>
                <th className="py-2 text-left">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b">
                  <td className="py-2">{item.name}</td>
                  <td>{Number(item.price).toLocaleString('vi-VN')}đ</td>
                  <td>{item.category || '-'}</td>
                  <td>{item.optionGroups?.length || 0}</td>
                  <td title={recipeSummary(item)}>
                    <div className="max-w-xs">
                      <p>{item.recipe?.length || 0} nguyên liệu</p>
                      <p className="truncate text-xs text-gray-500">{recipeSummary(item)}</p>
                    </div>
                  </td>
                  <td>{item.available ? 'Đang bán' : 'Ngừng bán'}</td>
                  <td className="flex gap-2 py-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setEditingItemId(item.id)
                        setItemForm({
                          name: item.name,
                          price: String(item.price),
                          description: item.description || '',
                          image: '',
                          categoryId: item.categoryId || '',
                          available: item.available,
                        })
                        setSelectedGroupIds((item.optionGroups || []).map((group) => group.id))
                        setRecipeRows(
                          Array.isArray(item.recipe) && item.recipe.length
                            ? item.recipe.map((entry) => ({
                                ingredientId: entry.ingredientId,
                                ingredientName: entry.ingredientName || '',
                                quantity: String(entry.quantity),
                                unit: entry.unit || '',
                              }))
                            : [emptyRecipeRow()],
                        )
                      }}
                    >
                      Sửa
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={async () => {
                        if (!window.confirm('Xóa món?')) return
                        await api.delete(`/orders/admin/menu/items/${item.id}`)
                        await loadItems()
                      }}
                    >
                      Xóa
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
