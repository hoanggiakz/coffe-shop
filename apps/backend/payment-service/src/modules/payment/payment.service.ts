import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { KafkaService } from '../../kafka/kafka.service';
import { ConfigService } from '@nestjs/config';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { WebhookDto } from './dto/webhook.dto';
import { PaymentReturnDto } from './dto/return.dto';
import { PaymentStatus } from '@prisma/client';

type SupportedProvider = 'VIETQR' | 'CASH' | 'VNPAY' | 'MOMO';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private prisma: PrismaService,
    private kafka: KafkaService,
    private config: ConfigService,
  ) {}

  private get chatServiceUrl() {
    return this.config.get<string>('CHAT_SERVICE_URL', 'http://chat-service:3007/api/chats');
  }

  private get onlineQrImageUrl() {
    return this.config.get<string>(
      'ONLINE_PAYMENT_QR_URL',
      'https://img.vietqr.io/image/VCB-1026422235-qr_only.png',
    );
  }

  private get appBaseUrl() {
    return String(this.config.get<string>('APP_BASE_URL', 'https://localhost') || 'https://localhost').replace(
      /\/+$/,
      '',
    );
  }

  private get paymentReturnBaseUrl() {
    return `${this.appBaseUrl}/payment/return`;
  }

  private get vnpayPayUrl() {
    return String(this.config.get<string>('VNPAY_PAY_URL', '') || '').trim();
  }

  private get vnpayTerminalCode() {
    return String(this.config.get<string>('VNPAY_TMN_CODE', '') || '').trim();
  }

  private get momoPayUrl() {
    return String(this.config.get<string>('MOMO_PAY_URL', '') || '').trim();
  }

  private get momoPartnerCode() {
    return String(this.config.get<string>('MOMO_PARTNER_CODE', '') || '').trim();
  }

  private async fetchWithRetry(
    url: string,
    init?: RequestInit,
    options?: { attempts?: number; retryDelayMs?: number; retryOnStatuses?: number[] },
  ) {
    const attempts = Math.max(options?.attempts || 3, 1);
    const retryDelayMs = Math.max(options?.retryDelayMs || 250, 0);
    const retryOnStatuses = options?.retryOnStatuses || [429, 500, 502, 503, 504];
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const response = await fetch(url, init);
        if (attempt < attempts && retryOnStatuses.includes(response.status)) {
          this.logger.warn(`Retry ${attempt}/${attempts - 1} for ${url} after status ${response.status}`);
          await this.sleep(retryDelayMs * attempt);
          continue;
        }
        return response;
      } catch (error) {
        lastError = error as Error;
        if (attempt >= attempts) {
          throw error;
        }
        this.logger.warn(`Retry ${attempt}/${attempts - 1} for ${url} after network error: ${lastError.message}`);
        await this.sleep(retryDelayMs * attempt);
      }
    }

    throw lastError || new Error(`Request failed: ${url}`);
  }

  private async sleep(ms: number) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private normalizeProvider(provider: string): SupportedProvider {
    const normalized = String(provider || '').toUpperCase();
    if (!['VIETQR', 'CASH', 'VNPAY', 'MOMO'].includes(normalized)) {
      throw new BadRequestException(`Unsupported provider: ${provider}`);
    }
    return normalized as SupportedProvider;
  }

  private ensureOnlineProvider(provider: SupportedProvider): Exclude<SupportedProvider, 'CASH'> {
    if (provider === 'CASH') {
      throw new BadRequestException('CASH does not support online webhook/return flow');
    }
    return provider;
  }

  private buildFrontendReturnUrl(
    provider: 'VIETQR' | 'VNPAY' | 'MOMO',
    payload: { orderId: string; transactionId: string; resultCode?: string; message?: string },
  ) {
    const url = new URL(this.paymentReturnBaseUrl);
    url.searchParams.set('provider', provider);
    url.searchParams.set('orderId', payload.orderId);
    url.searchParams.set('transactionId', payload.transactionId);

    if (payload.resultCode) {
      url.searchParams.set('resultCode', payload.resultCode);
    }
    if (payload.message) {
      url.searchParams.set('message', payload.message);
    }

    return url.toString();
  }

  private buildVnpayPaymentUrl(orderId: string, amount: number, transactionId: string) {
    if (!this.vnpayPayUrl) {
      return this.buildFrontendReturnUrl('VNPAY', {
        orderId,
        transactionId,
        resultCode: 'PENDING_SETUP',
        message: 'VNPAY gateway URL is not configured',
      });
    }

    const url = new URL(this.vnpayPayUrl);
    url.searchParams.set('vnp_TxnRef', orderId);
    url.searchParams.set('vnp_Amount', String(Math.max(0, Math.round(amount)) * 100));
    url.searchParams.set('vnp_OrderInfo', `Thanh toan don ${orderId}`);
    url.searchParams.set('vnp_ReturnUrl', this.buildFrontendReturnUrl('VNPAY', { orderId, transactionId }));

    if (this.vnpayTerminalCode) {
      url.searchParams.set('vnp_TmnCode', this.vnpayTerminalCode);
    }

    return url.toString();
  }

  private buildMomoPaymentUrl(orderId: string, amount: number, transactionId: string) {
    if (!this.momoPayUrl) {
      return this.buildFrontendReturnUrl('MOMO', {
        orderId,
        transactionId,
        resultCode: 'PENDING_SETUP',
        message: 'MOMO gateway URL is not configured',
      });
    }

    const url = new URL(this.momoPayUrl);
    url.searchParams.set('orderId', orderId);
    url.searchParams.set('requestId', transactionId);
    url.searchParams.set('amount', String(Math.max(0, Math.round(amount))));
    url.searchParams.set('orderInfo', `Thanh toan don ${orderId}`);
    url.searchParams.set('redirectUrl', this.buildFrontendReturnUrl('MOMO', { orderId, transactionId }));

    if (this.momoPartnerCode) {
      url.searchParams.set('partnerCode', this.momoPartnerCode);
    }

    return url.toString();
  }

  getOnlineQr() {
    const qrImageUrl = String(this.onlineQrImageUrl || '').trim();
    return {
      provider: 'VIETQR',
      qrImageUrl,
      htmlTag: `<img src='${qrImageUrl}'/>`,
      accountName: 'Coffee Shop',
      accountNo: '1026422235',
      bankCode: 'VCB',
    };
  }

  private buildResponse(payment: any) {
    const metadata =
      payment.metadata && typeof payment.metadata === 'object' && !Array.isArray(payment.metadata)
        ? payment.metadata
        : {};
    return {
      paymentId: payment.id,
      orderId: payment.orderId,
      tableId: payment.tableId,
      amount: Number(payment.amount),
      status: payment.status,
      provider: payment.provider,
      transactionId: payment.transactionId,
      transferContent: payment.transferContent,
      paymentUrl: (metadata as any).paymentUrl || null,
      vietQr: (metadata as any).vietQr || null,
      amountReceived: (metadata as any).amountReceived ?? null,
      changeDue: (metadata as any).changeDue ?? null,
      paidAt: payment.paidAt,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
    };
  }

  private async emitPaymentCompleted(payment: any) {
    await this.kafka.paymentCompleted({
      paymentId: payment.id,
      orderId: payment.orderId,
      amount: Number(payment.amount),
      status: payment.status,
    });
  }

  private async sendChatPaymentMessage(tableId: string, content: string) {
    if (!tableId) return;

    try {
      const listRes = await this.fetchWithRetry(`${this.chatServiceUrl}?tableId=${encodeURIComponent(tableId)}`);
      if (!listRes.ok) {
        this.logger.warn(`Cannot load chats for table ${tableId}: ${listRes.status}`);
        return;
      }

      const chats = (await listRes.json()) as Array<{ id: string; status?: string }>;
      let chatId = chats.find((chat) => chat.status === 'OPEN')?.id || chats[0]?.id;

      if (!chatId) {
        const createRes = await this.fetchWithRetry(this.chatServiceUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tableId }),
        });
        if (!createRes.ok) {
          this.logger.warn(`Cannot create chat for table ${tableId}: ${createRes.status}`);
          return;
        }
        const created = (await createRes.json()) as { id?: string };
        chatId = created.id || '';
      }

      if (!chatId) return;

      const msgRes = await this.fetchWithRetry(`${this.chatServiceUrl}/${chatId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderType: 'STAFF',
          senderName: 'Payment Bot',
          content,
        }),
      });

      if (!msgRes.ok) {
        this.logger.warn(`Cannot send payment chat message for table ${tableId}: ${msgRes.status}`);
      }
    } catch (error) {
      this.logger.warn(`Chat notification failed for table ${tableId}: ${(error as Error).message}`);
    }
  }

  private async updatePaymentStatus(
    paymentId: string,
    status: PaymentStatus,
    transactionId?: string,
    metadataPatch?: Record<string, any>,
  ) {
    const current = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!current) {
      throw new NotFoundException(`Payment ${paymentId} not found`);
    }

    if (current.status === status) {
      return current;
    }

    const nextMetadata =
      metadataPatch && Object.keys(metadataPatch).length > 0
        ? {
            ...((current.metadata && typeof current.metadata === 'object' ? current.metadata : {}) as Record<
              string,
              any
            >),
            ...metadataPatch,
          }
        : current.metadata;

    const updated = await this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        status,
        ...(transactionId ? { transactionId } : {}),
        ...(status === 'PAID' ? { paidAt: new Date() } : {}),
        ...(nextMetadata ? { metadata: nextMetadata } : {}),
      },
    });

    if (status === 'PAID') {
      await this.emitPaymentCompleted(updated);
    }

    return updated;
  }

  async create(createPaymentDto: CreatePaymentDto) {
    const { orderId, amount, tableId, customerName } = createPaymentDto;
    const provider = this.normalizeProvider(createPaymentDto.provider);

    const existing = await this.prisma.payment.findUnique({
      where: { orderId },
    });

    if (existing) {
      if (existing.provider !== provider) {
        throw new BadRequestException(
          `Order ${orderId} already has payment method ${existing.provider}. Cannot switch to ${provider}.`,
        );
      }
      return this.buildResponse(existing);
    }

    if (provider === 'CASH') {
      const payment = await this.prisma.payment.create({
        data: {
          orderId,
          tableId,
          amount,
          provider,
          status: PaymentStatus.WAITING_CASH,
          metadata: {
            customerName: customerName || null,
            requestedAt: new Date().toISOString(),
          },
        },
      });

      await this.sendChatPaymentMessage(
        tableId || '',
        `[PAYMENT_CASH_REQUEST] Khach yeu cau thanh toan tien mat cho don ${orderId}.`,
      );

      this.logger.log(`Created cash payment ${payment.id} for order ${orderId}`);
      return this.buildResponse(payment);
    }

    if (provider === 'VIETQR') {
      const onlineQr = this.getOnlineQr();
      const transactionId = `vietqr_${String(orderId).slice(0, 24)}_${Date.now()}`;
      const transferContent = `PAY ${String(orderId).toUpperCase()}`;
      const payment = await this.prisma.payment.create({
        data: {
          orderId,
          tableId,
          amount,
          provider,
          status: PaymentStatus.WAITING_TRANSFER,
          transactionId,
          transferContent,
          metadata: {
            vietQr: {
              qrImageUrl: onlineQr.qrImageUrl,
              htmlTag: onlineQr.htmlTag,
              accountName: onlineQr.accountName,
              accountNo: onlineQr.accountNo,
              bankCode: onlineQr.bankCode,
              transferContent,
            },
          },
        },
      });

      this.logger.log(`Created VietQR payment ${payment.id} for order ${orderId}`);
      return this.buildResponse(payment);
    }

    const normalizedAmount = Math.max(0, Math.round(Number(amount || 0)));
    const providerPrefix = provider.toLowerCase();
    const transactionId = `${providerPrefix}_${String(orderId).slice(0, 24)}_${Date.now()}`;
    const paymentUrl =
      provider === 'VNPAY'
        ? this.buildVnpayPaymentUrl(orderId, normalizedAmount, transactionId)
        : this.buildMomoPaymentUrl(orderId, normalizedAmount, transactionId);

    const payment = await this.prisma.payment.create({
      data: {
        orderId,
        tableId,
        amount,
        provider,
        status: PaymentStatus.WAITING_TRANSFER,
        transactionId,
        transferContent: `${provider} ${String(orderId).toUpperCase()}`,
        metadata: {
          paymentUrl,
          gateway: provider,
          gatewayRequest: {
            orderId,
            amount: normalizedAmount,
            transactionId,
          },
          returnUrl: this.buildFrontendReturnUrl(provider, { orderId, transactionId }),
        },
      },
    });

    this.logger.log(`Created ${provider} payment ${payment.id} for order ${orderId}`);
    return this.buildResponse(payment);
  }

  async findByOrderId(orderId: string, options?: { allowMissing?: boolean }) {
    const payment = await this.prisma.payment.findUnique({ where: { orderId } });
    if (!payment) {
      if (options?.allowMissing) {
        return null;
      }
      throw new NotFoundException(`Payment for order ${orderId} not found`);
    }
    return this.buildResponse(payment);
  }

  async findByPaymentId(paymentId: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) {
      throw new NotFoundException(`Payment ${paymentId} not found`);
    }
    return this.buildResponse(payment);
  }

  async handleWebhook(webhookDto: WebhookDto) {
    const provider = this.ensureOnlineProvider(this.normalizeProvider(webhookDto.provider));

    const existingPayment = await this.prisma.payment.findUnique({
      where: { orderId: webhookDto.orderId },
    });
    if (!existingPayment) {
      throw new NotFoundException(`Payment for order ${webhookDto.orderId} not found`);
    }
    if (existingPayment.provider !== provider) {
      throw new BadRequestException(`Order ${webhookDto.orderId} is not using ${provider}`);
    }

    const updated = await this.updatePaymentStatus(
      existingPayment.id,
      webhookDto.status === 'PAID' ? PaymentStatus.PAID : PaymentStatus.FAILED,
      webhookDto.transactionId,
      {
        webhookAt: new Date().toISOString(),
        webhookRaw: webhookDto.rawData || null,
      },
    );

    this.logger.log(`Updated ${provider} payment ${updated.id} to ${updated.status} via webhook ${webhookDto.transactionId}`);
    return { success: true, paymentId: updated.id, newStatus: updated.status };
  }

  async handleReturn(returnDto: PaymentReturnDto) {
    const provider = this.ensureOnlineProvider(this.normalizeProvider(returnDto.provider));
    if (!returnDto.orderId) {
      throw new BadRequestException('orderId is required');
    }

    const payment = await this.prisma.payment.findUnique({ where: { orderId: returnDto.orderId } });
    if (!payment) {
      throw new NotFoundException(`Payment for order ${returnDto.orderId} not found`);
    }
    if (payment.provider !== provider) {
      throw new BadRequestException(`Order ${returnDto.orderId} is not using ${provider}`);
    }

    const successCodes = new Set(['0', '00', 'SUCCESS', 'PAID']);
    const normalizedCode = String(returnDto.resultCode ?? '').toUpperCase();
    const newStatus = successCodes.has(normalizedCode) ? PaymentStatus.PAID : PaymentStatus.FAILED;

    const updated = await this.updatePaymentStatus(
      payment.id,
      newStatus,
      returnDto.transactionId || payment.transactionId || undefined,
      {
        returnResultCode: returnDto.resultCode ?? null,
        returnMessage: returnDto.message ?? null,
        returnAt: new Date().toISOString(),
      },
    );

    this.logger.log(`Handled return for order ${payment.orderId} via ${provider} -> ${updated.status}`);
    return this.buildResponse(updated);
  }

  async confirmCashPayment(paymentId: string, confirmedBy?: string, amountReceived?: number) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) {
      throw new NotFoundException(`Payment ${paymentId} not found`);
    }
    if (payment.provider !== 'CASH') {
      throw new BadRequestException(`Payment ${paymentId} is not CASH`);
    }

    const paidAmount = Number(payment.amount);
    const normalizedReceived =
      typeof amountReceived === 'number' && Number.isFinite(amountReceived) ? Math.round(amountReceived) : null;

    if (normalizedReceived !== null && normalizedReceived < paidAmount) {
      throw new BadRequestException(`So tien khach dua phai >= ${paidAmount}`);
    }

    const changeDue = normalizedReceived !== null ? Math.max(normalizedReceived - paidAmount, 0) : null;

    const updated = await this.updatePaymentStatus(payment.id, PaymentStatus.PAID, payment.transactionId || undefined, {
      confirmedBy: confirmedBy || 'staff',
      confirmedAt: new Date().toISOString(),
      ...(normalizedReceived !== null ? { amountReceived: normalizedReceived, changeDue } : {}),
    });

    await this.sendChatPaymentMessage(
      payment.tableId || '',
      `[PAYMENT_CASH_CONFIRMED] Da xac nhan thu tien mat cho don ${payment.orderId}.`,
    );

    this.logger.log(`Cash payment ${payment.id} confirmed by ${confirmedBy || 'staff'}`);
    return this.buildResponse(updated);
  }

}
