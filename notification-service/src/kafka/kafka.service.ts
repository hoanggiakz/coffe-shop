import { Injectable, OnModuleInit, OnModuleDestroy, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Consumer } from 'kafkajs';
import { NotificationService } from '../modules/notification/notification.service';
import { CustomLogger } from '../common/logger.service';

interface PaymentCompletedData {
  paymentId: string;
  orderId: string;
  amount: number;
  status: string;
  userEmail?: string;
}

interface LowStockData {
  ingredientId: string;
  currentStock: number;
  threshold: number;
}

@Injectable()
export class KafkaService implements OnModuleInit, OnModuleDestroy {
  private kafka = new Kafka({
    clientId: 'notification-service',
    brokers: this.configService.get('KAFKA_BROKERS', '').split(','),
  });
  private consumer: Consumer = this.kafka.consumer({ groupId: 'notification-group' });

  constructor(
    private configService: ConfigService,
    private notificationService: NotificationService,
    @Inject('CustomLogger') private logger: CustomLogger,
  ) {}

  async onModuleInit() {
    await this.consumer.connect();
    await this.consumer.subscribe({ topics: ['PaymentCompleted', 'LowStock'], fromBeginning: false });
    
    await this.consumer.run({
      eachMessage: async ({ topic, message }) => {
        try {
          const data = JSON.parse(message.value.toString());
          if (topic === 'PaymentCompleted') {
            await this.notificationService.sendPaymentNotification(data as PaymentCompletedData);
          } else if (topic === 'LowStock') {
            await this.notificationService.sendLowStockNotification(data as LowStockData);
          }
        } catch (error) {
          this.logger.error(`Kafka message processing error: ${error}`);
        }
      },
    });
    this.logger.log('Kafka consumer ready for PaymentCompleted, LowStock');
  }

  async onModuleDestroy() {
    await this.consumer.disconnect();
  }
}

