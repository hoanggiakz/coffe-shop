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
    request<{ accessToken: string; user: any }>('/api/users/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  register: (data: { email: string; password: string; name: string; role?: string; phone?: string }) =>
    request<{ accessToken: string; user: any }>('/api/users/register', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  profile: () => request<any>('/api/users/profile'),
};

// ── Table Service ───────────────────────────────────────
export const tableApi = {
  list: () => request<any[]>('/api/tables'),
  getById: (id: string) => request<any>(`/api/tables/${id}`),
  create: (data: { number: number; area?: string; capacity: number }) =>
    request<any>('/api/tables', { method: 'POST', body: JSON.stringify(data) }),
  updateStatus: (id: string, status: string) =>
    request<any>(`/api/tables/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  getQr: (id: string) => request<{ qrCode: string }>(`/api/tables/${id}/qr`),
};

// ── Order Service ───────────────────────────────────────
export const menuApi = {
  list: () => request<any[]>('/api/orders/menu'),
};

export const orderApi = {
  create: (data: { tableId: string; customerName?: string; customerPhone?: string; items: any[] }) =>
    request<any>('/api/orders', { method: 'POST', body: JSON.stringify(data) }),
  list: (tableId?: string) => request<any[]>(`/api/orders${tableId ? `?tableId=${tableId}` : ''}`),
  getById: (id: string) => request<any>(`/api/orders/${id}`),
  updateStatus: (id: string, status: string) =>
    request<any>(`/api/orders/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  updateItemStatus: (orderId: string, itemId: string, status: string) =>
    request<any>(`/api/orders/${orderId}/items/${itemId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
};

// ── Chat Service ────────────────────────────────────────
export const chatApi = {
  list: (tableId?: string) => request<any[]>(`/api/chats${tableId ? `?tableId=${tableId}` : ''}`),
  create: (data: { tableId: string; customerName?: string; customerPhone?: string }) =>
    request<any>('/api/chats', { method: 'POST', body: JSON.stringify(data) }),
  sendMessage: (chatId: string, data: { senderType: string; senderName: string; content: string; senderId?: string }) =>
    request<any>(`/api/chats/${chatId}/messages`, { method: 'POST', body: JSON.stringify(data) }),
  getMessages: (chatId: string) => request<any[]>(`/api/chats/${chatId}/messages`),
};

// ── Helper: format VND ──────────────────────────────────
export function formatVND(amount: number): string {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
}
