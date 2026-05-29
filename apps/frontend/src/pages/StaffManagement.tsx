import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import QRCode from 'qrcode/lib/browser'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { useAuthStore } from '@/stores/authStore'
import api from '@/utils/api'
import { TableSkeleton } from '@/components/ui/PageSkeleton'
import {
  caLamViec,
  trangThaiHoatDong,
  vaiTroNhanVien,
} from '@/utils/display'
import { normalizeRole } from '@/utils/rbac'

type StaffRole = 'ADMIN' | 'MANAGER' | 'WAITER' | 'BARISTA' | 'STAFF'
type ShiftType = string

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
  userId: string
  userName: string
  shiftId: string
  shiftName: string
  date: string
  notes?: string | null
}

interface AttendanceItem {
  id: string
  userId: string
  userName: string
  date: string
  checkInTime?: string | null
  checkOutTime?: string | null
  workedMinutes?: number | null
  status?: string | null
}

interface ShiftCoworkerItem {
  staffId: string
  staffName: string
  role: StaffRole
  employeeCode?: string | null
  branchId?: string | null
  branchName?: string | null
}

interface ShiftOverviewItem {
  date: string
  staffId: string
  staffName: string
  branchId?: string | null
  branchName?: string | null
  selectedShiftType?: ShiftType | null
  assignedShifts: StaffShiftItem[]
  sameShiftStaffs: ShiftCoworkerItem[]
}

interface PayrollItem {
  staffId: string
  staffName: string
  employeeCode?: string | null
  role: StaffRole
  branchId?: string | null
  branchName?: string | null
  totalWorkingHours: number
  workedDays: number
  baseSalaryEarned: number
  totalAllowances: number
  totalBonus: number
  totalDeductions: number
  netSalary: number
  status: string
}

interface PayrollSummary {
  month: string
  totalWorkingHours: number
  totalNetSalary: number
  items: PayrollItem[]
}

interface ShiftOption {
  id: string
  name: string
}

function getMondayDateString(date = new Date()): string {
  const current = new Date(date)
  const day = current.getDay()
  const diff = day === 0 ? -6 : 1 - day
  current.setDate(current.getDate() + diff)
  return current.toISOString().split('T')[0]
}

function getMonthStartDateString(date = new Date()): string {
  const current = new Date(date)
  current.setDate(1)
  return current.toISOString().split('T')[0]
}

const selectClass =
  'min-h-11 w-full rounded-xl border border-amber-100/80 bg-white/95 px-3 py-2 text-sm text-slate-800 focus:border-amber-400 focus:ring-2 focus:ring-amber-300/60 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:focus:border-amber-400 dark:focus:ring-amber-500/30'

const softPanelClass = 'rounded-xl border border-amber-100 bg-white/90 p-4'

export default function StaffManagement() {
  const currentUser = useAuthStore((state) => state.user)
  const currentRole = normalizeRole(currentUser?.role)
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
  const [scheduleShiftId, setScheduleShiftId] = useState('')
  const [scheduleNote, setScheduleNote] = useState('')
  const [shiftOptions, setShiftOptions] = useState<ShiftOption[]>([])
  const [schedules, setSchedules] = useState<StaffShiftItem[]>([])
  const [loadingSchedule, setLoadingSchedule] = useState(true)
  const [savingSchedule, setSavingSchedule] = useState(false)

  const [attendanceIdentifier, setAttendanceIdentifier] = useState('')
  const [processingAttendance, setProcessingAttendance] = useState(false)
  const [attendanceStaffId, setAttendanceStaffId] = useState('ALL')
  const [attendanceDateFrom, setAttendanceDateFrom] = useState(new Date().toISOString().split('T')[0])
  const [attendanceDateTo, setAttendanceDateTo] = useState(new Date().toISOString().split('T')[0])
  const [attendanceLogs, setAttendanceLogs] = useState<AttendanceItem[]>([])
  const [loadingAttendance, setLoadingAttendance] = useState(true)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [scannerAction, setScannerAction] = useState<'check-in' | 'check-out' | null>(null)
  const [scannerError, setScannerError] = useState('')
  const scannerVideoRef = useRef<HTMLVideoElement | null>(null)
  const scannerStreamRef = useRef<MediaStream | null>(null)
  const scannerTimerRef = useRef<number | null>(null)
  const scannerLockRef = useRef(false)
  const [shiftOverviewDate, setShiftOverviewDate] = useState(new Date().toISOString().split('T')[0])
  const [shiftOverviewStaffId, setShiftOverviewStaffId] = useState('')
  const [shiftOverview, setShiftOverview] = useState<ShiftOverviewItem | null>(null)
  const [loadingShiftOverview, setLoadingShiftOverview] = useState(true)
  const [payrollStaffId, setPayrollStaffId] = useState('ALL')
  const [payrollDateFrom, setPayrollDateFrom] = useState(getMonthStartDateString())
  const [payrollDateTo, setPayrollDateTo] = useState(new Date().toISOString().split('T')[0])
  const [payrollSummary, setPayrollSummary] = useState<PayrollSummary | null>(null)
  const [loadingPayroll, setLoadingPayroll] = useState(true)
  const [staffQrImages, setStaffQrImages] = useState<Record<string, string>>({})
  const activeBranchId = useMemo(() => {
    if (currentRole === 'MANAGER') return currentUser?.branchId || ''
    if (staffBranchFilter) return staffBranchFilter
    return branches[0]?.id || ''
  }, [branches, currentRole, currentUser?.branchId, staffBranchFilter])

  const activeStaffs = useMemo(
    () => staffs.filter((item) => item.isActive),
    [staffs],
  )
  const currentStaffEntry = useMemo(
    () => staffs.find((item) => item.id === currentUser?.id) || null,
    [staffs, currentUser?.id],
  )
  const employeeCodeByStaffId = useMemo(
    () =>
      staffs.reduce<Record<string, string>>((acc, item) => {
        if (item.id) {
          acc[item.id] = item.employeeCode?.trim() || '-'
        }
        return acc
      }, {}),
    [staffs],
  )

  const loadStaffs = async () => {
    if (!activeBranchId) {
      setStaffs([])
      setLoadingStaff(false)
      return
    }
    setLoadingStaff(true)
    try {
      const { data } = await api.get(`/branches/${activeBranchId}/staff`)
      let next = Array.isArray(data) ? data : []
      if (!includeInactive) next = next.filter((item) => item?.isActive !== false)
      if (staffKeyword.trim()) {
        const keyword = staffKeyword.trim().toLowerCase()
        next = next.filter((item) =>
          [item.name, item.email, item.employeeCode].some((v) => String(v || '').toLowerCase().includes(keyword)),
        )
      }
      if (staffRoleFilter !== 'ALL') next = next.filter((item) => item.role === staffRoleFilter)
      setStaffs(next)
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Không tải được danh sách nhân viên')
    } finally {
      setLoadingStaff(false)
    }
  }

  const loadSchedules = async () => {
    if (!canManageAccounts || !activeBranchId) {
      setSchedules([])
      setLoadingSchedule(false)
      return
    }
    setLoadingSchedule(true)
    try {
      const from = weekStart
      const to = new Date(new Date(weekStart).getTime() + 6 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      const { data } = await api.get(`/branches/${activeBranchId}/schedule`, { params: { from, to } })
      setSchedules(Array.isArray(data) ? data : [])
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Không tải được lịch phân ca')
    } finally {
      setLoadingSchedule(false)
    }
  }

  const loadShiftOptions = async () => {
    if (!canManageAccounts || !activeBranchId) {
      setShiftOptions([])
      return
    }
    try {
      const { data } = await api.get(`/branches/${activeBranchId}/shifts`)
      const next = (Array.isArray(data) ? data : [])
        .filter((item) => item?.isActive !== false)
        .map((item) => ({ id: item.id as string, name: item.name as string }))
      setShiftOptions(next)
      if (!scheduleShiftId && next[0]?.id) setScheduleShiftId(next[0].id)
    } catch {
      setShiftOptions([])
    }
  }

  const loadBranches = async () => {
    if (!canManageAccounts) {
      setBranches([])
      return
    }

    try {
      if (currentRole === 'ADMIN') {
        const { data } = await api.get('/branches', {
          params: { includeInactive: 'true' },
        })
        setBranches(Array.isArray(data) ? data : [])
        return
      }
      if (currentRole === 'MANAGER' && currentUser?.branchId) {
        const { data } = await api.get(`/branches/${currentUser.branchId}`)
        setBranches(data ? [data] : [])
        return
      }
      setBranches([])
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Không tải được danh sách chi nhánh')
    }
  }

  const loadAttendance = async () => {
    setLoadingAttendance(true)
    try {
      if (canManageAccounts && activeBranchId) {
        const { data } = await api.get(`/branches/${activeBranchId}/attendance`, {
          params: { from: attendanceDateFrom, to: attendanceDateTo },
        })
        let next = Array.isArray(data) ? data : []
        if (attendanceStaffId !== 'ALL') next = next.filter((item) => item.userId === attendanceStaffId)
        setAttendanceLogs(next)
      } else {
        const { data } = await api.get('/attendance/me', {
          params: { from: attendanceDateFrom, to: attendanceDateTo },
        })
        setAttendanceLogs(Array.isArray(data) ? data : [])
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Không tải được dữ liệu chấm công')
    } finally {
      setLoadingAttendance(false)
    }
  }

  const loadShiftOverview = async () => {
    setLoadingShiftOverview(true)
    try {
      const params: Record<string, string> = {
        date: shiftOverviewDate,
      }
      if (canManageAccounts) {
        if (shiftOverviewStaffId) params.staffId = shiftOverviewStaffId
      } else if (currentUser?.id) {
        params.staffId = currentUser.id
      }

      const targetStaffId = canManageAccounts ? shiftOverviewStaffId : currentUser?.id
      if (!targetStaffId) {
        setShiftOverview(null)
        return
      }
      const assignedShifts = schedules.filter((item) => item.userId === targetStaffId && item.date === shiftOverviewDate)
      const selectedShiftName = assignedShifts[0]?.shiftName || null
      const sameShiftStaffs = selectedShiftName
        ? schedules
            .filter((item) => item.date === shiftOverviewDate && item.shiftName === selectedShiftName)
            .map((item) => {
              const staff = staffs.find((s) => s.id === item.userId)
              return {
                staffId: item.userId,
                staffName: item.userName,
                role: (staff?.role || 'STAFF') as StaffRole,
                employeeCode: staff?.employeeCode || null,
                branchId: staff?.branchId || null,
                branchName: staff?.branchName || null,
              }
            })
        : []
      const staff = staffs.find((item) => item.id === targetStaffId)
      setShiftOverview({
        date: shiftOverviewDate,
        staffId: targetStaffId,
        staffName: staff?.name || currentUser?.name || '-',
        branchId: staff?.branchId || null,
        branchName: staff?.branchName || null,
        selectedShiftType: selectedShiftName,
        assignedShifts,
        sameShiftStaffs,
      })
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Không tải được ca làm hiện tại')
    } finally {
      setLoadingShiftOverview(false)
    }
  }

  const loadPayroll = async () => {
    setLoadingPayroll(true)
    try {
      const month = payrollDateFrom
      if (canManageAccounts && activeBranchId) {
        const { data } = await api.get(`/branches/${activeBranchId}/payroll`, { params: { month } })
        const list = (Array.isArray(data) ? data : []).filter((item) => (payrollStaffId === 'ALL' ? true : item.userId === payrollStaffId))
        const items: PayrollItem[] = list.map((item) => {
          const staff = staffs.find((s) => s.id === item.userId)
          return {
            staffId: item.userId,
            staffName: staff?.name || item.userId,
            employeeCode: staff?.employeeCode || null,
            role: (staff?.role || 'STAFF') as StaffRole,
            branchId: staff?.branchId || null,
            branchName: staff?.branchName || null,
            totalWorkingHours: Number(item.totalWorkedHours || 0),
            workedDays: Number(item.totalWorkedDays || 0),
            baseSalaryEarned: Number(item.baseSalaryEarned || 0),
            totalAllowances: Number(item.totalAllowances || 0),
            totalBonus: Number(item.totalBonus || 0),
            totalDeductions: Number(item.totalDeductions || 0),
            netSalary: Number(item.netSalary || 0),
            status: String(item.status || 'DRAFT'),
          }
        })
        setPayrollSummary({
          month,
          totalWorkingHours: items.reduce((sum, item) => sum + item.totalWorkingHours, 0),
          totalNetSalary: items.reduce((sum, item) => sum + item.netSalary, 0),
          items,
        })
      } else if (currentUser?.id) {
        const { data } = await api.get(`/payroll/${currentUser.id}`)
        const list = (Array.isArray(data) ? data : []).filter((item) => String(item.month || '').startsWith(month.slice(0, 7)))
        const items: PayrollItem[] = list.map((item) => ({
          staffId: currentUser.id,
          staffName: currentUser.name || currentUser.id,
          employeeCode: currentStaffEntry?.employeeCode || null,
          role: (currentRole || 'STAFF') as StaffRole,
          branchId: currentUser.branchId || null,
          branchName: currentStaffEntry?.branchName || null,
          totalWorkingHours: Number(item.totalWorkedHours || 0),
          workedDays: Number(item.totalWorkedDays || 0),
          baseSalaryEarned: Number(item.baseSalaryEarned || 0),
          totalAllowances: Number(item.totalAllowances || 0),
          totalBonus: Number(item.totalBonus || 0),
          totalDeductions: Number(item.totalDeductions || 0),
          netSalary: Number(item.netSalary || 0),
          status: String(item.status || 'DRAFT'),
        }))
        setPayrollSummary({
          month,
          totalWorkingHours: items.reduce((sum, item) => sum + item.totalWorkingHours, 0),
          totalNetSalary: items.reduce((sum, item) => sum + item.netSalary, 0),
          items,
        })
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Không tải được bảng lương')
    } finally {
      setLoadingPayroll(false)
    }
  }

  useEffect(() => {
    loadStaffs()
  }, [staffKeyword, staffRoleFilter, includeInactive, activeBranchId])

  useEffect(() => {
    loadSchedules()
  }, [weekStart, canManageAccounts, activeBranchId])

  useEffect(() => {
    loadAttendance()
  }, [attendanceStaffId, attendanceDateFrom, attendanceDateTo])

  useEffect(() => {
    loadShiftOverview()
  }, [shiftOverviewDate, shiftOverviewStaffId, canManageAccounts, currentUser?.id, schedules, staffs])

  useEffect(() => {
    loadPayroll()
  }, [payrollStaffId, payrollDateFrom, payrollDateTo, canManageAccounts, currentUser?.id, activeBranchId, staffs])

  useEffect(() => {
    void loadBranches()
  }, [canManageAccounts, currentRole, currentUser?.branchId])

  useEffect(() => {
    void loadShiftOptions()
  }, [canManageAccounts, activeBranchId])

  useEffect(() => {
    let cancelled = false
    const generateStaffQrImages = async () => {
      try {
        const qrTargets = staffs.filter((staff) => staff.personalQrCode && staff.personalQrCode.trim().length > 0)
        if (!qrTargets.length) {
          setStaffQrImages({})
          return
        }

        const pairs = await Promise.all(
          qrTargets.map(async (staff) => {
            const qrDataUrl = await QRCode.toDataURL(staff.personalQrCode as string, {
              errorCorrectionLevel: 'M',
              margin: 1,
              width: 220,
            })
            return [staff.id, qrDataUrl] as const
          }),
        )

        if (!cancelled) {
          setStaffQrImages(Object.fromEntries(pairs))
        }
      } catch {
        if (!cancelled) {
          setStaffQrImages({})
        }
      }
    }

    void generateStaffQrImages()
    return () => {
      cancelled = true
    }
  }, [staffs])

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
        await api.put(`/staff/${editingStaffId}`, payload)
        toast.success('Đã cập nhật nhân viên')
      } else {
        const targetBranchId = staffForm.branchId || activeBranchId
        await api.post(`/branches/${targetBranchId}/staff`, {
          name: staffForm.name,
          email: staffForm.email,
          password: staffForm.password,
          phone: staffForm.phone || null,
          role: staffForm.role,
          employeeCode: staffForm.employeeCode || null,
          personalQrCode: null,
          branchId: staffForm.branchId || null,
        })
        toast.success('Đã thêm nhân viên')
      }

      resetStaffForm()
      await loadStaffs()
      await loadAttendance()
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Lưu nhân viên thất bại')
    } finally {
      setSavingStaff(false)
    }
  }

  const deleteStaff = async (staff: StaffItem) => {
    if (!canManageTargetStaff(staff)) {
      toast.error('Ban khong duoc xoa tai khoan nay')
      return
    }
    if (!window.confirm(`Vô hiệu hóa nhân viên ${staff.name}?`)) return
    try {
      await api.patch(`/staff/${staff.id}/deactivate`)
      toast.success('Đã vô hiệu hóa nhân viên')
      if (editingStaffId === staff.id) {
        resetStaffForm()
      }
      await loadStaffs()
      await loadSchedules()
      await loadAttendance()
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Vô hiệu hóa nhân viên thất bại')
    }
  }

  const submitSchedule = async (e: FormEvent) => {
    e.preventDefault()
    if (!scheduleStaffId) {
      toast.error('Chọn nhân viên trước khi phân ca')
      return
    }
    if (!scheduleShiftId) {
      toast.error('Chọn ca làm trước khi phân ca')
      return
    }

    setSavingSchedule(true)
    try {
      await api.post('/schedule', {
        userId: scheduleStaffId,
        shiftId: scheduleShiftId,
        date: scheduleDate,
        notes: scheduleNote || null,
      })
      toast.success('Đã lưu phân ca')
      setScheduleNote('')
      await loadSchedules()
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Phân ca thất bại')
    } finally {
      setSavingSchedule(false)
    }
  }

  const removeSchedule = async (scheduleId: string) => {
    if (!window.confirm('Xóa ca làm này?')) return
    try {
      await api.delete(`/schedule/${scheduleId}`)
      toast.success('Đã xóa ca làm')
      await loadSchedules()
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Xóa ca làm thất bại')
    }
  }

  const handleAttendanceAction = async (
    action: 'check-in' | 'check-out',
    payload?: { identifier: string },
  ) => {
    const identifier = (payload?.identifier ?? attendanceIdentifier).trim()

    if (!identifier) {
      toast.error('Nhập mã nhân viên hoặc mã QR')
      return
    }

    setProcessingAttendance(true)
    try {
      await api.post(action === 'check-in' ? '/attendance/checkin' : '/attendance/checkout', {
        employeeCode: identifier,
      })
      toast.success(action === 'check-in' ? 'Chấm công vào ca thành công' : 'Chấm công ra ca thành công')
      await loadAttendance()
    } catch (error: any) {
      const status = Number(error?.response?.status || 0)
      const serverMessage = error?.response?.data?.message
      if (serverMessage) {
        toast.error(serverMessage)
      } else if (status === 400) {
        toast.error(
          action === 'check-in'
            ? 'Không thể vào ca. Có thể bạn đang trong ca hoặc mã chưa hợp lệ.'
            : 'Không thể ra ca. Có thể bạn chưa vào ca hoặc đã ra ca rồi.',
        )
      } else {
        toast.error('Chấm công thất bại')
      }
    } finally {
      setProcessingAttendance(false)
    }
  }

  const releaseScannerResources = () => {
    if (scannerTimerRef.current !== null) {
      window.clearInterval(scannerTimerRef.current)
      scannerTimerRef.current = null
    }
    if (scannerStreamRef.current) {
      scannerStreamRef.current.getTracks().forEach((track) => track.stop())
      scannerStreamRef.current = null
    }
    if (scannerVideoRef.current) {
      scannerVideoRef.current.pause()
      scannerVideoRef.current.srcObject = null
    }
    scannerLockRef.current = false
  }

  const closeQrScanner = () => {
    releaseScannerResources()
    setScannerOpen(false)
    setScannerAction(null)
    setScannerError('')
  }

  const openQrScanner = (action: 'check-in' | 'check-out') => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      toast.error('Thiết bị không hỗ trợ quét QR trực tiếp')
      return
    }
    if (!('BarcodeDetector' in window)) {
      toast.error('Trình duyệt chưa hỗ trợ quét QR trực tiếp, vui lòng nhập mã QR thủ công')
      return
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error('Không truy cập được camera của thiết bị')
      return
    }

    setScannerError('')
    setScannerAction(action)
    setScannerOpen(true)
  }

  useEffect(() => {
    if (!scannerOpen || !scannerAction) return

    let cancelled = false
    const startScanner = async () => {
      try {
        const detector = new (window as any).BarcodeDetector({ formats: ['qr_code'] })
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }

        scannerStreamRef.current = stream
        const videoEl = scannerVideoRef.current
        if (!videoEl) {
          setScannerError('Không khởi tạo được vùng camera')
          releaseScannerResources()
          return
        }

        videoEl.srcObject = stream
        await videoEl.play()

        scannerTimerRef.current = window.setInterval(async () => {
          if (scannerLockRef.current) return
          if (!scannerVideoRef.current || scannerVideoRef.current.readyState < 2) return
          try {
            const codes = await detector.detect(scannerVideoRef.current)
            const scannedText = codes
              .map((code: any) => String(code?.rawValue || '').trim())
              .find((value: string) => value.length > 0)
            if (!scannedText) return

            scannerLockRef.current = true
            setAttendanceIdentifier(scannedText)
            await handleAttendanceAction(scannerAction, { identifier: scannedText })
            closeQrScanner()
          } catch {
            // Ignore per-frame detect errors and keep scanning.
          }
        }, 300)
      } catch (error: any) {
        setScannerError(error?.message || 'Không truy cập được camera. Kiểm tra quyền camera rồi thử lại.')
      }
    }

    void startScanner()
    return () => {
      cancelled = true
      releaseScannerResources()
    }
  }, [scannerOpen, scannerAction])

  const canManageTargetRole = (role: StaffRole) => {
    if (!canManageAccounts) return false
    if (canManagePrivilegedAccounts) return true
    return role !== 'ADMIN' && role !== 'MANAGER'
  }

  const canManageTargetStaff = (staff: StaffItem) => canManageTargetRole(staff.role)

  const printStaffCard = (staff: StaffItem) => {
    const qrImage = staffQrImages[staff.id]
    if (!qrImage) {
      toast.error('Chưa tạo được mã QR cho nhân viên này')
      return
    }

    const popup = window.open('', '_blank', 'width=420,height=640')
    if (!popup) {
      toast.error('Không mở được cửa sổ in thẻ')
      return
    }

    popup.document.write(`
      <html>
        <head>
          <title>Thẻ nhân viên - ${staff.name}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 0; padding: 24px; background: #f5f5f5; }
            .card { background: #fff; border-radius: 16px; border: 1px solid #ddd; padding: 20px; width: 320px; }
            .meta { font-size: 13px; color: #555; margin-top: 8px; }
            .name { font-size: 20px; font-weight: 700; margin: 0; }
            .qr { margin-top: 16px; width: 220px; height: 220px; border: 1px solid #e5e5e5; border-radius: 12px; }
            .id { margin-top: 12px; font-size: 12px; color: #666; word-break: break-all; }
          </style>
        </head>
        <body>
          <div class="card">
            <p class="name">${staff.name}</p>
            <div class="meta">Mã NV: ${staff.employeeCode || '-'}</div>
            <div class="meta">Vai trò: ${vaiTroNhanVien(staff.role)}</div>
            <div class="meta">Chi nhánh: ${staff.branchName || staff.branchId || '-'}</div>
            <img class="qr" src="${qrImage}" alt="QR ${staff.personalQrCode || ''}" />
            <div class="meta">Mã QR: ${staff.personalQrCode || '-'}</div>
            <div class="id">ID: ${staff.id}</div>
          </div>
          <script>window.onload = () => window.print();</script>
        </body>
      </html>
    `)
    popup.document.close()
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      <h1 className="text-xl font-bold text-slate-900 dark:text-white sm:text-2xl">Quản lý nhân sự (Quản lý / Quản trị)</h1>

      <Card title="M-01 Quản lý nhân sự" subtitle="Chi ADMIN/MANAGER moi duoc them, sua, xoa tai khoan nhan vien">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <Input
            placeholder="Tìm theo tên/email/mã NV"
            value={staffKeyword}
            onChange={(e) => setStaffKeyword(e.target.value)}
          />
          <select
            className={selectClass}
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
            className={selectClass}
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
          <label className="flex min-h-11 items-center gap-2 rounded-xl border border-amber-100 bg-white/90 px-3 py-2 text-sm">
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
              className={selectClass}
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
              className={selectClass}
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
            {editingStaffId ? (
              <Input
                placeholder="Mã QR cá nhân (để trống tự sinh lại)"
                value={staffForm.personalQrCode}
                onChange={(e) => setStaffForm((prev) => ({ ...prev, personalQrCode: e.target.value }))}
              />
            ) : (
              <div className="rounded-xl border border-dashed border-amber-200 px-3 py-2 text-sm text-slate-600">
                Mã QR cá nhân sẽ được hệ thống tự sinh sau khi tạo nhân viên
              </div>
            )}
            <select
              className={selectClass}
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
              <label className="flex min-h-11 items-center gap-2 rounded-xl border border-amber-100 bg-white/90 px-3 py-2 text-sm">
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
          <div className="mt-4 rounded-xl border border-amber-100 bg-white/90 px-4 py-3 text-sm text-slate-600">
            Bạn đang ở chế độ chỉ xem. Hệ thống sẽ ẩn bớt thông tin nhạy cảm và khóa toàn bộ thao tác thêm, sửa, xóa tài khoản.
          </div>
        )}

        <div className="mt-4 space-y-3 md:hidden">
          {loadingStaff && <TableSkeleton cols={2} rows={5} />}
          {!loadingStaff &&
            staffs.map((staff) => (
              <div key={`mobile-${staff.id}`} className="rounded-xl border border-amber-100 bg-white/90 p-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-900">{staff.name}</p>
                    <p className="text-xs text-slate-500">{staff.email}</p>
                  </div>
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">{vaiTroNhanVien(staff.role)}</span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-600">
                  <p>Chi nhánh: <span className="font-medium">{staff.branchName || staff.branchId || '-'}</span></p>
                  <p>Mã NV: <span className="font-medium">{staff.employeeCode || '-'}</span></p>
                  <p>Ca: <span className="font-medium">{caLamViec(staff.preferredShift)}</span></p>
                  <p>Trạng thái: <span className="font-medium">{trangThaiHoatDong(staff.isActive)}</span></p>
                </div>
                <div className="mt-2 flex gap-2">
                  {canManageTargetStaff(staff) ? (
                    <>
                      <Button size="sm" variant="secondary" className="flex-1" onClick={() => startEditStaff(staff)}>
                        Sửa
                      </Button>
                      <Button size="sm" variant="danger" className="flex-1" onClick={() => deleteStaff(staff)}>
                        Xóa
                      </Button>
                    </>
                  ) : (
                    <span className="text-xs text-slate-500">Chỉ xem</span>
                  )}
                </div>
              </div>
            ))}
        </div>

        <div className="mt-4 hidden overflow-x-auto md:block">
          {loadingStaff && <TableSkeleton cols={9} rows={5} />}
          {!loadingStaff && (
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2 pr-3">Tên</th>
                  <th className="py-2 pr-3">Email</th>
                  <th className="py-2 pr-3">Vai trò</th>
                  <th className="py-2 pr-3">Chi nhánh</th>
                  <th className="py-2 pr-3">Mã NV</th>
                  <th className="py-2 pr-3">Mã QR cá nhân</th>
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
                    <td className="py-2 pr-3">{staff.personalQrCode || '-'}</td>
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

        {canManageAccounts && (
          <div className="mt-6">
            <h2 className="text-base font-semibold text-slate-900">Thẻ nhân viên (ID + QR cá nhân)</h2>
            <p className="mt-1 text-sm text-slate-600">In thẻ cho nhân viên để quét QR vào ca/ra ca nhanh hơn.</p>
            <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {staffs.map((staff) => (
                <div key={`card-${staff.id}`} className="rounded-xl border border-amber-100 bg-white/90 p-4 shadow-sm">
                  <p className="text-base font-semibold text-slate-900">{staff.name}</p>
                  <p className="mt-1 text-sm text-slate-600">Mã NV: {staff.employeeCode || '-'}</p>
                  <p className="text-sm text-slate-600">Vai trò: {vaiTroNhanVien(staff.role)}</p>
                  <p className="text-sm text-slate-600">Chi nhánh: {staff.branchName || staff.branchId || '-'}</p>
                  <p className="mt-1 break-all text-xs text-slate-500">ID: {staff.id}</p>
                  <div className="mt-3 flex justify-center rounded-lg border border-amber-100 bg-amber-50/40 p-2">
                    {staffQrImages[staff.id] ? (
                      <img
                        src={staffQrImages[staff.id]}
                        alt={`QR ${staff.personalQrCode || ''}`}
                        className="h-40 w-40 rounded-md border bg-white p-1"
                      />
                    ) : (
                      <span className="py-14 text-xs text-gray-500">Chưa có mã QR</span>
                    )}
                  </div>
                  <p className="mt-2 text-xs text-gray-500 break-all">Mã QR: {staff.personalQrCode || '-'}</p>
                  <div className="mt-3">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={!staffQrImages[staff.id]}
                      onClick={() => printStaffCard(staff)}
                    >
                      In thẻ nhân viên
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
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
            className={selectClass}
            value={scheduleStaffId}
            onChange={(e) => setScheduleStaffId(e.target.value)}
          >
            <option value="">-- Chọn nhân viên --</option>
            {activeStaffs.map((staff) => (
              <option key={staff.id} value={staff.id}>
                {staff.name} - {staff.employeeCode || 'N/A'} ({vaiTroNhanVien(staff.role)})
              </option>
            ))}
          </select>
          <select className={selectClass} value={scheduleShiftId} onChange={(e) => setScheduleShiftId(e.target.value)}>
            <option value="">-- Chọn ca làm --</option>
            {shiftOptions.map((shift) => (
              <option key={shift.id} value={shift.id}>
                {shift.name}
              </option>
            ))}
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
                    <td className="py-2 pr-3">{shift.date}</td>
                    <td className="py-2 pr-3">{shift.userName}</td>
                    <td className="py-2 pr-3">{shift.shiftName}</td>
                    <td className="py-2 pr-3">{shift.notes || '-'}</td>
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
        <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-amber-100 bg-white/90 px-3 py-2 text-sm text-slate-700">
            Mã NV của bạn: <span className="font-semibold">{currentStaffEntry?.employeeCode || '-'}</span>
          </div>
          <div className="rounded-xl border border-amber-100 bg-white/90 px-3 py-2 text-sm text-slate-700 md:col-span-2">
            Mã QR cá nhân: <span className="font-semibold">{currentStaffEntry?.personalQrCode || '-'}</span>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <Input
            placeholder="Mã nhân viên hoặc mã QR"
            value={attendanceIdentifier}
            onChange={(e) => setAttendanceIdentifier(e.target.value)}
          />
          <div className="rounded-xl border border-amber-100 bg-white/90 px-3 py-2 text-sm text-slate-600">
            Check-in/out theo mã nhân viên hoặc QR cá nhân
          </div>
          <Button loading={processingAttendance} onClick={() => handleAttendanceAction('check-in')}>
            Vào ca
          </Button>
          <Button variant="secondary" loading={processingAttendance} onClick={() => handleAttendanceAction('check-out')}>
            Ra ca
          </Button>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
          <Button
            variant="secondary"
            disabled={processingAttendance || scannerOpen}
            onClick={() => openQrScanner('check-in')}
          >
            Quét QR vào ca
          </Button>
          <Button
            variant="secondary"
            disabled={processingAttendance || scannerOpen}
            onClick={() => openQrScanner('check-out')}
          >
            Quét QR ra ca
          </Button>
          {scannerOpen ? (
            <Button variant="danger" onClick={closeQrScanner}>
              Tắt camera quét
            </Button>
          ) : (
            <div className="rounded-xl border border-amber-100 bg-white/90 px-3 py-2 text-sm text-slate-600">
              Quét mã QR cá nhân để tự động điền mã và chấm công
            </div>
          )}
        </div>
        {scannerOpen && (
          <div className="mt-3 rounded-xl border border-amber-100 bg-white/90 p-3">
            <p className="text-sm text-slate-700">
              Đưa mã QR cá nhân vào khung hình để {scannerAction === 'check-out' ? 'ra ca' : 'vào ca'}.
            </p>
            <video ref={scannerVideoRef} className="mt-2 w-full max-w-md rounded-lg border bg-black" muted playsInline />
            {scannerError && <p className="mt-2 text-sm text-red-600">{scannerError}</p>}
          </div>
        )}

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
          {canManageAccounts ? (
            <select
              className={selectClass}
              value={attendanceStaffId}
              onChange={(e) => setAttendanceStaffId(e.target.value)}
            >
                <option value="ALL">Tất cả nhân viên</option>
                {staffs.map((staff) => (
                  <option key={staff.id} value={staff.id}>
                    {staff.name} - {staff.employeeCode || 'N/A'}
                  </option>
                ))}
              </select>
          ) : (
            <div className="rounded-xl border border-amber-100 bg-white/90 px-3 py-2 text-sm text-slate-600">
              Chỉ hiển thị lịch sử chấm công của chính bạn
            </div>
          )}
          <Input type="date" value={attendanceDateFrom} onChange={(e) => setAttendanceDateFrom(e.target.value)} />
          <Input type="date" value={attendanceDateTo} onChange={(e) => setAttendanceDateTo(e.target.value)} />
          <Button variant="secondary" onClick={loadAttendance}>
            Tải lại chấm công
          </Button>
        </div>

        <div className="mt-4 space-y-3 md:hidden">
            {loadingAttendance && <TableSkeleton cols={2} rows={4} />}
            {!loadingAttendance && attendanceLogs.map((log) => (
              <div key={`mobile-att-${log.id}`} className="rounded-xl border border-amber-100 bg-white/90 p-3 text-xs">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-slate-900">{log.userName}</p>
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">{log.date}</span>
                </div>
                <p className="mt-1 text-slate-600">Mã NV: {employeeCodeByStaffId[log.userId] || '-'}</p>
                <p className="text-slate-600">Vào: {log.checkInTime ? new Date(log.checkInTime).toLocaleString() : '-'}</p>
                <p className="text-slate-600">Ra: {log.checkOutTime ? new Date(log.checkOutTime).toLocaleString() : '-'}</p>
                <p className="text-slate-600">Giờ công: {log.workedMinutes ?? '-'} phút</p>
              </div>
            ))}
        </div>

        <div className="mt-4 hidden overflow-x-auto md:block">
            {loadingAttendance && <TableSkeleton cols={8} rows={5} />}
            {!loadingAttendance && (
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2 pr-3">Ngày</th>
                    <th className="py-2 pr-3">Nhân viên</th>
                    <th className="py-2 pr-3">Mã NV</th>
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
                      <td className="py-2 pr-3">{log.date}</td>
                      <td className="py-2 pr-3">{log.userName}</td>
                      <td className="py-2 pr-3">{employeeCodeByStaffId[log.userId] || '-'}</td>
                      <td className="py-2 pr-3">{log.status || '-'}</td>
                      <td className="py-2 pr-3">{log.checkInTime ? new Date(log.checkInTime).toLocaleString() : '-'}</td>
                      <td className="py-2 pr-3">{log.checkOutTime ? new Date(log.checkOutTime).toLocaleString() : '-'}</td>
                      <td className="py-2 pr-3">{log.workedMinutes ?? '-'}</td>
                    <td className="py-2 pr-3">App/QR</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      <Card title="Ca làm & đồng ca" subtitle="Xem ca hiện tại và nhân sự làm cùng ca">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <Input type="date" value={shiftOverviewDate} onChange={(e) => setShiftOverviewDate(e.target.value)} />
          {canManageAccounts ? (
            <select
              className={selectClass}
              value={shiftOverviewStaffId}
              onChange={(e) => setShiftOverviewStaffId(e.target.value)}
            >
                <option value="">-- Xem theo tài khoản của bạn --</option>
                {activeStaffs.map((staff) => (
                  <option key={staff.id} value={staff.id}>
                    {staff.name} - {staff.employeeCode || 'N/A'} ({vaiTroNhanVien(staff.role)})
                  </option>
                ))}
              </select>
          ) : (
            <div className="rounded-xl border border-amber-100 bg-white/90 px-3 py-2 text-sm text-slate-600">
              Đang xem theo tài khoản: {currentUser?.name || 'Nhân viên hiện tại'}
            </div>
          )}
          <Button variant="secondary" onClick={loadShiftOverview}>
            Tải lại ca làm
          </Button>
          <div className="rounded-xl border border-amber-100 bg-white/90 px-3 py-2 text-sm text-slate-600">
            {shiftOverview?.selectedShiftType ? `Ca đang chọn: ${caLamViec(shiftOverview.selectedShiftType)}` : 'Chưa có ca được phân'}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className={softPanelClass}>
            <p className="text-xs font-semibold uppercase text-slate-500">Nhân sự đang xem</p>
            <p className="mt-2 text-lg font-bold text-slate-900">{shiftOverview?.staffName || currentUser?.name || '-'}</p>
            <p className="mt-1 text-sm text-slate-600">{shiftOverview?.branchName || 'Chưa gán chi nhánh'}</p>
            <p className="mt-2 text-sm text-slate-700">
              {shiftOverview?.selectedShiftType ? caLamViec(shiftOverview.selectedShiftType) : 'Chưa có ca trong ngày'}
            </p>
          </div>
          <div className={softPanelClass}>
            <p className="text-xs font-semibold uppercase text-slate-500">Ca được phân trong ngày</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {shiftOverview?.assignedShifts?.length ? (
                shiftOverview.assignedShifts.map((shift) => (
                  <span key={shift.id} className="rounded-full bg-white px-3 py-1 text-sm font-medium text-slate-700 ring-1 ring-amber-200">
                    {shift.shiftName}
                  </span>
                ))
              ) : (
                <span className="text-sm text-slate-500">Không có ca được phân</span>
              )}
            </div>
          </div>
          <div className={softPanelClass}>
            <p className="text-xs font-semibold uppercase text-slate-500">Nhân sự cùng ca</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{shiftOverview?.sameShiftStaffs?.length || 0}</p>
            <p className="mt-1 text-sm text-slate-600">Bao gồm cả người đang xem nếu có lịch phân ca khớp</p>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          {loadingShiftOverview && <TableSkeleton cols={4} rows={4} />}
          {!loadingShiftOverview && (
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2 pr-3">Tên</th>
                  <th className="py-2 pr-3">Vai trò</th>
                  <th className="py-2 pr-3">Mã NV</th>
                  <th className="py-2 pr-3">Chi nhánh</th>
                </tr>
              </thead>
              <tbody>
                {(shiftOverview?.sameShiftStaffs || []).map((staff) => (
                  <tr key={staff.staffId} className="border-b">
                    <td className="py-2 pr-3">{staff.staffName}</td>
                    <td className="py-2 pr-3">{vaiTroNhanVien(staff.role)}</td>
                    <td className="py-2 pr-3">{staff.employeeCode || '-'}</td>
                    <td className="py-2 pr-3">{staff.branchName || staff.branchId || '-'}</td>
                  </tr>
                ))}
                {!shiftOverview?.sameShiftStaffs?.length && (
                  <tr>
                    <td className="py-3 text-sm text-gray-500" colSpan={4}>
                      Chưa có nhân sự cùng ca trong ngày đã chọn
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      <Card title="Lương tạm tính" subtitle="Tổng hợp số phút công và tiền công theo vai trò">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          {canManageAccounts ? (
            <select
              className={selectClass}
              value={payrollStaffId}
              onChange={(e) => setPayrollStaffId(e.target.value)}
            >
                <option value="ALL">Tất cả nhân viên</option>
                {activeStaffs.map((staff) => (
                  <option key={staff.id} value={staff.id}>
                    {staff.name} - {staff.employeeCode || 'N/A'}
                  </option>
                ))}
              </select>
          ) : (
            <div className="rounded-xl border border-amber-100 bg-white/90 px-3 py-2 text-sm text-slate-600">
              Đang tính lương cho: {currentUser?.name || 'Tài khoản hiện tại'}
            </div>
          )}
          <Input type="date" value={payrollDateFrom} onChange={(e) => setPayrollDateFrom(e.target.value)} />
          <Input type="date" value={payrollDateTo} onChange={(e) => setPayrollDateTo(e.target.value)} />
          <Button variant="secondary" onClick={loadPayroll}>
            Tải lại lương
          </Button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-4">
          <div className={softPanelClass}>
            <p className="text-xs font-semibold uppercase text-slate-500">Tổng tiền lương</p>
            <p className="mt-2 text-xl font-bold text-slate-900">{Number(payrollSummary?.totalNetSalary || 0).toLocaleString()}đ</p>
          </div>
          <div className={softPanelClass}>
            <p className="text-xs font-semibold uppercase text-slate-500">Tổng giờ công</p>
            <p className="mt-2 text-xl font-bold text-slate-900">{payrollSummary?.totalWorkingHours ?? 0} giờ</p>
          </div>
          <div className={softPanelClass}>
            <p className="text-xs font-semibold uppercase text-slate-500">Tổng phút công</p>
            <p className="mt-2 text-xl font-bold text-slate-900">{payrollSummary?.month || '-'}</p>
          </div>
          <div className={softPanelClass}>
            <p className="text-xs font-semibold uppercase text-slate-500">Ca hoàn tất</p>
            <p className="mt-2 text-xl font-bold text-slate-900">{payrollSummary?.items?.length ?? 0}</p>
          </div>
        </div>

        <div className="mt-4 space-y-3 md:hidden">
          {loadingPayroll && <TableSkeleton cols={2} rows={4} />}
          {!loadingPayroll &&
            (payrollSummary?.items || []).map((item) => (
              <div key={`mobile-pay-${item.staffId}`} className="rounded-xl border border-amber-100 bg-white/90 p-3 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-slate-900">{item.staffName}</p>
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-emerald-700">
                    {Number(item.netSalary || 0).toLocaleString()}đ
                  </span>
                </div>
                <p className="mt-1 text-slate-600">Mã NV: {item.employeeCode || employeeCodeByStaffId[item.staffId] || '-'}</p>
                <p className="text-slate-600">Vai trò: {vaiTroNhanVien(item.role)}</p>
                <p className="text-slate-600">Giờ công: {item.totalWorkingHours} giờ</p>
                <p className="text-slate-600">Ngày công: {item.workedDays}</p>
                <p className="text-slate-600">Trạng thái: {item.status}</p>
              </div>
            ))}
        </div>

        <div className="mt-4 hidden overflow-x-auto md:block">
          {loadingPayroll && <TableSkeleton cols={9} rows={5} />}
          {!loadingPayroll && (
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2 pr-3">Nhân viên</th>
                  <th className="py-2 pr-3">Mã NV</th>
                  <th className="py-2 pr-3">Vai trò</th>
                  <th className="py-2 pr-3">Chi nhánh</th>
                  <th className="py-2 pr-3">Đơn giá giờ</th>
                  <th className="py-2 pr-3">Giờ công</th>
                  <th className="py-2 pr-3">Ngày chấm công</th>
                  <th className="py-2 pr-3">Ca hoàn tất</th>
                  <th className="py-2 pr-3">Lương tạm tính</th>
                </tr>
              </thead>
              <tbody>
                {(payrollSummary?.items || []).map((item) => (
                  <tr key={item.staffId} className="border-b">
                    <td className="py-2 pr-3">{item.staffName}</td>
                    <td className="py-2 pr-3">{item.employeeCode || employeeCodeByStaffId[item.staffId] || '-'}</td>
                    <td className="py-2 pr-3">{vaiTroNhanVien(item.role)}</td>
                    <td className="py-2 pr-3">{item.branchName || item.branchId || '-'}</td>
                    <td className="py-2 pr-3">{Number(item.baseSalaryEarned || 0).toLocaleString()}đ</td>
                    <td className="py-2 pr-3">{item.totalWorkingHours} giờ</td>
                    <td className="py-2 pr-3">{item.workedDays}</td>
                    <td className="py-2 pr-3">{item.status}</td>
                    <td className="py-2 pr-3 font-semibold text-emerald-700">{Number(item.netSalary || 0).toLocaleString()}đ</td>
                  </tr>
                ))}
                {!payrollSummary?.items?.length && (
                  <tr>
                    <td className="py-3 text-sm text-gray-500" colSpan={9}>
                      Chưa có dữ liệu lương trong khoảng thời gian đã chọn
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </div>
  )
}
