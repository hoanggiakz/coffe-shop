import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type OrderItemStatus = 'WAITING' | 'PREPARING' | 'READY' | 'DONE';
type OrderStatus = 'PENDING' | 'CONFIRMED' | 'PREPARING' | 'READY' | 'COMPLETED' | 'CANCELLED';

export type KdsItemPayload = {
  itemId: string;
  status: OrderItemStatus;
};

@Injectable()
export class KdsOrderSyncService {
  constructor(private readonly configService: ConfigService) {}

  private baseUrl() {
    const base = String(this.configService.get<string>('ORDER_SERVICE_URL') || 'http://localhost:3001').replace(/\/+$/, '');
    return `${base}/api/orders`;
  }

  private internalServiceToken() {
    return String(this.configService.get<string>('INTERNAL_SERVICE_TOKEN') || 'dev-internal-token').trim();
  }

  private async request(path: string, init?: RequestInit) {
    const internalToken = this.internalServiceToken();
    const response = await fetch(`${this.baseUrl()}${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        ...(internalToken ? { Authorization: `Bearer ${internalToken}` } : {}),
        'x-actor-role': 'ADMIN',
        ...(init?.headers || {}),
      },
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Order service error ${response.status}: ${text}`);
    }
    return response.json();
  }

  async getActiveOrders(branchId: string) {
    const query = new URLSearchParams({ branchId }).toString();
    const rows = await this.request(`?${query}`, { method: 'GET' });
    const list = Array.isArray(rows) ? rows : [];
    return list.filter((order: any) => ['CONFIRMED', 'PREPARING', 'READY'].includes(String(order?.status || '').toUpperCase()));
  }

  async updateItemStatus(orderId: string, itemId: string, status: 'PREPARING' | 'READY') {
    return this.request(`/${orderId}/items/${itemId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  }

  async updateItemsBatch(orderId: string, items: Array<{ itemId: string; status: 'PREPARING' | 'READY' }>) {
    return this.request(`/${orderId}/items/batch-status`, {
      method: 'PATCH',
      body: JSON.stringify({ items }),
    });
  }

  async getOrder(orderId: string) {
    return this.request(`/${orderId}`, { method: 'GET' });
  }

  resolveOrderStatus(order: any): OrderStatus {
    return String(order?.status || 'CONFIRMED').toUpperCase() as OrderStatus;
  }

  extractItems(order: any): KdsItemPayload[] {
    const items = Array.isArray(order?.orderItems) ? order.orderItems : [];
    return items.map((item: any) => ({
      itemId: String(item?.id || ''),
      status: String(item?.status || 'WAITING').toUpperCase() as OrderItemStatus,
    }));
  }
}
