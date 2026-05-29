import { FormEvent, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import api from '@/utils/api'
import { RoutePageSkeleton } from '@/components/ui/PageSkeleton'
import { trangThaiHoatDong, vaiTroNhanVien } from '@/utils/display'

type BranchItem = {
  id: string
  name: string
  code: string
  address?: string | null
  phone?: string | null
  managerId?: string | null
  managerName?: string | null
  isActive: boolean
  staffCount?: number
  createdAt?: string
}

type StaffItem = {
  id: string
  name: string
  role: 'ADMIN' | 'MANAGER' | 'WAITER' | 'BARISTA' | 'STAFF'
  isActive: boolean
}

const defaultForm = {
  name: '',
  code: '',
  address: '',
  phone: '',
  managerId: '',
  isActive: true,
}
const fieldClass =
  'min-h-11 w-full rounded-xl border border-amber-100/80 bg-white/95 px-3 py-2 text-sm text-slate-800 focus:border-amber-400 focus:ring-2 focus:ring-amber-300/60 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:focus:border-amber-400 dark:focus:ring-amber-500/30'

export default function Branches() {
  const [branches, setBranches] = useState<BranchItem[]>([])
  const [staffs, setStaffs] = useState<StaffItem[]>([])
  const [editingBranchId, setEditingBranchId] = useState<string | null>(null)
  const [includeInactive, setIncludeInactive] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(defaultForm)

  const managerOptions = useMemo(
    () => staffs.filter((staff) => staff.isActive && staff.role === 'MANAGER'),
    [staffs],
  )

  const visibleBranches = useMemo(() => {
    const q = keyword.trim().toLowerCase()
    if (!q) return branches
    return branches.filter((branch) => {
      return (
        String(branch.name || '').toLowerCase().includes(q) ||
        String(branch.address || '').toLowerCase().includes(q) ||
        String(branch.phone || '').toLowerCase().includes(q) ||
        String(branch.managerName || '').toLowerCase().includes(q)
      )
    })
  }, [branches, keyword])

  const loadData = async () => {
    setLoading(true)
    try {
      const [branchesRes, staffsRes] = await Promise.all([
        api.get('/branches', { params: { includeInactive } }),
        api.get('/users/staff', { params: { includeInactive: 'false' } }),
      ])
      setBranches(Array.isArray(branchesRes.data) ? branchesRes.data : [])
      setStaffs(Array.isArray(staffsRes.data) ? staffsRes.data : [])
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Không tải được dữ liệu chi nhánh')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [includeInactive])

  const resetForm = () => {
    setEditingBranchId(null)
    setForm(defaultForm)
  }

  const startEdit = (branch: BranchItem) => {
    setEditingBranchId(branch.id)
    setForm({
      name: branch.name || '',
      code: branch.code || '',
      address: branch.address || '',
      phone: branch.phone || '',
      managerId: branch.managerId || '',
      isActive: branch.isActive,
    })
  }

  const submitForm = async (e: FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) {
      toast.error('Tên chi nhánh không được để trống')
      return
    }
    if (!form.code.trim()) {
      toast.error('Mã chi nhánh không được để trống')
      return
    }

    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        code: form.code.trim(),
        address: form.address.trim() || null,
        phone: form.phone.trim() || null,
        managerId: form.managerId,
        isActive: form.isActive,
      }

      if (editingBranchId) {
        await api.patch(`/branches/${editingBranchId}`, payload)
        toast.success('Đã cập nhật chi nhánh')
      } else {
        await api.post('/branches', payload)
        toast.success('Đã tạo chi nhánh')
      }

      resetForm()
      await loadData()
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Lưu chi nhánh thất bại')
    } finally {
      setSaving(false)
    }
  }

  const deactivateBranch = async (branch: BranchItem) => {
    if (!window.confirm(`Vô hiệu hóa chi nhánh "${branch.name}"?`)) return
    try {
      await api.delete(`/branches/${branch.id}`)
      toast.success('Đã vô hiệu hóa chi nhánh')
      if (editingBranchId === branch.id) {
        resetForm()
      }
      await loadData()
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Không vô hiệu hóa được chi nhánh')
    }
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      <h1 className="text-xl font-bold text-slate-900 dark:text-white sm:text-2xl">Quản lý chi nhánh (M-24/M-25)</h1>

      <Card title="M-24 Thêm / sửa chi nhánh">
        <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          <Input
            placeholder="Tìm theo tên, địa chỉ hoặc quản lý"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
          <label className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-amber-100 bg-white/90 px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(e) => setIncludeInactive(e.target.checked)}
            />
            Hiển thị cả chi nhánh đã ngừng hoạt động
          </label>
          <div>
            <Button variant="secondary" onClick={resetForm}>
              {editingBranchId ? 'Hủy sửa' : 'Làm mới biểu mẫu'}
            </Button>
          </div>
        </div>

        <form onSubmit={submitForm} className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Input
            required
            placeholder="Tên chi nhánh"
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
          />
          <Input
            required
            placeholder="Mã chi nhánh (VD: HN01)"
            value={form.code}
            onChange={(e) => setForm((prev) => ({ ...prev, code: e.target.value }))}
          />
          <Input
            placeholder="Địa chỉ"
            value={form.address}
            onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))}
          />
          <Input
            placeholder="Số điện thoại"
            value={form.phone}
            onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
          />
          <label className="text-sm">
            Quản lý chi nhánh
            <select
              className={`${fieldClass} mt-1 block`}
              value={form.managerId}
              onChange={(e) => setForm((prev) => ({ ...prev, managerId: e.target.value }))}
            >
              <option value="">-- Chọn quản lý --</option>
              {managerOptions.map((staff) => (
                <option key={staff.id} value={staff.id}>
                  {staff.name} ({vaiTroNhanVien(staff.role)})
                </option>
              ))}
            </select>
          </label>
          <label className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-amber-100 bg-white/90 px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm((prev) => ({ ...prev, isActive: e.target.checked }))}
            />
            Chi nhánh đang hoạt động
          </label>
          <div>
            <Button type="submit" loading={saving}>
              {editingBranchId ? 'Cập nhật chi nhánh' : 'Tạo chi nhánh'}
            </Button>
          </div>
        </form>
      </Card>

      <Card title="Danh sách chi nhánh">
        {loading ? (
          <RoutePageSkeleton kind="form" />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2 pr-3">Tên chi nhánh</th>
                  <th className="py-2 pr-3">Mã</th>
                  <th className="py-2 pr-3">Địa chỉ</th>
                  <th className="py-2 pr-3">Số điện thoại</th>
                  <th className="py-2 pr-3">Quản lý</th>
                  <th className="py-2 pr-3">Nhân sự</th>
                  <th className="py-2 pr-3">Trạng thái</th>
                  <th className="py-2">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {visibleBranches.map((branch) => (
                  <tr key={branch.id} className="border-b">
                    <td className="py-2 pr-3">{branch.name}</td>
                    <td className="py-2 pr-3">{branch.code || '-'}</td>
                    <td className="py-2 pr-3">{branch.address || '-'}</td>
                    <td className="py-2 pr-3">{branch.phone || '-'}</td>
                    <td className="py-2 pr-3">{branch.managerName || branch.managerId || '-'}</td>
                    <td className="py-2 pr-3">{Number(branch.staffCount || 0)}</td>
                    <td className="py-2 pr-3">{trangThaiHoatDong(branch.isActive)}</td>
                    <td className="py-2">
                      <div className="flex gap-2">
                        <Button size="sm" variant="secondary" onClick={() => startEdit(branch)}>
                          Sửa
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => deactivateBranch(branch)}>
                          Vô hiệu hóa
                        </Button>
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
