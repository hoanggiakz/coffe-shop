import { Controller, Get } from '@nestjs/common';

@Controller('reports')
export class ReportsHealthController {
  @Get('health')
  health() {
    return {
      service: 'report-service',
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
