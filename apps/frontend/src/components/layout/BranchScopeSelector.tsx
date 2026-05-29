import { useEffect, useMemo, useState } from 'react'
import api from '@/utils/api'
import { normalizeRole } from '@/utils/rbac'
import { useAuthStore } from '@/stores/authStore'
import { useBranchScopeStore } from '@/stores/branchScopeStore'

type BranchItem = {
  id: string
  name: string
  isActive?: boolean
}

export default function BranchScopeSelector() {
  const user = useAuthStore((state) => state.user)
  const role = normalizeRole(user?.role)
  const selectedBranchId = useBranchScopeStore((state) => state.selectedBranchId)
  const setSelectedBranchId = useBranchScopeStore((state) => state.setSelectedBranchId)
  const [branches, setBranches] = useState<BranchItem[]>([])
  const [managerBranchName, setManagerBranchName] = useState('')

  const isAdminVisible = role === 'ADMIN'
  const isManagerVisible = role === 'MANAGER'

  useEffect(() => {
    if (!isAdminVisible) return
    let cancelled = false

    const run = async () => {
      try {
        const { data } = await api.get('/branches', { params: { includeInactive: false } })
        if (cancelled) return
        const list = Array.isArray(data) ? (data as BranchItem[]) : []
        setBranches(list)
      } catch {
        if (!cancelled) {
          setBranches([])
        }
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [isAdminVisible])

  useEffect(() => {
    if (!isManagerVisible || !user?.branchId) {
      setManagerBranchName('')
      return
    }
    let cancelled = false
    const run = async () => {
      try {
        const { data } = await api.get(`/branches/${user.branchId}`)
        if (cancelled) return
        setManagerBranchName(String(data?.name || '').trim())
      } catch {
        if (!cancelled) {
          setManagerBranchName('')
        }
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [isManagerVisible, user?.branchId])

  useEffect(() => {
    if (!isAdminVisible) return
    if (selectedBranchId) return
    if (user?.branchId) {
      setSelectedBranchId(user.branchId)
    }
  }, [isAdminVisible, selectedBranchId, setSelectedBranchId, user?.branchId])

  useEffect(() => {
    if (!isManagerVisible) return
    if (!user?.branchId) return
    if (selectedBranchId === user.branchId) return
    setSelectedBranchId(user.branchId)
  }, [isManagerVisible, user?.branchId, selectedBranchId, setSelectedBranchId])

  const activeOptions = useMemo(
    () => branches.filter((item) => item.isActive !== false),
    [branches],
  )

  if (isManagerVisible) {
    const branchLabel = managerBranchName || user?.branchId || 'N/A'
    return (
      <div className="hidden items-center gap-2 rounded-xl border border-amber-100 bg-white/85 px-2 py-1 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200 md:flex">
        <span className="font-medium">Chi nhánh</span>
        <span className="rounded-lg border border-amber-100 bg-white px-2 py-1 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
          {branchLabel}
        </span>
      </div>
    )
  }

  if (!isAdminVisible) return null

  return (
    <label className="hidden items-center gap-2 rounded-xl border border-amber-100 bg-white/85 px-2 py-1 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200 md:flex">
      <span className="font-medium">Chi nhánh</span>
      <select
        className="rounded-lg border border-amber-100 bg-white px-2 py-1 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        value={selectedBranchId}
        onChange={(e) => setSelectedBranchId(e.target.value)}
      >
        <option value="">Tất cả</option>
        {activeOptions.map((branch) => (
          <option key={branch.id} value={branch.id}>
            {branch.name}
          </option>
        ))}
      </select>
    </label>
  )
}

