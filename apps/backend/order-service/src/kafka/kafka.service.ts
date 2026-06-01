import { Injectable, OnModuleInit, OnModuleDestroy, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Producer } from 'kafkajs';
import { CustomLogger } from '../common/logger.service';

interface OrderEventData {
  id: string;
  tableId: string;
  status: string;
  totalAmount: number;
  items: any[];
}

interface ItemCompletedEventData {
  orderId: string;
  orderItemId: string;
  menuItemId: string;
  quantity: number;
  branchId?: string | null;
  ingredients: Array<{
    ingredientId: string;
    quantity: number;
    note?: string;
  }>;
  occurredAt: string;
}

@Injectable()
export class KafkaService implements OnModuleInit, OnModuleDestroy {
  private kafka?: Kafka;
  private producer?: Producer;
  private enabled = false;
  private readonly isProduction: boolean;
  private readonly configured: boolean;
  private lastError: string | null = null;

  constructor(
    private configService: ConfigService,
    @Inject('CustomLogger') private logger: CustomLogger,
  ) {
    this.isProduction = String(this.configService.get('NODE_ENV', 'development')).toLowerCase() === 'production';
    const brokers = this.configService
      .get<string>('KAFKA_BROKERS', '')
      .split(',')
      .map((broker) => broker.trim())
      .filter(Boolean);

    this.configured = brokers.length > 0;
    if (!brokers.length) {
      if (this.isProduction) {
        throw new Error('KAFKA_BROKERS is required in production');
      }
      this.logger.warn('KAFKA_BROKERS is empty, skip Kafka producer initialization');
      return;
    }

    this.kafka = new Kafka({
      clientId: 'order-service',
      brokers,
    });
    this.producer = this.kafka.producer();
  }

  async onModuleInit() {
    if (!this.producer) {
      return;
    }

    try {
      await this.producer.connect();
      this.enabled = true;
      this.logger.log('Kafka producer connected for order-service');
    } catch (error) {
      this.enabled = false;
      this.lastError = (error as Error).message;
      if (this.isProduction) {
        throw error;
      }
      this.logger.warn(`Kafka unavailable, continue without producer: ${(error as Error).message}`);
    }
  }

  async onModuleDestroy() {
    if (!this.producer || !this.enabled) {
      return;
    }
    await this.producer.disconnect();
    this.logger.log('Kafka producer disconnected for order-service');
  }

  async orderCreated(data: OrderEventData): Promise<boolean> {
    const published = await this.publish('OrderCreated', data);
    if (published) {
      this.logger.log(`Published OrderCreated event for order ${data.id}`);
    }
    return published;
  }

  async orderUpdated(data: OrderEventData): Promise<boolean> {
    const published = await this.publish('OrderUpdated', data);
    if (published) {
      this.logger.log(`Published OrderUpdated event for order ${data.id}`);
    }
    return published;
  }

  async itemCompleted(data: ItemCompletedEventData): Promise<boolean> {
    const published = await this.publish('ItemCompleted', data);
    if (published) {
      this.logger.log(
        `Published ItemCompleted event for order ${data.orderId}, item ${data.orderItemId}`,
      );
    }
    return published;
  }

  private async publish(topic: string, data: unknown): Promise<boolean> {
    if (!this.producer || !this.enabled) {
      return false;
    }

    try {
      await this.producer.send({
        topic,
        messages: [{ value: JSON.stringify(data) }],
      });
      return true;
    } catch (error) {
      this.logger.warn(`Kafka publish failed (${topic}): ${(error as Error).message}`);
      return false;
    }
  }

  readiness() {
    return {
      configured: this.configured,
      connected: this.enabled,
      required: this.isProduction,
      lastError: this.lastError,
    };
  }
}

