const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const res = await fetch(`${API_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || 'Request failed');
  }
  return res.json();
}

// ── Shared response shapes (TODO: move to a shared types file) ──
interface UserProfile {
  id?: string;
  name?: string;
  email?: string;
  role?: string;
  [key: string]: unknown;
}

interface AuthResponse {
  accessToken: string;
  user: UserProfile;
}

interface TableRecord {
  id: string;
  number: number;
  capacity: number;
  area?: string;
  status: string;
  [key: string]: unknown;
}

interface OrderItemRecord {
  id: string;
  menuItemId?: string;
  quantity: number;
  price: number;
  status?: string;
  note?: string;
  [key: string]: unknown;
}

interface OrderRecord {
  id: string;
  status: string;
  customerName?: string;
  customerPhone?: string;
  tableId?: string;
  totalAmount: number;
  orderItems?: OrderItemRecord[];
  [key: string]: unknown;
}

interface ChatRecord {
  id: string;
  status: string;
  customerName?: string;
  customerPhone?: string;
  tableId?: string;
  messages?: { content?: string }[];
  [key: string]: unknown;
}

interface ChatMessageRecord {
  id?: string;
  senderType?: string;
  senderName?: string;
  content?: string;
  [key: string]: unknown;
}

interface MenuItemRecord {
  id: string;
  name: string;
  price?: number;
  [key: string]: unknown;
}

// ── User Service ────────────────────────────────────────
export const authApi = {
  login: (email: string, password: string) =>
    request<AuthResponse>('/api/users/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  register: (data: { email: string; password: string; name: string; role?: string; phone?: string }) =>
    request<AuthResponse>('/api/users/register', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  profile: () => request<UserProfile>('/api/users/profile'),
};

// ── Table Service ───────────────────────────────────────
export const tableApi = {
  list: () => request<TableRecord[]>('/api/tables'),
  getById: (id: string) => request<TableRecord>(`/api/tables/${id}`),
  create: (data: { number: number; area?: string; capacity: number }) =>
    request<TableRecord>('/api/tables', { method: 'POST', body: JSON.stringify(data) }),
  updateStatus: (id: string, status: string) =>
    request<TableRecord>(`/api/tables/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  getQr: (id: string) => request<{ qrCode: string }>(`/api/tables/${id}/qr`),
};

// ── Order Service ───────────────────────────────────────
export const menuApi = {
  list: () => request<MenuItemRecord[]>('/api/orders/menu'),
};

export const orderApi = {
  create: (data: { tableId: string; customerName?: string; customerPhone?: string; items: Record<string, unknown>[] }) =>
    request<OrderRecord>('/api/orders', { method: 'POST', body: JSON.stringify(data) }),
  list: (tableId?: string) => request<OrderRecord[]>(`/api/orders${tableId ? `?tableId=${tableId}` : ''}`),
  getById: (id: string) => request<OrderRecord>(`/api/orders/${id}`),
  updateStatus: (id: string, status: string) =>
    request<OrderRecord>(`/api/orders/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  updateItemStatus: (orderId: string, itemId: string, status: string) =>
    request<OrderItemRecord>(`/api/orders/${orderId}/items/${itemId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
};

// ── Chat Service ────────────────────────────────────────
export const chatApi = {
  list: (tableId?: string) => request<ChatRecord[]>(`/api/chats${tableId ? `?tableId=${tableId}` : ''}`),
  create: (data: { tableId: string; customerName?: string; customerPhone?: string }) =>
    request<ChatRecord>('/api/chats', { method: 'POST', body: JSON.stringify(data) }),
  sendMessage: (chatId: string, data: { senderType: string; senderName: string; content: string; senderId?: string }) =>
    request<ChatMessageRecord>(`/api/chats/${chatId}/messages`, { method: 'POST', body: JSON.stringify(data) }),
  getMessages: (chatId: string) => request<ChatMessageRecord[]>(`/api/chats/${chatId}/messages`),
};

// ── Helper: format VND ──────────────────────────────────
export function formatVND(amount: number): string {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
}
