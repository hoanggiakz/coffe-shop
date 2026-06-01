import { Injectable, OnModuleInit, OnModuleDestroy, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Consumer } from 'kafkajs';
import { PrismaService } from '../prisma/prisma.service';
import { CustomLogger } from '../common/logger.service';

interface OrderCreatedData {
  id: string;
  tableId: string;
  status: string;
  totalAmount: number;
  items: Array<{
    id: string;
    menuItemId: string;
    quantity: number;
    price: number;
    note?: string;
  }>;
}

interface PaymentCompletedData {
  paymentId: string;
  orderId: string;
  amount: number;
  status: string;
}

@Injectable()
export class KafkaService implements OnModuleInit, OnModuleDestroy {
  private kafka: Kafka | null = null;
  private consumer: Consumer | null = null;
  private enabled = false;
  private readonly isProduction: boolean;
  private readonly kafkaRequired: boolean;
  private configured = false;
  private lastError: string | null = null;

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
    @Inject('CustomLogger') private logger: CustomLogger,
  ) {
    this.isProduction = String(this.configService.get('NODE_ENV', 'development')).toLowerCase() === 'production';
    this.kafkaRequired = String(this.configService.get('KAFKA_REQUIRED', 'false')).toLowerCase() === 'true';
  }

  async onModuleInit() {
    const brokers = this.configService
      .get('KAFKA_BROKERS', '')
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
    this.configured = brokers.length > 0;

    if (!brokers.length) {
      if (this.kafkaRequired) {
        throw new Error('KAFKA_BROKERS is required when KAFKA_REQUIRED=true');
      }
      this.logger.log('Kafka consumer disabled (KAFKA_BROKERS is empty)');
      return;
    }

    this.kafka = new Kafka({
      clientId: 'report-service',
      brokers,
    });
    this.consumer = this.kafka.consumer({ groupId: 'report-group' });

    try {
      await this.consumer.connect();
      await this.consumer.subscribe({ topics: ['OrderCreated', 'PaymentCompleted'], fromBeginning: false });

      await this.consumer.run({
        eachMessage: async ({ topic, message }) => {
          const data = JSON.parse(message.value.toString());
          if (topic === 'PaymentCompleted' && data.status === 'PAID') {
            await this.handlePaymentCompleted(data as PaymentCompletedData);
          }
          if (topic === 'OrderCreated') {
            // Reserved for pending-order analytics if needed in future.
          }
        },
      });
      this.enabled = true;
      this.logger.log('Kafka consumer connected and subscribed to OrderCreated, PaymentCompleted');
    } catch (error) {
      this.enabled = false;
      this.lastError = (error as Error).message;
      if (this.kafkaRequired) {
        throw error;
      }
      this.logger.warn(`Kafka consumer init failed: ${(error as Error).message}`);
    }
  }

  async onModuleDestroy() {
    if (!this.enabled || !this.consumer) {
      return;
    }

    await this.consumer.disconnect();
    this.logger.log('Kafka consumer disconnected');
  }

  private async handlePaymentCompleted(data: PaymentCompletedData) {
    const date = new Date(data.paymentId.split('_')[0] || Date.now()).toISOString().split('T')[0]; // Assume paymentId has date or use now
    const dateObj = new Date(date + 'T00:00:00Z');

    // To get order items, we'd need OrderCreated event or query order-service DB. For now, aggregate revenue only from payment
    // Full impl needs OrderCreated correlation or join payments to orders
    await this.prisma.$transaction(async (tx) => {
      await tx.dailyRevenue.upsert({
        where: { date: dateObj },
        update: {
          revenue: { increment: data.amount },
          orderCount: { increment: 1 },
        },
        create: {
          date: dateObj,
          revenue: data.amount,
          orderCount: 1,
        },
      });

      // Item sales would require order items data - for demo, skip or assume avg items
      // In full impl: store pending from OrderCreated, confirm on payment
    });

    this.logger.log(`Aggregated payment ${data.paymentId} for $${data.amount} on ${date}`);
  }

  readiness() {
    return {
      configured: this.configured,
      connected: this.enabled,
      required: this.kafkaRequired,
      lastError: this.lastError,
    };
  }
}

