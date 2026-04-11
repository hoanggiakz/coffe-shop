import { Controller, Post, Body, UseGuards, HttpCode, HttpStatus, Get, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { PaymentService } from './payment.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { WebhookDto } from './dto/webhook.dto';
import { PaymentReturnDto } from './dto/return.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ConfirmCashDto } from './dto/confirm-cash.dto';

@ApiTags('Payments')
@Controller('payments')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Get('health')
  @ApiOperation({ summary: 'Health check for payment service' })
  @ApiResponse({ status: 200, description: 'Service is healthy.' })
  health() {
    return {
      service: 'payment-service',
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  @Post()
  @ApiOperation({ summary: 'Create payment (CASH or VIETQR)' })
  @ApiResponse({ status: 201, description: 'Payment created.' })
  @ApiBody({ type: CreatePaymentDto })
  @HttpCode(HttpStatus.CREATED)
  create(@Body() createPaymentDto: CreatePaymentDto) {
    return this.paymentService.create(createPaymentDto);
  }

  @Get('orders/:orderId')
  @ApiOperation({ summary: 'Get payment by orderId (for polling)' })
  @ApiResponse({ status: 200, description: 'Payment status fetched.' })
  findByOrder(
    @Param('orderId') orderId: string,
    @Query('allowMissing') allowMissing?: string,
  ) {
    return this.paymentService.findByOrderId(orderId, { allowMissing: allowMissing === 'true' });
  }

  @Get('online/qr')
  @ApiOperation({ summary: 'Get static VietQR image for online transfer' })
  @ApiResponse({ status: 200, description: 'Online QR fetched.' })
  getOnlineQr() {
    return this.paymentService.getOnlineQr();
  }

  @Get(':paymentId')
  @ApiOperation({ summary: 'Get payment by paymentId' })
  @ApiResponse({ status: 200, description: 'Payment fetched.' })
  findByPaymentId(@Param('paymentId') paymentId: string) {
    return this.paymentService.findByPaymentId(paymentId);
  }

  @Post('webhook')
  @ApiOperation({ summary: 'Handle provider webhook (public)' })
  @ApiResponse({ status: 200, description: 'Webhook processed.' })
  @ApiBody({ type: WebhookDto })
  @HttpCode(HttpStatus.OK)
  handleWebhook(@Body() webhookDto: WebhookDto) {
    return this.paymentService.handleWebhook(webhookDto);
  }

  @Post('return')
  @ApiOperation({ summary: 'Handle provider redirect/return (public)' })
  @ApiResponse({ status: 200, description: 'Return processed.' })
  @ApiBody({ type: PaymentReturnDto })
  @HttpCode(HttpStatus.OK)
  handleReturn(@Body() returnDto: PaymentReturnDto) {
    return this.paymentService.handleReturn(returnDto);
  }

  @Post(':paymentId/confirm-cash')
  @ApiOperation({ summary: 'Staff confirms cash payment collected' })
  @ApiResponse({ status: 200, description: 'Cash payment confirmed.' })
  @ApiBody({ type: ConfirmCashDto })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  confirmCash(@Param('paymentId') paymentId: string, @Body() dto: ConfirmCashDto) {
    return this.paymentService.confirmCashPayment(paymentId, dto.confirmedBy, dto.amountReceived);
  }

}
