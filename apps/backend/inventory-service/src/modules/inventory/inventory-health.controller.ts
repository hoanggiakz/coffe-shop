import { Controller, Get } from '@nestjs/common';

@Controller('ingredients')
export class InventoryHealthController {
  @Get('health')
  health() {
    return {
      service: 'inventory-service',
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
