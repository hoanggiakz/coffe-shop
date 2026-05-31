import { ConnectedSocket, MessageBody, OnGatewayInit, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { NotificationHubService } from './notification-hub.service';

@WebSocketGateway({ namespace: '/customer', cors: { origin: '*' } })
export class CustomerGateway implements OnGatewayInit {
  @WebSocketServer() server: Server;

  constructor(private readonly hub: NotificationHubService) {}

  afterInit(server: Server) {
    this.hub.register('/customer', server);
  }

  @SubscribeMessage('join')
  handleJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() data?: { tableId?: string; orderId?: string },
  ) {
    const tableId = String(data?.tableId || client.handshake.auth?.tableId || '').trim();
    const orderId = String(data?.orderId || client.handshake.auth?.orderId || '').trim();
    if (tableId) client.join(`table:${tableId}`);
    if (orderId) client.join(`order:${orderId}`);
    client.emit('joined', {
      tableRoom: tableId ? `table:${tableId}` : null,
      orderRoom: orderId ? `order:${orderId}` : null,
    });
  }
}

