import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { KafkaService } from '../../kafka/kafka.service';
import { ConfigService } from '@nestjs/config';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { WebhookDto } from './dto/webhook.dto';
import { PaymentReturnDto } from './dto/return.dto';
import { PaymentStatus } from '@prisma/client';
import { VNPayProvider } from './providers/vnpay.provider';
import { MomoProvider } from './providers/momo.provider';
import { ZaloPayProvider } from './providers/zalopay.provider';
import * as crypto from 'crypto';

type SupportedProvider = 'VNPAY' | 'MOMO' | 'ZALOPAY' | 'VIETQR' | 'CASH';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  private providers = new Map<string, any>();

  constructor(
    private prisma: PrismaService,
    private kafka: KafkaService,
    private config: ConfigService,
  ) {
    this.providers.set('VNPAY', new VNPayProvider(this.config));
    this.providers.set('MOMO', new MomoProvider(this.config));
    this.providers.set('ZALOPAY', new ZaloPayProvider(this.config));
  }

  private get chatServiceUrl() {
    return this.config.get<string>('CHAT_SERVICE_URL', 'http://chat-service:3007/api/chats');
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
    if (!['VNPAY', 'MOMO', 'ZALOPAY', 'VIETQR', 'CASH'].includes(normalized)) {
      throw new BadRequestException(`Unsupported provider: ${provider}`);
    }
    return normalized as SupportedProvider;
  }

  private parseRawData(rawData: Record<string, any> | string | undefined, fallback: Record<string, any>) {
    if (!rawData) return fallback;
    if (typeof rawData === 'string') {
      try {
        return JSON.parse(rawData);
      } catch {
        return fallback;
      }
    }
    return rawData;
  }

  private buildVietQrData(orderId: string, amount: number) {
    const bankBin = this.config.get<string>('VIETQR_BANK_BIN', '970422');
    const accountNo = this.config.get<string>('VIETQR_ACCOUNT_NO', '1900123456789');
    const accountName = this.config.get<string>('VIETQR_ACCOUNT_NAME', 'COFFEE SHOP');
    const transferContent = `CF-${orderId.slice(-8).toUpperCase()}`;
    const qrImageUrl = `https://img.vietqr.io/image/${bankBin}-${accountNo}-compact2.png?amount=${amount}&addInfo=${encodeURIComponent(
      transferContent,
    )}&accountName=${encodeURIComponent(accountName)}`;

    return {
      bankBin,
      accountNo,
      accountName,
      transferContent,
      qrImageUrl,
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

    if (provider === 'VIETQR') {
      const vietQr = this.buildVietQrData(orderId, amount);
      const payment = await this.prisma.payment.create({
        data: {
          orderId,
          tableId,
          amount,
          provider,
          status: PaymentStatus.WAITING_TRANSFER,
          transactionId: `vietqr_${Date.now()}`,
          transferContent: vietQr.transferContent,
          metadata: { paymentUrl: vietQr.qrImageUrl, vietQr },
        },
      });

      this.logger.log(`Created VietQR payment ${payment.id} for order ${orderId}`);
      return this.buildResponse(payment);
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

    const providerInstance = this.providers.get(provider);
    if (!providerInstance) {
      throw new BadRequestException(`Unsupported provider: ${provider}`);
    }

    const payment = await this.prisma.payment.create({
      data: {
        orderId,
        tableId,
        amount,
        provider,
        status: PaymentStatus.PENDING,
      },
    });

    const { paymentUrl, transactionId } = await providerInstance.pay(amount, orderId);
    const updated = await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        transactionId,
        metadata: { paymentUrl },
      },
    });

    this.logger.log(`Created payment ${payment.id} for order ${orderId} via ${provider}`);
    return this.buildResponse(updated);
  }

  async findByOrderId(orderId: string) {
    const payment = await this.prisma.payment.findUnique({ where: { orderId } });
    if (!payment) {
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
    const provider = this.normalizeProvider(webhookDto.provider);
    if (provider === 'CASH') {
      throw new BadRequestException('Webhook is not supported for CASH provider');
    }

    const providerPayload = this.parseRawData(webhookDto.rawData, webhookDto as any);

    if (provider === 'VIETQR') {
      const secret = this.config.get<string>('VIETQR_SECRET', '');
      if (secret) {
        const receivedSignature = webhookDto.signature || '';
        const calculated = crypto.createHmac('sha256', secret).update(JSON.stringify(providerPayload)).digest('hex');
        if (receivedSignature !== calculated) {
          throw new BadRequestException('Invalid VietQR signature');
        }
      }

      const existing = await this.prisma.payment.findUnique({ where: { orderId: webhookDto.orderId } });
      if (!existing) {
        throw new NotFoundException(`Payment for order ${webhookDto.orderId} not found`);
      }
      if (existing.provider !== 'VIETQR') {
        throw new BadRequestException(`Order ${webhookDto.orderId} is not using VietQR`);
      }

      const updated = await this.updatePaymentStatus(
        existing.id,
        webhookDto.status === 'PAID' ? PaymentStatus.PAID : PaymentStatus.FAILED,
        webhookDto.transactionId,
      );
      this.logger.log(`Updated VietQR payment ${updated.id} to ${updated.status}`);
      return { success: true, paymentId: updated.id, newStatus: updated.status };
    }

    const providerInstance = this.providers.get(provider);
    if (!providerInstance) {
      throw new BadRequestException(`Unsupported provider: ${provider}`);
    }

    const signature = webhookDto.signature || '';
    if (!providerInstance.verifySignature(providerPayload, signature)) {
      this.logger.warn(`Invalid signature for webhook ${webhookDto.transactionId}`);
      throw new BadRequestException('Invalid signature');
    }

    const verified = await providerInstance.verifyWebhook(providerPayload);
    if (
      verified.orderId !== webhookDto.orderId ||
      verified.transactionId !== webhookDto.transactionId ||
      verified.status !== webhookDto.status
    ) {
      throw new BadRequestException('Webhook data mismatch');
    }

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
    );

    this.logger.log(`Updated payment ${updated.id} to ${updated.status} via webhook ${webhookDto.transactionId}`);
    return { success: true, paymentId: updated.id, newStatus: updated.status };
  }

  async handleReturn(returnDto: PaymentReturnDto) {
    const provider = this.normalizeProvider(returnDto.provider);
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

    const successCodes = ['0', '00', 'SUCCESS'];
    const normalizedCode = String(returnDto.resultCode ?? '').toUpperCase();
    const newStatus = successCodes.includes(normalizedCode) ? PaymentStatus.PAID : PaymentStatus.FAILED;

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

  async confirmTransferPayment(paymentId: string, transactionId?: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) {
      throw new NotFoundException(`Payment ${paymentId} not found`);
    }
    if (payment.provider !== 'VIETQR') {
      throw new BadRequestException(`Payment ${paymentId} is not VIETQR`);
    }

    const updated = await this.updatePaymentStatus(
      payment.id,
      PaymentStatus.PAID,
      transactionId || payment.transactionId || `vietqr_manual_${Date.now()}`,
      { manualConfirmedAt: new Date().toISOString() },
    );

    this.logger.log(`VietQR payment ${payment.id} manually confirmed`);
    return this.buildResponse(updated);
  }
}
