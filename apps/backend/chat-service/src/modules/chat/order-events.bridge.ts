import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { KafkaService } from '../../kafka/kafka.service';
import { ChatGateway } from './chat.gateway';

@Injectable()
export class OrderEventsBridge implements OnModuleInit {
  private readonly logger = new Logger(OrderEventsBridge.name);

  constructor(
    private readonly kafkaService: KafkaService,
    private readonly chatGateway: ChatGateway,
  ) {}

  onModuleInit() {
    this.kafkaService.registerOrderCreatedHandler(async (payload) => {
      const orderId = String(payload?.id || '').trim();
      const tableId = String(payload?.tableId || '').trim();
      const totalAmount = Number(payload?.totalAmount || 0);
      const items = Array.isArray(payload?.items) ? payload.items : [];
      const itemCount = items.reduce((sum, item) => sum + Number(item?.quantity || 0), 0);

      if (!orderId || !tableId) {
        this.logger.warn('Skip OrderCreated event without orderId/tableId');
        return;
      }

      this.chatGateway.emitStaffNotificationEvent({
        id: `order-new:${orderId}`,
        type: 'ORDER_NEW',
        title: `Đơn mới từ bàn ${tableId}`,
        message: `${itemCount} món - ${totalAmount.toLocaleString('vi-VN')}đ`,
        orderId,
        tableId,
      });
    });
  }
}

