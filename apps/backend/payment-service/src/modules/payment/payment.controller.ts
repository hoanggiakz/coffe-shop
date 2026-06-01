import { Controller, Post, Body, UseGuards, HttpCode, HttpStatus, Get, Param, Query, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { PaymentService } from './payment.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { PaymentReturnDto } from './dto/return.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ConfirmCashDto } from './dto/confirm-cash.dto';
import { VerifyPaymentDto } from './dto/verify-payment.dto';
import type { Request } from 'express';
import { KafkaService } from '../../kafka/kafka.service';

@ApiTags('Payments')
@Controller('payments')
export class PaymentController {
  constructor(
    private readonly paymentService: PaymentService,
    private readonly kafkaService: KafkaService,
  ) {}

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
  @ApiOperation({ summary: 'Create payment (CASH, SEPAY)' })
  @ApiResponse({ status: 201, description: 'Payment created.' })
  @ApiBody({ type: CreatePaymentDto })
  @HttpCode(HttpStatus.CREATED)
  create(@Body() createPaymentDto: CreatePaymentDto) {
    return this.paymentService.create(createPaymentDto);
  }

  @Get()
  @ApiOperation({ summary: 'List recent payments (staff/admin)' })
  @ApiResponse({ status: 200, description: 'Recent payments fetched.' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  findRecent(
    @Query('limit') limit?: string,
    @Query('provider') provider?: string,
    @Query('status') status?: string,
    @Query('reconcileOnline') reconcileOnline?: string,
  ) {
    return this.paymentService.listRecentPayments({
      limit,
      provider,
      status,
      reconcileOnline: reconcileOnline === 'true',
    });
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
  @ApiOperation({ summary: 'Get VietQR image for online transfer (supports amount, transferContent)' })
  @ApiResponse({ status: 200, description: 'Online QR fetched.' })
  getOnlineQr(
    @Query('amount') amount?: string,
    @Query('transferContent') transferContent?: string,
  ) {
    const parsedAmount = Number(amount);
    return this.paymentService.getOnlineQr({
      amount: Number.isFinite(parsedAmount) ? parsedAmount : undefined,
      transferContent,
    });
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness check for payment service dependencies' })
  @ApiResponse({ status: 200, description: 'Readiness payload.' })
  ready() {
    const kafka = this.kafkaService.readiness();
    const ready = kafka.required ? kafka.connected : kafka.configured ? kafka.connected : true;
    return {
      service: 'payment-service',
      status: ready ? 'ready' : 'not-ready',
      checks: { kafka },
      timestamp: new Date().toISOString(),
    };
  }

  @Get(':paymentId')
  @ApiOperation({ summary: 'Get payment by paymentId' })
  @ApiResponse({ status: 200, description: 'Payment fetched.' })
  findByPaymentId(@Param('paymentId') paymentId: string) {
    return this.paymentService.findByPaymentId(paymentId);
  }

  @Post(':paymentId/verify')
  @ApiOperation({ summary: 'Verify online transaction status with provider/webhook evidence' })
  @ApiResponse({ status: 200, description: 'Payment verification completed.' })
  @ApiBody({ type: VerifyPaymentDto, required: false })
  @HttpCode(HttpStatus.OK)
  verifyPayment(@Param('paymentId') paymentId: string, @Body() dto: VerifyPaymentDto) {
    return this.paymentService.verifyOnlinePayment(paymentId, dto.transactionId);
  }

  @Post('webhook')
  @ApiOperation({ summary: 'Handle provider webhook (public)' })
  @ApiResponse({ status: 200, description: 'Webhook processed.' })
  @ApiBody({ type: Object })
  @HttpCode(HttpStatus.OK)
  handleWebhook(@Req() req: Request, @Body() webhookDto: Record<string, any>) {
    return this.paymentService.handleWebhook(webhookDto, req.headers as Record<string, string | string[] | undefined>);
  }

  @Post('webhook/relay')
  @ApiOperation({ summary: 'Relay ingest endpoint (fixed public IPN target)' })
  @ApiResponse({ status: 200, description: 'Relay event accepted.' })
  @ApiBody({ type: Object })
  @HttpCode(HttpStatus.OK)
  relayIngest(@Req() req: Request, @Body() webhookDto: Record<string, any>) {
    return this.paymentService.relayIngest(webhookDto, req.headers as Record<string, string | string[] | undefined>);
  }

  @Get('webhook/relay/events')
  @ApiOperation({ summary: 'Relay pull endpoint for local payment-service instances' })
  @ApiResponse({ status: 200, description: 'Relay events fetched.' })
  @HttpCode(HttpStatus.OK)
  relayPull(
    @Req() req: Request,
    @Query('sinceId') sinceId?: string,
    @Query('limit') limit?: string,
    @Query('consumer') consumer?: string,
  ) {
    return this.paymentService.relayPull(
      { sinceId, limit, consumer },
      req.headers as Record<string, string | string[] | undefined>,
    );
  }

  @Get('webhook')
  @ApiOperation({ summary: 'Webhook endpoint probe (GET)' })
  @ApiResponse({ status: 200, description: 'Webhook endpoint is reachable. Use POST for IPN payload.' })
  webhookProbe() {
    return {
      success: true,
      message: 'Payment webhook endpoint is reachable. SePay IPN must call this URL with POST application/json.',
      method: 'POST',
    };
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
