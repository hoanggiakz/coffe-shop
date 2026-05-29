import { Module } from '@nestjs/common';
import { PaymentController } from './payment.controller';
import { PaymentCompatController } from './payment-compat.controller';
import { InvoiceController } from './invoice.controller';
import { PaymentService } from './payment.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { KafkaModule } from '../../kafka/kafka.module';
import { ConfigModule } from '../../config/config.module';

@Module({
  controllers: [PaymentController, PaymentCompatController, InvoiceController],
  providers: [PaymentService],
  imports: [PrismaModule, KafkaModule, ConfigModule],
  exports: [PaymentService],
})
export class PaymentModule {}
