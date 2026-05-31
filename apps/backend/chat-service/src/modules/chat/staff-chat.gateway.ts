import { ConnectedSocket, MessageBody, OnGatewayInit, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { NotificationHubService } from './notification-hub.service';
import { SocketAuthService } from './socket-auth.service';

@WebSocketGateway({ namespace: '/staff-chat', cors: { origin: '*' } })
export class StaffChatGateway implements OnGatewayInit {
  @WebSocketServer() server: Server;

  constructor(
    private readonly hub: NotificationHubService,
    private readonly auth: SocketAuthService,
  ) {}

  afterInit(server: Server) {
    this.hub.register('/staff-chat', server);
    server.use((socket, next) => {
      const user = this.auth.verifyStaffFromSocket(socket);
      if (!user) return next(new Error('Unauthorized'));
      if (!['ADMIN', 'MANAGER', 'WAITER'].includes(user.role)) return next(new Error('Forbidden'));
      socket.data.user = user;
      next();
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

  @SubscribeMessage('join-chat')
  handleJoinChat(@ConnectedSocket() client: Socket, @MessageBody() data?: { sessionId?: string }) {
    const sessionId = String(data?.sessionId || '').trim();
    if (!sessionId) return;
    client.join(`chat:${sessionId}`);
  }
}
