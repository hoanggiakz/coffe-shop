import { Injectable, OnModuleInit, OnModuleDestroy, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Producer } from 'kafkajs';
import { CustomLogger } from '../common/logger.service';

@Injectable()
export class KafkaService implements OnModuleInit, OnModuleDestroy {
  private kafka = new Kafka({
    clientId: 'menu-service',
    brokers: this.configService.get('KAFKA_BROKERS', '').split(','),
  });
  private producer: Producer = this.kafka.producer();

  constructor(
    private configService: ConfigService,
    @Inject('CustomLogger') private logger: CustomLogger,
  ) {}

  async onModuleInit() {
    await this.producer.connect();
    this.logger.log('Kafka producer connected');
  }

  async onModuleDestroy() {
    await this.producer.disconnect();
    this.logger.log('Kafka producer disconnected');
  }

  async menuUpdated(data: { action: 'CREATE' | 'UPDATE' | 'DELETE'; entity: string; data: any }) {
    await this.producer.send({
      topic: 'MenuUpdated',
      messages: [{ value: JSON.stringify(data) }],
    });
    this.logger.log(`Published MenuUpdated event: ${data.action} ${data.entity}`);
  }
}
