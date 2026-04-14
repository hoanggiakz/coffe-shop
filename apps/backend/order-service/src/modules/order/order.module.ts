import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { KafkaModule } from '../../kafka/kafka.module';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';

@Module({
  imports: [PrismaModule, KafkaModule],
  controllers: [OrderController],
  providers: [OrderService],
  exports: [OrderService],
})
export class OrderModule {}

