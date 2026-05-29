// Auth
export interface User {
  id: string
  email: string
  name: string
  role: 'ADMIN' | 'MANAGER' | 'WAITER' | 'BARISTA' | 'STAFF' | 'CUSTOMER'
  branchId?: string | null
  phone?: string | null
  employeeCode?: string | null
  avatar?: string
  avatarUrl?: string | null
}

export interface AuthResponse {
  accessToken: string
  user: User
}

// Menu
export interface Category {
  id: string
  name: string
  description?: string
  items: MenuItem[]
}

export interface MenuItem {
  id: string
  name: string
  description?: string
  price: number
  image?: string
  categoryId: string
  available: boolean
}

// Tables
export type TableStatus = 'AVAILABLE' | 'OCCUPIED' | 'RESERVED' | 'CLEANING' | 'MAINTENANCE'

export interface Table {
  id: string
  number: number
  capacity: number
  status: TableStatus
  area?: string
  branchId?: string
  qrCode?: string
}

// Orders
export type OrderStatus = 'PENDING' | 'CONFIRMED' | 'PREPARING' | 'READY' | 'SERVED' | 'COMPLETED' | 'CANCELLED'

export interface OrderItem {
  id: string
  menuItemId: string
  menuItem?: MenuItem
  quantity: number
  price: number
  notes?: string
}

export interface Order {
  id: string
  tableId: string
  table?: Table
  items: OrderItem[]
  status: OrderStatus
  total: number
  createdAt: string
  updatedAt: string
}

// Payment
export type PaymentMethod = 'CASH' | 'SEPAY'
export type PaymentStatus =
  | 'PENDING'
  | 'WAITING_TRANSFER'
  | 'WAITING_CASH'
  | 'PAID'
  | 'FAILED'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'COMPLETED'
  | 'REFUNDED'

export interface Payment {
  id: string
  orderId: string
  amount: number
  method: PaymentMethod
  status: PaymentStatus
  createdAt: string
}

// Inventory
export interface InventoryItem {
  id: string
  name: string
  quantity: number
  unit: string
  minStock: number
  price: number
  importPrice?: number
  isActive?: boolean
}

// Chat
export type SenderType = 'CUSTOMER' | 'STAFF'

export interface ChatMessage {
  id: string
  sessionId: string
  senderType: SenderType
  senderName: string
  isRead?: boolean
  content: string
  createdAt: string
}

export interface Chat {
  id: string
  branchId?: string
  tableId: string
  customerName?: string | null
  customerPhone?: string | null
  status: 'OPEN' | 'CLOSED'
  unreadCount?: number
  messages: ChatMessage[]
}

// API
export interface ApiError {
  statusCode: number
  message: string
  error?: string
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
}
