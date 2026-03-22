import { Injectable, OnModuleInit, OnModuleDestroy, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Consumer } from 'kafkajs';
import { CustomLogger } from '../common/logger.service';
import { KdsService } from '../modules/kds/kds.service'; // Forward ref

interface OrderEventData {
  id: string;
  tableId: string;
  status: string;
  totalAmount: number;
  items: Array<{
    id: string;
    name: string;
    quantity: number;
    notes?: string;
    status?: 'pending' | 'preparing' | 'ready' | 'done';
  }>;
}

@Injectable()
export class KafkaService implements OnModuleInit, OnModuleDestroy {
  private kafka = new Kafka({
    clientId: 'kds-service',
    brokers: this.configService.get('KAFKA_BROKERS', '').split(','),
  });
  private consumer: Consumer = this.kafka.consumer({ groupId: 'kds-group' });

constructor(
    private configService: ConfigService,
    private logger: CustomLogger,
    private kdsService: KdsService,
  ) {}

  async onModuleInit() {
    await this.consumer.connect();
    await this.consumer.subscribe({ topic: 'OrderCreated', fromBeginning: false });
    await this.consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        const data: OrderEventData = JSON.parse(message.value.toString());
        await this.kdsService.handleNewOrder(data);
        this.logger.log(`Consumed OrderCreated: ${data.id} from table ${data.tableId}`);
      },
    });
    this.logger.log('KDS Kafka consumer connected and subscribed to OrderCreated');
  }

  async onModuleDestroy() {
    await this.consumer.disconnect();
    this.logger.log('KDS Kafka consumer disconnected');
  }
}
