import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  WebSocketServer,
  ConnectedSocket,
  OnGatewayConnection,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { KdsService } from './kds.service';
import { RedisService } from '../../redis/redis.service';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  path: '/kds',
})
export class KdsGateway implements OnGatewayConnection {
  @WebSocketServer() server: Server;
  private logger = new Logger('KdsGateway');

  constructor(private kdsService: KdsService, private redisService: RedisService) {}

  async handleConnection(client: Socket) {
    // Optional: join room based on tableId from query or auth
    const tableId = client.handshake.query.tableId as string || 'kitchen';
    client.join(`table:${tableId}`);
    this.logger.log(`Client connected to table room: ${tableId}`);
  }

  @SubscribeMessage('updateItemStatus')
  async handleUpdateStatus(
    @MessageBody() data: { orderId: string; itemId: string; status: string },
    @ConnectedSocket() client: Socket,
  ) {
    const order = await this.kdsService.updateItemStatus(data.orderId, data.itemId, data.status);
    if (order) {
      this.server.to(`table:${order.tableId}`).emit('order:update', order);
    }
  }

  // Broadcast new orders - called from service/kafka via event emitter if needed
  // For now, kafka → service → here via pubsub or direct emit
}
