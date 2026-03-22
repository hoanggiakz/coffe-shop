import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import api from '@/utils/api'
import { useI18n } from '@/utils/i18n'

type Status = 'checking' | 'success' | 'failed'

export default function PaymentReturn() {
  const { tv } = useI18n()
  const [searchParams] = useSearchParams()
  const [status, setStatus] = useState<Status>('checking')
  const [message, setMessage] = useState('')

  const payload = useMemo(() => {
    const orderId = searchParams.get('orderId') || ''
    const provider = (searchParams.get('partnerCode') || searchParams.get('provider') || 'MOMO').toUpperCase()
    const resultCode = searchParams.get('resultCode') || searchParams.get('errorCode') || ''
    const transactionId = searchParams.get('transId') || searchParams.get('transactionId') || ''
    const returnMessage = searchParams.get('message') || ''

    return { orderId, provider, resultCode, transactionId, message: returnMessage }
  }, [searchParams])

  useEffect(() => {
    const run = async () => {
      if (!payload.orderId) {
        setStatus('failed')
        setMessage(tv('Thiếu mã đơn hàng trong phản hồi thanh toán', 'Missing orderId in payment return'))
        return
      }

      try {
        const { data } = await api.post('/v1/payments/return', payload)
        setStatus(data.status === 'PAID' ? 'success' : 'failed')
        setMessage(
          data.status === 'PAID'
            ? tv('Thanh toán thành công. Cảm ơn bạn!', 'Payment successful. Thank you!')
            : tv('Thanh toán thất bại hoặc bị hủy.', 'Payment failed or cancelled.'),
        )
      } catch (error: any) {
        const fallback = payload.resultCode === '0' || payload.resultCode === '00'
          ? tv('Hệ thống đang xác thực thanh toán, vui lòng thử lại sau.', 'Awaiting payment verification, please retry.')
          : tv('Không thể xác nhận thanh toán. Vui lòng liên hệ nhân viên.', 'Unable to confirm payment. Please contact staff.')
        setStatus('failed')
        setMessage(error?.response?.data?.message || fallback)
      }
    }

    run()
  }, [payload, tv])

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-orange-100 px-4 py-10 text-center text-gray-900">
      <div className="mx-auto max-w-lg rounded-3xl bg-white/90 p-8 shadow-xl ring-1 ring-amber-200">
        <div className="mb-4 text-sm font-semibold uppercase tracking-wide text-amber-600">
          {payload.provider || 'Payment'}
        </div>
        <h1 className="text-2xl font-bold text-gray-900">
          {status === 'success'
            ? tv('Thanh toán thành công', 'Payment Successful')
            : status === 'checking'
              ? tv('Đang xác thực thanh toán...', 'Verifying payment...')
              : tv('Thanh toán không thành công', 'Payment Failed')}
        </h1>
        <p className="mt-4 text-sm text-gray-700">{message}</p>

        <div className="mt-8 space-y-3">
          <div className="rounded-xl bg-amber-50 px-4 py-3 text-left text-sm text-amber-900 ring-1 ring-amber-200">
            <div className="font-semibold">{tv('Thông tin giao dịch', 'Transaction info')}</div>
            <div className="mt-2 space-y-1">
              <div>
                <span className="font-medium">{tv('Mã đơn', 'Order')}:</span> {payload.orderId || '—'}
              </div>
              {payload.transactionId && (
                <div>
                  <span className="font-medium">{tv('Mã giao dịch', 'Transaction')}:</span> {payload.transactionId}
                </div>
              )}
              {payload.resultCode && (
                <div>
                  <span className="font-medium">{tv('Mã kết quả', 'Result code')}:</span> {payload.resultCode}
                </div>
              )}
              {payload.message && (
                <div>
                  <span className="font-medium">{tv('Mô tả', 'Message')}:</span> {payload.message}
                </div>
              )}
            </div>
          </div>

          <Link
            to="/menu"
            className="block w-full rounded-xl bg-amber-600 px-4 py-3 text-center font-semibold text-white shadow hover:bg-amber-700"
          >
            {tv('Quay lại menu', 'Back to menu')}
          </Link>
          <Link
            to="/orders"
            className="block w-full rounded-xl border border-amber-200 px-4 py-3 text-center font-semibold text-amber-700 hover:bg-amber-50"
          >
            {tv('Xem trạng thái đơn', 'View order status')}
          </Link>
        </div>
      </div>
    </div>
  )
}
