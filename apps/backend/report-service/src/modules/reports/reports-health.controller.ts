import { Controller, Get } from '@nestjs/common';
import { KafkaService } from '../../kafka/kafka.service';
import { ReportsRealtimeService } from './reports-realtime.service';

@Controller('reports')
export class ReportsHealthController {
  constructor(
    private readonly kafkaService: KafkaService,
    private readonly reportsRealtimeService: ReportsRealtimeService,
  ) {}

  @Get('health')
  health() {
    return {
      service: 'report-service',
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  ready() {
    const kafka = this.kafkaService.readiness();
    const realtime = this.reportsRealtimeService.metrics();
    const ready = kafka.required ? kafka.connected : kafka.configured ? kafka.connected : true;
    return {
      service: 'report-service',
      status: ready ? 'ready' : 'not-ready',
      checks: {
        kafka,
        realtime: {
          disconnectRate: realtime.disconnectRate,
          p95LagMs: realtime.lag?.p95Ms || 0,
        },
      },
      timestamp: new Date().toISOString(),
    };
  }
}
