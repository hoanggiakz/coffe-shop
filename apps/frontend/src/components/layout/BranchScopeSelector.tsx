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

  const isVisible = role === 'ADMIN' || role === 'MANAGER'

  useEffect(() => {
    if (!isVisible) return
    let cancelled = false

    const run = async () => {
      try {
        const { data } = await api.get('/users/admin/branches', { params: { includeInactive: false } })
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
  }, [isVisible])

  useEffect(() => {
    if (!isVisible) return
    if (selectedBranchId) return
    if (user?.branchId) {
      setSelectedBranchId(user.branchId)
    }
  }, [isVisible, selectedBranchId, setSelectedBranchId, user?.branchId])

  const activeOptions = useMemo(
    () => branches.filter((item) => item.isActive !== false),
    [branches],
  )

  if (!isVisible) return null

  return (
    <label className="hidden items-center gap-2 rounded-xl border border-sky-100 bg-white/85 px-2 py-1 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200 md:flex">
      <span className="font-medium">Chi nhánh</span>
      <select
        className="rounded-lg border border-sky-100 bg-white px-2 py-1 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
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

