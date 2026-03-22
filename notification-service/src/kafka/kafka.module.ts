import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CommonModule } from '../common/common.module';
import { KafkaService } from './kafka.service';
import { NotificationModule } from '../modules/notification/notification.module';

@Module({
  imports: [ConfigModule, CommonModule, NotificationModule],
  providers: [KafkaService],
  exports: [KafkaService],
})
export class KafkaModule {}

