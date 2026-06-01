export type ManagerBoardColumnKey = 'PENDING' | 'WORKING' | 'COMPLETED'

export type ManagerOrderStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'PREPARING'
  | 'READY'
  | 'COMPLETED'
  | 'CANCELLED'

export interface ManagerOrderItem {
  id: string
  menuItemId: string
  menuItemName?: string | null
  quantity: number
  price: number
  note?: string | null
  status: 'WAITING' | 'PREPARING' | 'DONE' | 'READY'
}

export interface ManagerOrder {
  id: string
  tableId: string
  tableNumber?: number | null
  status: ManagerOrderStatus
  subtotalAmount?: number
  discountAmount?: number
  promotionCode?: string | null
  totalAmount: number
  createdAt: string
  orderItems: ManagerOrderItem[]
}

export interface ManagerPayment {
  paymentId: string
  orderId: string
  tableId?: string | null
  amount: number
  status: 'PENDING' | 'WAITING_TRANSFER' | 'WAITING_CASH' | 'PAID' | 'FAILED' | 'EXPIRED' | 'CANCELLED'
  provider: 'CASH' | 'SEPAY'
  paidAt?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  paidBy?: string | null
  customerName?: string | null
}

export interface ManagerTable {
  id: string
  number: number
}

export interface ManagerMenuItem {
  id: string
  name: string
  price: number
  available: boolean
}

export interface ManagerCustomCartLine {
  localId: string
  menuItemName: string
  quantity: number
  selectedOptions: {
    size?: { name?: string }
    toppings?: Array<{ name?: string }>
    note?: string
  }
}

export interface OfflineQueueEntry {
  localId: string
  createdAt: string
  tableId: string
  items: Array<{ menuItemId: string; quantity: number }>
}

export interface ManagerBoardColumn {
  key: ManagerBoardColumnKey
  title: string
  icon: string
  orders: ManagerOrder[]
  accent: string
}
