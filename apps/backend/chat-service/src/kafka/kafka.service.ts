import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Producer, Consumer } from 'kafkajs';

type OrderCreatedHandler = (payload: Record<string, any>) => Promise<void> | void;

@Injectable()
export class KafkaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaService.name);
  private connected = false;
  private orderCreatedHandlers: OrderCreatedHandler[] = [];
  private kafka?: Kafka;
  private producer?: Producer;
  private consumer?: Consumer;
  private readonly configured: boolean;
  private lastError: string | null = null;
  private readonly isProduction: boolean;
  private readonly kafkaRequired: boolean;

  constructor(private configService: ConfigService) {
    this.isProduction = String(this.configService.get('NODE_ENV', 'development')).toLowerCase() === 'production';
    this.kafkaRequired = String(this.configService.get('KAFKA_REQUIRED', 'false')).toLowerCase() === 'true';
    const brokers = this.configService
      .get<string>('KAFKA_BROKERS', '')
      .split(',')
      .map((broker) => broker.trim())
      .filter(Boolean);

    this.configured = brokers.length > 0;
    if (!brokers.length) {
      if (this.kafkaRequired) {
        throw new Error('KAFKA_BROKERS is required when KAFKA_REQUIRED=true');
      }
      this.logger.warn('KAFKA_BROKERS is empty, skip Kafka initialization');
      return;
    }

    this.kafka = new Kafka({
      clientId: 'chat-service',
      brokers,
      retry: { retries: 3 },
    });
    this.producer = this.kafka.producer();
    this.consumer = this.kafka.consumer({ groupId: 'chat-group' });
  }

  async onModuleInit() {
    if (!this.producer || !this.consumer) {
      return;
    }

    try {
      await this.producer.connect();
      await this.consumer.connect();
      await this.consumer.subscribe({ topic: 'OrderCreated', fromBeginning: false });
      await this.consumer.run({
        eachMessage: async ({ topic, message }) => {
          if (topic !== 'OrderCreated') {
            return;
          }

          const raw = message.value?.toString() || '{}';
          let payload: Record<string, any> = {};
          try {
            payload = JSON.parse(raw) as Record<string, any>;
          } catch {
            this.logger.warn(`Skip invalid OrderCreated payload: ${raw}`);
            return;
          }

          for (const handler of this.orderCreatedHandlers) {
            await handler(payload);
          }
        },
      });
      this.connected = true;
      this.logger.log('Kafka connected successfully');
    } catch (error) {
      this.lastError = (error as Error).message;
      if (this.kafkaRequired) {
        throw error;
      }
      this.logger.warn('Kafka is not available - running without Kafka. ' + error.message);
    }
  }

  async onModuleDestroy() {
    if (!this.connected || !this.producer || !this.consumer) return;
    await this.producer.disconnect();
    await this.consumer.disconnect();
  }

  async send(topic: string, messages: any[]) {
    if (!this.connected || !this.producer) {
      return;
    }
    await this.producer.send({
      topic,
      messages,
    });
  }

  getConsumer() {
    return this.consumer;
  }

  registerOrderCreatedHandler(handler: OrderCreatedHandler) {
    this.orderCreatedHandlers.push(handler);
  }

  readiness() {
    return {
      configured: this.configured,
      connected: this.connected,
      required: this.kafkaRequired,
      lastError: this.lastError,
    };
  }
}
