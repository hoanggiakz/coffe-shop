import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, EachMessagePayload, Producer, Consumer } from 'kafkajs';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class KafkaService implements OnModuleInit, OnModuleDestroy {
  private kafka?: Kafka;
  private producer?: Producer;
  private consumer?: Consumer;
  private enabled = false;
  private logger = new Logger(KafkaService.name);

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    const brokers = this.configService
      .get<string>('KAFKA_BROKERS', '')
      .split(',')
      .map((broker) => broker.trim())
      .filter(Boolean);

    if (brokers.length === 0) {
      this.logger.warn('KAFKA_BROKERS is empty, skip Kafka initialization');
      return;
    }

    this.kafka = new Kafka({
      clientId: 'inventory-service',
      brokers,
    });
    this.producer = this.kafka.producer();
    this.consumer = this.kafka.consumer({ groupId: 'inventory-group' });
  }

  async onModuleInit() {
    if (!this.producer || !this.consumer) {
      return;
    }

    try {
      await this.producer.connect();
      await this.consumer.connect();
      await this.consumer.subscribe({ topic: 'ItemCompleted', fromBeginning: false });
      await this.consumer.run({
        eachMessage: async ({ topic, message }: EachMessagePayload) => {
          const payload = JSON.parse(message.value?.toString() || '{}');
          this.logger.log(`Received ${topic}: ${JSON.stringify(payload)}`);
          await this.handleItemCompleted(payload);
        },
      });
      this.enabled = true;
      this.logger.log('Kafka connected for inventory-service');
    } catch (error) {
      this.enabled = false;
      this.logger.warn(`Kafka unavailable, continue without consumer: ${(error as Error).message}`);
    }
  }

  async onModuleDestroy() {
    if (!this.enabled || !this.producer || !this.consumer) {
      return;
    }
    await this.producer.disconnect();
    await this.consumer.disconnect();
  }

  async handleItemCompleted(payload: { orderItems: { menuItemId: string; quantity: number }[] }) {
    const tx = await this.prisma.$transaction(async (prisma) => {
      for (const item of payload.orderItems) {
        // Map menuItemId to Ingredient - simplified; in real impl, use menu-service API or joint model
        // For demo, assume menuItemId maps directly to ingredientId (adjust as needed)
        await prisma.stockMovement.create({
          data: {
            ingredientId: item.menuItemId, // TODO: Resolve actual ingredient
            type: 'EXPORT',
            quantity: item.quantity,
          },
        });

        await prisma.ingredient.update({
          where: { id: item.menuItemId },
          data: { stock: { decrement: item.quantity } },
        });
      }
    });
    this.logger.log(`Processed stock deduction for ${payload.orderItems.length} items`);
  }

  async sendEvent(topic: string, payload: any) {
    if (!this.enabled || !this.producer) {
      return;
    }
    await this.producer.send({
      topic,
      messages: [{ value: JSON.stringify(payload) }],
    });
  }
}
