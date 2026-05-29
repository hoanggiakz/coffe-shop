import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { ChatService } from './chat.service';

export interface StaffNotificationInput {
  type: 'ORDER_NEW' | 'CALL_STAFF' | 'CHAT_MESSAGE' | 'CHAT_OPENED' | 'KDS_ITEM_STATUS' | 'KDS_ORDER_READY' | 'LOW_STOCK';
  title: string;
  message: string;
  branchId?: string;
  chatId?: string;
  tableId?: string;
  messageId?: string;
  orderId?: string;
  id?: string;
  createdAt?: string;
}

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/chat',
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger('ChatGateway');
  private readonly customerRateLimitWindowMs = 60_000;
  private readonly customerRateLimitMax = 10;
  private readonly customerRateMap = new Map<string, number[]>();

  constructor(private readonly chatService: ChatService) {}

  handleConnection(client: Socket) {
    this.logger.log(`Client ${client.id} connected`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client ${client.id} disconnected`);
  }

  @SubscribeMessage('join-staff')
  handleJoinStaff(
    @ConnectedSocket() client: Socket,
    @MessageBody() data?: { staffId?: string; staffName?: string; branchId?: string; role?: string },
  ) {
    client.join('staff:global');
    const branchId = String(data?.branchId || '').trim();
    if (branchId) {
      client.join(this.staffBranchRoom(branchId));
      client.data.branchId = branchId;
    }
    client.data.isStaff = true;
    client.data.staffId = data?.staffId;
    client.data.staffName = data?.staffName;
    client.data.role = String(data?.role || '').toUpperCase();
    client.emit('joined-staff', {
      room: 'staff:global',
      branchRoom: branchId ? this.staffBranchRoom(branchId) : null,
    });
  }

  @SubscribeMessage('join-chat')
  async handleJoinChat(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { tableId: string; branchId: string; customerName?: string; customerPhone?: string },
  ) {
    const tableId = String(data?.tableId || '').trim();
    const branchId = String(data?.branchId || '').trim();

    if (!tableId || !branchId) {
      client.emit('error', { message: 'Thiếu tableId hoặc branchId' });
      return;
    }

    const session = await this.chatService.getOrCreateOpenSession({
      tableId,
      branchId,
      customerName: data.customerName,
      customerPhone: data.customerPhone,
    });

    const room = this.chatRoom(session.id);
    client.join(room);
    client.data.sessionId = session.id;
    client.data.tableId = tableId;
    client.data.branchId = branchId;

    const messages = Array.isArray((session as any).messages) ? (session as any).messages : [];
    client.emit('chat-joined', { sessionId: session.id, messages });
    client.emit('joined', { chatId: session.id, room, messages });

    if (messages.length === 0) {
      this.server.to(this.staffBranchRoom(branchId)).emit('new-message', {
        sessionId: session.id,
        tableId,
        preview: `Bàn ${tableId} vừa mở chat`,
      });
    }
  }

  @SubscribeMessage('join')
  async handleJoinLegacy(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { tableId: string; branchId?: string; customerName?: string; customerPhone?: string; senderType?: 'CUSTOMER' | 'STAFF' },
  ) {
    const branchId = String(data?.branchId || client.data.branchId || '').trim();
    if (!branchId) {
      client.emit('error', { message: 'Thiếu branchId' });
      return;
    }

    await this.handleJoinChat(client, {
      tableId: data.tableId,
      branchId,
      customerName: data.customerName,
      customerPhone: data.customerPhone,
    });
  }

  @SubscribeMessage('join-chat-room')
  async handleJoinChatRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessionId: string },
  ) {
    const sessionId = String(data?.sessionId || '').trim();
    if (!sessionId) {
      client.emit('error', { message: 'Thiếu sessionId' });
      return;
    }

    const session = await this.chatService.getSessionById(sessionId);
    if (!session) {
      client.emit('error', { message: 'Không tìm thấy phiên chat' });
      return;
    }

    if (client.data.isStaff) {
      const role = String(client.data.role || '').toUpperCase();
      if (role !== 'ADMIN' && String(client.data.branchId || '').trim() !== session.branchId) {
        client.emit('error', { message: 'Không có quyền truy cập chat của chi nhánh khác' });
        return;
      }
    }

    client.join(this.chatRoom(session.id));
    client.data.sessionId = session.id;
    client.data.tableId = session.tableId;
    client.data.branchId = session.branchId;
  }

  @SubscribeMessage('send-message')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessionId?: string; content: string; senderType: 'CUSTOMER' | 'STAFF'; senderName: string; senderId?: string },
  ) {
    const sessionId = String(data?.sessionId || client.data.sessionId || '').trim();
    const content = String(data?.content || '').trim();
    if (!sessionId || !content) {
      client.emit('error', { message: 'Thiếu sessionId hoặc nội dung' });
      return;
    }

    if (String(data.senderType).toUpperCase() === 'CUSTOMER' && !this.allowCustomerMessage(sessionId)) {
      client.emit('error', { message: 'Bạn đã gửi quá nhanh, vui lòng thử lại sau' });
      return;
    }

    const session = await this.chatService.getSessionById(sessionId);
    if (!session) {
      client.emit('error', { message: 'Không tìm thấy phiên chat' });
      return;
    }

    if (String(data.senderType).toUpperCase() === 'STAFF') {
      if (!client.data.isStaff) {
        client.emit('error', { message: 'Thiếu xác thực nhân viên' });
        return;
      }
      const role = String(client.data.role || '').toUpperCase();
      if (role !== 'ADMIN' && String(client.data.branchId || '').trim() !== session.branchId) {
        client.emit('error', { message: 'Không có quyền gửi tin cho chat khác chi nhánh' });
        return;
      }
    }

    const message = await this.chatService.createMessage({
      sessionId,
      senderType: data.senderType,
      senderName: data.senderName,
      senderId: data.senderId,
      content,
    });

    this.server.to(this.chatRoom(session.id)).emit('message-received', { message });
    this.server.to(this.chatRoom(session.id)).emit('new-message', message);
    client.emit('message-sent', { messageId: message.id, sessionId: session.id });

    if (String(data.senderType).toUpperCase() === 'CUSTOMER') {
      this.server.to(this.staffBranchRoom(session.branchId)).emit('new-message', {
        sessionId: session.id,
        tableId: session.tableId,
        preview: content.slice(0, 120),
      });
    }
  }

  @SubscribeMessage('typing')
  async handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: { sessionId?: string; senderType: 'CUSTOMER' | 'STAFF'; senderName?: string; isTyping: boolean },
  ) {
    const sessionId = String(data?.sessionId || client.data.sessionId || '').trim();
    if (!sessionId) return;
    const room = this.chatRoom(sessionId);
    client.to(room).emit('chat-typing', {
      sessionId,
      senderType: data.senderType,
      senderName: String(data.senderName || '').trim(),
      isTyping: Boolean(data.isTyping),
    });
  }

  @SubscribeMessage('close-chat')
  async handleCloseChat(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessionId: string },
  ) {
    const sessionId = String(data?.sessionId || '').trim();
    if (!sessionId) {
      client.emit('error', { message: 'Thiếu sessionId' });
      return;
    }

    const session = await this.chatService.getSessionById(sessionId);
    if (!session) {
      client.emit('error', { message: 'Không tìm thấy phiên chat' });
      return;
    }

    if (!client.data.isStaff) {
      client.emit('error', { message: 'Thiếu xác thực nhân viên' });
      return;
    }

    const role = String(client.data.role || '').toUpperCase();
    if (role !== 'ADMIN' && String(client.data.branchId || '').trim() !== session.branchId) {
      client.emit('error', { message: 'Không có quyền đóng chat của chi nhánh khác' });
      return;
    }

    await this.chatService.closeSession(sessionId, {
      role: role || undefined,
      branchId: String(client.data.branchId || ''),
      userId: String(client.data.staffId || ''),
    });
    this.emitChatClosed(sessionId);
  }

  emitStaffNotificationEvent(input: StaffNotificationInput) {
    const payload = {
      id: String(input.id || '').trim() || `${input.type}:${Date.now()}`,
      type: input.type,
      title: String(input.title || '').trim() || 'Thông báo',
      message: String(input.message || '').trim() || 'Có cập nhật mới',
      branchId: input.branchId ? String(input.branchId) : undefined,
      chatId: input.chatId ? String(input.chatId) : undefined,
      tableId: input.tableId ? String(input.tableId) : undefined,
      messageId: input.messageId ? String(input.messageId) : undefined,
      orderId: input.orderId ? String(input.orderId) : undefined,
      createdAt: input.createdAt ? new Date(input.createdAt).toISOString() : new Date().toISOString(),
    };

    if (payload.branchId) {
      this.server.to(this.staffBranchRoom(payload.branchId)).emit('staff-notification', payload);
    } else {
      this.server.to('staff:global').emit('staff-notification', payload);
    }

    return payload;
  }

  emitMessageToSession(sessionId: string, message: any) {
    this.server.to(this.chatRoom(sessionId)).emit('message-received', { message });
    this.server.to(this.chatRoom(sessionId)).emit('new-message', message);
  }

  emitChatClosed(sessionId: string) {
    this.server.to(this.chatRoom(sessionId)).emit('chat-closed', { sessionId });
  }

  private chatRoom(sessionId: string) {
    return `chat:${sessionId}`;
  }

  private staffBranchRoom(branchId: string) {
    return `staff:${branchId}`;
  }

  private allowCustomerMessage(sessionId: string) {
    const now = Date.now();
    const marks = this.customerRateMap.get(sessionId) || [];
    const fresh = marks.filter((item) => now - item <= this.customerRateLimitWindowMs);
    if (fresh.length >= this.customerRateLimitMax) {
      this.customerRateMap.set(sessionId, fresh);
      return false;
    }
    fresh.push(now);
    this.customerRateMap.set(sessionId, fresh);
    return true;
  }
}
