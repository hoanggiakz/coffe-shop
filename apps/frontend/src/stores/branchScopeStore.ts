import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface BranchScopeState {
  selectedBranchId: string
  setSelectedBranchId: (branchId: string) => void
  resetBranchScope: () => void
}

export const useBranchScopeStore = create<BranchScopeState>()(
  persist(
    (set) => ({
      selectedBranchId: '',
      setSelectedBranchId: (branchId) => set({ selectedBranchId: String(branchId || '').trim() }),
      resetBranchScope: () => set({ selectedBranchId: '' }),
    }),
    { name: 'branch-scope' },
  ),
)

