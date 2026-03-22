import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CommonModule } from '../../common/common.module';
import { NotificationService } from './notification.service';
import { EmailProvider } from './providers/email.provider';
import { WsPushProvider } from './providers/ws-push.provider';

@Module({
  imports: [ConfigModule, CommonModule],
  providers: [NotificationService, EmailProvider, WsPushProvider],
  exports: [NotificationService],
})
export class NotificationModule {}

