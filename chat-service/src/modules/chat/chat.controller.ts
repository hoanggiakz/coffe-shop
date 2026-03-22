import { Controller, Get, Post, Patch, Body, Param, Query } from '@nestjs/common';
import { ChatService, CreateChatDto, CreateMessageDto } from './chat.service';
import { ChatGateway, StaffNotificationInput } from './chat.gateway';

@Controller('api/chats')
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly chatGateway: ChatGateway,
  ) {}

  @Get('health')
  health() {
    return {
      service: 'chat-service',
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  // GET /api/chats?tableId=xxx – lấy lịch sử chat của bàn
  @Get()
  findChats(@Query('tableId') tableId?: string) {
    if (tableId) {
      return this.chatService.findByTableId(tableId);
    }
    return this.chatService.findOpenChats();
  }

  // POST /api/chats – tạo phiên chat mới
  @Post()
  createChat(@Body() dto: CreateChatDto) {
    return this.chatService.createChat(dto);
  }

  // POST /api/chats/staff-notifications – phát realtime notification cho staff
  @Post('staff-notifications')
  emitStaffNotification(@Body() payload: StaffNotificationInput) {
    const notification = this.chatGateway.emitStaffNotificationEvent(payload);
    return { success: true, notification };
  }

  // POST /api/chats/:id/messages – gửi tin nhắn
  @Post(':id/messages')
  async sendMessage(@Param('id') chatId: string, @Body() dto: Omit<CreateMessageDto, 'chatId'>) {
    const message = await this.chatService.createMessage({ ...dto, chatId } as CreateMessageDto);
    const chat = await this.chatService.getChatById(chatId);
    if (chat?.tableId) {
      this.chatGateway.emitMessageToTable(chat.tableId, message);
      this.chatGateway.emitStaffNotificationFromMessage(message, chat.tableId);
    }
    return message;
  }

  // PATCH /api/chats/:id/close – đóng phiên chat
  @Patch(':id/close')
  closeChat(@Param('id') chatId: string) {
    return this.chatService.closeChat(chatId);
  }

  // GET /api/chats/:id/messages – lấy tin nhắn
  @Get(':id/messages')
  getMessages(@Param('id') chatId: string) {
    return this.chatService.getMessages(chatId);
  }
}
