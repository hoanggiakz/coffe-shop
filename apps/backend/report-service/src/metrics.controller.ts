import { Controller, Get, Header } from '@nestjs/common';
import { register } from 'prom-client';

@Controller()
export class MetricsController {
  @Get('metrics')
  @Header('Content-Type', register.contentType)
  async metrics() {
    return register.metrics();
  }
}

