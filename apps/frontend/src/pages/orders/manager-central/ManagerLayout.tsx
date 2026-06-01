import { ReactNode } from 'react'
import { ArrowPathIcon, ArrowRightOnRectangleIcon } from '@heroicons/react/24/outline'

interface ManagerLayoutProps {
  branchLabel: string
  roleLabel: string
  isLive: boolean
  onRefresh: () => void
  onLogout?: () => void
  offlineQueuePanel: ReactNode
  filterPanel: ReactNode
  boardPanel: ReactNode
  paymentHistoryPanel: ReactNode
  createOrderPanel: ReactNode
}

export default function ManagerLayout({
  branchLabel,
  roleLabel,
  isLive,
  onRefresh,
  onLogout,
  offlineQueuePanel,
  filterPanel,
  boardPanel,
  paymentHistoryPanel,
  createOrderPanel,
}: ManagerLayoutProps) {
  return (
    <div className="space-y-4 text-[#1e1b19] [font-family:Inter,'Plus_Jakarta_Sans',sans-serif]">
      <section className="rounded-[24px] border border-[#d2c4ba] bg-[#fff8f5] p-4 shadow-[0_4px_16px_rgba(30,27,25,0.06)] sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[32px] font-bold leading-tight tracking-[-0.02em] text-[#291806] sm:text-[38px]">Coffee Shop POS</p>
            <p className="text-sm text-[#4e453d]">Manager Central · {branchLabel} · {roleLabel}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex min-h-12 items-center gap-2 rounded-full border border-[#d2c4ba] bg-white px-4 text-sm font-semibold text-[#33210d]">
              <span className={`h-2.5 w-2.5 rounded-full ${isLive ? 'bg-emerald-500' : 'bg-amber-500'}`} />
              {isLive ? 'Live sync' : 'Syncing'}
            </span>
            <button
              type="button"
              className="inline-flex min-h-12 items-center justify-center rounded-full border border-[#d2c4ba] bg-white px-4 text-[#33210d] transition hover:bg-[#f4ece9]"
              onClick={onRefresh}
              aria-label="Làm mới dữ liệu"
            >
              <ArrowPathIcon className="h-5 w-5" />
            </button>
            {onLogout && (
              <button
                type="button"
                className="inline-flex min-h-12 items-center justify-center rounded-full border border-[#d2c4ba] bg-white px-4 text-[#33210d] transition hover:bg-[#f4ece9]"
                onClick={onLogout}
                aria-label="Đăng xuất"
              >
                <ArrowRightOnRectangleIcon className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>
      </section>

      {offlineQueuePanel}
      {filterPanel}
      {boardPanel}

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,2fr)_360px]">
        {paymentHistoryPanel}
        {createOrderPanel}
      </section>
    </div>
  )
}
