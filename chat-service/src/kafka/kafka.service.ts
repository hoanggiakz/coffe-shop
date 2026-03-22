import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Producer, Consumer } from 'kafkajs';

@Injectable()
export class KafkaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaService.name);
  private connected = false;

  private kafka = new Kafka({
    clientId: 'chat-service',
    brokers: this.configService.get('KAFKA_BROKERS')?.split(',') || ['localhost:9092'],
    retry: { retries: 3 },
  });

  private producer: Producer = this.kafka.producer();
  private consumer: Consumer = this.kafka.consumer({ groupId: 'chat-group' });

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    try {
      await this.producer.connect();
      await this.consumer.connect();
      this.connected = true;
      this.logger.log('Kafka connected successfully');
    } catch (error) {
      this.logger.warn('Kafka is not available - running without Kafka. ' + error.message);
    }
  }

  async onModuleDestroy() {
    if (!this.connected) return;
    await this.producer.disconnect();
    await this.consumer.disconnect();
  }

  async send(topic: string, messages: any[]) {
    await this.producer.send({
      topic,
      messages,
    });
  }

  getConsumer() {
    return this.consumer;
  }
}
