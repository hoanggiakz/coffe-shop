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
import { vaiTroNhanVien } from '@/utils/display'

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

export default function Reports() {
  const { tv } = useI18n()
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

  const [exportType, setExportType] = useState<ExportType>('revenue')
  const [exportFormat, setExportFormat] = useState<ExportFormat>('excel')

  const loadReports = async () => {
    setLoading(true)
    try {
      const [dashboardRes, revenueRes, topRes, inventoryRes, staffRes] = await Promise.all([
        api.get('/reports/dashboard', {
          params: { dateFrom, dateTo, groupBy },
        }),
        api.get('/reports/revenue', {
          params: { dateFrom, dateTo, groupBy },
        }),
        api.get('/reports/top-items', {
          params: { dateFrom, dateTo, limit: 10 },
        }),
        api.get('/reports/inventory', {
          params: { dateFrom, dateTo, includeMovements: false },
        }),
        api.get('/reports/staff-performance', {
          params: { dateFrom, dateTo, limit: 10 },
        }),
      ])

      setDashboard((dashboardRes.data || null) as DashboardResponse | null)
      setRevenueSeries(Array.isArray(revenueRes.data?.series) ? (revenueRes.data.series as RevenueSeriesItem[]) : [])
      setTopItems(Array.isArray(topRes.data) ? (topRes.data as TopItem[]) : [])
      setInventory((inventoryRes.data || null) as InventoryReportResponse | null)
      setStaffItems(Array.isArray(staffRes.data?.items) ? (staffRes.data.items as StaffPerformanceItem[]) : [])
    } catch (error: any) {
      toast.error(error.response?.data?.message || tv('Không tải được dữ liệu báo cáo', 'Unable to load report data'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadReports()
  }, [dateFrom, dateTo, groupBy])

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadReports()
    }, 30000)
    return () => window.clearInterval(timer)
  }, [dateFrom, dateTo, groupBy])

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

  const handleExport = async () => {
    try {
      const response = await api.get('/reports/export', {
        params: { reportType: exportType, format: exportFormat, dateFrom, dateTo, groupBy, limit: 20 },
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <h1 className="mr-auto text-2xl font-bold text-gray-900 dark:text-white">Báo cáo và phân tích</h1>
        <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-44" />
        <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-44" />
        <select
          value={groupBy}
          onChange={(e) => setGroupBy(e.target.value as TimeGroup)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="day">{tv('Theo ngày', 'By day')}</option>
          <option value="week">{tv('Theo tuần', 'By week')}</option>
          <option value="month">{tv('Theo tháng', 'By month')}</option>
          <option value="year">{tv('Theo năm', 'By year')}</option>
        </select>
        <Button variant="secondary" onClick={() => void loadReports()} loading={loading}>
          {tv('Làm mới', 'Refresh')}
        </Button>
      </div>

      {loading && !dashboard && <RoutePageSkeleton kind="reports" />}

      {!!dashboard && <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Card className="text-center">
          <p className="text-sm text-gray-500">Tổng doanh thu</p>
          <p className="text-2xl font-bold text-gray-900">{formatMoney(dashboard?.revenue.totalRevenue || 0)}</p>
        </Card>
        <Card className="text-center">
          <p className="text-sm text-gray-500">Tổng đơn hoàn thành</p>
          <p className="text-2xl font-bold text-gray-900">{dashboard?.revenue.totalOrders || 0}</p>
        </Card>
        <Card className="text-center">
          <p className="text-sm text-gray-500">Nguyên liệu sắp hết</p>
          <p className="text-2xl font-bold text-red-600">{dashboard?.inventory.summary.lowStockCount || 0}</p>
        </Card>
        <Card className="text-center">
          <p className="text-sm text-gray-500">Giá trị tồn kho</p>
          <p className="text-2xl font-bold text-gray-900">{formatMoney(dashboard?.inventory.summary.totalStockValue || 0)}</p>
        </Card>
      </div>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Doanh thu theo thời gian (M-19)" subtitle="Ngày / tuần / tháng / năm">
          <div className="h-72">
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
          <div className="h-72">
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
        <Card title="Top 10 món bán chạy (M-20)">
          <div className="space-y-2">
            {topItems.length === 0 && <p className="text-sm text-gray-500">Chưa có dữ liệu</p>}
            {topItems.map((item, index) => (
              <div key={item.menuItemId} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm">
                <div>
                  <p className="font-medium text-gray-900">
                    #{index + 1} {item.menuItemName}
                  </p>
                  <p className="text-xs text-gray-500">{item.quantity} món · {item.orderCount} đơn</p>
                </div>
                <p className="font-semibold text-gray-900">{formatMoney(item.revenue)}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Hiệu suất nhân viên (M-22)">
          <div className="space-y-2">
            {staffItems.length === 0 && <p className="text-sm text-gray-500">Chưa có dữ liệu</p>}
            {staffItems.map((item) => (
              <div key={item.staffId} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm">
                <div>
                  <p className="font-medium text-gray-900">{item.staffName}</p>
                  <p className="text-xs text-gray-500">{vaiTroNhanVien(item.role) || 'Chưa phân vai trò'} · {item.orderCount} đơn</p>
                </div>
                <p className="font-semibold text-gray-900">{formatMoney(item.revenue)}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card title="Tồn kho hiện tại (M-21)" subtitle={`Cập nhật: ${dashboard?.updatedAt ? new Date(dashboard.updatedAt).toLocaleString('vi-VN') : '-'}`}>
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-lg bg-gray-50 p-3 text-sm">
            <p className="text-gray-500">Tổng nguyên liệu</p>
            <p className="text-xl font-semibold text-gray-900">{inventory?.summary.totalIngredients || 0}</p>
          </div>
          <div className="rounded-lg bg-gray-50 p-3 text-sm">
            <p className="text-gray-500">Đang hoạt động</p>
            <p className="text-xl font-semibold text-gray-900">{inventory?.summary.activeIngredients || 0}</p>
          </div>
          <div className="rounded-lg bg-red-50 p-3 text-sm">
            <p className="text-red-600">Sắp hết hàng</p>
            <p className="text-xl font-semibold text-red-700">{inventory?.summary.lowStockCount || 0}</p>
          </div>
        </div>

        <div className="overflow-x-auto">
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
            <label className="mb-1 block text-xs font-medium text-gray-600">Loại báo cáo</label>
            <select
              value={exportType}
              onChange={(e) => setExportType(e.target.value as ExportType)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="revenue">Doanh thu</option>
              <option value="top-items">Top món bán chạy</option>
              <option value="inventory">Tồn kho</option>
              <option value="staff-performance">Hiệu suất nhân viên</option>
              <option value="dashboard">Ảnh chụp nhanh dashboard</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Định dạng</label>
            <select
              value={exportFormat}
              onChange={(e) => setExportFormat(e.target.value as ExportFormat)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="excel">Excel (.xlsx)</option>
              <option value="pdf">PDF (.pdf)</option>
            </select>
          </div>

          <Button onClick={() => void handleExport()} loading={loading}>
            Tải báo cáo
          </Button>
        </div>
      </Card>
    </div>
  )
}
