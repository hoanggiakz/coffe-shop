import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface CreateChatDto {
  tableId: string;
  customerName?: string;
  customerPhone?: string;
}

export interface CreateMessageDto {
  chatId: string;
  senderType: 'CUSTOMER' | 'STAFF';
  senderId?: string;
  senderName: string;
  content: string;
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(private prisma: PrismaService) {}

  // Tạo phiên chat mới
  async createChat(dto: CreateChatDto) {
    const chat = await this.prisma.chat.create({
      data: {
        tableId: dto.tableId,
        customerName: dto.customerName,
        customerPhone: dto.customerPhone,
        status: 'OPEN' as any,
      },
      include: { messages: true },
    });
    this.logger.log(`Tạo chat ${chat.id} cho bàn ${dto.tableId}`);
    return chat;
  }

  // Lấy hoặc tạo phiên chat cho bàn
  async getOrCreateChat(tableId: string, customerName?: string, customerPhone?: string) {
    let chat = await this.prisma.chat.findFirst({
      where: { tableId, status: 'OPEN' as any },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });

    if (!chat) {
      chat = await this.createChat({ tableId, customerName, customerPhone });
    }

    return chat;
  }

  // Lấy chat theo bàn
  async findByTableId(tableId: string) {
    return this.prisma.chat.findMany({
      where: { tableId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Lấy danh sách chat OPEN (cho nhân viên)
  async findOpenChats() {
    return this.prisma.chat.findMany({
      where: { status: 'OPEN' as any },
      include: {
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  // Gửi tin nhắn
  async createMessage(dto: CreateMessageDto) {
    const chat = await this.prisma.chat.findUnique({ where: { id: dto.chatId } });
    if (!chat || chat.status !== ('OPEN' as any)) {
      throw new NotFoundException('Chat không tồn tại hoặc đã đóng');
    }

    const message = await this.prisma.message.create({
      data: {
        chatId: dto.chatId,
        senderType: dto.senderType as any,
        senderName: dto.senderName,
        content: dto.content,
        ...(dto.senderId ? { senderId: dto.senderId } : {}),
      } as any,
    });

    // Cập nhật updatedAt của chat
    await this.prisma.chat.update({
      where: { id: dto.chatId },
      data: { updatedAt: new Date() },
    });

    this.logger.log(`Tin nhắn ${message.id} trong chat ${dto.chatId}`);
    return message;
  }

  // Đóng phiên chat
  async closeChat(chatId: string) {
    return this.prisma.chat.update({
      where: { id: chatId },
      data: { status: 'CLOSED' as any },
    });
  }

  // Lấy tin nhắn theo chat
  async getMessages(chatId: string, limit = 50) {
    return this.prisma.message.findMany({
      where: { chatId },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
  }

  async getChatById(chatId: string) {
    return this.prisma.chat.findUnique({
      where: { id: chatId },
    });
  }
}
