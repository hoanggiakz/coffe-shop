import { Module } from '@nestjs/common';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { KafkaModule } from '../../kafka/kafka.module';
import { ConfigModule } from '../../config/config.module';
import { VNPayProvider } from './providers/vnpay.provider';

@Module({
  controllers: [PaymentController],
  providers: [PaymentService, VNPayProvider],
  imports: [PrismaModule, KafkaModule, ConfigModule],
  exports: [PaymentService],
})
export class PaymentModule {}
