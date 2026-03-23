import { FormEvent, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { useAuthStore } from '@/stores/authStore'
import api from '@/utils/api'
import { TableSkeleton } from '@/components/ui/PageSkeleton'
import {
  caLamViec,
  phuongThucChamCong,
  trangThaiHoatDong,
  vaiTroNhanVien,
} from '@/utils/display'
import { normalizeRole } from '@/utils/rbac'

/** Safely extract error message from unknown errors (typically axios errors). */
function getErrMsg(error: unknown, fallback: string): string {
  if (error && typeof error === 'object') {
    if ('response' in error) {
      const resp = (error as { response?: { data?: { message?: string } } }).response
      if (typeof resp?.data?.message === 'string') return resp.data.message
    }
    if (error instanceof Error) return error.message
  }
  return fallback
}



type StaffRole = 'ADMIN' | 'MANAGER' | 'WAITER' | 'BARISTA' | 'STAFF'
type ShiftType = 'MORNING' | 'AFTERNOON' | 'EVENING'
type AttendanceMethod = 'EMPLOYEE_CODE' | 'QR'

interface StaffItem {
  id: string
  name: string
  email: string
  phone?: string | null
  role: StaffRole
  branchId?: string | null
  branchName?: string | null
  employeeCode?: string | null
  personalQrCode?: string | null
  preferredShift?: ShiftType | null
  isActive: boolean
  createdAt: string
}

interface BranchItem {
  id: string
  name: string
  isActive: boolean
}

interface StaffShiftItem {
  id: string
  staffId: string
  staffName: string
  shiftDate: string
  shiftType: ShiftType
  note?: string | null
}

interface AttendanceItem {
  id: string
  staffId: string
  staffName: string
  workDate: string
  scheduledShift?: ShiftType | null
  checkInAt: string
  checkOutAt?: string | null
  checkInMethod: AttendanceMethod
  checkOutMethod?: AttendanceMethod | null
  workingMinutes?: number | null
}

function getMondayDateString(date = new Date()): string {
  const current = new Date(date)
  const day = current.getDay()
  const diff = day === 0 ? -6 : 1 - day
  current.setDate(current.getDate() + diff)
  return current.toISOString().split('T')[0]
}

export default function StaffManagement() {
  const currentRole = normalizeRole(useAuthStore((state) => state.user?.role))
  const canManageAccounts = currentRole === 'ADMIN' || currentRole === 'MANAGER'
  const canManagePrivilegedAccounts = currentRole === 'ADMIN'
  const [staffs, setStaffs] = useState<StaffItem[]>([])
  const [branches, setBranches] = useState<BranchItem[]>([])
  const [loadingStaff, setLoadingStaff] = useState(true)
  const [staffKeyword, setStaffKeyword] = useState('')
  const [staffRoleFilter, setStaffRoleFilter] = useState<'ALL' | StaffRole>('ALL')
  const [staffBranchFilter, setStaffBranchFilter] = useState('')
  const [includeInactive, setIncludeInactive] = useState(false)

  const [editingStaffId, setEditingStaffId] = useState<string | null>(null)
  const [staffForm, setStaffForm] = useState({
    name: '',
    email: '',
    password: '',
    phone: '',
    role: 'WAITER' as StaffRole,
    employeeCode: '',
    personalQrCode: '',
    preferredShift: 'MORNING' as ShiftType,
    branchId: '',
    isActive: true,
  })
  const [savingStaff, setSavingStaff] = useState(false)

  const [weekStart, setWeekStart] = useState(getMondayDateString())
  const [scheduleStaffId, setScheduleStaffId] = useState('')
  const [scheduleDate, setScheduleDate] = useState(new Date().toISOString().split('T')[0])
  const [scheduleShiftType, setScheduleShiftType] = useState<ShiftType>('MORNING')
  const [scheduleNote, setScheduleNote] = useState('')
  const [schedules, setSchedules] = useState<StaffShiftItem[]>([])
  const [loadingSchedule, setLoadingSchedule] = useState(true)
  const [savingSchedule, setSavingSchedule] = useState(false)

  const [attendanceIdentifier, setAttendanceIdentifier] = useState('')
  const [attendanceMethod, setAttendanceMethod] = useState<AttendanceMethod>('EMPLOYEE_CODE')
  const [processingAttendance, setProcessingAttendance] = useState(false)
  const [attendanceStaffId, setAttendanceStaffId] = useState('ALL')
  const [attendanceDateFrom, setAttendanceDateFrom] = useState(new Date().toISOString().split('T')[0])
  const [attendanceDateTo, setAttendanceDateTo] = useState(new Date().toISOString().split('T')[0])
  const [attendanceLogs, setAttendanceLogs] = useState<AttendanceItem[]>([])
  const [loadingAttendance, setLoadingAttendance] = useState(true)

  const activeStaffs = useMemo(
    () => staffs.filter((item) => item.isActive),
    [staffs],
  )

  const loadStaffs = async () => {
    setLoadingStaff(true)
    try {
      const params: Record<string, string> = {
        includeInactive: String(includeInactive),
      }
      if (staffKeyword.trim()) params.keyword = staffKeyword.trim()
      if (staffRoleFilter !== 'ALL') params.role = staffRoleFilter
      if (staffBranchFilter.trim()) params.branchId = staffBranchFilter.trim()

      const { data } = await api.get('/users/staff', { params })
      setStaffs(Array.isArray(data) ? data : [])
    } catch (error: unknown) {
      toast.error(getErrMsg(error, 'Không tải được danh sách nhân viên'))
    } finally {
      setLoadingStaff(false)
    }
  }

  const loadSchedules = async () => {
    if (!canManageAccounts) {
      setSchedules([])
      setLoadingSchedule(false)
      return
    }
    setLoadingSchedule(true)
    try {
      const params: Record<string, string> = { weekStart }
      const { data } = await api.get('/users/staff/schedules', { params })
      setSchedules(Array.isArray(data?.shifts) ? data.shifts : [])
    } catch (error: unknown) {
      toast.error(getErrMsg(error, 'Không tải được lịch phân ca'))
    } finally {
      setLoadingSchedule(false)
    }
  }

  const loadBranches = async () => {
    if (!canManageAccounts) {
      setBranches([])
      return
    }

    try {
      const { data } = await api.get('/users/admin/branches', {
        params: { includeInactive: 'true' },
      })
      setBranches(Array.isArray(data) ? data : [])
    } catch (error: unknown) {
      toast.error(getErrMsg(error, 'Không tải được danh sách chi nhánh'))
    }
  }

  const loadAttendance = async () => {
    setLoadingAttendance(true)
    try {
      const params: Record<string, string> = {
        dateFrom: attendanceDateFrom,
        dateTo: attendanceDateTo,
      }
      if (attendanceStaffId !== 'ALL') {
        params.staffId = attendanceStaffId
      }
      const { data } = await api.get('/users/staff/attendance', { params })
      setAttendanceLogs(Array.isArray(data) ? data : [])
    } catch (error: unknown) {
      toast.error(getErrMsg(error, 'Không tải được dữ liệu chấm công'))
    } finally {
      setLoadingAttendance(false)
    }
  }

  useEffect(() => {
    loadStaffs()
  }, [staffKeyword, staffRoleFilter, staffBranchFilter, includeInactive])

  useEffect(() => {
    loadSchedules()
  }, [weekStart, canManageAccounts])

  useEffect(() => {
    loadAttendance()
  }, [attendanceStaffId, attendanceDateFrom, attendanceDateTo])

  useEffect(() => {
    void loadBranches()
  }, [canManageAccounts])

  const resetStaffForm = () => {
    setEditingStaffId(null)
    setStaffForm({
      name: '',
      email: '',
      password: '',
      phone: '',
      role: 'WAITER',
      employeeCode: '',
      personalQrCode: '',
      preferredShift: 'MORNING',
      branchId: '',
      isActive: true,
    })
  }

  const startEditStaff = (staff: StaffItem) => {
    if (!canManageTargetStaff(staff)) {
      toast.error('Ban khong duoc sua tai khoan nay')
      return
    }
    setEditingStaffId(staff.id)
    setStaffForm({
      name: staff.name || '',
      email: staff.email || '',
      password: '',
      phone: staff.phone || '',
      role: staff.role || 'WAITER',
      employeeCode: staff.employeeCode || '',
      personalQrCode: staff.personalQrCode || '',
      preferredShift: staff.preferredShift || 'MORNING',
      branchId: staff.branchId || '',
      isActive: staff.isActive,
    })
  }

  const submitStaffForm = async (e: FormEvent) => {
    e.preventDefault()
    if (!canManageAccounts) {
      toast.error('Chi ADMIN hoac MANAGER moi duoc quan ly tai khoan')
      return
    }
    if (!canManageTargetRole(staffForm.role)) {
      toast.error('Role da chon vuot qua quyen hien tai')
      return
    }
    setSavingStaff(true)
    try {
      if (editingStaffId) {
        const payload: any = {
          name: staffForm.name,
          email: staffForm.email,
          phone: staffForm.phone || null,
          role: staffForm.role,
          employeeCode: staffForm.employeeCode,
          personalQrCode: staffForm.personalQrCode,
          preferredShift: staffForm.preferredShift,
          branchId: staffForm.branchId || null,
          isActive: staffForm.isActive,
        }
        if (staffForm.password.trim()) {
          payload.password = staffForm.password
        }
        await api.patch(`/users/staff/${editingStaffId}`, payload)
        toast.success('Đã cập nhật nhân viên')
      } else {
        await api.post('/users/staff', {
          name: staffForm.name,
          email: staffForm.email,
          password: staffForm.password,
          phone: staffForm.phone || null,
          role: staffForm.role,
          employeeCode: staffForm.employeeCode || null,
          personalQrCode: staffForm.personalQrCode || null,
          preferredShift: staffForm.preferredShift,
          branchId: staffForm.branchId || null,
        })
        toast.success('Đã thêm nhân viên')
      }

      resetStaffForm()
      await loadStaffs()
      await loadAttendance()
    } catch (error: unknown) {
      toast.error(getErrMsg(error, 'Lưu nhân viên thất bại'))
    } finally {
      setSavingStaff(false)
    }
  }

  const deleteStaff = async (staff: StaffItem) => {
    if (!canManageTargetStaff(staff)) {
      toast.error('Ban khong duoc xoa tai khoan nay')
      return
    }
    if (!window.confirm(`Xóa nhân viên ${staff.name}?`)) return
    try {
      await api.delete(`/users/staff/${staff.id}`)
      toast.success('Đã xóa nhân viên')
      if (editingStaffId === staff.id) {
        resetStaffForm()
      }
      await loadStaffs()
      await loadSchedules()
      await loadAttendance()
    } catch (error: unknown) {
      toast.error(getErrMsg(error, 'Xóa nhân viên thất bại'))
    }
  }

  const submitSchedule = async (e: FormEvent) => {
    e.preventDefault()
    if (!scheduleStaffId) {
      toast.error('Chọn nhân viên trước khi phân ca')
      return
    }

    setSavingSchedule(true)
    try {
      await api.post('/users/staff/schedules', {
        staffId: scheduleStaffId,
        shiftDate: scheduleDate,
        shiftType: scheduleShiftType,
        note: scheduleNote || null,
      })
      toast.success('Đã lưu phân ca')
      setScheduleNote('')
      await loadSchedules()
    } catch (error: unknown) {
      toast.error(getErrMsg(error, 'Phân ca thất bại'))
    } finally {
      setSavingSchedule(false)
    }
  }

  const removeSchedule = async (shiftId: string) => {
    if (!window.confirm('Xóa ca làm này?')) return
    try {
      await api.delete(`/users/staff/schedules/${shiftId}`)
      toast.success('Đã xóa ca làm')
      await loadSchedules()
    } catch (error: unknown) {
      toast.error(getErrMsg(error, 'Xóa ca làm thất bại'))
    }
  }

  const handleAttendanceAction = async (action: 'check-in' | 'check-out') => {
    if (!attendanceIdentifier.trim()) {
      toast.error('Nhập mã nhân viên hoặc mã QR')
      return
    }

    setProcessingAttendance(true)
    try {
      await api.post(`/users/staff/attendance/${action}`, {
        identifier: attendanceIdentifier.trim(),
        method: attendanceMethod,
      })
      toast.success(action === 'check-in' ? 'Chấm công vào ca thành công' : 'Chấm công ra ca thành công')
      await loadAttendance()
    } catch (error: unknown) {
      toast.error(getErrMsg(error, 'Chấm công thất bại'))
    } finally {
      setProcessingAttendance(false)
    }
  }

  const canManageTargetRole = (role: StaffRole) => {
    if (!canManageAccounts) return false
    if (canManagePrivilegedAccounts) return true
    return role !== 'ADMIN' && role !== 'MANAGER'
  }

  const canManageTargetStaff = (staff: StaffItem) => canManageTargetRole(staff.role)

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Quản lý nhân sự (Quản lý / Quản trị)</h1>

      <Card title="M-01 Quản lý nhân sự" subtitle="Chi ADMIN/MANAGER moi duoc them, sua, xoa tai khoan nhan vien">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <Input
            placeholder="Tìm theo tên/email/mã NV"
            value={staffKeyword}
            onChange={(e) => setStaffKeyword(e.target.value)}
          />
          <select
            className="rounded-lg border px-3 py-2 text-sm"
            value={staffRoleFilter}
            onChange={(e) => setStaffRoleFilter(e.target.value as 'ALL' | StaffRole)}
          >
            <option value="ALL">Tất cả vai trò</option>
            <option value="ADMIN">Quản trị hệ thống</option>
            <option value="MANAGER">Quản lý</option>
            <option value="WAITER">Phục vụ</option>
            <option value="BARISTA">Pha chế</option>
            <option value="STAFF">Nhân viên</option>
          </select>
          <select
            className="rounded-lg border px-3 py-2 text-sm"
            value={staffBranchFilter}
            onChange={(e) => setStaffBranchFilter(e.target.value)}
          >
            <option value="">Tất cả chi nhánh</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
                {!branch.isActive ? ' (Ngừng hoạt động)' : ''}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(e) => setIncludeInactive(e.target.checked)}
            />
            Hiện cả nhân viên đã vô hiệu hóa
          </label>
          <Button variant="secondary" onClick={resetStaffForm}>
            {editingStaffId ? 'Hủy sửa' : 'Làm mới form'}
          </Button>
        </div>

        {canManageAccounts ? (
          <form onSubmit={submitStaffForm} className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            <Input
              required
              placeholder="Họ tên"
              value={staffForm.name}
              onChange={(e) => setStaffForm((prev) => ({ ...prev, name: e.target.value }))}
            />
            <Input
              required
              type="email"
              placeholder="Email"
              value={staffForm.email}
              onChange={(e) => setStaffForm((prev) => ({ ...prev, email: e.target.value }))}
            />
            <Input
              type="password"
              placeholder={editingStaffId ? 'Đổi mật khẩu (tùy chọn)' : 'Mật khẩu đăng nhập'}
              required={!editingStaffId}
              value={staffForm.password}
              onChange={(e) => setStaffForm((prev) => ({ ...prev, password: e.target.value }))}
            />
            <Input
              placeholder="Số điện thoại"
              value={staffForm.phone}
              onChange={(e) => setStaffForm((prev) => ({ ...prev, phone: e.target.value }))}
            />
            <select
              className="rounded-lg border px-3 py-2 text-sm"
              value={staffForm.role}
              onChange={(e) => setStaffForm((prev) => ({ ...prev, role: e.target.value as StaffRole }))}
            >
              {canManagePrivilegedAccounts && <option value="ADMIN">Quản trị hệ thống</option>}
              {canManagePrivilegedAccounts && <option value="MANAGER">Quản lý</option>}
              <option value="WAITER">Phục vụ</option>
              <option value="BARISTA">Pha chế</option>
              <option value="STAFF">Nhân viên</option>
            </select>
            <select
              className="rounded-lg border px-3 py-2 text-sm"
              value={staffForm.preferredShift}
              onChange={(e) => setStaffForm((prev) => ({ ...prev, preferredShift: e.target.value as ShiftType }))}
            >
              <option value="MORNING">Ca sáng</option>
              <option value="AFTERNOON">Ca chiều</option>
              <option value="EVENING">Ca tối</option>
            </select>
            <Input
              placeholder="Mã nhân viên (để trống tự sinh)"
              value={staffForm.employeeCode}
              onChange={(e) => setStaffForm((prev) => ({ ...prev, employeeCode: e.target.value }))}
            />
            <Input
              placeholder="Mã QR cá nhân (để trống tự sinh)"
              value={staffForm.personalQrCode}
              onChange={(e) => setStaffForm((prev) => ({ ...prev, personalQrCode: e.target.value }))}
            />
            <select
              className="rounded-lg border px-3 py-2 text-sm"
              value={staffForm.branchId}
              onChange={(e) => setStaffForm((prev) => ({ ...prev, branchId: e.target.value }))}
            >
              <option value="">-- Chưa gán chi nhánh --</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                  {!branch.isActive ? ' (Ngừng hoạt động)' : ''}
                </option>
              ))}
            </select>
            {editingStaffId ? (
              <label className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={staffForm.isActive}
                  onChange={(e) => setStaffForm((prev) => ({ ...prev, isActive: e.target.checked }))}
                />
                Tài khoản đang hoạt động
              </label>
            ) : (
              <div />
            )}
            <Button type="submit" loading={savingStaff}>
              {editingStaffId ? 'Cập nhật nhân viên' : 'Thêm nhân viên'}
            </Button>
          </form>
        ) : (
          <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
            Bạn đang ở chế độ chỉ xem. Hệ thống sẽ ẩn bớt thông tin nhạy cảm và khóa toàn bộ thao tác thêm, sửa, xóa tài khoản.
          </div>
        )}

        <div className="mt-4 overflow-x-auto">
          {loadingStaff && <TableSkeleton cols={8} rows={5} />}
          {!loadingStaff && (
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2 pr-3">Tên</th>
                  <th className="py-2 pr-3">Email</th>
                  <th className="py-2 pr-3">Vai trò</th>
                  <th className="py-2 pr-3">Chi nhánh</th>
                  <th className="py-2 pr-3">Mã NV</th>
                  <th className="py-2 pr-3">Ca mặc định</th>
                  <th className="py-2 pr-3">Trạng thái</th>
                  <th className="py-2">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {staffs.map((staff) => (
                  <tr key={staff.id} className="border-b">
                    <td className="py-2 pr-3">{staff.name}</td>
                    <td className="py-2 pr-3">{staff.email}</td>
                    <td className="py-2 pr-3">{vaiTroNhanVien(staff.role)}</td>
                    <td className="py-2 pr-3">{staff.branchName || staff.branchId || '-'}</td>
                    <td className="py-2 pr-3">{staff.employeeCode || '-'}</td>
                    <td className="py-2 pr-3">{caLamViec(staff.preferredShift)}</td>
                    <td className="py-2 pr-3">{trangThaiHoatDong(staff.isActive)}</td>
                    <td className="py-2">
                      {canManageTargetStaff(staff) ? (
                        <div className="flex gap-2">
                          <Button size="sm" variant="secondary" onClick={() => startEditStaff(staff)}>
                            Sửa
                          </Button>
                          <Button size="sm" variant="danger" onClick={() => deleteStaff(staff)}>
                            Xóa
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-500">Chỉ xem</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      {canManageAccounts && (
        <Card title="M-02 Phân ca tuần" subtitle="Lập lịch ca sáng / chiều / tối">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <Input
            type="date"
            label="Tuần bắt đầu"
            value={weekStart}
            onChange={(e) => setWeekStart(e.target.value)}
          />
          <Input
            type="date"
            label="Ngày làm"
            value={scheduleDate}
            onChange={(e) => setScheduleDate(e.target.value)}
          />
          <select
            className="rounded-lg border px-3 py-2 text-sm"
            value={scheduleStaffId}
            onChange={(e) => setScheduleStaffId(e.target.value)}
          >
            <option value="">-- Chọn nhân viên --</option>
            {activeStaffs.map((staff) => (
              <option key={staff.id} value={staff.id}>
                {staff.name} ({vaiTroNhanVien(staff.role)})
              </option>
            ))}
          </select>
          <select
            className="rounded-lg border px-3 py-2 text-sm"
            value={scheduleShiftType}
            onChange={(e) => setScheduleShiftType(e.target.value as ShiftType)}
          >
            <option value="MORNING">Ca sáng</option>
            <option value="AFTERNOON">Ca chiều</option>
            <option value="EVENING">Ca tối</option>
          </select>
        </div>

        <form onSubmit={submitSchedule} className="mt-3 flex flex-col gap-3 md:flex-row">
          <Input
            placeholder="Ghi chú ca làm"
            value={scheduleNote}
            onChange={(e) => setScheduleNote(e.target.value)}
          />
          <Button type="submit" loading={savingSchedule}>
            Lưu phân ca
          </Button>
        </form>

        <div className="mt-4 overflow-x-auto">
          {loadingSchedule && <TableSkeleton cols={5} rows={4} />}
          {!loadingSchedule && (
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2 pr-3">Ngày</th>
                  <th className="py-2 pr-3">Nhân viên</th>
                  <th className="py-2 pr-3">Ca</th>
                  <th className="py-2 pr-3">Ghi chú</th>
                  <th className="py-2">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {schedules.map((shift) => (
                  <tr key={shift.id} className="border-b">
                    <td className="py-2 pr-3">{shift.shiftDate}</td>
                    <td className="py-2 pr-3">{shift.staffName}</td>
                    <td className="py-2 pr-3">{caLamViec(shift.shiftType)}</td>
                    <td className="py-2 pr-3">{shift.note || '-'}</td>
                    <td className="py-2">
                      <Button size="sm" variant="danger" onClick={() => removeSchedule(shift.id)}>
                        Xóa
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        </Card>
      )}

      <Card title="M-03 Chấm công" subtitle="Chấm công vào ca / ra ca bằng mã nhân viên hoặc mã QR cá nhân">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <Input
            placeholder="Mã nhân viên hoặc mã QR"
            value={attendanceIdentifier}
            onChange={(e) => setAttendanceIdentifier(e.target.value)}
          />
          <select
            className="rounded-lg border px-3 py-2 text-sm"
            value={attendanceMethod}
            onChange={(e) => setAttendanceMethod(e.target.value as AttendanceMethod)}
          >
            <option value="EMPLOYEE_CODE">Mã nhân viên</option>
            <option value="QR">Mã QR</option>
          </select>
          <Button loading={processingAttendance} onClick={() => handleAttendanceAction('check-in')}>
            Vào ca
          </Button>
          <Button variant="secondary" loading={processingAttendance} onClick={() => handleAttendanceAction('check-out')}>
            Ra ca
          </Button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
          {canManageAccounts ? (
            <select
              className="rounded-lg border px-3 py-2 text-sm"
              value={attendanceStaffId}
              onChange={(e) => setAttendanceStaffId(e.target.value)}
            >
              <option value="ALL">Tất cả nhân viên</option>
              {staffs.map((staff) => (
                <option key={staff.id} value={staff.id}>
                  {staff.name}
                </option>
              ))}
            </select>
          ) : (
            <div className="rounded-lg border px-3 py-2 text-sm text-gray-600">
              Chỉ hiển thị lịch sử chấm công của chính bạn
            </div>
          )}
          <Input type="date" value={attendanceDateFrom} onChange={(e) => setAttendanceDateFrom(e.target.value)} />
          <Input type="date" value={attendanceDateTo} onChange={(e) => setAttendanceDateTo(e.target.value)} />
          <Button variant="secondary" onClick={loadAttendance}>
            Tải lại chấm công
          </Button>
        </div>

        <div className="mt-4 overflow-x-auto">
          {loadingAttendance && <TableSkeleton cols={7} rows={5} />}
          {!loadingAttendance && (
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2 pr-3">Ngày</th>
                  <th className="py-2 pr-3">Nhân viên</th>
                  <th className="py-2 pr-3">Ca</th>
                  <th className="py-2 pr-3">Vào ca</th>
                  <th className="py-2 pr-3">Ra ca</th>
                  <th className="py-2 pr-3">Giờ công (phút)</th>
                  <th className="py-2 pr-3">Phương thức</th>
                </tr>
              </thead>
              <tbody>
                {attendanceLogs.map((log) => (
                  <tr key={log.id} className="border-b">
                    <td className="py-2 pr-3">{log.workDate}</td>
                    <td className="py-2 pr-3">{log.staffName}</td>
                    <td className="py-2 pr-3">{caLamViec(log.scheduledShift)}</td>
                    <td className="py-2 pr-3">{new Date(log.checkInAt).toLocaleString()}</td>
                    <td className="py-2 pr-3">{log.checkOutAt ? new Date(log.checkOutAt).toLocaleString() : '-'}</td>
                    <td className="py-2 pr-3">{log.workingMinutes ?? '-'}</td>
                    <td className="py-2 pr-3">
                      {phuongThucChamCong(log.checkInMethod)}
                      {log.checkOutMethod ? ` / ${phuongThucChamCong(log.checkOutMethod)}` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </div>
  )
}
