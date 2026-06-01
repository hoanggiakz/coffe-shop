import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Producer } from 'kafkajs';
import { CustomLogger } from '../common/logger.service';

interface PaymentEventData {
  paymentId: string;
  orderId: string;
  amount: number;
  status: string;
}

@Injectable()
export class KafkaService implements OnModuleInit, OnModuleDestroy {
  private kafka?: Kafka;
  private producer?: Producer;
  private enabled = false;
  private readonly isProduction: boolean;
  private readonly kafkaRequired: boolean;
  private readonly configured: boolean;
  private lastError: string | null = null;

  constructor(
    private configService: ConfigService,
    private logger: CustomLogger,
  ) {
    this.isProduction = String(this.configService.get('NODE_ENV', 'development')).toLowerCase() === 'production';
    this.kafkaRequired = String(this.configService.get('KAFKA_REQUIRED', 'false')).toLowerCase() === 'true';
    const brokers = this.configService
      .get<string>('KAFKA_BROKERS', '')
      .split(',')
      .map((broker) => broker.trim())
      .filter(Boolean);

    this.configured = brokers.length > 0;
    if (brokers.length === 0) {
      if (this.kafkaRequired) {
        throw new Error('KAFKA_BROKERS is required when KAFKA_REQUIRED=true');
      }
      this.logger.warn('KAFKA_BROKERS is empty, skip Kafka initialization');
      return;
    }

    this.kafka = new Kafka({
      clientId: 'payment-service',
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
      this.logger.log('Kafka producer connected for payment-service');
    } catch (error) {
      this.enabled = false;
      this.lastError = (error as Error).message;
      if (this.kafkaRequired) {
        throw error;
      }
      this.logger.warn(`Kafka unavailable, continue without producer: ${(error as Error).message}`);
    }
  }

  async onModuleDestroy() {
    if (!this.enabled || !this.producer) {
      return;
    }
    await this.producer.disconnect();
    this.logger.log('Kafka producer disconnected for payment-service');
  }

  async paymentCompleted(data: PaymentEventData) {
    if (!this.enabled || !this.producer) {
      return;
    }
    await this.producer.send({
      topic: 'PaymentCompleted',
      messages: [{ value: JSON.stringify(data) }],
    });
    this.logger.log(`Published PaymentCompleted event for payment ${data.paymentId}`);
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
