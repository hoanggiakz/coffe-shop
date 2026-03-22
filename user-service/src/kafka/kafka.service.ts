import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Producer, EachMessagePayload } from 'kafkajs';

@Injectable()
export class KafkaService implements OnModuleInit, OnModuleDestroy {
  private kafka = new Kafka({
    clientId: 'user-service',
    brokers: this.configService.get('KAFKA_BROKERS', '').split(','),
  });
  private producer: Producer = this.kafka.producer();
  private logger = new Logger(KafkaService.name);

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    await this.producer.connect();
    this.logger.log('Kafka producer connected');
  }

  async onModuleDestroy() {
    await this.producer.disconnect();
    this.logger.log('Kafka producer disconnected');
  }

  async userCreated(data: { userId: string; email: string; role: string }) {
    await this.producer.send({
      topic: 'UserCreated',
      messages: [{ value: JSON.stringify(data) }],
    });
    this.logger.log(`Published UserCreated event for user ${data.userId}`);
  }
}
