import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface ActorContext {
  role?: string;
  branchId?: string;
  userId?: string;
}

export interface CreateSessionDto {
  tableId: string;
  branchId: string;
  customerName?: string;
  customerPhone?: string;
  startedBy?: string;
}

export interface CreateMessageDto {
  sessionId: string;
  senderType: 'CUSTOMER' | 'STAFF';
  senderId?: string;
  senderName: string;
  content: string;
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(private prisma: PrismaService) {}

  private normalizeStatus(status?: string) {
    const normalized = String(status || 'OPEN').toUpperCase();
    if (normalized === 'ALL') return undefined;
    if (normalized === 'CLOSED') return 'CLOSED';
    return 'OPEN';
  }

  private enforceBranchAccess(actor: ActorContext, branchId: string) {
    const actorRole = String(actor.role || '').toUpperCase();
    const actorBranchId = String(actor.branchId || '').trim();
    if (actorRole === 'ADMIN') return;
    if (!actorBranchId || actorBranchId !== branchId) {
      throw new ForbiddenException('Không có quyền truy cập chat của chi nhánh khác');
    }
  }

  async getOrCreateOpenSession(dto: CreateSessionDto) {
    let session = await this.prisma.chatSession.findFirst({
      where: {
        tableId: dto.tableId,
        branchId: dto.branchId,
        status: 'OPEN' as any,
      },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { startedAt: 'desc' },
    });

    if (!session) {
      session = await this.prisma.chatSession.create({
        data: {
          tableId: dto.tableId,
          branchId: dto.branchId,
          customerName: dto.customerName,
          customerPhone: dto.customerPhone,
          startedBy: dto.startedBy,
          status: 'OPEN' as any,
        } as any,
        include: {
          messages: {
            orderBy: { createdAt: 'asc' },
          },
        },
      });
      this.logger.log(`Tạo session ${session.id} cho bàn ${dto.tableId} (${dto.branchId})`);
    }

    return session;
  }

  async listSessions(branchId: string, status?: string, page = 1, limit = 20, actor: ActorContext = {}) {
    this.enforceBranchAccess(actor, branchId);
    const where = {
      branchId,
      ...(this.normalizeStatus(status) ? { status: this.normalizeStatus(status) } : {}),
    };

    const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
    const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(Math.floor(limit), 1), 100) : 20;
    const skip = (safePage - 1) * safeLimit;

    const sessions = await this.prisma.chatSession.findMany({
      where: where as any,
      orderBy: { updatedAt: 'desc' },
      skip,
      take: safeLimit,
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    const unreadBySession = await this.prisma.chatMessage.groupBy({
      by: ['sessionId'],
      where: {
        sessionId: { in: sessions.map((item) => item.id) },
        senderType: 'CUSTOMER' as any,
        isRead: false,
      } as any,
      _count: { _all: true },
    });

    const unreadMap = new Map(unreadBySession.map((item) => [item.sessionId, item._count._all]));

    return sessions.map((session) => ({
      ...session,
      unreadCount: unreadMap.get(session.id) || 0,
    }));
  }

  async getMessages(sessionId: string, actor: ActorContext = {}, page = 1, limit = 50, before?: string) {
    const session = await this.prisma.chatSession.findUnique({ where: { id: sessionId } });
    if (!session) {
      throw new NotFoundException('Không tìm thấy phiên chat');
    }

    this.enforceBranchAccess(actor, session.branchId);

    const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
    const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(Math.floor(limit), 1), 200) : 50;

    return this.prisma.chatMessage.findMany({
      where: {
        sessionId,
        ...(before ? { createdAt: { lt: new Date(before) } } : {}),
      } as any,
      orderBy: { createdAt: 'asc' },
      skip: (safePage - 1) * safeLimit,
      take: safeLimit,
    });
  }

  async createMessage(dto: CreateMessageDto) {
    const session = await this.prisma.chatSession.findUnique({ where: { id: dto.sessionId } });
    if (!session || session.status !== ('OPEN' as any)) {
      throw new NotFoundException('Phiên chat không tồn tại hoặc đã đóng');
    }

    const message = await this.prisma.chatMessage.create({
      data: {
        sessionId: dto.sessionId,
        senderType: dto.senderType as any,
        senderName: dto.senderName,
        senderId: dto.senderId,
        content: dto.content,
        isRead: dto.senderType === 'STAFF',
      } as any,
    });

    await this.prisma.chatSession.update({
      where: { id: dto.sessionId },
      data: { updatedAt: new Date() },
    });

    return message;
  }

  async markRead(sessionId: string, actor: ActorContext = {}) {
    const session = await this.prisma.chatSession.findUnique({ where: { id: sessionId } });
    if (!session) {
      throw new NotFoundException('Không tìm thấy phiên chat');
    }

    this.enforceBranchAccess(actor, session.branchId);

    const result = await this.prisma.chatMessage.updateMany({
      where: {
        sessionId,
        senderType: 'CUSTOMER' as any,
        isRead: false,
      } as any,
      data: { isRead: true },
    });

    return { updatedCount: result.count };
  }

  async closeSession(sessionId: string, actor: ActorContext = {}) {
    const session = await this.prisma.chatSession.findUnique({ where: { id: sessionId } });
    if (!session) {
      throw new NotFoundException('Không tìm thấy phiên chat');
    }

    this.enforceBranchAccess(actor, session.branchId);

    const closed = await this.prisma.chatSession.update({
      where: { id: sessionId },
      data: {
        status: 'CLOSED' as any,
        closedBy: actor.userId,
        closedAt: new Date(),
      } as any,
    });

    return { success: true, closedAt: closed.closedAt };
  }

  async getSessionById(sessionId: string) {
    return this.prisma.chatSession.findUnique({ where: { id: sessionId } });
  }
}
