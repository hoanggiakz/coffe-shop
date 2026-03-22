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

@Injectable()
export class KafkaService implements OnModuleInit, OnModuleDestroy {
  private kafka = new Kafka({
    clientId: 'order-service',
    brokers: this.configService.get('KAFKA_BROKERS', '').split(','),
  });
  private producer: Producer = this.kafka.producer();

  constructor(
    private configService: ConfigService,
    @Inject('CustomLogger') private logger: CustomLogger,
  ) {}

  async onModuleInit() {
    await this.producer.connect();
    this.logger.log('Kafka producer connected for order-service');
  }

  async onModuleDestroy() {
    await this.producer.disconnect();
    this.logger.log('Kafka producer disconnected for order-service');
  }

  async orderCreated(data: OrderEventData) {
    await this.producer.send({
      topic: 'OrderCreated',
      messages: [{ value: JSON.stringify(data) }],
    });
    this.logger.log(`Published OrderCreated event for order ${data.id}`);
  }

  async orderUpdated(data: OrderEventData) {
    await this.producer.send({
      topic: 'OrderUpdated',
      messages: [{ value: JSON.stringify(data) }],
    });
    this.logger.log(`Published OrderUpdated event for order ${data.id}`);
  }
}

