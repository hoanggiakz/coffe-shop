import { Injectable } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';
import { CustomLogger } from '../../common/logger.service';

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
export class KdsService {
  private readonly logger = new CustomLogger();

  constructor(private redisService: RedisService) {}

  async handleNewOrder(orderData: OrderData): Promise<void> {
    // Set initial item status to 'pending'
    orderData.items.forEach(item => { item.status = 'pending'; });
    await this.redisService.setOrder(orderData);
    this.logger.log(`New order added to KDS: ${orderData.id}`);
  }

  async updateItemStatus(orderId: string, itemId: string, status: string): Promise<OrderData | null> {
    await this.redisService.updateItemStatus(orderId, itemId, status);
    const order = await this.redisService.getOrder(orderId);
    this.logger.log(`Item ${itemId} updated to ${status} in order ${orderId}`);
    return order;
  }

  async getOrdersForTable(tableId: string): Promise<OrderData[]> {
    return this.redisService.getOrdersByTable(tableId);
  }
}
