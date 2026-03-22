import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { CustomLogger } from '../common/logger.service';

interface OrderData {
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
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private redis: Redis;
  constructor(
    private configService: ConfigService,
    private logger: CustomLogger,
  ) {}

  async onModuleInit() {
    const redisUrl = this.configService.get<string>('REDIS_URL') ?? 'redis://localhost:6379';
    this.redis = new Redis(redisUrl);
    this.logger.log('Redis connected for KDS');
    this.logger.setContext('RedisService');
  }

  async onModuleDestroy() {
    await this.redis.quit();
  }

  async setOrder(order: OrderData): Promise<void> {
    const normalizedOrder: OrderData = {
      ...order,
      items: order.items.map((item) => ({
        ...item,
        status: item.status ?? 'pending',
      })),
    };
    const key = `order:${order.id}`;
    await this.redis.hset(key, 'data', JSON.stringify(normalizedOrder));
    await this.redis.sadd(`table:${order.tableId}:orders`, order.id);
    await this.redis.publish('kds-update', JSON.stringify({event: 'order:new', orderId: order.id, tableId: order.tableId}));
  }

  async getOrder(orderId: string): Promise<OrderData | null> {
    const key = `order:${orderId}`;
    const data = await this.redis.hget(key, 'data');
    return data ? JSON.parse(data) : null;
  }

  async getOrdersByTable(tableId: string): Promise<OrderData[]> {
    const orderIds = await this.redis.smembers(`table:${tableId}:orders`);
    const orders = [];
    for (const id of orderIds) {
      const order = await this.getOrder(id);
      if (order) orders.push(order);
    }
    return orders;
  }

  async updateItemStatus(orderId: string, itemId: string, status: string): Promise<void> {
    const order = await this.getOrder(orderId);
    if (order) {
      const item = order.items.find(i => i.id === itemId);
      if (item) {
        item.status = status as any;
        await this.setOrder(order); // Update full
        await this.redis.publish('kds-update', JSON.stringify({event: 'order:update', orderId, tableId: order.tableId}));
      }
    }
  }

  async getActiveTables(): Promise<string[]> {
    const keys = await this.redis.keys('table:*:orders');
    return keys.map(k => k.split(':')[1]);
  }
}
