import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, EachMessagePayload, Producer, Consumer } from 'kafkajs';
import { StockSource, StockType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type ItemCompletedPayload = {
  orderId?: string;
  orderItemId?: string;
  menuItemId?: string;
  quantity?: number;
  branchId?: string | null;
  ingredients?: Array<{
    ingredientId: string;
    quantity: number;
    note?: string;
  }>;
  // Backward compatibility for older demo payload.
  orderItems?: Array<{ menuItemId: string; quantity: number }>;
};

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
          try {
            const payload = JSON.parse(message.value?.toString() || '{}') as ItemCompletedPayload;
            this.logger.log(`Received ${topic}: ${JSON.stringify(payload)}`);
            await this.handleItemCompleted(payload);
          } catch (error) {
            this.logger.error(`Failed to process ${topic}: ${(error as Error).message}`);
          }
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

  async handleItemCompleted(payload: ItemCompletedPayload) {
    const ingredients = Array.isArray(payload.ingredients)
      ? payload.ingredients
          .map((item) => ({
            ingredientId: String(item.ingredientId || '').trim(),
            quantity: Number(item.quantity || 0),
            note: item.note ? String(item.note).trim() : undefined,
          }))
          .filter((item) => item.ingredientId && Number.isFinite(item.quantity) && item.quantity > 0)
      : [];

    if (!ingredients.length) {
      if (Array.isArray(payload.orderItems) && payload.orderItems.length) {
        this.logger.warn('ItemCompleted payload uses legacy shape orderItems; skipping to avoid wrong ingredient mapping');
        return;
      }
      this.logger.warn('ItemCompleted payload missing ingredients; skipping');
      return;
    }

    const branchId = String(payload.branchId || '').trim() || null;
    const referenceCode = String(payload.orderId || '').trim() || null;
    const reason = referenceCode
      ? `Xuat tu dong cho don ${referenceCode}`
      : 'Xuat tu dong khi mon hoan thanh';

    await this.prisma.$transaction(async (tx) => {
      for (const item of ingredients) {
        const ingredient = await tx.ingredient.findUnique({
          where: { id: item.ingredientId },
        });
        if (!ingredient) {
          throw new Error(`Ingredient not found: ${item.ingredientId}`);
        }

        const ingredientBranchId = String(ingredient.branchId || '').trim() || null;
        if (branchId && ingredientBranchId && branchId !== ingredientBranchId) {
          throw new Error(`Ingredient ${item.ingredientId} does not belong to branch ${branchId}`);
        }

        const beforeStock = Number(ingredient.stock || 0);
        const afterStock = beforeStock - item.quantity;
        if (afterStock < 0) {
          throw new Error(`Insufficient stock for ingredient ${item.ingredientId}`);
        }

        await tx.stockMovement.create({
          data: {
            ingredientId: ingredient.id,
            branchId: ingredientBranchId || branchId,
            type: StockType.EXPORT,
            source: StockSource.ORDER,
            quantity: item.quantity,
            unitPrice: 0,
            totalPrice: 0,
            reason,
            note: item.note || null,
            referenceCode,
            beforeStock,
            afterStock,
            createdBy: 'kafka-item-completed',
          },
        });

        await tx.ingredient.update({
          where: { id: ingredient.id },
          data: { stock: afterStock },
        });
      }
    });

    this.logger.log(
      `Processed ItemCompleted for order ${referenceCode || 'unknown'} with ${ingredients.length} ingredient exports`,
    );
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
