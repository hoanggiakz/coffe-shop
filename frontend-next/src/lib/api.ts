import { ChatMessage, ChatSession, Order, OrderItem, OrderItemInput, Table, User } from '@/types';

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

// ── User Service ────────────────────────────────────────
export const authApi = {
  login: (email: string, password: string) =>
    request<{ accessToken: string; user: User }>('/api/users/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  register: (data: { email: string; password: string; name: string; role?: string; phone?: string }) =>
    request<{ accessToken: string; user: User }>('/api/users/register', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  profile: () => request<User>('/api/users/profile'),
};

// ── Table Service ───────────────────────────────────────
export const tableApi = {
  list: () => request<Table[]>('/api/tables'),
  getById: (id: string) => request<Table>(`/api/tables/${id}`),
  create: (data: { number: number; area?: string; capacity: number }) =>
    request<Table>('/api/tables', { method: 'POST', body: JSON.stringify(data) }),
  updateStatus: (id: string, status: string) =>
    request<Table>(`/api/tables/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  getQr: (id: string) => request<{ qrCode: string }>(`/api/tables/${id}/qr`),
};

// ── Order Service ───────────────────────────────────────
export const menuApi = {
  list: () => request<OrderItem[]>('/api/orders/menu'),
};

export const orderApi = {
  create: (data: { tableId: string; customerName?: string; customerPhone?: string; items: OrderItemInput[] }) =>
    request<Order>('/api/orders', { method: 'POST', body: JSON.stringify(data) }),
  list: (tableId?: string) => request<Order[]>(`/api/orders${tableId ? `?tableId=${tableId}` : ''}`),
  getById: (id: string) => request<Order>(`/api/orders/${id}`),
  updateStatus: (id: string, status: string) =>
    request<Order>(`/api/orders/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  updateItemStatus: (orderId: string, itemId: string, status: string) =>
    request<Order>(`/api/orders/${orderId}/items/${itemId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
};

// ── Chat Service ────────────────────────────────────────
export const chatApi = {
  list: (tableId?: string) => request<ChatSession[]>(`/api/chats${tableId ? `?tableId=${tableId}` : ''}`),
  create: (data: { tableId: string; customerName?: string; customerPhone?: string }) =>
    request<ChatSession>('/api/chats', { method: 'POST', body: JSON.stringify(data) }),
  sendMessage: (
    chatId: string,
    data: { senderType: string; senderName: string; content: string; senderId?: string },
  ) => request<ChatMessage>(`/api/chats/${chatId}/messages`, { method: 'POST', body: JSON.stringify(data) }),
  getMessages: (chatId: string) => request<ChatMessage[]>(`/api/chats/${chatId}/messages`),
};

// ── Helper: format VND ──────────────────────────────────
export function formatVND(amount: number): string {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
}
