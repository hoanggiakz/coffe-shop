import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
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
  private readonly notificationRetentionHours = 72;
  private readonly customerChatTokenTtl = '12h';

  constructor(
    private prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  private customerChatTokenSecret() {
    return String(
      this.configService.get<string>('CHAT_CUSTOMER_TOKEN_SECRET') ||
        this.configService.get<string>('JWT_SECRET') ||
        'chat-customer-secret-dev',
    );
  }

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

  private enforceStaffChatRole(actor: ActorContext) {
    const actorRole = String(actor.role || '').toUpperCase();
    if (!['ADMIN', 'MANAGER', 'WAITER', 'STAFF'].includes(actorRole)) {
      throw new ForbiddenException('Không có quyền truy cập module chat');
    }
  }

  issueCustomerSessionToken(sessionId: string) {
    return jwt.sign(
      {
        type: 'CHAT_CUSTOMER',
        sessionId,
      },
      this.customerChatTokenSecret(),
      { expiresIn: this.customerChatTokenTtl },
    );
  }

  private canReadByCustomerToken(sessionId: string, token?: string) {
    const normalized = String(token || '').trim();
    if (!normalized) return false;
    try {
      const payload = jwt.verify(normalized, this.customerChatTokenSecret()) as any;
      return payload?.type === 'CHAT_CUSTOMER' && String(payload?.sessionId || '') === sessionId;
    } catch {
      return false;
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
    this.enforceStaffChatRole(actor);
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

  async getMessages(sessionId: string, actor: ActorContext = {}, page = 1, limit = 50, before?: string, customerToken?: string) {
    const session = await this.prisma.chatSession.findUnique({ where: { id: sessionId } });
    if (!session) {
      throw new NotFoundException('Không tìm thấy phiên chat');
    }

    const allowCustomerRead = this.canReadByCustomerToken(sessionId, customerToken);
    if (!allowCustomerRead) {
      this.enforceStaffChatRole(actor);
      this.enforceBranchAccess(actor, session.branchId);
    }

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

    this.enforceStaffChatRole(actor);
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

    this.enforceStaffChatRole(actor);
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

  private normalizeNotificationActorRole(actor: ActorContext) {
    return String(actor.role || '').trim().toUpperCase();
  }

  private resolveNotificationScope(actor: ActorContext, requestedBranchId?: string) {
    const role = this.normalizeNotificationActorRole(actor);
    const actorBranchId = String(actor.branchId || '').trim();
    const actorUserId = String(actor.userId || '').trim();
    const branchId = String(requestedBranchId || '').trim() || actorBranchId;

    if (!['ADMIN', 'MANAGER', 'WAITER', 'BARISTA', 'STAFF'].includes(role)) {
      throw new ForbiddenException('Insufficient permissions');
    }

    if (role === 'ADMIN') {
      if (!branchId) {
        throw new ForbiddenException('branchId la bat buoc voi tai khoan ADMIN');
      }
      return { role, branchId, userId: actorUserId };
    }

    if (!actorBranchId) {
      throw new ForbiddenException('Tai khoan nhan vien thieu branchId');
    }

    if (branchId && branchId !== actorBranchId) {
      throw new ForbiddenException('Khong co quyen truy cap thong bao chi nhanh khac');
    }

    return {
      role,
      branchId: actorBranchId,
      userId: actorUserId,
    };
  }

  async logStaffNotification(payload: {
    id?: string;
    type: string;
    title: string;
    message: string;
    branchId?: string;
    chatId?: string;
    tableId?: string;
    messageId?: string;
    orderId?: string;
    createdAt?: string;
  }) {
    const importantTypes = new Set(['ORDER_NEW', 'CALL_STAFF', 'LOW_STOCK', 'PAYMENT_SUCCESS']);
    const type = String(payload.type || '').trim().toUpperCase();
    const branchId = String(payload.branchId || '').trim();
    if (!importantTypes.has(type) || !branchId) {
      return;
    }

    const createdAt = payload.createdAt ? new Date(payload.createdAt) : new Date();
    const expiresAt = new Date(createdAt.getTime() + this.notificationRetentionHours * 60 * 60 * 1000);
    await this.prisma.notificationLog.create({
      data: {
        branchId,
        type,
        payload: {
          title: String(payload.title || '').trim(),
          message: String(payload.message || '').trim(),
          chatId: payload.chatId || null,
          tableId: payload.tableId || null,
          messageId: payload.messageId || null,
          orderId: payload.orderId || null,
          sourceId: payload.id || null,
        },
        targetRoles: type === 'LOW_STOCK' ? ['MANAGER'] : ['ADMIN', 'MANAGER', 'WAITER', 'BARISTA', 'STAFF'],
        userId: null,
        createdAt,
        expiresAt,
      },
    });
  }

  async listNotifications(
    query: { branchId?: string; isRead?: string; type?: string; page?: number; limit?: number },
    actor: ActorContext = {},
  ) {
    const scope = this.resolveNotificationScope(actor, query.branchId);
    const safePage = Number.isFinite(query.page) && Number(query.page) > 0 ? Math.floor(Number(query.page)) : 1;
    const safeLimit = Number.isFinite(query.limit) ? Math.min(Math.max(Math.floor(Number(query.limit)), 1), 100) : 20;
    const skip = (safePage - 1) * safeLimit;
    const normalizedType = String(query.type || '').trim().toUpperCase();
    const hasReadFilter = query.isRead === 'true' || query.isRead === 'false';
    const isRead = query.isRead === 'true';

    const where: any = {
      branchId: scope.branchId,
      ...(normalizedType && normalizedType !== 'ALL' ? { type: normalizedType } : {}),
      ...(hasReadFilter ? { isRead } : {}),
    };

    if ((scope.role === 'WAITER' || scope.role === 'BARISTA' || scope.role === 'STAFF') && scope.userId) {
      where.OR = [{ userId: scope.userId }, { userId: null }];
    }

    const [rows, total, unreadCount] = await Promise.all([
      this.prisma.notificationLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: safeLimit,
      }),
      this.prisma.notificationLog.count({ where }),
      this.prisma.notificationLog.count({
        where: {
          ...where,
          isRead: false,
        },
      }),
    ]);

    return {
      data: rows.map((row) => ({
        id: row.id,
        type: row.type,
        payload: row.payload,
        isRead: row.isRead,
        createdAt: row.createdAt,
      })),
      meta: {
        total,
        unreadCount,
        page: safePage,
        limit: safeLimit,
      },
    };
  }

  async markNotificationRead(id: string, actor: ActorContext = {}) {
    const existing = await this.prisma.notificationLog.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Khong tim thay thong bao');
    }
    const scope = this.resolveNotificationScope(actor, existing.branchId);

    if ((scope.role === 'WAITER' || scope.role === 'BARISTA' || scope.role === 'STAFF') && existing.userId && existing.userId !== scope.userId) {
      throw new ForbiddenException('Khong co quyen cap nhat thong bao nay');
    }

    await this.prisma.notificationLog.update({
      where: { id },
      data: { isRead: true },
    });
    return { success: true };
  }

  async markAllNotificationsRead(query: { branchId?: string }, actor: ActorContext = {}) {
    const scope = this.resolveNotificationScope(actor, query.branchId);
    const where: any = {
      branchId: scope.branchId,
      isRead: false,
    };

    if (scope.role === 'WAITER' || scope.role === 'BARISTA' || scope.role === 'STAFF') {
      where.OR = [{ userId: scope.userId || '__none__' }, { userId: null }];
    }

    const updated = await this.prisma.notificationLog.updateMany({
      where,
      data: { isRead: true },
    });

    return { success: true, updatedCount: updated.count };
  }

  async listNotificationsSince(branchId: string, actor: ActorContext = {}, lastReceivedAt?: string, limit = 100) {
    const scope = this.resolveNotificationScope(actor, branchId);
    const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(Math.floor(Number(limit)), 1), 200) : 100;
    const since = String(lastReceivedAt || '').trim();
    const createdAfter = since ? new Date(since) : null;
    const where: any = {
      branchId: scope.branchId,
      ...(createdAfter && !Number.isNaN(createdAfter.getTime()) ? { createdAt: { gt: createdAfter } } : {}),
    };

    if ((scope.role === 'WAITER' || scope.role === 'BARISTA' || scope.role === 'STAFF') && scope.userId) {
      where.OR = [{ userId: scope.userId }, { userId: null }];
    }

    const rows = await this.prisma.notificationLog.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      take: safeLimit,
    });

    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      payload: row.payload,
      isRead: row.isRead,
      createdAt: row.createdAt,
    }));
  }
}
