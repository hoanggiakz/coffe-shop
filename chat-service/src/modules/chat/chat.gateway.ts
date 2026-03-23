import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  WebSocketServer,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { ChatService } from './chat.service';

export type StaffNotificationType =
  | 'ORDER_NEW'
  | 'CALL_STAFF'
  | 'CHAT_MESSAGE'
  | 'CHAT_OPENED'
  | 'KDS_ITEM_STATUS'
  | 'KDS_ORDER_READY'
  | 'LOW_STOCK';

export interface StaffNotificationPayload {
  id: string;
  type: StaffNotificationType;
  title: string;
  message: string;
  chatId?: string;
  tableId?: string;
  messageId?: string;
  orderId?: string;
  createdAt: string;
}

export type StaffNotificationInput = Omit<StaffNotificationPayload, 'id' | 'createdAt'> &
  Partial<Pick<StaffNotificationPayload, 'id' | 'createdAt'>>;

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/chat',
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private logger = new Logger('ChatGateway');

  constructor(private chatService: ChatService) {}

  handleConnection(@ConnectedSocket() client: Socket) {
    this.logger.log(`Client ${client.id} connected`);
  }

  handleDisconnect(@ConnectedSocket() client: Socket) {
    this.logger.log(`Client ${client.id} disconnected`);
  }

  @SubscribeMessage('join-staff')
  handleJoinStaff(
    @ConnectedSocket() client: Socket,
    @MessageBody() data?: { staffId?: string; staffName?: string },
  ) {
    client.join('staff:global');
    client.data.isStaff = true;
    client.data.staffId = data?.staffId;
    client.data.staffName = data?.staffName;
    client.emit('joined-staff', { room: 'staff:global' });
    this.logger.log(`Staff client ${client.id} joined staff:global`);
  }

  // Client gửi { tableId, customerName?, customerPhone?, senderType? } để join phòng
  @SubscribeMessage('join')
  async handleJoin(
    @MessageBody() data: { tableId: string; customerName?: string; customerPhone?: string; senderType?: 'CUSTOMER' | 'STAFF' },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const tableId = String(data?.tableId || '').trim();
      if (!tableId) {
        client.emit('error', { message: 'Thieu tableId de mo chat' });
        return;
      }

      const chat = await this.chatService.getOrCreateChat(
        tableId, data.customerName, data.customerPhone,
      );
      client.join(`table:${tableId}`);
      client.data.tableId = tableId;
      client.data.chatId = chat.id;
      client.emit('joined', { chatId: chat.id, messages: chat.messages ?? [] });

      const isStaffJoin = data?.senderType === 'STAFF' || client.data.isStaff === true;
      const hasMessages = Array.isArray(chat.messages) && chat.messages.length > 0;
      if (!isStaffJoin && !hasMessages) {
        this.emitStaffNotification({
          id: `chat-opened:${chat.id}`,
          type: 'CHAT_OPENED',
          title: 'Khách mở chat',
          message: `Bàn ${tableId} vừa mở phiên chat hỗ trợ`,
          chatId: chat.id,
          tableId,
          createdAt: new Date().toISOString(),
        });
      }

      this.logger.log(`Client ${client.id} joined table:${tableId} chat:${chat.id}`);
    } catch (err: unknown) {
      client.emit('error', { message: err instanceof Error ? err.message : 'Không thể join phòng' });
    }
  }

  // Client gửi tin nhắn { content, senderType, senderName, senderId? }
  @SubscribeMessage('send-message')
  async handleSendMessage(
    @MessageBody() data: {
      content: string;
      senderType: 'CUSTOMER' | 'STAFF';
      senderName: string;
      senderId?: string;
    },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const content = String(data?.content || '').trim();
      if (!content) {
        client.emit('error', { message: 'Tin nhan khong duoc rong' });
        return;
      }

      const chatId = client.data.chatId as string;
      if (!chatId) {
        client.emit('error', { message: 'Chưa join phòng chat' });
        return;
      }

      const message = await this.chatService.createMessage({
        chatId,
        senderType: data.senderType,
        senderName: data.senderName,
        senderId: data.senderId,
        content,
      });

      // Phát tin nhắn đến tất cả trong phòng
      this.emitMessageToTable(String(client.data.tableId || ''), message);
      this.emitStaffNotificationFromMessage(message, String(client.data.tableId || ''));
    } catch (err: unknown) {
      client.emit('error', { message: err instanceof Error ? err.message : 'Gửi tin nhắn thất bại' });
    }
  }

  emitMessageToTable(tableId: string, message: Record<string, unknown>) {
    const normalizedTableId = String(tableId || '').trim();
    if (!normalizedTableId) {
      return;
    }
    this.server.to(`table:${normalizedTableId}`).emit('new-message', message);
  }

  emitStaffNotificationFromMessage(message: Record<string, unknown>, tableId?: string) {
    const payload = this.buildNotificationFromMessage(message, tableId);
    if (!payload) {
      return;
    }
    this.emitStaffNotification(payload);
  }

  emitStaffNotificationEvent(input: StaffNotificationInput) {
    const normalizedPayload: StaffNotificationPayload = {
      id:
        String(input.id || '').trim() ||
        `${input.type}:${input.orderId || input.messageId || Date.now()}:${input.tableId || ''}`,
      type: input.type,
      title: String(input.title || '').trim() || 'Thông báo',
      message: String(input.message || '').trim() || 'Có cập nhật mới',
      chatId: input.chatId ? String(input.chatId) : undefined,
      tableId: input.tableId ? String(input.tableId) : undefined,
      messageId: input.messageId ? String(input.messageId) : undefined,
      orderId: input.orderId ? String(input.orderId) : undefined,
      createdAt: input.createdAt ? new Date(input.createdAt).toISOString() : new Date().toISOString(),
    };
    this.emitStaffNotification(normalizedPayload);
    return normalizedPayload;
  }

  private emitStaffNotification(payload: StaffNotificationPayload) {
    this.server.to('staff:global').emit('staff-notification', payload);
  }

  private buildNotificationFromMessage(message: Record<string, unknown>, tableId?: string): StaffNotificationPayload | null {
    const content = String(message?.content || '').trim();
    if (!content) return null;

    const chatId = message?.chatId ? String(message.chatId) : undefined;
    const messageId = message?.id ? String(message.id) : undefined;
    const createdAt = message?.createdAt ? new Date(message.createdAt).toISOString() : new Date().toISOString();
    const normalizedTableId = String(tableId || '').trim() || undefined;

    if (content.startsWith('[ORDER_NEW]')) {
      const meta = this.parseTaggedMeta(content, 'ORDER_NEW');
      const orderId = meta.orderId || undefined;
      const items = Number(meta.items || 0);
      const total = Number(meta.total || 0);
      const table = meta.tableId || normalizedTableId;
      const orderSummary =
        items > 0
          ? `${items} món - ${total.toLocaleString('vi-VN')}đ`
          : content.replace('[ORDER_NEW]', '').trim();

      return {
        id: messageId ? `order-new:${messageId}` : `order-new:${Date.now()}`,
        type: 'ORDER_NEW',
        title: table ? `Đơn mới từ bàn ${table}` : 'Đơn mới',
        message: orderSummary || 'Có đơn mới vừa được tạo',
        chatId,
        tableId: table || undefined,
        messageId,
        orderId,
        createdAt,
      };
    }

    if (content.startsWith('[CALL_STAFF]')) {
      const reason = content.replace('[CALL_STAFF]', '').trim() || 'Khách cần hỗ trợ tại bàn';
      return {
        id: messageId ? `call-staff:${messageId}` : `call-staff:${Date.now()}`,
        type: 'CALL_STAFF',
        title: normalizedTableId ? `Gọi phục vụ - Bàn ${normalizedTableId}` : 'Gọi phục vụ',
        message: reason,
        chatId,
        tableId: normalizedTableId,
        messageId,
        createdAt,
      };
    }

    if (content.startsWith('[KDS_ITEM_STATUS]')) {
      const meta = this.parseTaggedMeta(content, 'KDS_ITEM_STATUS');
      const orderId = meta.orderId || undefined;
      const table = meta.tableId || normalizedTableId;
      const itemStatus = (meta.status || '').toUpperCase();
      return {
        id: messageId ? `kds-item:${messageId}` : `kds-item:${Date.now()}`,
        type: 'KDS_ITEM_STATUS',
        title: table ? `Bếp cập nhật món - Bàn ${table}` : 'Bếp cập nhật món',
        message: itemStatus
          ? `Đơn ${orderId || ''} chuyển món sang ${itemStatus}`.trim()
          : content.replace('[KDS_ITEM_STATUS]', '').trim(),
        chatId,
        tableId: table || undefined,
        messageId,
        orderId,
        createdAt,
      };
    }

    if (content.startsWith('[KDS_ORDER_READY]')) {
      const meta = this.parseTaggedMeta(content, 'KDS_ORDER_READY');
      const orderId = meta.orderId || undefined;
      const table = meta.tableId || normalizedTableId;
      return {
        id: messageId ? `kds-ready:${messageId}` : `kds-ready:${Date.now()}`,
        type: 'KDS_ORDER_READY',
        title: table ? `Bếp hoàn thành đơn - Bàn ${table}` : 'Bếp hoàn thành đơn',
        message: orderId ? `Đơn ${orderId} đã sẵn sàng phục vụ` : 'Đơn đã sẵn sàng phục vụ',
        chatId,
        tableId: table || undefined,
        messageId,
        orderId,
        createdAt,
      };
    }

    if (String(message?.senderType || '').toUpperCase() === 'CUSTOMER') {
      return {
        id: messageId ? `chat-message:${messageId}` : `chat-message:${Date.now()}`,
        type: 'CHAT_MESSAGE',
        title: normalizedTableId ? `Tin nhắn khách - Bàn ${normalizedTableId}` : 'Tin nhắn khách',
        message: `${String(message?.senderName || 'Khách')}: ${content}`,
        chatId,
        tableId: normalizedTableId,
        messageId,
        createdAt,
      };
    }

    return null;
  }

  private parseTaggedMeta(content: string, tag: string): Record<string, string> {
    const prefix = `[${tag}]`;
    const raw = content.startsWith(prefix) ? content.slice(prefix.length).trim() : content;
    const pairs = raw.split(';').map((item) => item.trim()).filter(Boolean);
    const result: Record<string, string> = {};

    for (const pair of pairs) {
      const index = pair.indexOf('=');
      if (index <= 0) continue;
      const key = pair.slice(0, index).trim();
      const value = pair.slice(index + 1).trim();
      if (key) result[key] = value;
    }

    return result;
  }
}
