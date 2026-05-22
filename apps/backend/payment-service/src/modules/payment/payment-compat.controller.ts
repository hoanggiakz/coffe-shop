import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Version, VERSION_NEUTRAL } from '@nestjs/common';
import type { Request } from 'express';
import { PaymentService } from './payment.service';

@Controller('payment')
export class PaymentCompatController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post('webhook/sepay')
  @Version(VERSION_NEUTRAL)
  @HttpCode(HttpStatus.OK)
  handleSepayWebhookCompat(@Req() req: Request, @Body() payload: Record<string, any>) {
    return this.paymentService.handleWebhook(payload, req.headers as Record<string, string | string[] | undefined>);
  }

  @Get('webhook/sepay')
  @Version(VERSION_NEUTRAL)
  @HttpCode(HttpStatus.OK)
  sepayWebhookProbeCompat() {
    return {
      success: true,
      message: 'SePay webhook compatibility endpoint is reachable. Use POST for IPN payload.',
      method: 'POST',
    };
  }
}
