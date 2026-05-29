import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import api from '@/utils/api'

type InvoiceItem = {
  name: string
  quantity: number
  unitPrice: number
  totalPrice: number
}

type InvoiceDetail = {
  id: string
  invoiceNumber: string
  issueDate: string
  customerName?: string | null
  customerPhone?: string | null
  items: InvoiceItem[]
  subtotal: number
  discount: number
  taxRate: number
  taxAmount: number
  totalAmount: number
  paymentMethod: string
  status: string
  voidReason?: string | null
}

function formatVnd(value: number) {
  return `${Number(value || 0).toLocaleString('vi-VN')}đ`
}

export default function PublicInvoice() {
  const { id = '' } = useParams()
  const [searchParams] = useSearchParams()
  const token = String(searchParams.get('token') || '').trim()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null)
  const [downloading, setDownloading] = useState(false)

  const canLoad = useMemo(() => !!id && !!token, [id, token])

  useEffect(() => {
    const run = async () => {
      if (!canLoad) {
        setLoading(false)
        setError('Link hóa đơn không hợp lệ.')
        return
      }
      setLoading(true)
      setError('')
      try {
        const { data } = await api.get<InvoiceDetail>(`/public/invoices/${encodeURIComponent(id)}`, {
          params: { token },
        })
        setInvoice(data)
      } catch (err: any) {
        setError(err.response?.data?.message || 'Không tải được hóa đơn.')
      } finally {
        setLoading(false)
      }
    }
    run()
  }, [canLoad, id, token])

  const downloadPdf = async () => {
    if (!id || !token) return
    setDownloading(true)
    try {
      const { data } = await api.get(`/public/invoices/${encodeURIComponent(id)}/pdf`, {
        params: { token },
        responseType: 'blob',
      })
      const blob = new Blob([data], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank', 'noopener,noreferrer')
      setTimeout(() => URL.revokeObjectURL(url), 5000)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="min-h-screen bg-amber-50 px-4 py-8 text-slate-800">
      <div className="mx-auto w-full max-w-2xl rounded-2xl border border-amber-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-bold">Hóa đơn điện tử</h1>
          <button
            type="button"
            onClick={downloadPdf}
            disabled={!invoice || downloading}
            className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-sm text-sky-700 disabled:opacity-60"
          >
            {downloading ? 'Đang tải...' : 'Tải PDF'}
          </button>
        </div>

        {loading && <p className="text-sm text-slate-500">Đang tải hóa đơn...</p>}
        {!loading && error && <p className="text-sm text-rose-600">{error}</p>}

        {!loading && !error && invoice && (
          <div className="space-y-4 text-sm">
            <div className="rounded-lg bg-amber-50 p-3">
              <p><span className="font-semibold">Số hóa đơn:</span> {invoice.invoiceNumber}</p>
              <p><span className="font-semibold">Ngày xuất:</span> {new Date(invoice.issueDate).toLocaleString('vi-VN')}</p>
              <p><span className="font-semibold">Khách hàng:</span> {invoice.customerName || 'Khách vãng lai'}</p>
              {invoice.customerPhone && <p><span className="font-semibold">SĐT:</span> {invoice.customerPhone}</p>}
              <p><span className="font-semibold">Thanh toán:</span> {invoice.paymentMethod}</p>
              <p><span className="font-semibold">Trạng thái:</span> {invoice.status}</p>
              {invoice.status === 'VOIDED' && invoice.voidReason && (
                <p><span className="font-semibold">Lý do hủy:</span> {invoice.voidReason}</p>
              )}
            </div>

            <div className="overflow-hidden rounded-lg border border-slate-200">
              <table className="w-full text-left">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2">Món</th>
                    <th className="px-3 py-2">SL</th>
                    <th className="px-3 py-2">Đơn giá</th>
                    <th className="px-3 py-2">Thành tiền</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.items.map((item, index) => (
                    <tr key={`${item.name}-${index}`} className="border-t border-slate-100">
                      <td className="px-3 py-2">{item.name}</td>
                      <td className="px-3 py-2">{item.quantity}</td>
                      <td className="px-3 py-2">{formatVnd(item.unitPrice)}</td>
                      <td className="px-3 py-2">{formatVnd(item.totalPrice)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-1 rounded-lg bg-slate-50 p-3">
              <p>Tạm tính: <span className="font-semibold">{formatVnd(invoice.subtotal)}</span></p>
              <p>Giảm giá: <span className="font-semibold">-{formatVnd(invoice.discount)}</span></p>
              <p>Thuế ({invoice.taxRate}%): <span className="font-semibold">{formatVnd(invoice.taxAmount)}</span></p>
              <p className="text-base font-bold">Tổng thanh toán: {formatVnd(invoice.totalAmount)}</p>
            </div>
          </div>
        )}

        <div className="mt-5 border-t border-slate-100 pt-3 text-xs text-slate-500">
          Cần hỗ trợ thêm? Vui lòng liên hệ nhân viên tại quầy.
          <div className="mt-2">
            <Link to="/menu" className="text-sky-700 underline">Quay lại menu</Link>
          </div>
        </div>
      </div>
    </div>
  )
}

