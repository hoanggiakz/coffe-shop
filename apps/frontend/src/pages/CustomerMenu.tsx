import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import api from '@/utils/api'
import { getSocket, disconnectSocket } from '@/utils/socket'
import { showRealtimeNotification } from '@/utils/notifications'
import { maDonHangNgan, phuongThucThanhToan, trangThaiDonHang, trangThaiThanhToan } from '@/utils/display'
import { ChatBubbleLeftRightIcon, ShoppingBagIcon, XMarkIcon, MinusIcon } from '@heroicons/react/24/outline'

type PaymentMode = 'POST_PAY' | 'ONLINE_PAY'
type PaymentProvider = 'SEPAY'

interface CustomizationOption {
  value: string
  label: string
  priceDelta?: number
}

interface CustomizationGroup {
  id: string
  label: string
  type: 'single' | 'multi' | 'text'
  options?: CustomizationOption[]
  placeholder?: string
}

interface MenuItem {
  id: string
  branchMenuItemId?: string
  name: string
  description?: string
  price: number
  category: string
  available: boolean
  image?: string | null
  customizations?: CustomizationGroup[]
}

type CartSelections = Record<string, string | string[]>

interface CartItem {
  branchMenuItemId?: string
  menuItemId: string
  quantity: number
  note: string
  selections: CartSelections
}

interface CartDraft {
  note: string
  selections: CartSelections
}

interface ChatMessage {
  id?: string
  senderName?: string
  senderType?: 'CUSTOMER' | 'STAFF'
  content: string
  createdAt?: string
}

function parseTaggedMeta(content: string, tag: string): Record<string, string> {
  const prefix = `[${tag}]`
  const raw = content.startsWith(prefix) ? content.slice(prefix.length).trim() : content
  return raw
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((acc, pair) => {
      const index = pair.indexOf('=')
      if (index <= 0) return acc
      const key = pair.slice(0, index).trim()
      const value = pair.slice(index + 1).trim()
      if (key) acc[key] = value
      return acc
    }, {})
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function formatSystemChatContent(content: string): string {
  const raw = String(content || '').trim()
  if (!raw.startsWith('[')) return raw

  if (raw.startsWith('[ORDER_NEW]')) {
    const meta = parseTaggedMeta(raw, 'ORDER_NEW')
    const tableText =
      meta.tableNumber && meta.tableNumber !== 'null' && meta.tableNumber !== 'undefined'
        ? `Bàn ${meta.tableNumber}`
        : meta.tableId
          ? `Bàn ${meta.tableId}`
          : 'Bàn không xác định'
    const decodedSummary = meta.summary ? safeDecodeURIComponent(meta.summary) : ''
    if (decodedSummary) return decodedSummary

    const itemCount = Number(meta.items || 0)
    const total = Number(meta.total || 0)
    return `${tableText} | ${itemCount > 0 ? `${itemCount} món` : 'Chưa có món'} | Tổng tiền ${formatVnd(total)}`
  }

  if (raw.startsWith('[CALL_STAFF]')) {
    return raw.replace('[CALL_STAFF]', '').trim() || 'Khách đang cần hỗ trợ'
  }

  if (raw.startsWith('[KDS_ITEM_STATUS]')) {
    return raw.replace('[KDS_ITEM_STATUS]', '').trim() || 'Bếp đã cập nhật trạng thái món'
  }

  if (raw.startsWith('[KDS_ORDER_READY]')) {
    return raw.replace('[KDS_ORDER_READY]', '').trim() || 'Đơn đã sẵn sàng phục vụ'
  }

  return raw.replace(/\[[A-Z_]+\]\s*/, '').trim()
}

interface OrderItemStatus {
  id: string
  menuItemId: string
  quantity: number
  status: string
  note?: string | null
  options?: string | null
  menuItemName?: string | null
}

interface OrderStatusResponse {
  id: string
  status: string
  createdAt?: string
  subtotalAmount?: number
  discountAmount?: number
  promotionCode?: string | null
  totalAmount: number
  orderItems: OrderItemStatus[]
}

interface PaymentStatusResponse {
  paymentId: string
  orderId: string
  status: 'PENDING' | 'WAITING_TRANSFER' | 'WAITING_CASH' | 'PAID' | 'FAILED' | 'EXPIRED' | 'CANCELLED'
  provider: 'SEPAY' | 'CASH'
  paymentUrl?: string | null
  transferContent?: string | null
  vietQr?: {
    qrImageUrl: string
    htmlTag?: string
    transferContent: string
    accountNo?: string
    accountName?: string
    bankBin?: string
  } | null
}

interface PromotionPreview {
  code: string
  description?: string
  discountAmount: number
  finalAmount: number
}

interface CustomerSession {
  id: string
  email: string
  name: string
  role: string
  phone?: string | null
  loyaltyPoints: number
  memberTier: 'STANDARD' | 'SILVER' | 'GOLD'
  totalSpent: number
}

interface CustomerAuthResponse {
  accessToken: string
  user: CustomerSession
}

interface CustomerOfferResponse {
  tier: string
  loyaltyPoints: number
  offers: string[]
}

interface SpecMenuCategory {
  id: string
  name: string
  emoji?: string
  sortOrder?: number
  items: any[]
}

interface SpecMenuResponse {
  branchId?: string
  branchName?: string
  tableId?: string
  tableName?: string
  categories?: SpecMenuCategory[]
}

interface PublicInvoiceLinkResponse {
  invoiceId: string
  invoiceNumber: string
  url: string
  token: string
  expiresAt: string
}

interface PendingChatMessage {
  content: string
  senderName: string
  createdAt: string
}

interface BranchCartValidateChange {
  branchMenuItemId?: string | null
  menuItemId?: string | null
  type: 'PRICE_CHANGED' | 'UNAVAILABLE' | string
  oldPrice?: number
  newPrice?: number
  message?: string
}

interface MenuRecommendation extends MenuItem {
  recommendationReason?: string
  recommendationScore?: number
}

function normalizeCustomizations(raw: unknown): CustomizationGroup[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((entry: any) => ({
      id: String(entry?.id || ''),
      label: String(entry?.label || ''),
      type: entry?.type === 'multi' || entry?.type === 'text' ? entry.type : 'single',
      options: Array.isArray(entry?.options)
        ? entry.options.map((opt: any) => ({
            value: String(opt?.value || ''),
            label: String(opt?.label || ''),
            priceDelta: Number(opt?.priceDelta || 0),
          }))
        : undefined,
      placeholder: entry?.placeholder ? String(entry.placeholder) : undefined,
    }))
    .filter((entry) => entry.id && entry.label)
}

function toNumber(value: string | null): number | null {
  if (!value) return null
  const parsed = Number(value)
  return Number.isNaN(parsed) ? null : parsed
}

function normalizeSelectionValue(value: unknown): string | string[] {
  if (Array.isArray(value)) {
    const normalized = Array.from(
      new Set(
        value
          .map((entry) => String(entry || '').trim())
          .filter(Boolean),
      ),
    ).sort((a, b) => a.localeCompare(b))
    return normalized
  }

  return String(value || '').trim()
}

function normalizeSelections(selections: CartSelections): CartSelections {
  const keys = Object.keys(selections || {}).sort((a, b) => a.localeCompare(b))
  return keys.reduce<CartSelections>((acc, key) => {
    acc[key] = normalizeSelectionValue(selections[key])
    return acc
  }, {})
}

function sanitizeSelectionsForMenuItem(menuItem: MenuItem | undefined, selections: CartSelections): CartSelections {
  if (!menuItem) return normalizeSelections(selections || {})
  const next: CartSelections = {}
  ;(menuItem.customizations || []).forEach((group) => {
    const raw = selections?.[group.id]
    if (group.type === 'single') {
      const allowed = new Set((group.options || []).map((opt) => String(opt.value || '')))
      const selected = String(raw || '').trim()
      const fallback = String(group.options?.[0]?.value || '')
      next[group.id] = allowed.has(selected) ? selected : fallback
      return
    }
    if (group.type === 'multi') {
      const allowed = new Set((group.options || []).map((opt) => String(opt.value || '')))
      const selectedValues = Array.isArray(raw) ? raw.map((entry) => String(entry || '').trim()) : []
      next[group.id] = selectedValues.filter((entry) => allowed.has(entry))
      return
    }
    next[group.id] = String(raw || '')
  })
  return normalizeSelections(next)
}

function buildCartLineKey(menuItemId: string, selections: CartSelections, note?: string): string {
  return JSON.stringify({
    menuItemId: String(menuItemId || '').trim(),
    selections: normalizeSelections(selections || {}),
    note: String(note || '').trim(),
  })
}

function parseCartLineEntry(legacyKey: string, entry: any): CartItem | null {
  if (!entry || typeof entry !== 'object') return null
  const menuItemId = String(entry.menuItemId || legacyKey || '').trim()
  const branchMenuItemId = String(entry.branchMenuItemId || '').trim()
  if (!menuItemId) return null

  const quantity = Math.max(0, Number(entry.quantity || 0))
  if (quantity <= 0) return null

  const selections =
    entry.selections && typeof entry.selections === 'object' && !Array.isArray(entry.selections)
      ? normalizeSelections(entry.selections as CartSelections)
      : {}

  return {
    ...(branchMenuItemId ? { branchMenuItemId } : {}),
    menuItemId,
    quantity,
    note: String(entry.note || ''),
    selections,
  }
}

function restoreCartFromStorage(raw: unknown): Record<string, CartItem> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const source = raw as Record<string, any>

  const next: Record<string, CartItem> = {}
  Object.entries(source).forEach(([legacyKey, entry]) => {
    const parsed = parseCartLineEntry(legacyKey, entry)
    if (!parsed) return
    const lineKey = buildCartLineKey(parsed.menuItemId, parsed.selections, parsed.note)
    const existing = next[lineKey]
    if (existing) {
      next[lineKey] = { ...existing, quantity: existing.quantity + parsed.quantity }
      return
    }
    next[lineKey] = parsed
  })

  return next
}

type DiscountValidationCachePayload = {
  savedAt: number
  data: PromotionPreview
}

const fieldClass =
  'min-h-11 w-full rounded-xl border border-sky-100/80 bg-white/95 px-3 py-2 text-sm text-slate-800 focus:border-sky-400 focus:ring-2 focus:ring-sky-300/60'

const panelClass = 'rounded-2xl border border-sky-100 bg-white/92 p-4 shadow-sm'
const subtleActionButtonClass =
  'inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100'

function normalizeVndAmount(value: unknown): number {
  const amount = Number(value || 0)
  if (!Number.isFinite(amount)) return 0
  if (amount > 0 && amount < 1000 && Number.isInteger(amount)) return amount * 1000
  return amount
}

function formatVnd(value: unknown): string {
  return `${normalizeVndAmount(value).toLocaleString('vi-VN')}đ`
}

function normalizeVietnameseText(input: unknown): string {
  const raw = String(input || '').trim()
  if (!raw) return ''
  const lower = raw.toLowerCase()
  const map: Record<string, string> = {
    'bac xiu': 'Bạc xỉu',
    'ca phe den': 'Cà phê đen',
    'ca phe sua': 'Cà phê sữa',
    'ca phe sua da': 'Cà phê sữa đá',
    'ca phe sua nhieu sua': 'Cà phê sữa nhiều sữa',
    'ca phe den truyen thong': 'Cà phê đen truyền thống',
  }
  return map[lower] || raw
}

function inferSelectedOptions(menuItem: MenuItem | undefined, selections: CartSelections, note: string) {
  if (!menuItem) return { note: String(note || '').trim() || undefined }
  let size: { name: string; priceModifier: number } | undefined
  const toppings: Array<{ name: string; priceModifier: number }> = []

  ;(menuItem.customizations || []).forEach((group) => {
    const normalizedLabel = String(group.label || '').toLowerCase()
    const isSizeGroup = group.type === 'single' && normalizedLabel.includes('size')
    const isToppingGroup = group.type === 'multi' && normalizedLabel.includes('topping')
    const selected = selections[group.id]

    if (isSizeGroup && typeof selected === 'string' && selected) {
      const match = group.options?.find((option) => option.value === selected)
      if (match) {
        size = { name: match.label, priceModifier: Number(match.priceDelta || 0) }
      }
    }

    if (isToppingGroup && Array.isArray(selected)) {
      selected.forEach((value) => {
        const match = group.options?.find((option) => option.value === value)
        if (match) {
          toppings.push({ name: match.label, priceModifier: Number(match.priceDelta || 0) })
        }
      })
    }
  })

  return {
    ...(size ? { size } : {}),
    toppings,
    note: String(note || '').trim() || undefined,
  }
}

function trangThaiMonTrongDon(status?: string | null): string {
  switch (status) {
    case 'WAITING':
      return 'Chờ làm'
    case 'PREPARING':
      return 'Đang chuẩn bị'
    case 'DONE':
      return 'Hoàn thành'
    default:
      return status || '-'
  }
}

function dinhDangThoiGianDon(value?: string | null): string {
  if (!value) return '-'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '-'
  return parsed.toLocaleString('vi-VN')
}

function orderStepIndex(status?: string | null): number {
  const normalized = String(status || '').trim().toUpperCase()
  if (normalized === 'CANCELLED') return -1
  if (normalized === 'COMPLETED' || normalized === 'READY' || normalized === 'SERVED') return 2
  if (normalized === 'PREPARING' || normalized === 'CONFIRMED') return 1
  return 0
}

export default function CustomerMenu() {
  const [searchParams] = useSearchParams()
  const qrTableId = searchParams.get('tableId') || ''
  const qrBranchId = searchParams.get('branchId') || ''
  const qrTableNumber = toNumber(searchParams.get('tableNumber'))

  const [tableId, setTableId] = useState('')
  const [tableName, setTableName] = useState('Chưa xác định')
  const [resolvingTable, setResolvingTable] = useState(true)

  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [loadingMenu, setLoadingMenu] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [cart, setCart] = useState<Record<string, CartItem>>({})
  const [cartDrafts, setCartDrafts] = useState<Record<string, CartDraft>>({})
  const [cartLoaded, setCartLoaded] = useState(false)
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('POST_PAY')
  const [paymentProvider, setPaymentProvider] = useState<PaymentProvider>('SEPAY')
  const [promoCode, setPromoCode] = useState('')
  const [promoPreview, setPromoPreview] = useState<PromotionPreview | null>(null)
  const [applyingPromo, setApplyingPromo] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('ALL')

  const [currentOrderId, setCurrentOrderId] = useState('')
  const [currentOrder, setCurrentOrder] = useState<OrderStatusResponse | null>(null)
  const [editingCurrentOrder, setEditingCurrentOrder] = useState(false)
  const [loadingOrderStatus, setLoadingOrderStatus] = useState(false)
  const [currentPayment, setCurrentPayment] = useState<PaymentStatusResponse | null>(null)
  const [loadingPaymentStatus, setLoadingPaymentStatus] = useState(false)
  const [publicInvoiceUrl, setPublicInvoiceUrl] = useState('')
  const [loadingPublicInvoiceUrl, setLoadingPublicInvoiceUrl] = useState(false)
  const [requestingCashPayment, setRequestingCashPayment] = useState(false)

  const [staffReason, setStaffReason] = useState('Cần hỗ trợ')
  const [customReason, setCustomReason] = useState('')
  const [callingStaff, setCallingStaff] = useState(false)

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [chatText, setChatText] = useState('')
  const [chatOpen, setChatOpen] = useState(false)
  const [chatMinimized, setChatMinimized] = useState(false)
  const [chatNeedProfile, setChatNeedProfile] = useState(false)
  const [chatConnecting, setChatConnecting] = useState(false)
  const [chatCustomerName, setChatCustomerName] = useState('')
  const [chatCustomerPhone, setChatCustomerPhone] = useState('')
  const [chatSessionId, setChatSessionId] = useState('')
  const [staffTyping, setStaffTyping] = useState(false)
  const [cartDrawerOpen, setCartDrawerOpen] = useState(false)
  const [pendingLineRemoveConfirm, setPendingLineRemoveConfirm] = useState<Record<string, boolean>>({})

  const [customerToken, setCustomerToken] = useState('')
  const [customerSession, setCustomerSession] = useState<CustomerSession | null>(null)
  const [customerOffers, setCustomerOffers] = useState<string[]>([])
  const [customerOrderHistory, setCustomerOrderHistory] = useState<OrderStatusResponse[]>([])
  const [customerRecommendations, setCustomerRecommendations] = useState<MenuRecommendation[]>([])
  const [loadingRecommendations, setLoadingRecommendations] = useState(false)
  const [customerHistoryOpen, setCustomerHistoryOpen] = useState(false)
  const [expandedHistoryOrderIds, setExpandedHistoryOrderIds] = useState<Record<string, boolean>>({})
  const [customerAuthOpen, setCustomerAuthOpen] = useState(false)
  const [customerAuthTab, setCustomerAuthTab] = useState<'LOGIN' | 'REGISTER'>('LOGIN')
  const [customerAuthMode, setCustomerAuthMode] = useState<'EMAIL' | 'OTP'>('EMAIL')
  const [authName, setAuthName] = useState('')
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authPhone, setAuthPhone] = useState('')
  const [authOtp, setAuthOtp] = useState('')
  const [requestingOtp, setRequestingOtp] = useState(false)
  const [authSubmitting, setAuthSubmitting] = useState(false)
  const [loadingCustomerData, setLoadingCustomerData] = useState(false)
  const cartPanelRef = useRef<HTMLDivElement | null>(null)
  const previousOrderStatusRef = useRef('')
  const syncedCompletedOrderIdRef = useRef('')
  const staffTypingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingChatFlushRef = useRef(false)
  const customerTypingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lineRemoveTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  useEffect(() => {
    let ignore = false
    const resolveTable = async () => {
      setResolvingTable(true)
      if (qrTableId) {
        try {
          const { data } = await api.get(`/tables/${qrTableId}`)
          if (!data?.id) {
            toast.error('Không tìm thấy bàn từ QR')
            if (!ignore) {
              setTableId('')
              setTableName('Không xác định')
            }
            return
          }
          if (!ignore) {
            setTableId(String(data.id))
            setTableName(`Bàn ${data.number ?? qrTableNumber ?? qrTableId}`)
          }
        } catch (error: any) {
          if (!ignore) {
            setTableId('')
            setTableName('Không xác định')
          }
          toast.error(error.response?.data?.message || 'Không tìm thấy bàn từ QR')
        } finally {
          if (!ignore) {
            setResolvingTable(false)
          }
        }
        return
      }

      if (!qrBranchId || qrTableNumber === null) {
        if (!ignore) {
          toast.error('QR không hợp lệ: thiếu tableId hoặc branchId + tableNumber')
          setResolvingTable(false)
        }
        return
      }

      try {
        const { data } = await api.get('/tables', { params: { branchId: qrBranchId } })
        const matched = (Array.isArray(data) ? data : []).find((table: any) => Number(table?.number) === qrTableNumber)
        if (!matched?.id) {
          toast.error('Không tìm thấy bàn từ QR')
          return
        }
        if (!ignore) {
          setTableId(matched.id)
          setTableName(`Bàn ${matched.number}`)
        }
      } catch (error: any) {
        toast.error(error.response?.data?.message || 'Không xác định được bàn')
      } finally {
        if (!ignore) setResolvingTable(false)
      }
    }

    resolveTable()
    return () => {
      ignore = true
    }
  }, [qrTableId, qrBranchId, qrTableNumber])

  const normalizeMenuPayload = (payload: any): MenuItem[] => {
    const fromFlat = (rows: any[]) =>
      rows.map((item: any) => ({
        ...item,
        id: item.menu_item_id || item.id,
        branchMenuItemId: item.branchMenuItemId || item.branch_menu_item_id || undefined,
        name: normalizeVietnameseText(item.name),
        description: normalizeVietnameseText(item.description),
        image: item.image || item.image_url || null,
        price: normalizeVndAmount(item.price),
        available: item.available ?? item.is_available,
        category: item.category || item.category_name || 'Khac',
        customizations: normalizeCustomizations(item.customizations ?? item.custom_options),
      }))

    if (Array.isArray(payload)) return fromFlat(payload)

    const spec = payload as SpecMenuResponse
    if (Array.isArray(spec?.categories)) {
      return spec.categories.flatMap((category) =>
        (Array.isArray(category.items) ? category.items : []).map((item: any) => ({
          ...item,
          id: item.id || item.menu_item_id,
          branchMenuItemId: item.branchMenuItemId || item.branch_menu_item_id || undefined,
          name: normalizeVietnameseText(item.name),
          description: normalizeVietnameseText(item.description),
          image: item.image || item.imageUrl || item.image_url || null,
          price: normalizeVndAmount(item.price),
          available: item.available ?? item.isAvailable ?? item.is_available,
          category: category.name || 'Khac',
          customizations: normalizeCustomizations(item.customizations ?? item.custom_options ?? item.options),
        })),
      )
    }

    return []
  }

  useEffect(() => {
    const loadMenu = async () => {
      if (resolvingTable) {
        return
      }

      if (!tableId) {
        setMenuItems([])
        setLoadingMenu(false)
        return
      }

      setLoadingMenu(true)
      try {
        const request = qrBranchId
          ? api.get(`/orders/branches/${encodeURIComponent(qrBranchId)}/menu`, {
              params: { tableId: tableId || undefined },
            })
          : api.get('/orders/menu', {
              params: {
                tableId,
                branchId: qrBranchId || undefined,
              },
            })
        const { data } = await request
        const normalized = normalizeMenuPayload(data)
        setMenuItems(normalized)
      } catch (error: any) {
        toast.error(error.response?.data?.message || 'Không tải được menu')
      } finally {
        setLoadingMenu(false)
      }
    }
    loadMenu()
  }, [tableId, qrBranchId, resolvingTable])

  const cartStorageKey = useMemo(() => {
    if (!tableId) return ''
    const branchPart = String(qrBranchId || 'unknown').trim() || 'unknown'
    return `cart_${branchPart}_${tableId}`
  }, [tableId, qrBranchId])
  const cartSessionFallbackKey = useMemo(() => (cartStorageKey ? `session_fallback_${cartStorageKey}` : ''), [cartStorageKey])
  const orderStorageKey = useMemo(() => (tableId ? `customer-last-order:${tableId}` : ''), [tableId])
  const chatProfileStorageKey = useMemo(() => (tableId ? `customer-chat-profile:${tableId}` : ''), [tableId])
  const customerAuthStorageKey = 'customer-auth-session'

  useEffect(() => {
    if (!cartStorageKey) return
    try {
      const raw = localStorage.getItem(cartStorageKey)
      const fallbackRaw = cartSessionFallbackKey ? sessionStorage.getItem(cartSessionFallbackKey) : null
      const source = raw || fallbackRaw
      setCart(source ? restoreCartFromStorage(JSON.parse(source)) : {})
    } catch {
      setCart({})
    } finally {
      setCartLoaded(true)
    }
  }, [cartStorageKey, cartSessionFallbackKey])

  useEffect(() => {
    if (!cartStorageKey || !cartLoaded) return
    const serialized = JSON.stringify(cart)
    try {
      localStorage.setItem(cartStorageKey, serialized)
      if (cartSessionFallbackKey) {
        sessionStorage.removeItem(cartSessionFallbackKey)
      }
    } catch {
      if (cartSessionFallbackKey) {
        sessionStorage.setItem(cartSessionFallbackKey, serialized)
      }
      toast.error('Bo nho localStorage day, da tam luu gio hang trong session hien tai')
    }
  }, [cartStorageKey, cart, cartLoaded, cartSessionFallbackKey])

  useEffect(() => {
    const onEscCloseDrawer = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setCartDrawerOpen(false)
    }
    window.addEventListener('keydown', onEscCloseDrawer)
    return () => window.removeEventListener('keydown', onEscCloseDrawer)
  }, [])

  useEffect(() => {
    if (!orderStorageKey) return
    setCurrentOrderId(localStorage.getItem(orderStorageKey) || '')
  }, [orderStorageKey])

  useEffect(() => {
    try {
      const raw = localStorage.getItem(customerAuthStorageKey)
      if (!raw) return
      const parsed = JSON.parse(raw)
      const token = String(parsed?.token || '')
      const user = parsed?.user as CustomerSession | undefined
      const role = String(user?.role || '').toUpperCase()
      if (!token || !user?.id || role !== 'CUSTOMER') {
        localStorage.removeItem(customerAuthStorageKey)
        return
      }
      setCustomerToken(token)
      setCustomerSession(user)
      setChatCustomerName(String(user.name || ''))
      if (user.phone) setChatCustomerPhone(String(user.phone))
    } catch {
      // ignore broken storage
    }
  }, [])

  useEffect(() => {
    if (!chatProfileStorageKey) return
    try {
      const raw = localStorage.getItem(chatProfileStorageKey)
      if (raw) {
        const parsed = JSON.parse(raw)
        setChatCustomerName(String(parsed?.name || ''))
        setChatCustomerPhone(String(parsed?.phone || ''))
        return
      }
    } catch {
      // ignore invalid localStorage
    }
    setChatCustomerName(customerSession?.name || '')
    setChatCustomerPhone(customerSession?.phone || '')
    setMessages([])
  }, [chatProfileStorageKey, customerSession?.id])

  useEffect(() => {
    if (!tableId || currentOrderId) return
    const loadLatestOrder = async () => {
      try {
        const { data } = await api.get('/orders', { params: { tableId } })
        if (Array.isArray(data) && data.length > 0) {
          const latestOrderId = String(data[0].id)
          setCurrentOrderId(latestOrderId)
          if (orderStorageKey) localStorage.setItem(orderStorageKey, latestOrderId)
        }
      } catch {
        // ignore
      }
    }
    loadLatestOrder()
  }, [tableId, currentOrderId, orderStorageKey])

  const saveCustomerSession = (token: string, user: CustomerSession) => {
    const normalizedUser: CustomerSession = {
      ...user,
      loyaltyPoints: Number(user.loyaltyPoints || 0),
      totalSpent: Number(user.totalSpent || 0),
      memberTier: (user.memberTier || 'STANDARD') as CustomerSession['memberTier'],
    }
    setCustomerToken(token)
    setCustomerSession(normalizedUser)
    setChatCustomerName(normalizedUser.name || chatCustomerName)
    setChatCustomerPhone(normalizedUser.phone || chatCustomerPhone)
    localStorage.setItem(customerAuthStorageKey, JSON.stringify({ token, user: normalizedUser }))
  }

  const clearCustomerSession = () => {
    setCustomerToken('')
    setCustomerSession(null)
    setCustomerOffers([])
    setCustomerOrderHistory([])
    setCustomerRecommendations([])
    setCustomerHistoryOpen(false)
    setExpandedHistoryOrderIds({})
    setCustomerAuthOpen(false)
    previousOrderStatusRef.current = ''
    syncedCompletedOrderIdRef.current = ''
    localStorage.removeItem(customerAuthStorageKey)
  }

  const fetchCustomerProfile = async (token: string) => {
    const { data } = await api.get('/users/customer/profile', {
      headers: { Authorization: `Bearer ${token}` },
    })
    return data as CustomerSession
  }

  const fetchCustomerOffers = async (token: string) => {
    const { data } = await api.get('/users/customer/offers', {
      headers: { Authorization: `Bearer ${token}` },
    })
    const payload = data as CustomerOfferResponse
    return payload.offers || []
  }

  const fetchCustomerOrderHistory = async (user: CustomerSession) => {
    const params: Record<string, string | number> = { limit: 10 }
    if (user.id) params.customerId = user.id
    else if (user.phone) params.phone = user.phone
    else if (user.email) params.email = user.email

    const { data } = await api.get('/orders/history', { params })
    return Array.isArray(data) ? (data as OrderStatusResponse[]) : []
  }

  const loadCustomerData = async (token: string, baseUser: CustomerSession) => {
    setLoadingCustomerData(true)
    try {
      const [profile, offers, history] = await Promise.all([
        fetchCustomerProfile(token),
        fetchCustomerOffers(token),
        fetchCustomerOrderHistory(baseUser),
      ])
      saveCustomerSession(token, profile)
      setCustomerOffers(offers)
      setCustomerOrderHistory(history)
    } catch (error: any) {
      clearCustomerSession()
      const status = Number(error?.response?.status || 0)
      if (status === 401 || status === 403) {
        toast.error('Phiên khách hàng không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại.')
      } else {
        toast.error(error.response?.data?.message || 'Phiên đăng nhập đã hết hạn')
      }
    } finally {
      setLoadingCustomerData(false)
    }
  }

  const loadRecommendations = async () => {
    if (!tableId && !qrBranchId) {
      setCustomerRecommendations([])
      return
    }

    setLoadingRecommendations(true)
    try {
      const params: Record<string, string | number> = { limit: 6 }
      if (tableId) params.tableId = tableId
      if (qrBranchId) params.branchId = qrBranchId
      if (customerSession?.id) params.customerId = customerSession.id
      else if (customerSession?.phone) params.phone = customerSession.phone
      else if (customerSession?.email) params.email = customerSession.email

      const { data } = await api.get('/orders/recommendations', { params })
      const normalized = (Array.isArray(data) ? data : []).map((item: any) => ({
        ...item,
        name: normalizeVietnameseText(item.name),
        description: normalizeVietnameseText(item.description),
        price: normalizeVndAmount(item.price),
        customizations: normalizeCustomizations(item.customizations),
      }))
      setCustomerRecommendations(normalized)
    } catch {
      setCustomerRecommendations([])
    } finally {
      setLoadingRecommendations(false)
    }
  }

  const toggleHistoryOrderDetails = (orderId: string) => {
    setExpandedHistoryOrderIds((prev) => ({
      ...prev,
      [orderId]: !prev[orderId],
    }))
  }

  useEffect(() => {
    if (!customerToken || !customerSession?.id) return
    loadCustomerData(customerToken, customerSession)
  }, [customerToken])

  useEffect(() => {
    loadRecommendations()
  }, [tableId, qrBranchId, customerSession?.id, customerSession?.phone, customerSession?.email])

  useEffect(() => {
    const orderId = String(currentOrder?.id || '')
    const currentStatus = String(currentOrder?.status || '')
    const previousStatus = previousOrderStatusRef.current

    if (
      orderId &&
      currentStatus === 'COMPLETED' &&
      previousStatus !== 'COMPLETED' &&
      customerToken &&
      customerSession &&
      syncedCompletedOrderIdRef.current !== orderId
    ) {
      syncedCompletedOrderIdRef.current = orderId
      loadCustomerData(customerToken, customerSession)
    }

    previousOrderStatusRef.current = currentStatus
  }, [currentOrder?.id, currentOrder?.status, customerToken, customerSession?.id])

  const requestCustomerOtp = async () => {
    const phone = authPhone.trim()
    if (!phone) {
      toast.error('Nhap so dien thoai truoc khi lay OTP')
      return
    }
    setRequestingOtp(true)
    try {
      const { data } = await api.post('/users/customer/request-otp', { phone })
      if (data?.otp) {
        toast.success(`OTP sandbox: ${data.otp}`)
      } else {
        toast.success('OTP da duoc gui')
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Khong gui duoc OTP')
    } finally {
      setRequestingOtp(false)
    }
  }

  const submitCustomerAuth = async (e: FormEvent) => {
    e.preventDefault()
    setAuthSubmitting(true)
    try {
      let data: CustomerAuthResponse
      if (customerAuthMode === 'EMAIL') {
        if (customerAuthTab === 'REGISTER') {
          const res = await api.post('/users/customer/register-email', {
            name: authName.trim(),
            email: authEmail.trim(),
            password: authPassword,
            phone: authPhone.trim() || undefined,
          })
          data = res.data as CustomerAuthResponse
        } else {
          const res = await api.post('/users/customer/login-email', {
            email: authEmail.trim(),
            password: authPassword,
          })
          data = res.data as CustomerAuthResponse
        }
      } else {
        if (customerAuthTab === 'REGISTER') {
          const res = await api.post('/users/customer/register-otp', {
            name: authName.trim(),
            phone: authPhone.trim(),
            otp: authOtp.trim(),
            email: authEmail.trim() || undefined,
          })
          data = res.data as CustomerAuthResponse
        } else {
          const res = await api.post('/users/customer/login-otp', {
            phone: authPhone.trim(),
            otp: authOtp.trim(),
          })
          data = res.data as CustomerAuthResponse
        }
      }

      saveCustomerSession(data.accessToken, data.user)
      setCustomerAuthOpen(false)
      setAuthPassword('')
      setAuthOtp('')
      toast.success('Đăng nhập thành công')
      await loadCustomerData(data.accessToken, data.user)
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Đăng nhập hoặc đăng ký thất bại')
    } finally {
      setAuthSubmitting(false)
    }
  }

  const joinChatSession = (customerName: string, customerPhone?: string) => {
    if (!tableId) return
    const socket = getSocket()
    if (!socket.connected) {
      socket.connect()
    }
    setChatConnecting(true)
    socket.emit('join-chat', {
      tableId,
      branchId: qrBranchId,
      customerName,
      customerPhone: customerPhone || undefined,
    })
  }

  const chatPendingStorageKey = useMemo(() => {
    if (!tableId) return ''
    return `customer-chat-pending:${tableId}`
  }, [tableId])

  const readPendingMessages = (): PendingChatMessage[] => {
    if (!chatPendingStorageKey) return []
    try {
      const raw = localStorage.getItem(chatPendingStorageKey)
      if (!raw) return []
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) return []
      return parsed
        .map((item) => ({
          content: String(item?.content || '').trim(),
          senderName: String(item?.senderName || chatCustomerName || 'Khách'),
          createdAt: String(item?.createdAt || new Date().toISOString()),
        }))
        .filter((item) => item.content.length > 0)
    } catch {
      return []
    }
  }

  const writePendingMessages = (items: PendingChatMessage[]) => {
    if (!chatPendingStorageKey) return
    if (!items.length) {
      localStorage.removeItem(chatPendingStorageKey)
      return
    }
    localStorage.setItem(chatPendingStorageKey, JSON.stringify(items.slice(-50)))
  }

  const enqueuePendingMessage = (item: PendingChatMessage) => {
    const next = [...readPendingMessages(), item]
    writePendingMessages(next)
  }

  const flushPendingMessages = () => {
    if (pendingChatFlushRef.current) return
    if (!chatSessionId) return
    const socket = getSocket()
    if (!socket.connected) return
    const queue = readPendingMessages()
    if (!queue.length) return
    pendingChatFlushRef.current = true
    queue.forEach((item) => {
      socket.emit('send-message', {
        sessionId: chatSessionId,
        content: item.content,
        senderType: 'CUSTOMER',
        senderName: item.senderName,
      })
    })
    writePendingMessages([])
    pendingChatFlushRef.current = false
  }

  const onChatClosed = () => {
    toast.error('Phiên chat đã kết thúc, vui lòng gọi nhân viên')
    setChatSessionId('')
    setStaffTyping(false)
  }

  useEffect(() => {
    if (!chatOpen || !tableId) return

    const socket = getSocket()
    if (!socket.connected) {
      socket.connect()
    }

    const onJoined = (payload: { sessionId?: string; messages?: ChatMessage[] }) => {
      if (payload?.sessionId) {
        setChatSessionId(payload.sessionId)
      }
      setMessages(payload.messages || [])
      setChatConnecting(false)
    }
    const onNewMessage = (payload: ChatMessage | { message?: ChatMessage }) => {
      const message = (payload as any)?.message ? (payload as any).message as ChatMessage : payload as ChatMessage
      setMessages((prev) => (prev.some((item) => item.id === message.id) ? prev : [...prev, message]))
      if (message.senderType === 'STAFF') {
        const isSystem = String(message.senderName || '').trim().toUpperCase() === 'SYSTEM'
        showRealtimeNotification(
          isSystem ? 'Hệ thống' : message.senderName || 'Nhân viên',
          isSystem ? formatSystemChatContent(message.content) : message.content,
        )
      }
    }
    const onTyping = (payload: { senderType?: string; isTyping?: boolean }) => {
      if (String(payload?.senderType || '').toUpperCase() !== 'STAFF') return
      setStaffTyping(Boolean(payload?.isTyping))
      if (staffTypingTimerRef.current) clearTimeout(staffTypingTimerRef.current)
      if (payload?.isTyping) {
        staffTypingTimerRef.current = setTimeout(() => setStaffTyping(false), 2000)
      }
    }
    const onSocketError = (payload: { message?: string }) => {
      setChatConnecting(false)
      if (payload?.message) {
        toast.error(payload.message)
      }
    }

    socket.on('chat-joined', onJoined)
    socket.on('message-received', onNewMessage)
    socket.on('chat-closed', onChatClosed)
    socket.on('chat-typing', onTyping)
    socket.on('error', onSocketError)

    if (chatCustomerName.trim()) {
      setChatNeedProfile(false)
      joinChatSession(chatCustomerName.trim(), chatCustomerPhone.trim())
    } else {
      setChatNeedProfile(true)
      setChatConnecting(false)
    }

    return () => {
      socket.off('chat-joined', onJoined)
      socket.off('message-received', onNewMessage)
      socket.off('chat-closed', onChatClosed)
      socket.off('chat-typing', onTyping)
      socket.off('error', onSocketError)
      disconnectSocket()
      setChatConnecting(false)
      if (staffTypingTimerRef.current) clearTimeout(staffTypingTimerRef.current)
    }
  }, [chatOpen, tableId, qrBranchId])

  useEffect(() => {
    if (!tableId) return
    const socket = getSocket()
    if (!socket.connected) {
      socket.connect()
    }

    const roomId = `table:${tableId}`
    socket.emit('join-room', { room: roomId })

    const onCartUpdated = (payload: {
      tableId?: string
      cart?: Record<string, CartItem>
      updatedBy?: string
    }) => {
      if (String(payload?.tableId || '').trim() !== tableId) return
      if (!payload?.cart || typeof payload.cart !== 'object') return
      setCart(restoreCartFromStorage(payload.cart))
      toast('Giỏ hàng vừa được cập nhật bởi nhân viên')
    }

    socket.on('cart-updated', onCartUpdated)
    return () => {
      socket.off('cart-updated', onCartUpdated)
    }
  }, [tableId])

  useEffect(() => {
    flushPendingMessages()
  }, [chatSessionId, chatOpen])

  const menuMap = useMemo(() => new Map(menuItems.map((item) => [item.id, item])), [menuItems])

  useEffect(() => {
    if (!cartLoaded) return
    if (!menuMap.size) return
    setCart((prev) => {
      const rebuilt: Record<string, CartItem> = {}
      Object.values(prev).forEach((line) => {
        const menuItemId = String(line?.menuItemId || '').trim()
        const menuItem = menuMap.get(menuItemId)
        if (!menuItem) return
        const sanitizedSelections = sanitizeSelectionsForMenuItem(menuItem, line.selections || {})
        const normalizedNote = String(line.note || '')
        const lineKey = buildCartLineKey(menuItemId, sanitizedSelections, normalizedNote)
        const existing = rebuilt[lineKey]
        rebuilt[lineKey] = {
          branchMenuItemId: String(menuItem.branchMenuItemId || line.branchMenuItemId || ''),
          menuItemId,
          quantity: Number(existing?.quantity || 0) + Math.max(0, Number(line.quantity || 0)),
          note: normalizedNote,
          selections: sanitizedSelections,
        }
      })
      return JSON.stringify(rebuilt) === JSON.stringify(prev) ? prev : rebuilt
    })
    setCartDrafts((prev) => {
      const next: Record<string, CartDraft> = {}
      Object.entries(prev).forEach(([menuItemId, draft]) => {
        const menuItem = menuMap.get(String(menuItemId || '').trim())
        if (!menuItem) return
        next[menuItemId] = {
          note: String(draft?.note || ''),
          selections: sanitizeSelectionsForMenuItem(menuItem, draft?.selections || {}),
        }
      })
      return JSON.stringify(next) === JSON.stringify(prev) ? prev : next
    })
  }, [cartLoaded, menuMap])
  const recommendationItems = useMemo(
    () => customerRecommendations.filter((item) => menuMap.has(item.id)),
    [customerRecommendations, menuMap],
  )
  const categories = useMemo(() => ['ALL', ...new Set(menuItems.map((item) => item.category))], [menuItems])

  const filteredItems = useMemo(() => {
    const keyword = searchText.trim().toLowerCase()
    return menuItems.filter((item) => {
      const byCategory = selectedCategory === 'ALL' || item.category === selectedCategory
      const byKeyword =
        !keyword ||
        item.name.toLowerCase().includes(keyword) ||
        (item.description || '').toLowerCase().includes(keyword)
      return byCategory && byKeyword
    })
  }, [menuItems, searchText, selectedCategory])

  const buildDefaultSelections = (menuItemId: string): CartSelections => {
    const menuItem = menuMap.get(menuItemId)
    const defaults: CartSelections = {}
    ;(menuItem?.customizations || []).forEach((group) => {
      defaults[group.id] = group.type === 'multi' ? [] : String(group.options?.[0]?.value || '')
    })
    return defaults
  }

  const getDraftForMenuItem = (
    menuItemId: string,
    sourceDrafts: Record<string, CartDraft> = cartDrafts,
  ): CartDraft => {
    const menuItem = menuMap.get(menuItemId)
    const existing = sourceDrafts[menuItemId]
    if (existing) {
      return {
        note: String(existing.note || ''),
        selections: sanitizeSelectionsForMenuItem(menuItem, existing.selections || {}),
      }
    }

    return {
      note: '',
      selections: normalizeSelections(buildDefaultSelections(menuItemId)),
    }
  }

  const getCustomizationDelta = (menuItem: MenuItem, selections: CartSelections): number => {
    let totalDelta = 0
    ;(menuItem.customizations || []).forEach((group) => {
      if (!group.options?.length) return
      const selected = selections[group.id]
      if (group.type === 'single' && typeof selected === 'string') {
        const match = group.options.find((option) => option.value === selected)
        totalDelta += Number(match?.priceDelta || 0)
      }
      if (group.type === 'multi' && Array.isArray(selected)) {
        selected.forEach((value) => {
          const match = group.options?.find((option) => option.value === value)
          totalDelta += Number(match?.priceDelta || 0)
        })
      }
    })
    return totalDelta
  }

  const formatSelectionDetails = (menuItem: MenuItem | undefined, selections: CartSelections): string[] => {
    if (!menuItem) return []
    const details: string[] = []
    ;(menuItem.customizations || []).forEach((group) => {
      const selected = selections[group.id]
      if (group.type === 'single' && typeof selected === 'string' && selected) {
        const match = group.options?.find((option) => option.value === selected)
        details.push(`${group.label}: ${match?.label || selected}`)
      }
      if (group.type === 'multi' && Array.isArray(selected) && selected.length > 0) {
        const labels = selected.map((value) => {
          const match = group.options?.find((option) => option.value === value)
          return match?.label || value
        })
        details.push(`${group.label}: ${labels.join(', ')}`)
      }
      if (group.type === 'text' && typeof selected === 'string' && selected.trim()) {
        details.push(`${group.label}: ${selected.trim()}`)
      }
    })
    return details
  }

  const cartLines = useMemo(
    () => Object.values(cart).filter((line) => line.quantity > 0),
    [cart],
  )

  const cartTotal = useMemo(() => {
    return cartLines.reduce((sum, line) => {
      const menuItem = menuMap.get(line.menuItemId)
      if (!menuItem || line.quantity <= 0) return sum
      return sum + (menuItem.price + getCustomizationDelta(menuItem, line.selections)) * line.quantity
    }, 0)
  }, [cartLines, menuMap])
  const previewDiscount = promoPreview?.discountAmount || 0
  const payableCartTotal = Math.max(cartTotal - previewDiscount, 0)
  const cartItemCount = useMemo(
    () => cartLines.reduce((sum, item) => sum + Math.max(item.quantity || 0, 0), 0),
    [cartLines],
  )

  const cartCountByMenuItem = useMemo(() => {
    return cartLines.reduce<Map<string, number>>((acc, line) => {
      acc.set(line.menuItemId, (acc.get(line.menuItemId) || 0) + line.quantity)
      return acc
    }, new Map<string, number>())
  }, [cartLines])

  const increase = (menuItemId: string) => {
    const draft = getDraftForMenuItem(menuItemId)
    const normalizedSelections = normalizeSelections(draft.selections)
    const lineKey = buildCartLineKey(menuItemId, normalizedSelections, draft.note)

    setCart((prev) => {
      const current = prev[lineKey]
      return {
        ...prev,
        [lineKey]: {
          branchMenuItemId: String(menuMap.get(menuItemId)?.branchMenuItemId || ''),
          menuItemId,
          quantity: Number(current?.quantity || 0) + 1,
          note: String(draft.note || ''),
          selections: normalizedSelections,
        },
      }
    })
  }

  const increaseLineQuantity = (lineKey: string) => {
    setCart((prev) => {
      const current = prev[lineKey]
      if (!current) return prev
      return {
        ...prev,
        [lineKey]: {
          ...current,
          quantity: Number(current.quantity || 0) + 1,
        },
      }
    })
  }

  const decreaseLineQuantity = (lineKey: string) => {
    setCart((prev) => {
      const current = prev[lineKey]
      if (!current) return prev
      if (current.quantity <= 1) {
        return prev
      }
      return {
        ...prev,
        [lineKey]: {
          ...current,
          quantity: Number(current.quantity || 0) - 1,
        },
      }
    })
  }

  const removeCartLine = (lineKey: string) => {
    setCart((prev) => {
      if (!prev[lineKey]) return prev
      const next = { ...prev }
      delete next[lineKey]
      return next
    })
  }

  const scheduleLineRemoveConfirmation = (lineKey: string) => {
    if (lineRemoveTimersRef.current[lineKey]) {
      clearTimeout(lineRemoveTimersRef.current[lineKey])
    }
    setPendingLineRemoveConfirm((prev) => ({ ...prev, [lineKey]: true }))
    lineRemoveTimersRef.current[lineKey] = setTimeout(() => {
      setPendingLineRemoveConfirm((prev) => {
        const next = { ...prev }
        delete next[lineKey]
        return next
      })
      delete lineRemoveTimersRef.current[lineKey]
    }, 2000)
  }

  const validateCartWhenDrawerOpen = async () => {
    if (!cartDrawerOpen || !qrBranchId || cartLines.length === 0) return
    try {
      const payloadItems = cartLines
        .map((line) => {
          const item = menuMap.get(line.menuItemId)
          const unitPrice = item ? Number(item.price + getCustomizationDelta(item, line.selections)) : 0
          return {
            branchMenuItemId: String(line.branchMenuItemId || item?.branchMenuItemId || '').trim() || undefined,
            menuItemId: line.menuItemId,
            quantity: line.quantity,
            unitPrice,
          }
        })
        .filter((entry) => entry.menuItemId || entry.branchMenuItemId)

      if (!payloadItems.length) return
      const { data } = await api.post(`/branches/${encodeURIComponent(qrBranchId)}/cart/validate`, {
        items: payloadItems,
      })
      const changes: BranchCartValidateChange[] = Array.isArray(data?.changes) ? data.changes : []
      if (!changes.length) return

      const unavailableMenuIds = new Set(
        changes
          .filter((change) => change.type === 'UNAVAILABLE')
          .map((change) => String(change.menuItemId || '').trim())
          .filter(Boolean),
      )

      if (unavailableMenuIds.size > 0) {
        setCart((prev) =>
          Object.fromEntries(
            Object.entries(prev).filter(([, line]) => !unavailableMenuIds.has(String(line.menuItemId || '').trim())),
          ),
        )
      }

      const hasPriceChange = changes.some((change) => change.type === 'PRICE_CHANGED')
      changes.forEach((change) => {
        if (change?.message) {
          toast(change.message)
        }
      })

      if (hasPriceChange) {
        const request = qrBranchId
          ? api.get(`/orders/branches/${encodeURIComponent(qrBranchId)}/menu`, {
              params: { tableId: tableId || undefined },
            })
          : api.get('/orders/menu', {
              params: {
                tableId,
                branchId: qrBranchId || undefined,
              },
            })
        const { data: refreshedMenu } = await request
        setMenuItems(normalizeMenuPayload(refreshedMenu))
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Không thể kiểm tra lại giỏ hàng')
    }
  }

  useEffect(() => {
    void validateCartWhenDrawerOpen()
    // validate only when opening cart drawer or when source cart/menu changes while drawer is open
  }, [cartDrawerOpen, qrBranchId, tableId, cartLines.length])

  const decrease = (menuItemId: string) => {
    const draft = getDraftForMenuItem(menuItemId)
    const preferredKey = buildCartLineKey(menuItemId, draft.selections, draft.note)

    setCart((prev) => {
      const current = prev[preferredKey]
      if (!current) return prev
      if (current.quantity <= 1) {
        const next = { ...prev }
        delete next[preferredKey]
        return next
      }
      return { ...prev, [preferredKey]: { ...current, quantity: current.quantity - 1 } }
    })
  }

  const updateSelection = (menuItemId: string, groupId: string, value: string | string[]) => {
    setCartDrafts((prev) => {
      const current = getDraftForMenuItem(menuItemId, prev)
      return {
        ...prev,
        [menuItemId]: {
          ...current,
          selections: {
            ...current.selections,
            [groupId]: normalizeSelectionValue(value),
          },
        },
      }
    })
  }

  const updateNote = (menuItemId: string, note: string) => {
    setCartDrafts((prev) => {
      const current = getDraftForMenuItem(menuItemId, prev)
      return { ...prev, [menuItemId]: { ...current, note } }
    })
  }

  const parseOrderItemSelections = (rawOptions?: string | null): CartSelections => {
    if (!rawOptions) return {}
    try {
      const parsed = JSON.parse(rawOptions) as { selections?: CartSelections }
      if (!parsed?.selections || typeof parsed.selections !== 'object') return {}
      return normalizeSelections(parsed.selections)
    } catch {
      return {}
    }
  }

  const populateCartFromCurrentOrder = () => {
    if (!currentOrder || currentOrder.status !== 'PENDING') {
      toast.error('Chỉ có thể sửa đơn đang chờ xác nhận')
      return
    }

    if (currentPayment) {
      toast.error('Đơn đã có giao dịch thanh toán, không thể sửa')
      return
    }

    const nextCart = currentOrder.orderItems.reduce<Record<string, CartItem>>((acc, item) => {
      const selections = parseOrderItemSelections(item.options)
      const note = String(item.note || '')
      const lineKey = buildCartLineKey(item.menuItemId, selections, note)
      const existing = acc[lineKey]

      if (existing) {
        acc[lineKey] = {
          ...existing,
          quantity: existing.quantity + Number(item.quantity || 0),
        }
      } else {
        acc[lineKey] = {
          menuItemId: item.menuItemId,
          quantity: Number(item.quantity || 0),
          note,
          selections,
        }
      }
      return acc
    }, {})

    setCart(nextCart)
    setEditingCurrentOrder(true)
    setPromoCode(currentOrder.promotionCode || '')
    setPromoPreview(
      currentOrder.promotionCode && Number(currentOrder.discountAmount || 0) > 0
        ? {
            code: String(currentOrder.promotionCode || ''),
            discountAmount: Number(currentOrder.discountAmount || 0),
            finalAmount: Number(currentOrder.totalAmount || 0),
          }
        : null,
    )
    scrollToCart()
    toast.success('Đã nạp đơn hiện tại vào giỏ hàng để chỉnh sửa')
  }

  const fetchOrderStatus = async (orderId: string) => {
    if (!orderId) return
    setLoadingOrderStatus(true)
    try {
      const { data } = await api.get(`/orders/${orderId}`)
      setCurrentOrder(data)
    } catch (error: any) {
      if (error.response?.status === 404) {
        setCurrentOrder(null)
      } else {
        toast.error(error.response?.data?.message || 'Không tải được trạng thái đơn')
      }
    } finally {
      setLoadingOrderStatus(false)
    }
  }

  const fetchPaymentStatus = async (orderId: string) => {
    if (!orderId) return
    setLoadingPaymentStatus(true)
    try {
      const { data } = await api.get(`/v1/payments/orders/${orderId}?allowMissing=true`)
      let payment = data as PaymentStatusResponse | null
      if (
        payment &&
        payment.provider === 'SEPAY' &&
        ['PENDING', 'WAITING_TRANSFER'].includes(payment.status)
      ) {
        const { data: verified } = await api.post(
          `/v1/payments/${payment.paymentId}/verify`,
          payment.transactionId ? { transactionId: payment.transactionId } : {},
          customerToken ? { headers: { Authorization: `Bearer ${customerToken}` } } : undefined,
        )
        payment = verified as PaymentStatusResponse
      }
      setCurrentPayment(payment)
      if (payment?.status === 'PAID') {
        setLoadingPublicInvoiceUrl(true)
        try {
          const { data: invoiceLink } = await api.get<PublicInvoiceLinkResponse>(
            `/public/orders/${orderId}/invoice-link`,
          )
          setPublicInvoiceUrl(String(invoiceLink?.url || '').trim())
        } catch {
          setPublicInvoiceUrl('')
        } finally {
          setLoadingPublicInvoiceUrl(false)
        }
      } else {
        setPublicInvoiceUrl('')
      }
    } catch (error: any) {
      if (error.response?.status === 404) {
        setCurrentPayment(null)
        setPublicInvoiceUrl('')
      } else {
        toast.error(error.response?.data?.message || 'Khong tai duoc trang thai thanh toan')
      }
    } finally {
      setLoadingPaymentStatus(false)
    }
  }

  const applyPromotion = async () => {
    const code = promoCode.trim()
    if (!code) {
      setPromoPreview(null)
      return
    }
    if (cartTotal <= 0) {
      toast.error('Vui long co it nhat 1 mon truoc khi ap ma')
      return
    }

    setApplyingPromo(true)
    try {
      const cacheKey = `discount_validate_${code.toUpperCase()}_${Math.floor(cartTotal)}`
      const cachedRaw = sessionStorage.getItem(cacheKey)
      if (cachedRaw) {
        const cached = JSON.parse(cachedRaw) as DiscountValidationCachePayload
        if (cached?.savedAt && Date.now() - Number(cached.savedAt) <= 5 * 60 * 1000 && cached?.data) {
          setPromoPreview(cached.data)
          toast.success('Đã áp dụng mã khuyến mãi (cache)')
          return
        }
      }

      const selectedMenuItemIds = Array.from(
        new Set(
          cartLines
            .filter((line) => line.quantity > 0)
            .map((line) => line.menuItemId),
        ),
      )

      const { data } = await api.post('/discount/validate', {
        code,
        subtotal: cartTotal,
        menuItemIds: selectedMenuItemIds,
        tableId: tableId || undefined,
        branchId: qrBranchId || undefined,
      })
      if (!data?.valid) {
        throw new Error(String(data?.message || 'Ma khuyen mai khong hop le'))
      }
      setPromoPreview({
        code: String(data?.code || code).toUpperCase(),
        description: data?.description || undefined,
        discountAmount: Number(data?.discountAmount || 0),
        finalAmount: Number(data?.finalAmount || cartTotal),
      })
      sessionStorage.setItem(
        cacheKey,
        JSON.stringify({
          savedAt: Date.now(),
          data: {
            code: String(data?.code || code).toUpperCase(),
            description: data?.description || undefined,
            discountAmount: Number(data?.discountAmount || 0),
            finalAmount: Number(data?.finalAmount || cartTotal),
          },
        } as DiscountValidationCachePayload),
      )
      toast.success('Đã áp dụng mã khuyến mãi')
    } catch (error: any) {
      setPromoPreview(null)
      toast.error(error.response?.data?.message || 'Ma khuyen mai khong hop le')
    } finally {
      setApplyingPromo(false)
    }
  }

  const requestCashPayment = async () => {
    if (!tableId || !currentOrder) return
    setRequestingCashPayment(true)
    try {
      const { data } = await api.post(
        '/v1/payments',
        {
          orderId: currentOrder.id,
          amount: Number(currentOrder.totalAmount),
          provider: 'CASH',
          tableId,
          branchId: qrBranchId || undefined,
          customerName: customerSession?.name || tableName,
        },
        customerToken ? { headers: { Authorization: `Bearer ${customerToken}` } } : undefined,
      )
      setCurrentPayment(data)
      toast.success('Da gui yeu cau thanh toan tien mat cho nhan vien')
      await fetchPaymentStatus(currentOrder.id)
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Khong tao duoc yeu cau tien mat')
    } finally {
      setRequestingCashPayment(false)
    }
  }

  useEffect(() => {
    if (!currentOrderId) {
      setCurrentOrder(null)
      setCurrentPayment(null)
      setPublicInvoiceUrl('')
      return
    }
    fetchOrderStatus(currentOrderId)
    fetchPaymentStatus(currentOrderId)
    const timer = window.setInterval(() => {
      fetchOrderStatus(currentOrderId)
      fetchPaymentStatus(currentOrderId)
    }, 8000)
    return () => window.clearInterval(timer)
  }, [currentOrderId])

  const submitOrder = async (e: FormEvent) => {
    e.preventDefault()
    if (!tableId) {
      toast.error('Thiếu thông tin bàn từ QR')
      return
    }
    const items = cartLines
      .filter((cartItem) => cartItem.quantity > 0)
      .map((cartItem) => {
        const menuItem = menuMap.get(cartItem.menuItemId)
        const selectedOptions = inferSelectedOptions(menuItem, cartItem.selections, cartItem.note || '')
        return {
          branchMenuItemId: menuItem?.branchMenuItemId || undefined,
          menuItemId: cartItem.menuItemId,
          quantity: cartItem.quantity,
          note: cartItem.note || undefined,
          selectedOptions,
          options: JSON.stringify({
            selections: cartItem.selections,
            extraAmount: menuItem ? getCustomizationDelta(menuItem, cartItem.selections) : 0,
          }),
        }
      })

    if (!items.length) {
      toast.error('Vui lòng chọn ít nhất 1 món')
      return
    }

    setSubmitting(true)
    try {
      if (editingCurrentOrder && currentOrderId) {
        const { data: updatedOrder } = await api.patch(`/orders/${currentOrderId}/customer-items`, {
          tableId,
          items,
        })
        setCurrentOrder(updatedOrder)
        setEditingCurrentOrder(false)
        toast.success('Đã cập nhật món trong đơn')
        await fetchOrderStatus(currentOrderId)
        await fetchPaymentStatus(currentOrderId)
      } else {
        const idempotencyKey = `cart_${String(qrBranchId || 'unknown').trim() || 'unknown'}_${tableId}_${Date.now()}`
        const { data: order } = await api.post(
          '/orders',
          {
            tableId,
            branchId: qrBranchId || undefined,
            customerId: customerSession?.id || undefined,
            customerEmail: customerSession?.email || undefined,
            customerName: customerSession?.name || chatCustomerName || tableName,
            customerPhone: customerSession?.phone || chatCustomerPhone || undefined,
            paymentMethod: paymentMode,
            discountCode: promoPreview?.code || promoCode.trim() || undefined,
            promoCode: promoPreview?.code || promoCode.trim() || undefined,
            items,
          },
          { headers: { 'Idempotency-Key': idempotencyKey } },
        )
        const newOrderId = String(order.id)
        setCurrentOrderId(newOrderId)
        if (orderStorageKey) localStorage.setItem(orderStorageKey, newOrderId)

        if (paymentMode === 'ONLINE_PAY') {
          let payment: any = null
          try {
            const paymentInit = await api.post('/payments/online/init', {
              orderId: newOrderId,
              provider: paymentProvider,
            })
            const redirectUrl = String(paymentInit.data?.redirectUrl || '').trim()
            if (redirectUrl) {
              window.location.href = redirectUrl
            }
          } catch {
            const fallback = await api.post(
              '/v1/payments',
              {
                orderId: newOrderId,
                amount: Number(order.totalAmount),
                provider: paymentProvider,
                tableId,
                branchId: qrBranchId || undefined,
                customerName: customerSession?.name || tableName,
              },
              customerToken ? { headers: { Authorization: `Bearer ${customerToken}` } } : undefined,
            )
            payment = fallback.data
          }
          setCurrentPayment(payment)
          toast.success('Da tao don va hien ma QR thanh toan')
        } else {
          toast.success(`Đặt món thành công. Mã đơn: ${maDonHangNgan(newOrderId)}`)
        }

        fetchOrderStatus(newOrderId)
        fetchPaymentStatus(newOrderId)
        if (customerToken && customerSession) {
          loadCustomerData(customerToken, customerSession)
        }
      }

      setCart({})
      setPromoCode('')
      setPromoPreview(null)
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Đặt món thất bại')
    } finally {
      setSubmitting(false)
    }
  }

  const sendChat = () => {
    if (!chatText.trim() || !tableId) {
      return
    }
    if (!chatOpen) {
      setChatOpen(true)
      return
    }
    if (chatNeedProfile || !chatCustomerName.trim()) {
      toast.error('Vui long nhap ten de bat dau chat')
      setChatNeedProfile(true)
      return
    }
    const content = chatText.trim()
    const socket = getSocket()
    if (!socket.connected || !chatSessionId) {
      enqueuePendingMessage({
        content,
        senderName: chatCustomerName.trim(),
        createdAt: new Date().toISOString(),
      })
      toast('Tin nhắn sẽ được gửi khi kết nối lại')
      setChatText('')
      return
    }
    socket.emit('send-message', {
      sessionId: chatSessionId || undefined,
      content,
      senderType: 'CUSTOMER',
      senderName: chatCustomerName.trim(),
    })
    setChatText('')
  }

  const emitCustomerTyping = (value: string) => {
    setChatText(value)
    const socket = getSocket()
    if (!socket.connected || !chatSessionId) return
    socket.emit('typing', {
      sessionId: chatSessionId,
      senderType: 'CUSTOMER',
      senderName: chatCustomerName.trim() || 'Khách',
      isTyping: value.trim().length > 0,
    })
    if (customerTypingTimerRef.current) clearTimeout(customerTypingTimerRef.current)
    customerTypingTimerRef.current = setTimeout(() => {
      socket.emit('typing', {
        sessionId: chatSessionId,
        senderType: 'CUSTOMER',
        senderName: chatCustomerName.trim() || 'Khách',
        isTyping: false,
      })
    }, 1200)
  }

  const toggleChatWidget = () => {
    if (!tableId) {
      toast.error('Chua xac dinh duoc ban')
      return
    }
    setChatOpen((prev) => {
      const next = !prev
      if (next) {
        setChatMinimized(false)
      }
      return next
    })
  }

  const startChatSession = (e: FormEvent) => {
    e.preventDefault()
    const customerName = chatCustomerName.trim()
    const customerPhone = chatCustomerPhone.trim()
    if (!customerName) {
      toast.error('Vui long nhap ten truoc khi chat')
      return
    }
    if (chatProfileStorageKey) {
      localStorage.setItem(chatProfileStorageKey, JSON.stringify({ name: customerName, phone: customerPhone }))
    }
    setChatNeedProfile(false)
    joinChatSession(customerName, customerPhone)
  }

  const callStaff = async () => {
    if (!tableId) return
    const reason = staffReason === 'Khác' ? customReason.trim() || 'Cần hỗ trợ tại bàn' : staffReason
    setCallingStaff(true)
    try {
      await api.post(`/tables/${tableId}/call-staff`, { reason })
      toast.success('Đã gửi yêu cầu gọi phục vụ')
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Gọi phục vụ thất bại')
    } finally {
      setCallingStaff(false)
    }
  }

  const scrollToCart = () => {
    setCartDrawerOpen(true)
    cartPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="mx-auto max-w-7xl px-3 pb-36 pt-4 sm:px-6 sm:pb-28 sm:pt-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{resolvingTable ? 'Đang xác định bàn...' : `Thực đơn ${tableName}`}</h1>
          <p className="mt-1 text-sm text-slate-500">Đặt món qua QR, theo dõi trạng thái và gọi nhân viên.</p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="rounded-full bg-sky-50 px-3 py-1 font-medium text-sky-800">
            {cartItemCount} món trong giỏ
          </span>
            <span className="rounded-full bg-emerald-50 px-3 py-1 font-medium text-emerald-700">
              Tạm tính {formatVnd(payableCartTotal)}
            </span>
          {currentOrder && (
            <span className="rounded-full bg-sky-50 px-3 py-1 font-medium text-sky-700">
              Đơn hiện tại: {trangThaiDonHang(currentOrder.status)}
            </span>
          )}
          <button
            type="button"
            onClick={() => setCartDrawerOpen(true)}
            className="fixed right-4 top-4 z-40 hidden h-12 w-12 items-center justify-center rounded-full bg-amber-600 text-white shadow-md lg:inline-flex"
            aria-label="Mở giỏ hàng"
          >
            <ShoppingBagIcon className="h-5 w-5" />
            {cartItemCount > 0 && (
              <span className="absolute -right-1 -top-1 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                {cartItemCount}
              </span>
            )}
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 rounded-2xl border border-sky-100 bg-white/92 p-3 shadow-sm sm:grid-cols-2 lg:grid-cols-4 sm:p-4">
        <input
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          className={fieldClass}
          placeholder="Tìm món theo tên hoặc mô tả"
        />
        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className={fieldClass}
        >
          {categories.map((category) => (
            <option key={category} value={category}>
              {category === 'ALL' ? 'Tất cả danh mục' : category}
            </option>
          ))}
        </select>
        <div className="flex items-center justify-start text-sm text-slate-500">{filteredItems.length} món hiển thị</div>
        <div className="hidden items-center justify-end text-xs text-slate-500 lg:flex">Chọn danh mục để lọc nhanh</div>
      </div>
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {categories.map((category) => (
          <button
            key={`chip-${category}`}
            type="button"
            onClick={() => setSelectedCategory(category)}
            className={`whitespace-nowrap rounded-full px-3 py-2 text-sm ${
              selectedCategory === category
                ? 'bg-sky-600 text-white'
                : 'border border-sky-100 bg-white text-slate-700'
            }`}
          >
            {category === 'ALL' ? 'Tất cả' : category}
          </button>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {loadingMenu && <p>Đang tải menu...</p>}
          {!loadingMenu && (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
              {filteredItems.map((item) => {
                const draft = getDraftForMenuItem(item.id)
                const selectedCount = cartCountByMenuItem.get(item.id) || 0
                return (
                  <div key={item.id} className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-3 shadow-md shadow-slate-100">
                    <img
                      src={item.image || `https://placehold.co/400x280?text=${encodeURIComponent(item.name)}`}
                      alt={item.name}
                      className="h-36 w-full rounded-xl object-cover sm:h-32"
                    />
                    <div className="mt-2 flex items-start justify-between gap-2">
                      <p className="line-clamp-2 text-sm font-semibold text-slate-900">{item.name}</p>
                      <span className="shrink-0 text-sm font-bold text-sky-700">{formatVnd(item.price)}</span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-slate-500">{item.description || '---'}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => increase(item.id)}
                        className={`${subtleActionButtonClass} min-w-20 px-3 py-2 text-xs disabled:opacity-60`}
                        disabled={!item.available}
                      >
                        Thêm
                      </button>
                      <div className="ml-auto flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => decrease(item.id)}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-base text-slate-700"
                        >
                          <MinusIcon className="h-4 w-4" />
                        </button>
                        <span className="w-7 text-center text-sm font-semibold">{selectedCount}</span>
                        <button
                          type="button"
                          onClick={() => increase(item.id)}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-base text-slate-700"
                          disabled={!item.available}
                        >
                          +
                        </button>
                      </div>
                    </div>

                    {(item.customizations || []).length > 0 && (
                      <details className="group mt-2 rounded-xl border border-sky-100 bg-sky-50/40 p-2">
                        <summary className="cursor-pointer list-none text-xs font-semibold text-sky-700">
                          <span className="group-open:hidden">▶ Chọn size / topping</span>
                          <span className="hidden group-open:inline">▼ Ẩn tùy chọn</span>
                        </summary>
                        <div className="mt-2 space-y-2">
                          {(item.customizations || []).map((group) => (
                            <div key={`${item.id}-${group.id}`}>
                              <p className="mb-1 text-[11px] font-semibold uppercase text-slate-500">{group.label}</p>
                              {group.type === 'single' && (
                                <select
                                  value={String(draft.selections[group.id] || '')}
                                  onChange={(e) => updateSelection(item.id, group.id, e.target.value)}
                                  className={fieldClass}
                                >
                                  {(group.options || []).map((option) => (
                                    <option key={option.value} value={option.value}>
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                              )}
                              {group.type === 'multi' && (
                                <div className="space-y-1">
                                  {(group.options || []).map((option) => {
                                    const selectedValues = Array.isArray(draft.selections[group.id])
                                      ? (draft.selections[group.id] as string[])
                                      : []
                                    const checked = selectedValues.includes(option.value)
                                    return (
                                      <label key={option.value} className="flex items-center gap-2 text-xs">
                                        <input
                                          type="checkbox"
                                          checked={checked}
                                          onChange={(e) => {
                                            const nextValues = e.target.checked
                                              ? Array.from(new Set([...selectedValues, option.value]))
                                              : selectedValues.filter((entry) => entry !== option.value)
                                            updateSelection(item.id, group.id, nextValues)
                                          }}
                                        />
                                        {option.label}
                                      </label>
                                    )
                                  })}
                                </div>
                              )}
                              {group.type === 'text' && (
                                <input
                                  value={String(draft.selections[group.id] || '')}
                                  onChange={(e) => updateSelection(item.id, group.id, e.target.value)}
                                  className={fieldClass}
                                  placeholder={group.placeholder || 'Nhập yêu cầu'}
                                />
                              )}
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                    <textarea
                      value={draft.note}
                      onChange={(e) => updateNote(item.id, e.target.value)}
                      className={`${fieldClass} mt-2 min-h-0 py-1.5 text-xs`}
                      rows={1}
                      placeholder="Ghi chú ngắn (tùy chọn)"
                    />
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div
          ref={cartPanelRef}
          className={`fixed inset-y-0 right-0 z-50 w-full max-w-md overflow-y-auto border-l border-sky-100 bg-white px-4 py-5 shadow-2xl transition-transform duration-300 lg:static lg:z-auto lg:w-auto lg:max-w-none lg:translate-x-0 lg:border-0 lg:bg-transparent lg:px-0 lg:py-0 lg:shadow-none lg:col-span-1 lg:sticky lg:top-24 lg:self-start ${
            cartDrawerOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          <div className="mb-3 flex items-center justify-between lg:hidden">
            <p className="text-sm font-semibold text-slate-900">Giỏ hàng và trạng thái bàn</p>
            <button
              type="button"
              onClick={() => setCartDrawerOpen(false)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-sky-200"
            >
              <XMarkIcon className="h-5 w-5 text-slate-600" />
            </button>
          </div>

          <div className="space-y-4">
          <div className={panelClass}>
            <div className="flex items-center justify-between">
              <p className="font-semibold text-slate-900">Tai khoan thanh vien</p>
              {!customerSession ? (
                <button
                  type="button"
                  onClick={() => setCustomerAuthOpen(true)}
                  className="rounded-xl border border-sky-200 px-3 py-1 text-xs"
                >
                  Đăng nhập / Đăng ký
                </button>
              ) : (
                <button
                  type="button"
                  onClick={clearCustomerSession}
                  className="rounded-xl border border-red-200 px-3 py-1 text-xs text-red-600"
                >
                  Dang xuat
                </button>
              )}
            </div>

            {!customerSession && (
              <p className="mt-2 text-sm text-gray-500">
                Đăng nhập để lưu lịch sử đơn hàng, tích điểm và nhận ưu đãi thành viên.
              </p>
            )}

            {customerSession && (
              <div className="mt-2 space-y-2 text-sm">
                <p>
                  Xin chao <span className="font-semibold">{customerSession.name}</span>
                </p>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="rounded bg-amber-50 p-2">
                    <p className="text-gray-500">Diem</p>
                    <p className="font-semibold text-amber-700">{customerSession.loyaltyPoints}</p>
                  </div>
                  <div className="rounded bg-blue-50 p-2">
                    <p className="text-gray-500">Hang</p>
                    <p className="font-semibold text-blue-700">{customerSession.memberTier}</p>
                  </div>
                  <div className="rounded bg-emerald-50 p-2">
                    <p className="text-gray-500">Chi tieu</p>
                    <p className="font-semibold text-emerald-700">{formatVnd(customerSession.totalSpent)}</p>
                  </div>
                </div>
                {loadingCustomerData && <p className="text-xs text-gray-500">Dang tai du lieu thanh vien...</p>}
                {!loadingCustomerData && customerOffers.length > 0 && (
                  <div className="rounded border border-gray-100 p-2 text-xs">
                    <p className="font-semibold text-gray-700">Uu dai cua ban</p>
                    {customerOffers.slice(0, 3).map((offer, idx) => (
                      <p key={`${offer}-${idx}`} className="mt-1 text-gray-600">
                        - {offer}
                      </p>
                    ))}
                  </div>
                )}
                {!loadingCustomerData && customerOrderHistory.length > 0 && (
                  <div className="rounded border border-gray-100 p-2 text-xs">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-gray-700">Lich su don gan day</p>
                      <button
                        type="button"
                        onClick={() => setCustomerHistoryOpen(true)}
                        className="rounded border border-sky-200 px-2 py-1 text-[11px] font-medium text-sky-700"
                      >
                        Xem chi tiet
                      </button>
                    </div>
                    <div className="mt-1 space-y-1">
                      {customerOrderHistory.slice(0, 4).map((historyOrder) => (
                        <div key={historyOrder.id} className="rounded bg-gray-50 px-2 py-1">
                          <div className="flex items-center justify-between gap-2">
                            <span>{maDonHangNgan(historyOrder.id)}</span>
                            <span>{formatVnd(historyOrder.totalAmount)}</span>
                            <span className="font-semibold">{trangThaiDonHang(historyOrder.status)}</span>
                          </div>
                          <p className="mt-1 text-[11px] text-gray-500">
                            {dinhDangThoiGianDon(historyOrder.createdAt)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="rounded border border-gray-100 p-2 text-xs">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-gray-700">Gợi ý cho bạn</p>
                    <button
                      type="button"
                      onClick={loadRecommendations}
                      disabled={loadingRecommendations}
                      className="rounded border border-sky-200 px-2 py-1 text-[11px] font-medium text-sky-700 disabled:opacity-60"
                    >
                      {loadingRecommendations ? 'Đang tải...' : 'Làm mới'}
                    </button>
                  </div>
                  {loadingRecommendations && <p className="mt-1 text-gray-500">Đang tải gợi ý...</p>}
                  {!loadingRecommendations && recommendationItems.length === 0 && (
                    <p className="mt-1 text-gray-500">
                      Chưa có gợi ý phù hợp. Hãy đặt món để hệ thống học sở thích của bạn.
                    </p>
                  )}
                  {!loadingRecommendations && recommendationItems.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {recommendationItems.slice(0, 4).map((item) => (
                        <div key={`recommend-${item.id}`} className="flex items-center justify-between gap-2 rounded bg-sky-50/60 px-2 py-1.5">
                          <div className="min-w-0">
                            <p className="truncate font-medium text-slate-800">{item.name}</p>
                            <p className="text-[11px] text-slate-500">
                              {item.recommendationReason === 'history_preference' ? 'Theo lịch sử mua hàng' : 'Đang phổ biến'}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => increase(item.id)}
                            className="shrink-0 rounded-lg border border-amber-200 bg-white px-2 py-1 text-[11px] font-semibold text-amber-700"
                          >
                            + Thêm
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <form onSubmit={submitOrder} className={panelClass}>
            <p className="font-semibold text-slate-900">Giỏ hàng</p>
            <div className="mt-3 space-y-2 text-sm">
              {cartLines.length === 0 && (
                <div className="rounded-xl border border-dashed border-sky-200 bg-sky-50/30 px-3 py-5 text-center">
                  <p className="text-gray-500">Giỏ hàng trống. Hãy thêm món từ thực đơn.</p>
                  <button
                    type="button"
                    onClick={() => setCartDrawerOpen(false)}
                    className="mt-2 rounded-lg border border-sky-200 bg-white px-3 py-1.5 text-xs font-medium text-sky-700"
                  >
                    Tiếp tục chọn món
                  </button>
                </div>
              )}
              {cartLines.map((entry) => {
                const item = menuMap.get(entry.menuItemId)
                if (!item) return null
                const delta = getCustomizationDelta(item, entry.selections)
                const detailLines = formatSelectionDetails(item, entry.selections)
                const lineKey = buildCartLineKey(entry.menuItemId, entry.selections, entry.note)
                return (
                  <div key={lineKey} className="rounded border border-gray-100 p-2">
                    <div className="flex items-start justify-between gap-2">
                      <span>
                        {entry.quantity}x {item.name}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeCartLine(lineKey)}
                        className="rounded border border-red-200 px-2 py-0.5 text-xs text-red-600"
                      >
                        Xóa
                      </button>
                    </div>
                    {detailLines.length > 0 && (
                      <p className="mt-1 text-xs text-gray-500">Chi tiết: {detailLines.join(' | ')}</p>
                    )}
                    {!!entry.note && <p className="mt-1 text-xs text-gray-500">Ghi chú: {entry.note}</p>}
                    <div className="mt-2 flex items-center justify-between">
                      <span className="font-medium text-amber-700">{formatVnd((item.price + delta) * entry.quantity)}</span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            if (entry.quantity <= 1) {
                              if (pendingLineRemoveConfirm[lineKey]) {
                                removeCartLine(lineKey)
                                setPendingLineRemoveConfirm((prev) => {
                                  const next = { ...prev }
                                  delete next[lineKey]
                                  return next
                                })
                                if (lineRemoveTimersRef.current[lineKey]) {
                                  clearTimeout(lineRemoveTimersRef.current[lineKey])
                                  delete lineRemoveTimersRef.current[lineKey]
                                }
                                return
                              }
                              scheduleLineRemoveConfirmation(lineKey)
                              return
                            }
                            decreaseLineQuantity(lineKey)
                          }}
                          className="inline-flex h-8 w-8 items-center justify-center rounded border border-sky-200 disabled:opacity-50"
                        >
                          {entry.quantity <= 1 && pendingLineRemoveConfirm[lineKey] ? 'X' : '-'}
                        </button>
                        <span className="min-w-6 text-center text-sm font-semibold">{entry.quantity}</span>
                        <button
                          type="button"
                          onClick={() => increaseLineQuantity(lineKey)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded border border-sky-200"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="mt-3 rounded-xl border border-sky-100 p-3">
              <p className="text-xs font-semibold uppercase text-slate-500">Hình thức thanh toán</p>
              {editingCurrentOrder && (
                <p className="mt-2 text-xs text-amber-700">
                  Đơn hiện tại đã được tạo. Bạn chỉ đang cập nhật lại món trong đơn chờ xác nhận.
                </p>
              )}
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentMode('POST_PAY')}
                  disabled={editingCurrentOrder}
                  className={`rounded-xl px-3 py-2 text-sm ${paymentMode === 'POST_PAY' ? 'bg-sky-700 text-white' : 'border border-sky-200'}`}
                >
                  Trả sau
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMode('ONLINE_PAY')}
                  disabled={editingCurrentOrder}
                  className={`rounded-xl px-3 py-2 text-sm ${paymentMode === 'ONLINE_PAY' ? 'bg-sky-700 text-white' : 'border border-sky-200'}`}
                >
                  Trả trước
                </button>
              </div>
              {paymentMode === 'ONLINE_PAY' && (
                <select
                  value={paymentProvider}
                  onChange={(e) => setPaymentProvider(e.target.value as PaymentProvider)}
                  disabled={editingCurrentOrder}
                  className={`${fieldClass} mt-2`}
                >
                  <option value="SEPAY">SePay</option>
                </select>
              )}
            </div>

            <div className="mt-3 rounded-xl border border-sky-100 p-3">
              <p className="text-xs font-semibold uppercase text-slate-500">Ma khuyen mai</p>
              <div className="mt-2 flex gap-2">
                <input
                  value={promoCode}
                  onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      void applyPromotion()
                    }
                  }}
                  className={`${fieldClass} flex-1`}
                  placeholder="Nhap ma giam gia"
                />
                <button
                  type="button"
                  onClick={applyPromotion}
                  disabled={applyingPromo}
                  className="rounded-xl border border-sky-200 px-3 py-2 text-sm disabled:opacity-60"
                >
                  {applyingPromo ? 'Đang áp dụng...' : 'Áp dụng'}
                </button>
              </div>
              {promoPreview && (
                <div className="mt-2 flex items-center justify-between gap-2 text-xs text-emerald-700">
                  <p>
                    Đã áp dụng {promoPreview.code}: -{formatVnd(promoPreview.discountAmount)}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setPromoCode('')
                      setPromoPreview(null)
                    }}
                    className="rounded border border-emerald-200 px-2 py-0.5 text-emerald-700"
                  >
                    Xóa mã
                  </button>
                </div>
              )}
            </div>

            <div className="mt-3 space-y-1 border-t pt-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Tạm tính</span>
                <span>{formatVnd(cartTotal)}</span>
              </div>
              <div className="flex items-center justify-between text-emerald-700">
                <span>Khuyến mãi</span>
                <span>-{formatVnd(previewDiscount)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-semibold">Tong</span>
                <span className="font-bold text-amber-700">{formatVnd(payableCartTotal)}</span>
              </div>
            </div>
            <button
              type="submit"
              className="mt-4 w-full rounded bg-amber-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              disabled={submitting || resolvingTable}
            >
              {submitting
                ? 'Đang gửi...'
                : editingCurrentOrder
                  ? 'Cập nhật đơn hàng'
                  : paymentMode === 'ONLINE_PAY'
                    ? 'Đặt món và thanh toán'
                    : 'Gửi đơn chờ xác nhận'}
            </button>
            {editingCurrentOrder && (
              <button
                type="button"
                onClick={() => {
                  setEditingCurrentOrder(false)
                  setCart({})
                  setPromoCode(currentOrder?.promotionCode || '')
                  setPromoPreview(
                    currentOrder?.promotionCode && Number(currentOrder.discountAmount || 0) > 0
                      ? {
                          code: String(currentOrder.promotionCode || ''),
                          discountAmount: Number(currentOrder.discountAmount || 0),
                          finalAmount: Number(currentOrder.totalAmount || 0),
                        }
                      : null,
                  )
                }}
                className="mt-2 w-full rounded-xl border border-sky-200 px-4 py-2 text-sm font-medium text-slate-700"
              >
                Hủy sửa đơn
              </button>
            )}
          </form>

          <div className={panelClass}>
            <div className="flex items-center justify-between">
              <p className="font-semibold text-slate-900">Trạng thái đơn</p>
              {currentOrderId && (
                <button
                  type="button"
                  onClick={() => {
                    fetchOrderStatus(currentOrderId)
                    fetchPaymentStatus(currentOrderId)
                  }}
                  className="text-xs text-blue-600"
                >
                  Làm mới
                </button>
              )}
            </div>
            {!currentOrderId && <p className="mt-2 text-sm text-gray-500">Chưa có đơn gần đây.</p>}
            {currentOrderId && loadingOrderStatus && <p className="mt-2 text-sm text-gray-500">Đang tải trạng thái...</p>}
            {currentOrder && (
              <div className="mt-2 text-sm">
                <p>
                  Mã đơn: <span className="font-semibold" title={currentOrder.id}>{maDonHangNgan(currentOrder.id)}</span>
                </p>
                <p>
                  Trạng thái: <span className="font-semibold">{trangThaiDonHang(currentOrder.status)}</span>
                </p>
                <div className="mt-3">
                  {currentOrder.status === 'CANCELLED' ? (
                    <p className="rounded-lg bg-red-50 px-2 py-1 text-xs font-medium text-red-700">Đơn đã hủy</p>
                  ) : (
                    <div className="grid grid-cols-3 gap-2 text-[11px]">
                      {['Đã nhận', 'Đang làm', 'Hoàn thành'].map((step, index) => {
                        const active = orderStepIndex(currentOrder.status) >= index
                        return (
                          <div key={step} className={`rounded-lg border px-2 py-1 text-center ${active ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-500'}`}>
                            {step}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
                {typeof currentOrder.subtotalAmount === 'number' && (
                  <p>
                    Tạm tính: <span className="font-semibold">{formatVnd(currentOrder.subtotalAmount)}</span>
                  </p>
                )}
                {!!currentOrder.discountAmount && currentOrder.discountAmount > 0 && (
                  <p className="text-emerald-700">
                    Giảm giá {currentOrder.promotionCode ? `(${currentOrder.promotionCode})` : ''}:{' '}
                    <span className="font-semibold">-{formatVnd(currentOrder.discountAmount)}</span>
                  </p>
                )}
                <p>
                  Tổng thanh toán: <span className="font-semibold">{formatVnd(currentOrder.totalAmount)}</span>
                </p>
                {currentOrder.status === 'PENDING' && !currentPayment && !loadingPaymentStatus && (
                  <button
                    type="button"
                    onClick={populateCartFromCurrentOrder}
                    className="mt-2 rounded border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700"
                  >
                    Sửa món trong đơn
                  </button>
                )}
                <div className="mt-2 space-y-1">
                  {currentOrder.orderItems.map((item) => {
                    const details = formatSelectionDetails(
                      menuMap.get(item.menuItemId),
                      parseOrderItemSelections(item.options),
                    )
                    return (
                      <div key={item.id} className="rounded bg-gray-50 px-2 py-1 text-xs">
                        <div className="flex justify-between gap-2">
                          <span>
                            {item.quantity}x {item.menuItemName || menuMap.get(item.menuItemId)?.name || 'Món không xác định'}
                          </span>
                          <span className="font-semibold">{item.status === 'WAITING' ? 'Chờ làm' : item.status === 'PREPARING' ? 'Đang chuẩn bị' : item.status === 'DONE' || item.status === 'READY' ? 'Hoàn thành' : item.status}</span>
                        </div>
                        {details.length > 0 && (
                          <p className="mt-1 text-gray-600">Chi tiết: {details.join(' | ')}</p>
                        )}
                        {!!item.note && <p className="mt-1 text-gray-600">Ghi chú: {item.note}</p>}
                      </div>
                    )
                  })}
                </div>

                <div className="mt-3 rounded border border-gray-100 p-2 text-xs">
                  <p className="font-semibold text-gray-700">Thanh toan</p>
                  {loadingPaymentStatus && <p className="mt-1 text-gray-500">Đang tải thanh toán...</p>}
                  {!loadingPaymentStatus && !currentPayment && (
                    <p className="mt-1 text-gray-500">Chưa tạo giao dịch thanh toán.</p>
                  )}
                  {currentPayment && (
                    <div className="mt-1 space-y-1">
                      <p>
                        Phương thức: <span className="font-semibold">{phuongThucThanhToan(currentPayment.provider)}</span>
                      </p>
                      <p>
                        Trạng thái: <span className="font-semibold">{trangThaiThanhToan(currentPayment.status)}</span>
                      </p>
                      {currentPayment.provider === 'SEPAY' &&
                        (currentPayment.paymentUrl || currentPayment.vietQr?.qrImageUrl) && (
                          <div className="space-y-2">
                            {currentPayment.vietQr?.qrImageUrl && (
                              <div className="rounded border border-sky-200 bg-white p-2">
                                <p className="mb-2 text-xs text-slate-600">Quét QR SePay để thanh toán</p>
                                <img
                                  src={currentPayment.vietQr.qrImageUrl}
                                  alt="SePay QR"
                                  className="mx-auto h-48 w-48 rounded border border-slate-200 object-contain"
                                />
                                <p className="mt-2 break-all text-xs text-slate-600">
                                  Nội dung CK:{' '}
                                  <span className="font-semibold">
                                    {currentPayment.vietQr.transferContent || currentPayment.transferContent || '-'}
                                  </span>
                                </p>
                              </div>
                            )}
                            {currentPayment.paymentUrl && (
                              <a
                                href={currentPayment.paymentUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-block rounded border px-2 py-1"
                              >
                                Mở cổng thanh toán
                              </a>
                            )}
                          </div>
                        )}
                      {currentPayment.status === 'PAID' && (
                        <div className="pt-1">
                          {loadingPublicInvoiceUrl && <p className="text-gray-500">Đang tạo link hóa đơn...</p>}
                          {!loadingPublicInvoiceUrl && publicInvoiceUrl && (
                            <a
                              href={publicInvoiceUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-block rounded border border-sky-300 bg-sky-50 px-2 py-1 text-sky-700"
                            >
                              Xem hóa đơn
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {currentOrder.status !== 'CANCELLED' &&
                    currentOrder.status !== 'COMPLETED' &&
                    currentPayment?.status !== 'PAID' && (
                      <button
                        type="button"
                        onClick={requestCashPayment}
                        disabled={requestingCashPayment}
                        className="mt-2 rounded bg-emerald-600 px-3 py-1 text-white disabled:opacity-60"
                      >
                        {requestingCashPayment ? 'Đang gửi...' : 'Thanh toán tiền mặt'}
                      </button>
                    )}
                </div>
              </div>
            )}
          </div>

          <div className={panelClass}>
            <p className="font-semibold text-slate-900">Gọi phục vụ</p>
            <select
              value={staffReason}
              onChange={(e) => setStaffReason(e.target.value)}
              className={`${fieldClass} mt-2`}
            >
              <option>Cần hỗ trợ</option>
              <option>Cần tính tiền</option>
              <option>Cần thêm nước/đá</option>
              <option>Khác</option>
            </select>
            {staffReason === 'Khác' && (
              <input
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                className={`${fieldClass} mt-2`}
                placeholder="Nhập lý do cụ thể"
              />
            )}
            <button
              type="button"
              onClick={callStaff}
              disabled={callingStaff || resolvingTable}
              className="mt-3 w-full rounded bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {callingStaff ? 'Đang gửi...' : 'Gửi yêu cầu gọi phục vụ'}
            </button>
          </div>
          </div>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-sky-100 bg-white/95 px-3 py-2 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-slate-500">{cartItemCount} món trong giỏ</p>
            <p className="truncate text-sm font-bold text-slate-900">Tạm tính {formatVnd(payableCartTotal)}</p>
          </div>
          <button
            type="button"
            onClick={() => setCartDrawerOpen(true)}
            className="inline-flex min-h-11 items-center rounded-xl bg-amber-600 px-4 text-sm font-semibold text-white"
          >
            Xem giỏ hàng
          </button>
        </div>
      </div>

      {cartDrawerOpen && (
        <button
          type="button"
          onClick={() => setCartDrawerOpen(false)}
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          aria-label="Đóng ngăn giỏ hàng"
        />
      )}

      {customerHistoryOpen && customerSession && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center sm:p-4">
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5">
            <div className="flex items-center justify-between">
              <p className="text-lg font-bold text-slate-900">Lich su don hang chi tiet</p>
              <button
                type="button"
                onClick={() => setCustomerHistoryOpen(false)}
                className="rounded-xl border border-sky-200 px-2 py-1 text-xs"
              >
                Dong
              </button>
            </div>

            <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
              <p>
                Khach hang: <span className="font-semibold text-gray-700">{customerSession.name}</span>
              </p>
              <button
                type="button"
                onClick={() => {
                  if (customerToken && customerSession) {
                    loadCustomerData(customerToken, customerSession)
                  }
                }}
                className="rounded border border-sky-200 px-2 py-1 font-medium text-sky-700"
              >
                Lam moi
              </button>
            </div>

            {loadingCustomerData && <p className="mt-3 text-sm text-gray-500">Dang tai lich su don...</p>}
            {!loadingCustomerData && customerOrderHistory.length === 0 && (
              <p className="mt-3 text-sm text-gray-500">Chua co don hang nao.</p>
            )}

            {!loadingCustomerData && customerOrderHistory.length > 0 && (
              <div className="mt-3 space-y-2">
                {customerOrderHistory.map((historyOrder) => {
                  const isExpanded = !!expandedHistoryOrderIds[historyOrder.id]
                  return (
                    <div key={historyOrder.id} className="rounded-xl border border-gray-100 p-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-semibold text-slate-900" title={historyOrder.id}>
                            {maDonHangNgan(historyOrder.id)}
                          </p>
                          <p className="text-xs text-gray-500">{dinhDangThoiGianDon(historyOrder.createdAt)}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-amber-700">{formatVnd(historyOrder.totalAmount)}</p>
                          <p className="text-xs font-medium text-slate-700">{trangThaiDonHang(historyOrder.status)}</p>
                        </div>
                      </div>

                      <div className="mt-2 flex items-center justify-between text-xs">
                        <p className="text-gray-500">{historyOrder.orderItems.length} mon</p>
                        <button
                          type="button"
                          onClick={() => toggleHistoryOrderDetails(historyOrder.id)}
                          className="rounded border border-sky-200 px-2 py-1 font-medium text-sky-700"
                        >
                          {isExpanded ? 'Thu gon' : 'Xem chi tiet mon'}
                        </button>
                      </div>

                      {isExpanded && (
                        <div className="mt-2 space-y-1 rounded bg-gray-50 p-2 text-xs">
                          {historyOrder.orderItems.map((item) => {
                            const selections = parseOrderItemSelections(item.options)
                            const optionValues = formatSelectionDetails(
                              menuMap.get(item.menuItemId),
                              selections,
                            )

                            return (
                              <div key={item.id} className="rounded bg-white px-2 py-2">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="font-medium text-slate-800">
                                    {item.quantity}x{' '}
                                    {item.menuItemName || menuMap.get(item.menuItemId)?.name || 'Mon khong xac dinh'}
                                  </p>
                                  <p className="font-semibold text-slate-700">{trangThaiMonTrongDon(item.status)}</p>
                                </div>
                                {!!item.note && <p className="mt-1 text-gray-600">Ghi chu: {item.note}</p>}
                                {optionValues.length > 0 && (
                                  <p className="mt-1 text-gray-600">Tuy chon: {optionValues.join(', ')}</p>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {customerAuthOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center sm:p-4">
          <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5">
            <div className="flex items-center justify-between">
              <p className="text-lg font-bold text-slate-900">Tài khoản khách hàng</p>
              <button
                type="button"
                onClick={() => setCustomerAuthOpen(false)}
                className="rounded-xl border border-sky-200 px-2 py-1 text-xs"
              >
                Dong
              </button>
            </div>

            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => setCustomerAuthTab('LOGIN')}
                className={`rounded-xl px-3 py-2 text-sm ${customerAuthTab === 'LOGIN' ? 'bg-sky-700 text-white' : 'border border-sky-200'}`}
              >
                Đăng nhập
              </button>
              <button
                type="button"
                onClick={() => setCustomerAuthTab('REGISTER')}
                className={`rounded-xl px-3 py-2 text-sm ${customerAuthTab === 'REGISTER' ? 'bg-sky-700 text-white' : 'border border-sky-200'}`}
              >
                Đăng ký
              </button>
            </div>

            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setCustomerAuthMode('EMAIL')}
                className={`rounded-xl px-3 py-1.5 text-xs ${customerAuthMode === 'EMAIL' ? 'bg-sky-100 text-sky-700' : 'border border-sky-200'}`}
              >
                Email
              </button>
              <button
                type="button"
                onClick={() => setCustomerAuthMode('OTP')}
                className={`rounded-xl px-3 py-1.5 text-xs ${customerAuthMode === 'OTP' ? 'bg-sky-100 text-sky-700' : 'border border-sky-200'}`}
              >
                So dien thoai OTP
              </button>
            </div>

            <form onSubmit={submitCustomerAuth} className="mt-4 space-y-2">
              {customerAuthTab === 'REGISTER' && (
                <input
                  value={authName}
                  onChange={(e) => setAuthName(e.target.value)}
                  className={fieldClass}
                  placeholder="Ho ten"
                  required
                />
              )}

              {customerAuthMode === 'EMAIL' ? (
                <>
                  <input
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    className={fieldClass}
                    placeholder="Email"
                    type="email"
                    required
                  />
                  {(customerAuthTab === 'REGISTER' || customerAuthTab === 'LOGIN') && (
                    <input
                      value={authPassword}
                      onChange={(e) => setAuthPassword(e.target.value)}
                      className={fieldClass}
                      placeholder="Mat khau"
                      type="password"
                      required
                    />
                  )}
                  {customerAuthTab === 'REGISTER' && (
                    <input
                      value={authPhone}
                      onChange={(e) => setAuthPhone(e.target.value)}
                      className={fieldClass}
                      placeholder="So dien thoai (tuy chon)"
                    />
                  )}
                </>
              ) : (
                <>
                  <div className="flex gap-2">
                    <input
                      value={authPhone}
                      onChange={(e) => setAuthPhone(e.target.value)}
                      className={`${fieldClass} flex-1`}
                      placeholder="So dien thoai"
                      required
                    />
                    <button
                      type="button"
                      onClick={requestCustomerOtp}
                      disabled={requestingOtp}
                      className="rounded-xl border border-sky-200 px-3 py-2 text-xs disabled:opacity-60"
                    >
                      {requestingOtp ? 'Đang gửi OTP' : 'Lấy OTP'}
                    </button>
                  </div>
                  <input
                    value={authOtp}
                    onChange={(e) => setAuthOtp(e.target.value)}
                    className={fieldClass}
                    placeholder="Ma OTP"
                    required
                  />
                  {customerAuthTab === 'REGISTER' && (
                    <input
                      value={authEmail}
                      onChange={(e) => setAuthEmail(e.target.value)}
                      className={fieldClass}
                      placeholder="Email (tuy chon)"
                      type="email"
                    />
                  )}
                </>
              )}

              <button
                type="submit"
                disabled={authSubmitting}
                className="mt-2 w-full rounded-xl bg-sky-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {authSubmitting
                  ? 'Đang xử lý...'
                  : customerAuthTab === 'LOGIN'
                  ? 'Đăng nhập tài khoản'
                  : 'Tạo tài khoản'}
              </button>
            </form>
          </div>
        </div>
      )}

      {chatOpen && (
        <div className="fixed inset-x-3 bottom-24 z-40 rounded-2xl border border-sky-100 bg-white p-4 shadow-xl sm:inset-x-auto sm:right-4 sm:w-[calc(100vw-2rem)] sm:max-w-sm">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-slate-900">Chat hỗ trợ - {tableName}</p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setChatMinimized((prev) => !prev)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-sky-200 text-slate-600"
                aria-label="Thu gọn chat"
              >
                <MinusIcon className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setChatOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-sky-200 text-slate-600"
                aria-label="Đóng chat"
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            </div>
          </div>

          {!chatMinimized && (
            <>
              {chatNeedProfile ? (
                <form onSubmit={startChatSession} className="mt-3 space-y-2">
                  <input
                    value={chatCustomerName}
                    onChange={(e) => setChatCustomerName(e.target.value)}
                    className={fieldClass}
                    placeholder="Nhap ten cua ban"
                  />
                  <input
                    value={chatCustomerPhone}
                    onChange={(e) => setChatCustomerPhone(e.target.value)}
                    className={fieldClass}
                    placeholder="Nhap so dien thoai (tuy chon)"
                  />
                  <button type="submit" className="w-full rounded-xl bg-sky-700 px-3 py-2 text-sm text-white">
                    Bat dau chat
                  </button>
                </form>
              ) : (
                <>
                  {chatConnecting && <p className="mt-2 text-xs text-gray-500">Đang kết nối chat...</p>}
                  <div className="mt-3 h-64 space-y-2 overflow-y-auto rounded-xl border border-sky-100 bg-sky-50/50 p-2">
                    {messages.length === 0 && <p className="text-sm text-gray-500">Chưa có tin nhắn.</p>}
                    {messages.map((msg, idx) => (
                      <div key={`${msg.id || 'm'}-${idx}`} className="text-sm">
                        <span className="font-semibold">
                          {String(msg.senderName || '').trim().toUpperCase() === 'SYSTEM'
                            ? 'Hệ thống'
                            : msg.senderName || msg.senderType}
                          :
                        </span>{' '}
                        {String(msg.senderName || '').trim().toUpperCase() === 'SYSTEM'
                          ? formatSystemChatContent(msg.content)
                          : msg.content}
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 flex gap-2">
                    <input
                      value={chatText}
                      onChange={(e) => emitCustomerTyping(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && sendChat()}
                      className={`${fieldClass} flex-1`}
                      placeholder="Nhập tin nhắn..."
                    />
                    <button type="button" onClick={sendChat} className="rounded-xl bg-sky-700 px-3 py-2 text-sm text-white">
                      Gửi
                    </button>
                  </div>
                  {staffTyping && <p className="mt-1 text-xs text-slate-500">Nhân viên đang gõ...</p>}
                </>
              )}
            </>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={toggleChatWidget}
        className="fixed bottom-6 right-4 z-40 inline-flex h-14 w-14 items-center justify-center rounded-full bg-sky-700 text-white shadow-lg"
        aria-label="Mở chat hỗ trợ"
      >
        <ChatBubbleLeftRightIcon className="h-6 w-6" />
      </button>
    </div>
  )
}
