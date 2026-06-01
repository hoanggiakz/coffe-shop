import { FormEvent, RefObject } from 'react'
import Button from '@/components/ui/Button'
import { ManagerCustomCartLine, ManagerMenuItem, ManagerTable } from './managerTypes'

interface CreateOrderPanelProps {
  selectedTableId: string
  setSelectedTableId: (value: string) => void
  tableSelectRef: RefObject<HTMLSelectElement | null>
  tables: ManagerTable[]
  quickItems: ManagerMenuItem[]
  menuItems: ManagerMenuItem[]
  cart: Record<string, number>
  customCartLines: ManagerCustomCartLine[]
  cartTotal: number
  customCartTotal: number
  creating: boolean
  onSubmit: (event: FormEvent) => void
  onIncrease: (menuItemId: string) => void
  onDecrease: (menuItemId: string) => void
  onRemoveCustomLine: (localId: string) => void
}

export default function CreateOrderPanel({
  selectedTableId,
  setSelectedTableId,
  tableSelectRef,
  tables,
  quickItems,
  menuItems,
  cart,
  customCartLines,
  cartTotal,
  customCartTotal,
  creating,
  onSubmit,
  onIncrease,
  onDecrease,
  onRemoveCustomLine,
}: CreateOrderPanelProps) {
  return (
    <div className="rounded-2xl border border-[#59422c] bg-[#4b3621] p-4 text-[#f7efeb] shadow-[0_12px_30px_rgba(30,27,25,0.2)]">
      <h3 className="mb-3 text-2xl font-semibold">➕ Tạo đơn mới</h3>
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase text-[#bd9f83]">Vị trí phục vụ</p>
          <select
            ref={tableSelectRef}
            className="min-h-12 w-full rounded-xl border border-[#80756c] bg-[#5a4732] px-3 py-2 text-white"
            value={selectedTableId}
            onChange={(e) => setSelectedTableId(e.target.value)}
          >
            <option value="">Chọn bàn</option>
            {tables.map((table) => (
              <option key={table.id} value={table.id}>Bàn {table.number}</option>
            ))}
          </select>
        </div>

        <div>
          <p className="mb-1 text-xs font-semibold uppercase text-[#bd9f83]">Món nhanh</p>
          <div className="grid grid-cols-2 gap-2">
            {quickItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className="rounded-xl border border-[#80756c] bg-[#5a4732] px-3 py-2 text-left hover:bg-[#6a5540]"
                onClick={() => onIncrease(item.id)}
              >
                <p className="text-sm font-semibold">{item.name}</p>
                <p className="text-xs text-[#bd9f83]">{item.price.toLocaleString('vi-VN')}đ</p>
              </button>
            ))}
          </div>
        </div>

        <div className="max-h-52 space-y-2 overflow-y-auto rounded-xl border border-[#80756c] bg-[#5a4732]/70 p-2">
          {menuItems.filter((item) => item.available).map((item) => (
            <div key={item.id} className="flex items-center justify-between rounded-lg border border-[#80756c] bg-[#5a4732] px-2 py-1.5 text-sm">
              <div>
                <p className="font-medium">{item.name}</p>
                <p className="text-xs text-[#bd9f83]">{item.price.toLocaleString('vi-VN')}đ</p>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" className="inline-flex h-8 min-w-8 items-center justify-center rounded border border-[#bd9f83]" onClick={() => onDecrease(item.id)}>
                  -
                </button>
                <span className="min-w-4 text-center">{cart[item.id] || 0}</span>
                <button type="button" className="inline-flex h-8 min-w-8 items-center justify-center rounded border border-[#bd9f83]" onClick={() => onIncrease(item.id)}>
                  +
                </button>
              </div>
            </div>
          ))}
        </div>

        {customCartLines.length > 0 && (
          <div className="rounded-xl border border-[#80756c] bg-[#5a4732] p-2 text-xs">
            <p className="mb-1 font-semibold">Món đã tùy chỉnh</p>
            <div className="space-y-1">
              {customCartLines.map((line) => (
                <div key={line.localId} className="flex items-start justify-between gap-2">
                  <div>
                    <p>{line.quantity}x {line.menuItemName}</p>
                    <p className="text-[#bd9f83]">
                      {line.selectedOptions.size?.name ? `Size ${line.selectedOptions.size.name}. ` : ''}
                      {Array.isArray(line.selectedOptions.toppings) && line.selectedOptions.toppings.length > 0
                        ? `Topping: ${line.selectedOptions.toppings.map((item) => item.name).join(', ')}. `
                        : ''}
                      {line.selectedOptions.note ? `Ghi chú: ${line.selectedOptions.note}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="rounded border border-[#bd9f83] px-2 py-1"
                    onClick={() => onRemoveCustomLine(line.localId)}
                  >
                    Xóa
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between border-t border-[#80756c] pt-2">
          <span className="font-semibold">Tổng cộng</span>
          <span className="text-xl font-semibold">{(cartTotal + customCartTotal).toLocaleString('vi-VN')}đ</span>
        </div>

        <Button type="submit" className="w-full min-h-12 rounded-xl bg-white text-[#33210d] hover:bg-[#e8e1dd]" loading={creating}>
          Tạo đơn
        </Button>
      </form>
    </div>
  )
}
