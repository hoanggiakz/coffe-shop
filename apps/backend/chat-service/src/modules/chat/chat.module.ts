import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { KafkaModule } from '../../kafka/kafka.module';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';
import { ChatController } from './chat.controller';
import { OrderEventsBridge } from './order-events.bridge';
import { NotificationHubService } from './notification-hub.service';
import { SocketAuthService } from './socket-auth.service';
import { NotificationRouterService } from './notification-router.service';
import { PosGateway } from './pos.gateway';
import { KdsGateway } from './kds.gateway';
import { StaffChatGateway } from './staff-chat.gateway';
import { CustomerGateway } from './customer.gateway';
import { KdsOrderSyncService } from './kds-order-sync.service';

@Module({
  imports: [PrismaModule, KafkaModule],
  controllers: [ChatController],
  providers: [
    ChatService,
    NotificationHubService,
    SocketAuthService,
    NotificationRouterService,
    KdsOrderSyncService,
    ChatGateway,
    PosGateway,
    KdsGateway,
    StaffChatGateway,
    CustomerGateway,
    OrderEventsBridge,
  ],
  exports: [ChatService],
})
export class ChatModule {}
