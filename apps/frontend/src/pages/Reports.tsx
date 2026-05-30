import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import api from '@/utils/api'
import { RoutePageSkeleton } from '@/components/ui/PageSkeleton'
import { useI18n } from '@/utils/i18n'
import { phuongThucThanhToan, trangThaiThanhToan, vaiTroNhanVien } from '@/utils/display'
import { useBranchScopeStore } from '@/stores/branchScopeStore'
import { useAuthStore } from '@/stores/authStore'

type TimeGroup = 'day' | 'week' | 'month' | 'year'
type ExportType = 'revenue' | 'top-items' | 'inventory' | 'staff-performance' | 'dashboard'
type ExportFormat = 'excel' | 'pdf'

interface RevenueSeriesItem {
  period: string
  revenue: number
  orderCount: number
}

interface TopItem {
  menuItemId: string
  menuItemName: string
  quantity: number
  revenue: number
  orderCount: number
}

interface StaffPerformanceItem {
  staffId: string
  staffName: string
  role: string | null
  orderCount: number
  revenue: number
}

interface InventoryStockItem {
  id: string
  name: string
  unit: string
  stock: number
  minStock: number
  isLowStock: boolean
  stockValue: number
}

interface InventoryReportResponse {
  summary: {
    totalIngredients: number
    activeIngredients: number
    lowStockCount: number
    totalStockValue: number
  }
  stocks: InventoryStockItem[]
}

interface DashboardResponse {
  updatedAt: string
  revenue: {
    totalRevenue: number
    totalOrders: number
    series: RevenueSeriesItem[]
  }
  orders: {
    todayByStatus: Array<{ status: string; count: number }>
    hourly: Array<{ timestamp: string; orders: number; revenue: number }>
  }
  payments: {
    summary: {
      totalTransactions: number
      paidTransactions: number
      pendingTransactions: number
      failedTransactions: number
      totalRevenue: number
      averagePaidValue: number
    }
    byProvider: Array<{ provider: string; count: number; paidCount: number; revenue: number }>
    byStatus: Array<{ status: string; count: number; amount: number }>
  }
  inventory: {
    summary: {
      totalIngredients: number
      activeIngredients: number
      lowStockCount: number
      totalStockValue: number
    }
    lowStockItems: InventoryStockItem[]
  }
  topItems: TopItem[]
  staffPerformance: StaffPerformanceItem[]
}

interface AiRevenueForecast {
  date: string
  predictedRevenue: number
  confidenceLow: number
  confidenceHigh: number
}

interface AiInsightState {
  available: boolean
  forecasts: AiRevenueForecast[]
  anomalies: Array<{ id: string; severity: string; description: string; isResolved: boolean }>
  sentiment: { positive: number; neutral: number; negative: number } | null
  forecastSource?: string
  sentimentSource?: string
  fallbackReason?: string
}

function formatMoney(value: number): string {
  return `${new Intl.NumberFormat('vi-VN').format(Math.max(0, value || 0))}đ`
}

function formatDateInput(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function formatPeriodLabel(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('vi-VN')
}

function formatHourLabel(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return `${date.getHours().toString().padStart(2, '0')}:00`
}

const selectClass =
  'min-h-11 w-full rounded-xl border border-amber-100/80 bg-white/95 px-3 py-2 text-sm text-slate-800 focus:border-amber-400 focus:ring-2 focus:ring-amber-300/60 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:focus:border-amber-400 dark:focus:ring-amber-500/30'

export default function Reports() {
  const { tv } = useI18n()
  const selectedBranchId = useBranchScopeStore((state) => state.selectedBranchId)
  const setSelectedBranchId = useBranchScopeStore((state) => state.setSelectedBranchId)
  const currentUserBranchId = useAuthStore((state) => String(state.user?.branchId || '').trim())
  const now = new Date()
  const oneMonthAgo = new Date()
  oneMonthAgo.setDate(now.getDate() - 30)

  const [dateFrom, setDateFrom] = useState(formatDateInput(oneMonthAgo))
  const [dateTo, setDateTo] = useState(formatDateInput(now))
  const [groupBy, setGroupBy] = useState<TimeGroup>('day')
  const [loading, setLoading] = useState(false)

  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null)
  const [revenueSeries, setRevenueSeries] = useState<RevenueSeriesItem[]>([])
  const [topItems, setTopItems] = useState<TopItem[]>([])
  const [inventory, setInventory] = useState<InventoryReportResponse | null>(null)
  const [staffItems, setStaffItems] = useState<StaffPerformanceItem[]>([])
  const [aiInsight, setAiInsight] = useState<AiInsightState>({
    available: false,
    forecasts: [],
    anomalies: [],
    sentiment: null,
  })
  const [rebuildingForecast, setRebuildingForecast] = useState(false)

  const [exportType, setExportType] = useState<ExportType>('revenue')
  const [exportFormat, setExportFormat] = useState<ExportFormat>('excel')
  const effectiveAiBranchId = selectedBranchId || currentUserBranchId || 'branch-e2e'

  const requestAiWithRetry = async (path: string, params: Record<string, any>) => {
    try {
      return await api.get(path, { params, timeout: 1800 })
    } catch (error: any) {
      const status = Number(error?.response?.status || 0)
      const timeout = error?.code === 'ECONNABORTED'
      const retryable = timeout || status >= 500 || status === 0
      if (!retryable) throw error
      return api.get(path, { params, timeout: 1800 })
    }
  }

  const loadReports = async () => {
    setLoading(true)
    try {
      const [dashboardRes, revenueRes, topRes, inventoryRes, staffRes] = await Promise.all([
        api.get('/reports/dashboard', {
          params: { dateFrom, dateTo, groupBy, branchId: selectedBranchId || undefined },
        }),
        api.get('/reports/revenue', {
          params: { dateFrom, dateTo, groupBy, branchId: selectedBranchId || undefined },
        }),
        api.get('/reports/top-items', {
          params: { dateFrom, dateTo, branchId: selectedBranchId || undefined, limit: 10 },
        }),
        api.get('/reports/inventory', {
          params: { dateFrom, dateTo, branchId: selectedBranchId || undefined, includeMovements: false },
        }),
        api.get('/reports/staff-performance', {
          params: { dateFrom, dateTo, branchId: selectedBranchId || undefined, limit: 10 },
        }),
      ])

      setDashboard((dashboardRes.data || null) as DashboardResponse | null)
      setRevenueSeries(Array.isArray(revenueRes.data?.series) ? (revenueRes.data.series as RevenueSeriesItem[]) : [])
      setTopItems(Array.isArray(topRes.data) ? (topRes.data as TopItem[]) : [])
      setInventory((inventoryRes.data || null) as InventoryReportResponse | null)
      setStaffItems(Array.isArray(staffRes.data?.items) ? (staffRes.data.items as StaffPerformanceItem[]) : [])

      try {
        const [forecastResult, anomalyResult, sentimentResult] = await Promise.allSettled([
          requestAiWithRetry('/ai/forecast/revenue', { branchId: effectiveAiBranchId, days: 7 }),
          requestAiWithRetry('/ai/anomalies', { branchId: effectiveAiBranchId }),
          requestAiWithRetry('/ai/sentiment/summary', { branchId: effectiveAiBranchId }),
        ])

        const forecastData = forecastResult.status === 'fulfilled' ? forecastResult.value.data : null
        const anomalyData = anomalyResult.status === 'fulfilled' ? anomalyResult.value.data : null
        const sentimentData = sentimentResult.status === 'fulfilled' ? sentimentResult.value.data : null
        const aiAvailable = Boolean(forecastData || anomalyData || sentimentData)
        const reasons = [forecastResult, anomalyResult, sentimentResult]
          .filter((item): item is PromiseRejectedResult => item.status === 'rejected')
          .map((item) => item.reason?.response?.data?.message || item.reason?.message || 'request_failed')

        setAiInsight({
          available: aiAvailable,
          forecasts: Array.isArray(forecastData?.forecasts) ? (forecastData.forecasts as AiRevenueForecast[]) : [],
          anomalies: Array.isArray(anomalyData?.items) ? anomalyData.items : [],
          forecastSource: String(forecastData?.source || ''),
          sentimentSource: String(sentimentData?.source || ''),
          sentiment: sentimentData
            ? {
                positive: Number(sentimentData.positive || 0),
                neutral: Number(sentimentData.neutral || 0),
                negative: Number(sentimentData.negative || 0),
              }
            : null,
          fallbackReason: reasons.length ? reasons.join('; ') : undefined,
        })
      } catch (aiError: any) {
        setAiInsight({
          available: false,
          forecasts: [],
          anomalies: [],
          sentiment: null,
          forecastSource: '',
          sentimentSource: '',
          fallbackReason: aiError?.response?.data?.message || 'AI service unavailable',
        })
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || tv('Không tải được dữ liệu báo cáo', 'Unable to load report data'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadReports()
  }, [dateFrom, dateTo, groupBy, selectedBranchId])

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadReports()
    }, 30000)
    return () => window.clearInterval(timer)
  }, [dateFrom, dateTo, groupBy, selectedBranchId])

  const revenueChartData = useMemo(
    () =>
      revenueSeries.map((item) => ({
        period: formatPeriodLabel(item.period),
        revenue: item.revenue,
        orders: item.orderCount,
      })),
    [revenueSeries],
  )

  const orderHourlyChartData = useMemo(
    () =>
      (dashboard?.orders.hourly || []).map((item) => ({
        hour: formatHourLabel(item.timestamp),
        orders: item.orders,
        revenue: item.revenue,
      })),
    [dashboard?.orders.hourly],
  )

  const paymentProviderChartData = useMemo(
    () =>
      (dashboard?.payments.byProvider || []).map((item) => ({
        provider: phuongThucThanhToan(item.provider),
        revenue: item.revenue,
        paidCount: item.paidCount,
      })),
    [dashboard?.payments.byProvider],
  )

  const paymentStatusChartData = useMemo(
    () =>
      (dashboard?.payments.byStatus || []).map((item) => ({
        status: trangThaiThanhToan(item.status),
        count: item.count,
        amount: item.amount,
      })),
    [dashboard?.payments.byStatus],
  )

  const noBusinessDataForSelectedBranch = useMemo(() => {
    if (!selectedBranchId || !dashboard) return false

    const noRevenue = Number(dashboard.revenue?.totalRevenue || 0) <= 0
    const noOrders = Number(dashboard.revenue?.totalOrders || 0) <= 0
    const noTransactions = Number(dashboard.payments?.summary?.totalTransactions || 0) <= 0
    const noTopItems = (topItems || []).length === 0
    const noStaffStats = (staffItems || []).length === 0

    return noRevenue && noOrders && noTransactions && noTopItems && noStaffStats
  }, [dashboard, selectedBranchId, staffItems, topItems])

  const handleExport = async () => {
    try {
      const response = await api.get('/reports/export', {
        params: {
          reportType: exportType,
          format: exportFormat,
          dateFrom,
          dateTo,
          groupBy,
          branchId: selectedBranchId || undefined,
          limit: 20,
        },
        responseType: 'blob',
      })
      const blob = new Blob([response.data], { type: response.headers['content-type'] || 'application/octet-stream' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      const contentDisposition = String(response.headers['content-disposition'] || '')
      const match = /filename="([^"]+)"/.exec(contentDisposition)
      link.href = url
      link.download = match?.[1] || `${exportType}.${exportFormat === 'excel' ? 'xlsx' : 'pdf'}`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
      toast.success(tv('Đã tải xong báo cáo', 'Report downloaded'))
    } catch (error: any) {
      toast.error(error.response?.data?.message || tv('Xuất báo cáo thất bại', 'Export failed'))
    }
  }

  const handleRebuildForecast = async () => {
    if (!effectiveAiBranchId) {
      toast.error('Thiếu branchId để rebuild forecast')
      return
    }
    setRebuildingForecast(true)
    try {
      await api.post('/ai/forecast/revenue/rebuild', {
        branchId: effectiveAiBranchId,
        days: 7,
        granularity: 'daily',
      })
      toast.success('Đã rebuild forecast, đang tải lại AI insights')
      await loadReports()
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Rebuild forecast thất bại')
    } finally {
      setRebuildingForecast(false)
    }
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-amber-100 bg-white/85 p-3 backdrop-blur sm:p-4">
        <h1 className="mr-auto text-xl font-bold text-slate-900 dark:text-white sm:text-2xl">Báo cáo và phân tích</h1>
        <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-full sm:w-44" />
        <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-full sm:w-44" />
        <select
          value={groupBy}
          onChange={(e) => setGroupBy(e.target.value as TimeGroup)}
          className={`${selectClass} sm:w-44`}
        >
          <option value="day">{tv('Theo ngày', 'By day')}</option>
          <option value="week">{tv('Theo tuần', 'By week')}</option>
          <option value="month">{tv('Theo tháng', 'By month')}</option>
          <option value="year">{tv('Theo năm', 'By year')}</option>
        </select>
        <Button variant="secondary" className="w-full sm:w-auto" onClick={() => void loadReports()} loading={loading}>
          {tv('Làm mới', 'Refresh')}
        </Button>
      </div>

      {noBusinessDataForSelectedBranch && (
        <Card className="border border-amber-200 bg-amber-50/80">
          <p className="text-sm font-medium text-amber-800">
            Không có dữ liệu giao dịch cho chi nhánh đang chọn trong khoảng thời gian này.
          </p>
          <p className="mt-1 text-xs text-amber-700">
            BranchId hiện tại: {selectedBranchId}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => setSelectedBranchId('')}>
              Xem toàn hệ thống
            </Button>
            {currentUserBranchId && currentUserBranchId !== selectedBranchId && (
              <Button size="sm" variant="secondary" onClick={() => setSelectedBranchId(currentUserBranchId)}>
                Về chi nhánh của tôi
              </Button>
            )}
          </div>
        </Card>
      )}

      {loading && !dashboard && <RoutePageSkeleton kind="reports" />}

      {!!dashboard && <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="text-center">
          <p className="text-sm text-slate-500">Doanh thu thanh toán</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{formatMoney(dashboard?.payments.summary.totalRevenue || dashboard?.revenue.totalRevenue || 0)}</p>
        </Card>
        <Card className="text-center">
          <p className="text-sm text-slate-500">Giao dịch đã thanh toán</p>
          <p className="text-2xl font-bold text-emerald-600">{dashboard?.payments.summary.paidTransactions || 0}</p>
        </Card>
        <Card className="text-center">
          <p className="text-sm text-slate-500">Giao dịch đang chờ</p>
          <p className="text-2xl font-bold text-amber-600">{dashboard?.payments.summary.pendingTransactions || 0}</p>
        </Card>
        <Card className="text-center">
          <p className="text-sm text-slate-500">Giao dịch lỗi / hủy</p>
          <p className="text-2xl font-bold text-red-600">{dashboard?.payments.summary.failedTransactions || 0}</p>
        </Card>
      </div>}

      <Card title="AI Insights" subtitle={aiInsight.available ? 'Dự báo & cảnh báo thông minh' : 'Fallback rule-based'}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-slate-500">
            Branch AI: <span className="font-medium text-slate-700">{effectiveAiBranchId}</span>
            {aiInsight.forecastSource ? ` · Forecast source: ${aiInsight.forecastSource}` : ''}
            {aiInsight.sentimentSource ? ` · Sentiment source: ${aiInsight.sentimentSource}` : ''}
          </p>
          <Button size="sm" variant="secondary" onClick={() => void handleRebuildForecast()} loading={rebuildingForecast}>
            Rebuild forecast
          </Button>
        </div>
        {!aiInsight.available && (
          <p className="text-sm text-amber-700">
            AI tạm thời không khả dụng. Đang fallback về báo cáo truyền thống. {aiInsight.fallbackReason ? `(${aiInsight.fallbackReason})` : ''}
          </p>
        )}
        {aiInsight.available && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-sky-100 bg-sky-50/70 p-3">
              <p className="text-xs text-slate-600">Dự báo 7 ngày</p>
              <p className="text-lg font-semibold text-slate-900">
                {formatMoney(aiInsight.forecasts.reduce((acc, item) => acc + Number(item.predictedRevenue || 0), 0))}
              </p>
            </div>
            <div className="rounded-xl border border-amber-100 bg-amber-50/70 p-3">
              <p className="text-xs text-slate-600">Anomaly đang mở</p>
              <p className="text-lg font-semibold text-slate-900">
                {aiInsight.anomalies.filter((item) => !item.isResolved).length}
              </p>
            </div>
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-3">
              <p className="text-xs text-slate-600">Sentiment tích cực</p>
              <p className="text-lg font-semibold text-slate-900">
                {aiInsight.sentiment ? `${Math.round(aiInsight.sentiment.positive * 100)}%` : '-'}
              </p>
            </div>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Doanh thu theo thời gian (M-19)" subtitle="Ngày / tuần / tháng / năm">
          <div className="h-64 sm:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={revenueChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="period" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="revenue" name="Doanh thu" stroke="#2563eb" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Đơn hàng theo giờ (M-23)" subtitle="24 giờ gần nhất">
          <div className="h-64 sm:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={orderHourlyChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="hour" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="orders" name="Số đơn" fill="#14b8a6" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Thanh toán theo phương thức" subtitle="Doanh thu ghi nhận theo từng cổng thanh toán">
          <div className="h-64 sm:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={paymentProviderChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="provider" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="revenue" name="Doanh thu" fill="#2563eb" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Trạng thái thanh toán" subtitle="Phân bổ số lượng giao dịch theo trạng thái">
          <div className="h-64 sm:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={paymentStatusChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="status" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="count" name="Số giao dịch" fill="#0ea5e9" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Top 10 món bán chạy (M-20)">
          <div className="space-y-2">
            {topItems.length === 0 && <p className="text-sm text-gray-500">Chưa có dữ liệu</p>}
            {topItems.map((item, index) => (
              <div key={item.menuItemId} className="flex items-center justify-between rounded-xl border border-amber-100 bg-white/85 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900/60">
                <div>
                  <p className="font-medium text-slate-900 dark:text-slate-100">
                    #{index + 1} {item.menuItemName}
                  </p>
                  <p className="text-xs text-slate-500">{item.quantity} món · {item.orderCount} đơn</p>
                </div>
                <p className="font-semibold text-slate-900 dark:text-slate-100">{formatMoney(item.revenue)}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Hiệu suất nhân viên (M-22)">
          <div className="space-y-2">
            {staffItems.length === 0 && <p className="text-sm text-gray-500">Chưa có dữ liệu</p>}
            {staffItems.map((item) => (
              <div key={item.staffId} className="flex items-center justify-between rounded-xl border border-amber-100 bg-white/85 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900/60">
                <div>
                  <p className="font-medium text-slate-900 dark:text-slate-100">{item.staffName}</p>
                  <p className="text-xs text-slate-500">{vaiTroNhanVien(item.role) || 'Chưa phân vai trò'} · {item.orderCount} đơn</p>
                </div>
                <p className="font-semibold text-slate-900 dark:text-slate-100">{formatMoney(item.revenue)}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card title="Tồn kho hiện tại (M-21)" subtitle={`Cập nhật: ${dashboard?.updatedAt ? new Date(dashboard.updatedAt).toLocaleString('vi-VN') : '-'}`}>
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-amber-100 bg-white/90 p-3 text-sm dark:border-slate-700 dark:bg-slate-900/60">
            <p className="text-slate-500">Tổng nguyên liệu</p>
            <p className="text-xl font-semibold text-slate-900 dark:text-slate-100">{inventory?.summary.totalIngredients || 0}</p>
          </div>
          <div className="rounded-xl border border-amber-100 bg-white/90 p-3 text-sm dark:border-slate-700 dark:bg-slate-900/60">
            <p className="text-slate-500">Đang hoạt động</p>
            <p className="text-xl font-semibold text-slate-900 dark:text-slate-100">{inventory?.summary.activeIngredients || 0}</p>
          </div>
          <div className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm">
            <p className="text-red-600">Sắp hết hàng</p>
            <p className="text-xl font-semibold text-red-700">{inventory?.summary.lowStockCount || 0}</p>
          </div>
        </div>

        <div className="space-y-3 sm:hidden">
          {(inventory?.stocks || []).slice(0, 15).map((item) => (
            <div key={item.id} className="rounded-xl border border-amber-100 bg-white/90 p-3 text-sm dark:border-slate-700 dark:bg-slate-900/60">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-slate-900 dark:text-slate-100">{item.name}</p>
                <span className={`rounded-full px-2 py-0.5 text-xs ${item.isLowStock ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                  {item.isLowStock ? 'Sắp hết hàng' : 'Ổn định'}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">{item.stock} {item.unit} · Min {item.minStock} {item.unit}</p>
              <p className="mt-1 text-sm font-medium text-slate-800 dark:text-slate-100">{formatMoney(item.stockValue)}</p>
            </div>
          ))}
        </div>

        <div className="hidden overflow-x-auto sm:block">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs uppercase text-gray-500">
                <th className="py-2 pr-3">Nguyên liệu</th>
                <th className="py-2 pr-3">Tồn</th>
                <th className="py-2 pr-3">Min</th>
                <th className="py-2 pr-3">Giá trị</th>
                <th className="py-2">Cảnh báo</th>
              </tr>
            </thead>
            <tbody>
              {(inventory?.stocks || []).slice(0, 15).map((item) => (
                <tr key={item.id} className="border-b border-gray-100">
                  <td className="py-2 pr-3 font-medium text-gray-900">{item.name}</td>
                  <td className="py-2 pr-3">{item.stock} {item.unit}</td>
                  <td className="py-2 pr-3">{item.minStock} {item.unit}</td>
                  <td className="py-2 pr-3">{formatMoney(item.stockValue)}</td>
                  <td className="py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${item.isLowStock ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                      {item.isLowStock ? 'Sắp hết hàng' : 'Ổn định'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Xuất báo cáo (M-19/M-21/M-22)">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Loại báo cáo</label>
            <select
              value={exportType}
              onChange={(e) => setExportType(e.target.value as ExportType)}
              className={selectClass}
            >
              <option value="revenue">Doanh thu</option>
              <option value="top-items">Top món bán chạy</option>
              <option value="inventory">Tồn kho</option>
              <option value="staff-performance">Hiệu suất nhân viên</option>
              <option value="dashboard">Ảnh chụp nhanh dashboard</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Định dạng</label>
            <select
              value={exportFormat}
              onChange={(e) => setExportFormat(e.target.value as ExportFormat)}
              className={selectClass}
            >
              <option value="excel">Excel (.xlsx)</option>
              <option value="pdf">PDF (.pdf)</option>
            </select>
          </div>

          <Button className="w-full sm:w-auto" onClick={() => void handleExport()} loading={loading}>
            Tải báo cáo
          </Button>
        </div>
      </Card>
    </div>
  )
}
