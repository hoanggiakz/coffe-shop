import { Controller, Get } from '@nestjs/common';
import { KafkaService } from '../../kafka/kafka.service';

@Controller('ingredients')
export class InventoryHealthController {
  constructor(private readonly kafkaService: KafkaService) {}

  @Get('health')
  health() {
    return {
      service: 'inventory-service',
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  ready() {
    const kafka = this.kafkaService.readiness();
    const ready = kafka.required ? kafka.connected : kafka.configured ? kafka.connected : true;
    return {
      service: 'inventory-service',
      status: ready ? 'ready' : 'not-ready',
      checks: { kafka },
      timestamp: new Date().toISOString(),
    };
  }
}
