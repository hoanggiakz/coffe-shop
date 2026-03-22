import { Injectable, Inject } from '@nestjs/common';
import { EmailProvider } from './providers/email.provider';
import { WsPushProvider } from './providers/ws-push.provider';
import { CustomLogger } from '../../common/logger.service';
import { NotificationData } from './interfaces/channel-provider.interface';

@Injectable()
export class NotificationService {
  constructor(
    private emailProvider: EmailProvider,
    private wsPushProvider: WsPushProvider,
    @Inject('CustomLogger') private logger: CustomLogger,
  ) {}

  async sendPaymentNotification(data: any) {
    const notification: NotificationData = {
      type: 'PaymentCompleted',
      title: `Payment Confirmed - Order #${data.orderId}`,
      message: `Your payment of $${data.amount} has been successfully processed.`,
      recipient: data.userEmail || 'admin@coffeeshop.com',
      extra: data,
    };

    await Promise.allSettled([
      this.emailProvider.send(notification),
      this.wsPushProvider.send(notification),
    ]);
    this.logger.log(`Payment notification sent for order ${data.orderId}`);
  }

  async sendLowStockNotification(data: any) {
    const notification: NotificationData = {
      type: 'LowStock',
      title: 'Low Stock Alert',
      message: `Ingredient ID ${data.ingredientId} stock ${data.currentStock} below threshold ${data.threshold}`,
      recipient: 'manager@coffeeshop.com',
      extra: data,
    };

    await Promise.allSettled([
      this.emailProvider.send(notification),
      this.wsPushProvider.send(notification),
    ]);
    this.logger.log(`Low stock notification sent for ${data.ingredientId}`);
  }

  // Extensible: add new channels
  async sendViaChannel(channelType: string, notification: NotificationData) {
    const channels = [this.emailProvider, this.wsPushProvider];
    const channel = channels.find(c => c.getType() === channelType);
    if (channel) {
      await channel.send(notification);
    }
  }
}

