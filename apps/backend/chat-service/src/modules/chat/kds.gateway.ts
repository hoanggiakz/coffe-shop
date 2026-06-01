import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { NotificationHubService } from './notification-hub.service';
import { SocketAuthService } from './socket-auth.service';
import { RedisService } from '../../redis/redis.service';
import { KdsOrderSyncService } from './kds-order-sync.service';

@WebSocketGateway({ namespace: '/kds', cors: { origin: '*' } })
export class KdsGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly eventLimitPerMinute = 30;
  private readonly eventCounters = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly hub: NotificationHubService,
    private readonly auth: SocketAuthService,
    private readonly redisService: RedisService,
    private readonly kdsOrderSyncService: KdsOrderSyncService,
  ) {}

  afterInit(server: Server) {
    this.hub.register('/kds', server);
    server.use((socket, next) => {
      const user = this.auth.verifyStaffFromSocket(socket);
      if (!user) return next(new Error('Unauthorized'));
      if (!['ADMIN', 'MANAGER', 'BARISTA'].includes(user.role)) return next(new Error('Forbidden'));
      socket.data.user = user;
      next();
    });
    server.use((socket, next) => {
      socket.use(([event], eventNext) => {
        const key = `${socket.id}:${String(event || '')}`;
        const now = Date.now();
        const current = this.eventCounters.get(key) || { count: 0, resetAt: now + 60_000 };
        if (now > current.resetAt) {
          current.count = 0;
          current.resetAt = now + 60_000;
        }
        current.count += 1;
        this.eventCounters.set(key, current);
        if (current.count > this.eventLimitPerMinute) {
          socket.emit('kds:error', { code: 'RATE_LIMIT', message: 'Qua nhieu thao tac' });
          return;
        }
        eventNext();
      });
      next();
    });
  }

  handleConnection(client: Socket) {
    client.emit('connected', { ts: new Date().toISOString() });
  }

  handleDisconnect(client: Socket) {
    const branchId = String(client.data?.branchId || '').trim();
    const stationId = String(client.data?.stationId || '').trim();
    const stationCode = String(client.data?.stationCode || '').trim() || 'ALL';
    if (!branchId || !stationId) return;
    this.server.to(`manager:${branchId}`).emit('station-offline', {
      stationId,
      stationCode,
      reason: 'disconnect',
      ts: new Date().toISOString(),
    });
  }

  @SubscribeMessage('join')
  handleJoin(@ConnectedSocket() client: Socket) {
    const user = client.data.user as { userId: string; role: string; branchId: string };
    if (!user) return;
    if (user.branchId) client.join(`branch:${user.branchId}`);
    client.join(`user:${user.userId}`);
    if (user.role === 'ADMIN' || user.role === 'MANAGER') {
      client.join('admin');
    }
  }

  @SubscribeMessage('join-kds')
  handleJoinKds(
    @ConnectedSocket() client: Socket,
    @MessageBody() data?: { branchId?: string; stationCode?: string; stationId?: string },
  ) {
    const user = client.data.user as { userId: string; role: string; branchId: string };
    if (!user) {
      client.emit('kds:error', { code: 'UNAUTHORIZED', message: 'Unauthorized' });
      return;
    }
    const requestedBranchId = String(data?.branchId || '').trim();
    const branchId = user.role === 'ADMIN' ? requestedBranchId : String(user.branchId || '').trim();
    if (!branchId) {
      client.emit('kds:error', { code: 'BRANCH_REQUIRED', message: 'Missing branchId' });
      return;
    }
    if (user.role !== 'ADMIN' && requestedBranchId && requestedBranchId !== branchId) {
      client.emit('kds:error', { code: 'FORBIDDEN', message: 'Forbidden branch access' });
      return;
    }

    const stationCode = String(data?.stationCode || 'ALL').trim().toUpperCase() || 'ALL';
    const stationId = String(data?.stationId || client.id).trim();

    client.join(`kds:${branchId}`);
    client.join(`kds:${branchId}:ALL`);
    client.join(`kds:${branchId}:${stationCode}`);
    client.join(`manager:${branchId}`);
    client.data.branchId = branchId;
    client.data.stationId = stationId;
    client.data.stationCode = stationCode;

    this.server.to(`manager:${branchId}`).emit('station-online', {
      stationId,
      stationCode,
      userId: user.userId,
      ts: new Date().toISOString(),
    });

    client.emit('sync-response', {
      orders: [],
      serverTs: new Date().toISOString(),
      isDelta: false,
    });
  }

  @SubscribeMessage('sync-request')
  handleSyncRequest(
    @ConnectedSocket() client: Socket,
    @MessageBody() data?: { lastSyncAt?: string },
  ) {
    const branchId = String(client.data?.branchId || '').trim();
    if (!branchId) {
      client.emit('kds:error', { code: 'BRANCH_REQUIRED', message: 'Missing branch context' });
      return;
    }
    this.kdsOrderSyncService
      .getActiveOrders(branchId)
      .then((orders) => {
        client.emit('sync-response', {
          orders,
          serverTs: new Date().toISOString(),
          isDelta: Boolean(String(data?.lastSyncAt || '').trim()),
        });
      })
      .catch((error: any) => {
        client.emit('kds:error', { code: 'SYNC_FAILED', message: String(error?.message || 'Sync failed') });
      });
  }

  @SubscribeMessage('heartbeat')
  handleHeartbeat(
    @ConnectedSocket() client: Socket,
    @MessageBody() data?: { stationId?: string; ts?: number },
  ) {
    client.data.lastHeartbeatAt = Date.now();
    client.emit('heartbeat-ack', {
      stationId: String(data?.stationId || client.data?.stationId || ''),
      clientTs: Number(data?.ts || 0),
      serverTs: new Date().toISOString(),
    });
  }

  @SubscribeMessage('remind-staff')
  handleRemindStaff(
    @ConnectedSocket() client: Socket,
    @MessageBody() data?: { orderId?: string; tableNumber?: number },
  ) {
    const branchId = String(client.data?.branchId || '').trim();
    if (!branchId) {
      client.emit('kds:error', { code: 'BRANCH_REQUIRED', message: 'Missing branch context' });
      return;
    }
    const orderId = String(data?.orderId || '').trim();
    const tableNumber = Number(data?.tableNumber || 0);
    if (!orderId) {
      client.emit('kds:error', { code: 'ORDER_REQUIRED', message: 'Missing orderId' });
      return;
    }
    this.server.to(`staff:${branchId}`).emit('order-remind', {
      orderId,
      tableNumber: Number.isFinite(tableNumber) && tableNumber > 0 ? tableNumber : null,
      message: tableNumber > 0 ? `Ban ${tableNumber} dang cho mon` : 'Don hang dang cho phuc vu',
      ts: new Date().toISOString(),
    });
  }

  @SubscribeMessage('start-item')
  async handleStartItem(
    @ConnectedSocket() client: Socket,
    @MessageBody() data?: { orderId?: string; itemId?: string },
  ) {
    await this.updateSingleItem(client, String(data?.orderId || ''), String(data?.itemId || ''), 'PREPARING');
  }

  @SubscribeMessage('complete-item')
  async handleCompleteItem(
    @ConnectedSocket() client: Socket,
    @MessageBody() data?: { orderId?: string; itemId?: string },
  ) {
    await this.updateSingleItem(client, String(data?.orderId || ''), String(data?.itemId || ''), 'READY');
  }

  @SubscribeMessage('start-order')
  async handleStartOrder(
    @ConnectedSocket() client: Socket,
    @MessageBody() data?: { orderId?: string },
  ) {
    await this.updateOrderItemsBatch(client, String(data?.orderId || ''), 'PREPARING');
  }

  @SubscribeMessage('complete-order')
  async handleCompleteOrder(
    @ConnectedSocket() client: Socket,
    @MessageBody() data?: { orderId?: string },
  ) {
    await this.updateOrderItemsBatch(client, String(data?.orderId || ''), 'READY');
  }

  private async updateSingleItem(
    client: Socket,
    orderId: string,
    itemId: string,
    status: 'PREPARING' | 'READY',
  ) {
    const branchId = String(client.data?.branchId || '').trim();
    const userId = String((client.data?.user as any)?.userId || '').trim();
    if (!branchId || !orderId || !itemId) {
      client.emit('kds:error', { code: 'BAD_REQUEST', message: 'Missing orderId/itemId/branch' });
      return;
    }
    const lockKey = `kds:lock:item:${itemId}`;
    const redis = this.redisService.getClient('kds-lock');
    const locked = await redis.set(lockKey, '1', 'EX', 5, 'NX');
    if (locked !== 'OK') {
      client.emit('kds:error', { code: 'LOCKED', message: 'Item is being updated' });
      return;
    }
    try {
      await this.kdsOrderSyncService.updateItemStatus(orderId, itemId, status);
      const order = await this.kdsOrderSyncService.getOrder(orderId);
      const items = this.kdsOrderSyncService.extractItems(order);
      const completedItems = items.filter((item) => item.status === 'READY' || item.status === 'DONE').length;
      const totalItems = items.length;
      const orderStatus = this.kdsOrderSyncService.resolveOrderStatus(order);

      this.server.to(`kds:${branchId}`).emit('item-updated', {
        type: 'KDS_ITEM_STATUS',
        orderId,
        itemId,
        status,
        updatedBy: userId || undefined,
        ts: new Date().toISOString(),
      });
      this.server.to(`kds:${branchId}`).emit('order-status-updated', {
        type: orderStatus === 'READY' ? 'KDS_ORDER_READY' : 'KDS_ITEM_STATUS',
        orderId,
        status: orderStatus,
        completedItems,
        totalItems,
        sound: orderStatus === 'READY' ? 'order_ready' : undefined,
      });
    } catch (error: any) {
      client.emit('kds:error', { code: 'UPDATE_FAILED', message: String(error?.message || 'Update failed') });
    } finally {
      await redis.del(lockKey);
    }
  }

  private async updateOrderItemsBatch(
    client: Socket,
    orderId: string,
    targetStatus: 'PREPARING' | 'READY',
  ) {
    const branchId = String(client.data?.branchId || '').trim();
    const userId = String((client.data?.user as any)?.userId || '').trim();
    if (!branchId || !orderId) {
      client.emit('kds:error', { code: 'BAD_REQUEST', message: 'Missing orderId/branch' });
      return;
    }
    const lockKey = `kds:lock:order:${orderId}:${targetStatus}`;
    const redis = this.redisService.getClient('kds-lock');
    const locked = await redis.set(lockKey, '1', 'EX', 5, 'NX');
    if (locked !== 'OK') {
      client.emit('kds:error', { code: 'LOCKED', message: 'Order is being updated' });
      return;
    }
    try {
      const order = await this.kdsOrderSyncService.getOrder(orderId);
      const items = this.kdsOrderSyncService.extractItems(order);
      const patchItems = items
        .filter((item) => (targetStatus === 'PREPARING' ? item.status === 'WAITING' : item.status !== 'READY' && item.status !== 'DONE'))
        .map((item) => ({ itemId: item.itemId, status: targetStatus }));
      if (patchItems.length > 0) {
        await this.kdsOrderSyncService.updateItemsBatch(orderId, patchItems);
      }
      const updatedOrder = await this.kdsOrderSyncService.getOrder(orderId);
      const updatedItems = this.kdsOrderSyncService.extractItems(updatedOrder);
      const completedItems = updatedItems.filter((item) => item.status === 'READY' || item.status === 'DONE').length;
      const totalItems = updatedItems.length;
      const orderStatus = this.kdsOrderSyncService.resolveOrderStatus(updatedOrder);
      this.server.to(`kds:${branchId}`).emit('order-status-updated', {
        type: orderStatus === 'READY' ? 'KDS_ORDER_READY' : 'KDS_ITEM_STATUS',
        orderId,
        status: orderStatus,
        completedItems,
        totalItems,
        updatedBy: userId || undefined,
        ts: new Date().toISOString(),
        sound: orderStatus === 'READY' ? 'order_ready' : undefined,
      });
    } catch (error: any) {
      client.emit('kds:error', { code: 'UPDATE_FAILED', message: String(error?.message || 'Update failed') });
    } finally {
      await redis.del(lockKey);
    }
  }
}
