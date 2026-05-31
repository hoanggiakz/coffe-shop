import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { ChatGateway, StaffNotificationInput } from './chat.gateway';
import { ChatService } from './chat.service';
import { NotificationRouterService } from './notification-router.service';

@Controller()
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly chatGateway: ChatGateway,
    private readonly notificationRouter: NotificationRouterService,
  ) {}

  private actor(req: Request) {
    return {
      role: String(req.headers['x-actor-role'] || ''),
      branchId: String(req.headers['x-actor-branch-id'] || ''),
      userId: String(req.headers['x-actor-user-id'] || ''),
    };
  }

  @Get('api/chats/health')
  health() {
    return {
      service: 'chat-service',
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('api/branches/:branchId/chat/sessions')
  listBranchSessions(
    @Param('branchId') branchId: string,
    @Query('status') status?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Req() req?: Request,
  ) {
    return this.chatService.listSessions(branchId, status, Number(page), Number(limit), this.actor(req!));
  }

  @Get('api/chat/sessions/:sessionId/messages')
  getSessionMessages(
    @Param('sessionId') sessionId: string,
    @Query('page') page = '1',
    @Query('limit') limit = '50',
    @Query('before') before?: string,
    @Query('token') token?: string,
    @Req() req?: Request,
  ) {
    const customerToken = String(token || req?.headers['x-chat-token'] || '');
    return this.chatService.getMessages(sessionId, this.actor(req!), Number(page), Number(limit), before, customerToken);
  }

  @Post('api/chat/sessions/:sessionId/customer-token')
  issueCustomerChatToken(@Param('sessionId') sessionId: string) {
    return { token: this.chatService.issueCustomerSessionToken(sessionId) };
  }

  @Post('api/chat/sessions/:sessionId/close')
  async closeSession(@Param('sessionId') sessionId: string, @Req() req?: Request) {
    const result = await this.chatService.closeSession(sessionId, this.actor(req!));
    this.chatGateway.emitChatClosed(sessionId);
    return result;
  }

  @Post('api/chat/sessions/:sessionId/mark-read')
  markRead(@Param('sessionId') sessionId: string, @Req() req?: Request) {
    return this.chatService.markRead(sessionId, this.actor(req!));
  }

  // Backward compatibility for current FE/table-service
  @Get('api/chats')
  async findChats(@Query('tableId') tableId?: string, @Req() req?: Request) {
    const branchId = String(req?.headers['x-actor-branch-id'] || req?.query.branchId || '').trim();
    if (!branchId) {
      return [];
    }

    const actor = this.actor(req!);
    const hasActorRole = String(actor.role || '').trim().length > 0;
    const sessions = await this.chatService.listSessions(
      branchId,
      'OPEN',
      1,
      100,
      hasActorRole ? actor : { role: 'ADMIN', branchId, userId: 'system-internal' },
    );
    if (tableId) {
      return sessions.filter((session) => session.tableId === tableId);
    }
    return sessions;
  }

  @Post('api/chats')
  createChat(
    @Body() dto: { tableId: string; branchId?: string; customerName?: string; customerPhone?: string },
    @Req() req?: Request,
  ) {
    const branchId = String(dto.branchId || req?.headers['x-actor-branch-id'] || '').trim();
    return this.chatService.getOrCreateOpenSession({
      tableId: dto.tableId,
      branchId,
      customerName: dto.customerName,
      customerPhone: dto.customerPhone,
      startedBy: String(req?.headers['x-actor-user-id'] || ''),
    });
  }

  @Post('api/chats/staff-notifications')
  async emitStaffNotification(@Body() payload: StaffNotificationInput) {
    const notification = await this.notificationRouter.dispatch(payload);
    return { success: true, notification };
  }

  @Get('api/notifications')
  listNotifications(
    @Query('branchId') branchId?: string,
    @Query('isRead') isRead?: string,
    @Query('type') type?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Req() req?: Request,
  ) {
    return this.chatService.listNotifications(
      {
        branchId,
        isRead,
        type,
        page: Number(page),
        limit: Number(limit),
      },
      this.actor(req!),
    );
  }

  @Patch('api/notifications/:id/read')
  markNotificationRead(@Param('id') id: string, @Req() req?: Request) {
    return this.chatService.markNotificationRead(id, this.actor(req!));
  }

  @Patch('api/notifications/read-all')
  markAllNotificationsRead(@Query('branchId') branchId?: string, @Req() req?: Request) {
    return this.chatService.markAllNotificationsRead({ branchId }, this.actor(req!));
  }

  @Post('api/chats/:id/messages')
  async sendMessage(
    @Param('id') sessionId: string,
    @Body() dto: { senderType: 'CUSTOMER' | 'STAFF'; senderName: string; senderId?: string; content: string },
  ) {
    const message = await this.chatService.createMessage({ ...dto, sessionId });
    this.chatGateway.emitMessageToSession(sessionId, message);
    return message;
  }

  @Patch('api/chats/:id/close')
  async closeLegacy(@Param('id') sessionId: string, @Req() req?: Request) {
    const result = await this.chatService.closeSession(sessionId, this.actor(req!));
    this.chatGateway.emitChatClosed(sessionId);
    return result;
  }

  @Get('api/chats/:id/messages')
  getMessagesLegacy(@Param('id') sessionId: string, @Req() req?: Request) {
    const token = String(req?.query?.token || req?.headers['x-chat-token'] || '');
    return this.chatService.getMessages(sessionId, this.actor(req!), 1, 200, undefined, token);
  }
}
