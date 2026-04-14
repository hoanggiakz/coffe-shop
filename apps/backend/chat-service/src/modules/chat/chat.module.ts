import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { KafkaModule } from '../../kafka/kafka.module';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';
import { ChatController } from './chat.controller';
import { OrderEventsBridge } from './order-events.bridge';

@Module({
  imports: [PrismaModule, KafkaModule],
  controllers: [ChatController],
  providers: [ChatService, ChatGateway, OrderEventsBridge],
  exports: [ChatService],
})
export class ChatModule {}
