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

@WebSocketGateway({ namespace: '/kds', cors: { origin: '*' } })
export class KdsGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  constructor(
    private readonly hub: NotificationHubService,
    private readonly auth: SocketAuthService,
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
    client.emit('sync-response', {
      orders: [],
      serverTs: new Date().toISOString(),
      isDelta: Boolean(String(data?.lastSyncAt || '').trim()),
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
}
