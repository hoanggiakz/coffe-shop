import { Injectable } from '@nestjs/common';
import { ChatService } from './chat.service';
import { NotificationHubService } from './notification-hub.service';

export type RoutedNotificationInput = {
  id?: string;
  type: string;
  title?: string;
  message?: string;
  branchId?: string;
  tableId?: string;
  orderId?: string;
  chatId?: string;
  messageId?: string;
  createdAt?: string;
  cart?: Record<string, any>;
  payload?: Record<string, any>;
};

@Injectable()
export class NotificationRouterService {
  constructor(
    private readonly hub: NotificationHubService,
    private readonly chatService: ChatService,
  ) {}

  async dispatch(input: RoutedNotificationInput) {
    const type = String(input.type || '').trim().toUpperCase();
    const payload = {
      id: String(input.id || '').trim() || `${type}:${Date.now()}`,
      type,
      title: String(input.title || '').trim() || this.defaultTitle(type),
      message: String(input.message || '').trim() || 'Có cập nhật mới',
      branchId: input.branchId ? String(input.branchId) : undefined,
      tableId: input.tableId ? String(input.tableId) : undefined,
      orderId: input.orderId ? String(input.orderId) : undefined,
      chatId: input.chatId ? String(input.chatId) : undefined,
      messageId: input.messageId ? String(input.messageId) : undefined,
      createdAt: input.createdAt ? new Date(input.createdAt).toISOString() : new Date().toISOString(),
      cart: input.cart && typeof input.cart === 'object' ? input.cart : undefined,
      ...(input.payload && typeof input.payload === 'object' ? input.payload : {}),
    };

    const branchRooms = payload.branchId ? [`branch:${payload.branchId}`] : [];
    const tableRooms = payload.tableId ? [`table:${payload.tableId}`] : [];

    switch (type) {
      case 'ORDER_CREATED':
      case 'ORDER_NEW':
        this.hub.emitToRooms('/kds', 'new-order', branchRooms, payload);
        this.hub.emitToRooms('/pos', 'new-order', branchRooms, payload);
        break;
      case 'CALL_WAITER':
      case 'CALL_STAFF':
        this.hub.emitToRooms('/pos', 'call-waiter', branchRooms, payload);
        break;
      case 'NEW_MESSAGE':
      case 'CHAT_MESSAGE':
      case 'CHAT_OPENED':
        this.hub.emitToRooms('/staff-chat', 'new-message', branchRooms, payload);
        this.hub.emitToRooms('/pos', 'chat-badge', branchRooms, payload);
        break;
      case 'ITEM_READY':
      case 'KDS_ORDER_READY':
      case 'KDS_ITEM_STATUS':
        this.hub.emitToRooms('/pos', 'item-ready', branchRooms, payload);
        this.hub.emitToRooms('/customer', 'item-ready', tableRooms, payload);
        break;
      case 'PAYMENT_SUCCESS':
        this.hub.emitToRooms('/pos', 'payment-done', branchRooms, payload);
        this.hub.emitToRooms('/customer', 'order-status', tableRooms, payload);
        break;
      case 'LOW_INVENTORY':
      case 'LOW_STOCK':
        this.hub.emitToRooms('/pos', 'low-inventory', branchRooms, payload);
        break;
      case 'CART_UPDATED':
        this.hub.emitToRooms('/customer', 'cart-updated', tableRooms, payload);
        this.hub.emitToRooms('/chat', 'cart-updated', tableRooms, payload);
        break;
      default:
        this.hub.emitToRooms('/pos', 'notification', branchRooms, payload);
        break;
    }

    // Legacy compatibility (/chat namespace + current FE listeners)
    if (payload.branchId) {
      this.hub.emitToRooms('/chat', 'staff-notification', [`staff:${payload.branchId}`, 'staff:global'], payload);
    } else {
      this.hub.emitToNamespace('/chat', 'staff-notification', payload);
    }

    await this.chatService.logStaffNotification(payload);
    return payload;
  }

  private defaultTitle(type: string) {
    const map: Record<string, string> = {
      ORDER_CREATED: 'Đơn mới',
      ORDER_NEW: 'Đơn mới',
      CALL_WAITER: 'Khách gọi phục vụ',
      CALL_STAFF: 'Khách gọi phục vụ',
      NEW_MESSAGE: 'Tin nhắn mới',
      CHAT_MESSAGE: 'Tin nhắn mới',
      ITEM_READY: 'Món đã sẵn sàng',
      PAYMENT_SUCCESS: 'Thanh toán thành công',
      LOW_INVENTORY: 'Cảnh báo tồn kho',
      LOW_STOCK: 'Cảnh báo tồn kho',
      CART_UPDATED: 'Giỏ hàng đã cập nhật',
    };
    return map[type] || 'Thông báo';
  }
}
