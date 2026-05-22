import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import api from '@/utils/api'
import { cn } from '@/utils/cn'
import { phuongThucThanhToan, trangThaiThanhToan } from '@/utils/display'

interface PaymentApi {
  paymentId: string
  orderId: string
  amount: number
  provider: string
  status: string
  transactionId?: string | null
  paidAt?: string | null
  createdAt?: string | null
  updatedAt?: string | null
}

const POLLING_INTERVAL_MS = 5000
const DEFAULT_STATUS_CLASS = 'bg-slate-200 text-slate-700'

const getStatusClass = (status: string): string => {
  switch (status) {
    case 'PENDING':
    case 'WAITING_TRANSFER':
      return 'bg-amber-100 text-amber-700'
    case 'WAITING_CASH':
      return 'bg-orange-100 text-orange-700'
    case 'PAID':
    case 'COMPLETED':
      return 'bg-green-100 text-green-700'
    case 'FAILED':
      return 'bg-red-100 text-red-700'
    case 'REFUNDED':
      return 'bg-gray-100 text-gray-700'
    case 'EXPIRED':
    case 'CANCELLED':
      return 'bg-slate-200 text-slate-700'
    default:
      return DEFAULT_STATUS_CLASS
  }
}

const getMethodIcon = (provider: string): string => {
  switch (provider) {
    case 'CASH':
      return '💵'
    case 'VIETQR':
      return '🔳'
    case 'SEPAY':
      return '🏦'
    case 'VNPAY':
      return '🏦'
    default:
      return '💳'
  }
}

const formatDateTime = (value?: string | null): string => {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'

  return date.toLocaleString('vi-VN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

const getTransactionTime = (payment: PaymentApi): string => {
  return payment.paidAt || payment.updatedAt || payment.createdAt || ''
}

const formatCurrency = (amount: number): string => `${Number(amount || 0).toLocaleString('vi-VN')}đ`

const readErrorMessage = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.message
    if (typeof message === 'string' && message.trim()) {
      return message
    }
  }
  return 'Không tải được dữ liệu thanh toán'
}

export default function Payments() {
  const [payments, setPayments] = useState<PaymentApi[]>([])
  const [initialLoading, setInitialLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null)

  const loadPayments = async (initial = false) => {
    if (initial) {
      setInitialLoading(true)
    } else {
      setRefreshing(true)
    }

    try {
      const { data } = await api.get<PaymentApi[]>('/v1/payments', {
        params: { limit: 100, reconcileOnline: true },
      })
      setPayments(Array.isArray(data) ? data : [])
      setLastUpdatedAt(new Date().toISOString())
      setErrorMessage('')
    } catch (error: unknown) {
      setErrorMessage(readErrorMessage(error))
    } finally {
      if (initial) {
        setInitialLoading(false)
      } else {
        setRefreshing(false)
      }
    }
  }

  useEffect(() => {
    void loadPayments(true)

    const timerId = window.setInterval(() => {
      void loadPayments()
    }, POLLING_INTERVAL_MS)

    return () => {
      window.clearInterval(timerId)
    }
  }, [])

  const totalRevenue = useMemo(
    () =>
      payments
        .filter((payment) => payment.status === 'PAID' || payment.status === 'COMPLETED')
        .reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
    [payments],
  )

  const waitingCount = useMemo(
    () =>
      payments.filter(
        (payment) =>
          payment.status === 'PENDING' ||
          payment.status === 'WAITING_TRANSFER' ||
          payment.status === 'WAITING_CASH',
      ).length,
    [payments],
  )

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white sm:text-2xl">Thanh toán</h1>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span>Cập nhật: {formatDateTime(lastUpdatedAt)}</span>
          <Button size="sm" variant="secondary" onClick={() => void loadPayments()} loading={refreshing}>
            Làm mới
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="text-center">
          <p className="text-sm text-slate-500">Tổng doanh thu</p>
          <p className="text-3xl font-bold text-green-600">{formatCurrency(totalRevenue)}</p>
        </Card>
        <Card className="text-center">
          <p className="text-sm text-slate-500">Giao dịch</p>
          <p className="text-3xl font-bold text-slate-900 dark:text-white">{payments.length}</p>
        </Card>
        <Card className="text-center">
          <p className="text-sm text-slate-500">Đang chờ</p>
          <p className="text-3xl font-bold text-amber-600">{waitingCount}</p>
        </Card>
      </div>

      <Card>
        {errorMessage && <p className="mb-3 text-sm text-red-600">{errorMessage}</p>}

        {initialLoading && <p className="text-sm text-slate-500">Đang tải giao dịch thanh toán...</p>}

        {!initialLoading && payments.length === 0 && (
          <p className="text-sm text-slate-500">Chưa có giao dịch thanh toán nào.</p>
        )}

        {!initialLoading && payments.length > 0 && (
          <>
            <div className="space-y-3 sm:hidden">
              {payments.map((payment) => (
                <div
                  key={payment.paymentId}
                  className="rounded-xl border border-amber-100 bg-white/90 p-3 text-sm dark:border-slate-700 dark:bg-slate-900/60"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-slate-900 dark:text-slate-100">{payment.paymentId}</p>
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-xs font-medium',
                        getStatusClass(payment.status),
                      )}
                    >
                      {trangThaiThanhToan(payment.status)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">Đơn: {payment.orderId}</p>
                  <p className="mt-1 text-xs text-slate-500">Thời gian: {formatDateTime(getTransactionTime(payment))}</p>
                  <p className="mt-2 font-semibold text-slate-900 dark:text-slate-100">{formatCurrency(payment.amount)}</p>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                    {getMethodIcon(payment.provider)} {phuongThucThanhToan(payment.provider)}
                  </p>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">Mã GD: {payment.transactionId || '-'}</p>
                </div>
              ))}
            </div>

            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="pb-3 font-medium text-gray-500">ID thanh toán</th>
                    <th className="pb-3 font-medium text-gray-500">Đơn hàng</th>
                    <th className="pb-3 font-medium text-gray-500">Số tiền</th>
                    <th className="pb-3 font-medium text-gray-500">Phương thức</th>
                    <th className="pb-3 font-medium text-gray-500">Mã giao dịch</th>
                    <th className="pb-3 font-medium text-gray-500">Trạng thái</th>
                    <th className="pb-3 font-medium text-gray-500">Thời gian</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {payments.map((payment) => (
                    <tr key={payment.paymentId} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                      <td className="py-3 font-medium text-gray-900 dark:text-white">{payment.paymentId}</td>
                      <td className="py-3 text-gray-500">{payment.orderId}</td>
                      <td className="py-3 font-semibold text-gray-900 dark:text-white">
                        {formatCurrency(payment.amount)}
                      </td>
                      <td className="py-3">
                        <span className="inline-flex items-center gap-1">
                          {getMethodIcon(payment.provider)} {phuongThucThanhToan(payment.provider)}
                        </span>
                      </td>
                      <td className="py-3 text-gray-500">{payment.transactionId || '-'}</td>
                      <td className="py-3">
                        <span
                          className={cn(
                            'rounded-full px-2 py-0.5 text-xs font-medium',
                            getStatusClass(payment.status),
                          )}
                        >
                          {trangThaiThanhToan(payment.status)}
                        </span>
                      </td>
                      <td className="py-3 text-gray-500">{formatDateTime(getTransactionTime(payment))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
    </div>
  )
}
