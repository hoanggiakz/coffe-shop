import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { KafkaModule } from '../../kafka/kafka.module';
import { OrderController } from './order.controller';
import { BranchMenuController } from './branch-menu.controller';
import { DiscountController } from './discount.controller';
import { OrderService } from './order.service';

@Module({
  imports: [PrismaModule, KafkaModule],
  controllers: [OrderController, BranchMenuController, DiscountController],
  providers: [OrderService],
  exports: [OrderService],
})
export class OrderModule {}

