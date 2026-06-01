import Button from '@/components/ui/Button'
import { CloudIcon, CloudArrowUpIcon } from '@heroicons/react/24/outline'
import { ManagerTable, OfflineQueueEntry } from './managerTypes'

interface OfflineQueuePanelProps {
  queue: OfflineQueueEntry[]
  tables: ManagerTable[]
  isOnline: boolean
  syncing: boolean
  onSync: () => void
  onClear: () => void
  formatDateTime: (value?: string | null) => string
}

export default function OfflineQueuePanel({
  queue,
  tables,
  isOnline,
  syncing,
  onSync,
  onClear,
  formatDateTime,
}: OfflineQueuePanelProps) {
  return (
    <section className="rounded-[20px] border border-[#d2c4ba] bg-[#faf2ee] p-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="inline-flex min-h-12 items-center gap-2 rounded-full border border-[#d2c4ba] bg-white px-4 font-semibold text-[#33210d]">
          <CloudIcon className="h-5 w-5" />
          Offline Queue: {queue.length} đơn chờ
        </span>
        <span className={`inline-flex min-h-12 items-center rounded-full px-4 text-xs font-semibold ${isOnline ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
          {isOnline ? 'Kết nối mạng ổn định' : 'Mất kết nối mạng'}
        </span>
        <Button
          size="sm"
          className="min-h-12 rounded-full border-0 bg-[#33210d] px-5 text-white hover:bg-[#4b3621]"
          onClick={onSync}
          loading={syncing}
          disabled={!queue.length}
        >
          <span className="inline-flex items-center gap-2">
            <CloudArrowUpIcon className="h-4 w-4" />
            Đồng bộ ngay
          </span>
        </Button>
        <Button
          size="sm"
          variant="secondary"
          className="min-h-12 rounded-full border border-[#d2c4ba] bg-white px-5 text-[#33210d] hover:bg-[#f4ece9]"
          onClick={onClear}
          disabled={!queue.length}
        >
          Xóa queue
        </Button>
      </div>
      {queue.length > 0 && (
        <div className="mt-3 max-h-36 space-y-2 overflow-y-auto rounded-xl border border-[#d2c4ba] bg-white p-2 text-xs">
          {queue.map((item) => {
            const table = tables.find((entry) => entry.id === item.tableId)
            const quantity = item.items.reduce((sum, line) => sum + Number(line.quantity || 0), 0)
            return (
              <div key={item.localId} className="rounded-lg border border-[#e8e1dd] bg-[#fff8f5] px-2 py-1.5">
                <p className="font-semibold text-[#33210d]">#{item.localId.slice(-6)} · Bàn {table?.number ?? item.tableId}</p>
                <p className="text-[#4e453d]">{quantity} món · {formatDateTime(item.createdAt)}</p>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
