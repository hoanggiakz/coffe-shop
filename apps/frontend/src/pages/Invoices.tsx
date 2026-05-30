import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import api from '@/utils/api'
import { useAuthStore } from '@/stores/authStore'
import { useBranchScopeStore } from '@/stores/branchScopeStore'

interface InvoiceItem {
  id: string
  invoiceNumber: string
  issueDate: string
  customerName?: string | null
  subtotal: number
  discount: number
  taxRate: number
  taxAmount: number
  totalAmount: number
  paymentMethod: string
  status: 'ISSUED' | 'VOIDED'
  pdfUrl?: string | null
}

interface InvoiceListResponse {
  data: InvoiceItem[]
  meta: { total: number; page: number; limit: number; totalPages: number }
}

export default function Invoices() {
  const user = useAuthStore((s) => s.user)
  const selectedBranchId = useBranchScopeStore((s) => s.selectedBranchId)
  const [rows, setRows] = useState<InvoiceItem[]>([])
  const [selected, setSelected] = useState<any>(null)
  const [status, setStatus] = useState<'ALL' | 'ISSUED' | 'VOIDED'>('ALL')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [loading, setLoading] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)

  const branchId = String(selectedBranchId || user?.branchId || '').trim()
  const role = String(user?.role || '').toUpperCase()

  const canVoid = role === 'ADMIN' || role === 'MANAGER'
  const canViewInvoices = ['ADMIN', 'MANAGER', 'WAITER', 'STAFF'].includes(role)

  const params = useMemo(
    () => ({
      status,
      ...(startDate ? { start_date: startDate } : {}),
      ...(endDate ? { end_date: endDate } : {}),
      page: 1,
      limit: 50,
    }),
    [status, startDate, endDate],
  )

  const load = async () => {
    if (!canViewInvoices || !branchId) {
      setRows([])
      setSelected(null)
      return
    }
    setLoading(true)
    try {
      const { data } = await api.get<InvoiceListResponse>(`/branches/${branchId}/invoices`, { params })
      const list = Array.isArray(data?.data) ? data.data : []
      setRows(list)
      if (selected?.id) {
        const still = list.find((x) => x.id === selected.id)
        if (!still) setSelected(null)
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Không tải được danh sách hóa đơn')
    } finally {
      setLoading(false)
    }
  }

  const openDetail = async (id: string) => {
    setDetailLoading(true)
    try {
      const { data } = await api.get(`/invoices/${id}`)
      setSelected(data)
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Không tải được chi tiết hóa đơn')
    } finally {
      setDetailLoading(false)
    }
  }

  const voidInvoice = async () => {
    if (!selected?.id || !canVoid) return
    const reason = window.prompt('Nhập lý do hủy hóa đơn:')
    if (!reason || !reason.trim()) return
    try {
      await api.post(`/invoices/${selected.id}/void`, { reason: reason.trim() })
      toast.success('Đã hủy hóa đơn')
      await openDetail(selected.id)
      await load()
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Hủy hóa đơn thất bại')
    }
  }

  const openPdf = async () => {
    if (!selected?.id) return
    try {
      const { data } = await api.get(`/invoices/${selected.id}/pdf`, { responseType: 'blob' })
      const blob = new Blob([data], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank', 'noopener,noreferrer')
      setTimeout(() => URL.revokeObjectURL(url), 5000)
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Không tải được PDF hóa đơn')
    }
  }

  useEffect(() => {
    void load()
  }, [branchId, status, startDate, endDate])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Quản lý hóa đơn</h1>
        <Button onClick={load} loading={loading}>Làm mới</Button>
      </div>

      <Card>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as any)}
            className="min-h-11 rounded-xl border border-amber-100 px-3 text-sm"
          >
            <option value="ALL">Tất cả</option>
            <option value="ISSUED">Đã phát hành</option>
            <option value="VOIDED">Đã hủy</option>
          </select>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          {!branchId && (
            <p className="pb-3 text-sm text-amber-700">
              Không xác định được chi nhánh làm việc. Vui lòng đăng nhập lại hoặc liên hệ quản lý để gán chi nhánh.
            </p>
          )}
          <div className="overflow-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-amber-100 text-slate-500">
                  <th className="py-2">Số hóa đơn</th>
                  <th className="py-2">Ngày</th>
                  <th className="py-2">Khách</th>
                  <th className="py-2">Tiền</th>
                  <th className="py-2">Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    className="cursor-pointer border-b border-amber-50 hover:bg-amber-50/50"
                    onClick={() => openDetail(row.id)}
                  >
                    <td className="py-2 font-medium">{row.invoiceNumber}</td>
                    <td className="py-2">{new Date(row.issueDate).toLocaleString('vi-VN')}</td>
                    <td className="py-2">{row.customerName || 'Khách vãng lai'}</td>
                    <td className="py-2">{Number(row.totalAmount).toLocaleString('vi-VN')}đ</td>
                    <td className="py-2">{row.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          {detailLoading && <p className="text-sm text-slate-500">Đang tải chi tiết...</p>}
          {!detailLoading && !selected && <p className="text-sm text-slate-500">Chọn hóa đơn để xem chi tiết</p>}
          {!detailLoading && selected && (
            <div className="space-y-2 text-sm">
              <p className="font-semibold">{selected.invoiceNumber}</p>
              <p>Đơn hàng: {selected.orderId}</p>
              <p>Khách: {selected.customerName || 'Khách vãng lai'}</p>
              <p>Tổng cộng: {Number(selected.totalAmount).toLocaleString('vi-VN')}đ</p>
              <p>Thanh toán: {selected.paymentMethod}</p>
              <p>Trạng thái: {selected.status}</p>
              <div className="flex flex-wrap gap-2 pt-2">
                <Button size="sm" variant="secondary" onClick={openPdf}>
                  Xem PDF
                </Button>
                {canVoid && selected.status !== 'VOIDED' && (
                  <Button size="sm" onClick={voidInvoice}>Hủy hóa đơn</Button>
                )}
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
