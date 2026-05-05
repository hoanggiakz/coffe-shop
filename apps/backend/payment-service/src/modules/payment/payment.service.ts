import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { KafkaService } from '../../kafka/kafka.service';
import { ConfigService } from '@nestjs/config';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { WebhookDto } from './dto/webhook.dto';
import { PaymentReturnDto } from './dto/return.dto';
import { PaymentStatus } from '@prisma/client';

type SupportedProvider = 'SEPAY' | 'CASH';
type OnlineProvider = Exclude<SupportedProvider, 'CASH'>;
type ReturnStatusHint = PaymentStatus | 'SUCCESS_HINT' | null;
type RequestHeaders = Record<string, string | string[] | undefined>;

const TERMINAL_PAYMENT_STATUSES = new Set<PaymentStatus>([
  PaymentStatus.PAID,
  PaymentStatus.FAILED,
  PaymentStatus.EXPIRED,
  PaymentStatus.CANCELLED,
]);

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

  private get vnpayHashSecret() {
    return String(this.config.get<string>('VNPAY_HASH_SECRET', '') || '').trim();
  }

  private get vnpayQueryUrl() {
    return String(this.config.get<string>('VNPAY_QUERY_URL', '') || '').trim();
  }

  private get vietQrQueryUrl() {
    return String(this.config.get<string>('VIETQR_QUERY_URL', '') || '').trim();
  }

  private get sepayQueryUrl() {
    return String(this.config.get<string>('SEPAY_QUERY_URL', '') || '').trim();
  }

  private get onlinePaymentTimeoutMinutes() {
    const value = Number(this.config.get<string>('ONLINE_PAYMENT_TIMEOUT_MINUTES', '30'));
    if (!Number.isFinite(value) || value <= 0) {
      return 30;
    }
    return value;
  }

  private get commonWebhookSecret() {
    return String(this.config.get<string>('PAYMENT_WEBHOOK_SECRET', '') || '').trim();
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
    if (!['SEPAY', 'CASH'].includes(normalized)) {
      throw new BadRequestException(`Unsupported provider: ${provider}`);
    }
    return normalized as SupportedProvider;
  }

  private ensureOnlineProvider(provider: SupportedProvider): OnlineProvider {
    if (provider === 'CASH') {
      throw new BadRequestException('CASH does not support online webhook/return flow');
    }
    return provider;
  }

  private normalizePaymentStatus(raw: unknown): PaymentStatus | null {
    const normalized = String(raw || '').trim().toUpperCase();
    if (!normalized) {
      return null;
    }

    const aliases: Record<string, PaymentStatus> = {
      PENDING: PaymentStatus.WAITING_TRANSFER,
      WAITING: PaymentStatus.WAITING_TRANSFER,
      WAITING_TRANSFER: PaymentStatus.WAITING_TRANSFER,
      WAITING_CASH: PaymentStatus.WAITING_CASH,
      PROCESSING: PaymentStatus.WAITING_TRANSFER,
      IN_PROGRESS: PaymentStatus.WAITING_TRANSFER,
      PAID: PaymentStatus.PAID,
      SUCCESS: PaymentStatus.PAID,
      COMPLETED: PaymentStatus.PAID,
      DONE: PaymentStatus.PAID,
      SETTLED: PaymentStatus.PAID,
      FAILED: PaymentStatus.FAILED,
      FAIL: PaymentStatus.FAILED,
      ERROR: PaymentStatus.FAILED,
      DECLINED: PaymentStatus.FAILED,
      REJECTED: PaymentStatus.FAILED,
      EXPIRED: PaymentStatus.EXPIRED,
      TIMEOUT: PaymentStatus.EXPIRED,
      TIMED_OUT: PaymentStatus.EXPIRED,
      CANCELLED: PaymentStatus.CANCELLED,
      CANCELED: PaymentStatus.CANCELLED,
      USER_CANCELLED: PaymentStatus.CANCELLED,
      USER_CANCELED: PaymentStatus.CANCELLED,
      ABORTED: PaymentStatus.CANCELLED,
    };

    return aliases[normalized] || null;
  }

  private mapReturnCodeToStatusHint(resultCode?: string | null): ReturnStatusHint {
    const code = String(resultCode || '').trim().toUpperCase();
    if (!code) {
      return null;
    }

    const successCodes = new Set(['0', '00', 'SUCCESS', 'PAID', 'APPROVED']);
    if (successCodes.has(code)) {
      return 'SUCCESS_HINT';
    }

    const cancelledCodes = new Set(['CANCEL', 'CANCELED', 'CANCELLED', 'ABORTED', 'USER_CANCELLED', 'USER_CANCELED']);
    if (cancelledCodes.has(code)) {
      return PaymentStatus.CANCELLED;
    }

    const expiredCodes = new Set(['EXPIRED', 'TIMEOUT', 'TIMED_OUT']);
    if (expiredCodes.has(code)) {
      return PaymentStatus.EXPIRED;
    }

    const failedCodes = new Set(['FAIL', 'FAILED', 'ERROR', 'DECLINED', 'REJECTED']);
    if (failedCodes.has(code)) {
      return PaymentStatus.FAILED;
    }

    return null;
  }

  private getProviderWebhookSecret(provider: OnlineProvider) {
    const providerKey = `${provider}_WEBHOOK_SECRET`;
    const providerSecret = String(this.config.get<string>(providerKey, '') || '').trim();
    return providerSecret || this.commonWebhookSecret;
  }

  private stripSignaturePrefix(signature: string) {
    const value = String(signature || '').trim();
    if (value.startsWith('sha256=')) {
      return value.slice('sha256='.length);
    }
    return value;
  }

  private safeCompare(left: string, right: string) {
    const l = Buffer.from(left, 'utf8');
    const r = Buffer.from(right, 'utf8');
    if (l.length !== r.length) {
      return false;
    }
    return timingSafeEqual(l, r);
  }

  private verifyIncomingWebhookSignature(provider: OnlineProvider, webhookDto: WebhookDto) {
    const secret = this.getProviderWebhookSecret(provider);
    if (!secret) {
      return;
    }

    const receivedSignature = this.stripSignaturePrefix(String(webhookDto.signature || ''));
    if (!receivedSignature) {
      throw new BadRequestException(`Missing webhook signature for ${provider}`);
    }

    const rawPayload =
      typeof webhookDto.rawData === 'string'
        ? webhookDto.rawData
        : JSON.stringify(
            webhookDto.rawData || {
              orderId: webhookDto.orderId,
              transactionId: webhookDto.transactionId,
              status: webhookDto.status,
              provider: webhookDto.provider,
            },
          );

    const expected = createHmac('sha256', secret).update(rawPayload).digest('hex');
    if (!this.safeCompare(expected, receivedSignature)) {
      throw new BadRequestException(`Invalid webhook signature for ${provider}`);
    }
  }

  private getOnlineProviderStatusQueryUrl(provider: OnlineProvider) {
    if (provider === 'VNPAY') return this.vnpayQueryUrl;
    if (provider === 'SEPAY') return this.sepayQueryUrl || this.vietQrQueryUrl;
    return this.vietQrQueryUrl;
  }

  private getHeaderValue(headers: RequestHeaders | undefined, key: string) {
    if (!headers) return '';
    const lowerKey = key.toLowerCase();
    const entry = Object.entries(headers).find(([k]) => k.toLowerCase() === lowerKey)?.[1];
    if (Array.isArray(entry)) return String(entry[0] || '').trim();
    return String(entry || '').trim();
  }

  private verifySepayWebhookAuth(headers?: RequestHeaders) {
    const expectedApiKey = String(this.config.get<string>('SEPAY_IPN_API_KEY', '') || '').trim();
    const expectedSecretKey =
      String(this.config.get<string>('SEPAY_WEBHOOK_SECRET', '') || '').trim() || this.commonWebhookSecret;

    if (!expectedApiKey && !expectedSecretKey) {
      return;
    }

    const authHeader = this.getHeaderValue(headers, 'authorization');
    const secretHeader = this.getHeaderValue(headers, 'x-secret-key');

    const isApiKeyMatch = expectedApiKey
      ? authHeader.toLowerCase() === `apikey ${expectedApiKey}`.toLowerCase()
      : false;
    const isSecretMatch = expectedSecretKey ? secretHeader === expectedSecretKey : false;

    if (!isApiKeyMatch && !isSecretMatch) {
      throw new BadRequestException('Invalid SePay webhook authentication');
    }
  }

  private extractOrderHintsFromText(raw: string) {
    const text = String(raw || '').trim();
    if (!text) return [];

    const matches = new Set<string>();
    const patterns = [
      /\bPAY\s+([A-Z0-9_-]{6,64})\b/gi,
      /\bORDER[_\s:-]*([A-Z0-9_-]{6,64})\b/gi,
      /\bINV[_\s:-]*([A-Z0-9_-]{6,64})\b/gi,
      /\b([a-z0-9]{20,64})\b/gi,
    ];

    for (const pattern of patterns) {
      let result: RegExpExecArray | null;
      do {
        result = pattern.exec(text);
        if (result?.[1]) {
          matches.add(String(result[1]).trim());
        }
      } while (result);
    }

    return Array.from(matches);
  }

  private async resolvePaymentFromSepayPayload(payload: Record<string, any>) {
    const code = String(payload.code || payload.payment_code || '').trim();
    const content = String(payload.content || '').trim();
    const transactionId = String(payload.id || payload.transaction_id || '').trim();

    const orderHints = new Set<string>();
    if (code) orderHints.add(code);
    for (const hint of this.extractOrderHintsFromText(content)) {
      orderHints.add(hint);
    }

    for (const orderId of orderHints) {
      const payment = await this.prisma.payment.findUnique({ where: { orderId } });
      if (payment) return payment;
    }

    if (transactionId) {
      const payment = await this.prisma.payment.findFirst({
        where: { transactionId },
        orderBy: { createdAt: 'desc' },
      });
      if (payment) return payment;
    }

    const recentPending = await this.prisma.payment.findMany({
      where: {
        provider: 'SEPAY',
        status: { in: [PaymentStatus.WAITING_TRANSFER, PaymentStatus.PENDING] },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const normalizedContent = content.toLowerCase();
    const byTransferContent = recentPending.find((item) => {
      const transfer = String(item.transferContent || '').trim().toLowerCase();
      return transfer && normalizedContent.includes(transfer);
    });

    return byTransferContent || null;
  }

  private normalizeSepayWebhookStatus(payload: Record<string, any>) {
    const transferType = String(payload.transferType || payload.transfer_type || '').toLowerCase();
    if (transferType === 'in' || transferType === 'credit') {
      return PaymentStatus.PAID;
    }
    if (transferType === 'out' || transferType === 'debit') {
      return PaymentStatus.CANCELLED;
    }
    return null;
  }

  private isPaymentTerminal(status: PaymentStatus) {
    return TERMINAL_PAYMENT_STATUSES.has(status);
  }

  private getPaymentExpiryDate(payment: any): Date {
    const metadata =
      payment.metadata && typeof payment.metadata === 'object' && !Array.isArray(payment.metadata)
        ? (payment.metadata as Record<string, any>)
        : {};

    const expiresAtRaw = metadata.expiresAt ? new Date(String(metadata.expiresAt)) : null;
    if (expiresAtRaw && !Number.isNaN(expiresAtRaw.getTime())) {
      return expiresAtRaw;
    }

    const fallback = new Date(payment.createdAt);
    fallback.setMinutes(fallback.getMinutes() + this.onlinePaymentTimeoutMinutes);
    return fallback;
  }

  private resolveProviderStatusFromPayload(rawPayload: any, paymentAmount: number) {
    const raw = rawPayload && typeof rawPayload === 'object' ? rawPayload : {};
    const transactionFound =
      raw.transactionFound === false ||
      raw.found === false ||
      raw.exists === false ||
      raw.notFound === true ||
      String(raw.code || '').toUpperCase() === 'NOT_FOUND'
        ? false
        : true;

    const amountKeys = ['receivedAmount', 'amountReceived', 'settledAmount', 'paidAmount'];
    for (const key of amountKeys) {
      const value = Number(raw[key]);
      if (Number.isFinite(value) && value >= paymentAmount && transactionFound) {
        return {
          status: PaymentStatus.PAID,
          transactionFound,
          transactionId: String(raw.transactionId || raw.transId || raw.id || '').trim() || null,
        };
      }
    }

    const paidFlags = [raw.paid, raw.isPaid, raw.success, raw.completed];
    if (paidFlags.some((flag) => flag === true) && transactionFound) {
      return {
        status: PaymentStatus.PAID,
        transactionFound,
        transactionId: String(raw.transactionId || raw.transId || raw.id || '').trim() || null,
      };
    }

    const candidates = [
      raw.status,
      raw.paymentStatus,
      raw.transactionStatus,
      raw.resultStatus,
      raw.state,
      raw.result,
      raw.code,
    ];

    for (const candidate of candidates) {
      const mapped = this.normalizePaymentStatus(candidate);
      if (!mapped) continue;
      if (mapped === PaymentStatus.PAID && !transactionFound) continue;
      return {
        status: mapped,
        transactionFound,
        transactionId: String(raw.transactionId || raw.transId || raw.id || '').trim() || null,
      };
    }

    return {
      status: PaymentStatus.WAITING_TRANSFER,
      transactionFound,
      transactionId: String(raw.transactionId || raw.transId || raw.id || '').trim() || null,
    };
  }

  private async verifyWithProviderApi(payment: any, provider: OnlineProvider, transactionIdHint?: string) {
    const queryUrl = this.getOnlineProviderStatusQueryUrl(provider);
    if (!queryUrl) {
      return {
        status: PaymentStatus.WAITING_TRANSFER,
        transactionFound: false,
        transactionId: transactionIdHint || payment.transactionId || null,
        raw: { reason: 'provider-query-url-not-configured' },
      };
    }

    let statusUrl: URL;
    try {
      statusUrl = new URL(queryUrl);
    } catch {
      return {
        status: PaymentStatus.WAITING_TRANSFER,
        transactionFound: false,
        transactionId: transactionIdHint || payment.transactionId || null,
        raw: { reason: `invalid-provider-query-url:${queryUrl}` },
      };
    }

    statusUrl.searchParams.set('provider', provider);
    statusUrl.searchParams.set('paymentId', payment.id);
    statusUrl.searchParams.set('orderId', payment.orderId);
    statusUrl.searchParams.set('amount', String(Number(payment.amount)));
    if (payment.transferContent) {
      statusUrl.searchParams.set('transferContent', String(payment.transferContent));
    }
    if (transactionIdHint || payment.transactionId) {
      statusUrl.searchParams.set('transactionId', String(transactionIdHint || payment.transactionId));
    }

    try {
      const response = await this.fetchWithRetry(statusUrl.toString(), { method: 'GET' }, { attempts: 2 });
      if (!response.ok) {
        return {
          status: PaymentStatus.WAITING_TRANSFER,
          transactionFound: false,
          transactionId: transactionIdHint || payment.transactionId || null,
          raw: { reason: `provider-http-${response.status}` },
        };
      }

      let payload: any;
      try {
        payload = await response.json();
      } catch {
        payload = { status: await response.text() };
      }

      const resolved = this.resolveProviderStatusFromPayload(payload, Number(payment.amount));
      return {
        ...resolved,
        raw: payload,
      };
    } catch (error) {
      return {
        status: PaymentStatus.WAITING_TRANSFER,
        transactionFound: false,
        transactionId: transactionIdHint || payment.transactionId || null,
        raw: { reason: (error as Error).message || 'provider-request-failed' },
      };
    }
  }

  private buildFrontendReturnUrl(
    provider: 'VIETQR' | 'SEPAY' | 'VNPAY',
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

  private formatVnpayDate(value: Date) {
    const pad = (n: number) => String(n).padStart(2, '0');
    return (
      `${value.getFullYear()}` +
      `${pad(value.getMonth() + 1)}` +
      `${pad(value.getDate())}` +
      `${pad(value.getHours())}` +
      `${pad(value.getMinutes())}` +
      `${pad(value.getSeconds())}`
    );
  }

  private encodeVnpayQueryComponent(input: string) {
    return encodeURIComponent(input).replace(/%20/g, '+');
  }

  private buildVnpaySignData(params: Record<string, string>) {
    return Object.keys(params)
      .sort()
      .map((key) => `${this.encodeVnpayQueryComponent(key)}=${this.encodeVnpayQueryComponent(params[key])}`)
      .join('&');
  }

  private buildVnpayPaymentUrl(orderId: string, amount: number, transactionId: string) {
    if (!this.vnpayPayUrl || !this.vnpayTerminalCode || !this.vnpayHashSecret) {
      return this.buildFrontendReturnUrl('VNPAY', {
        orderId,
        transactionId,
        resultCode: 'PENDING_SETUP',
        message: 'VNPAY config missing (payUrl/tmnCode/hashSecret)',
      });
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.onlinePaymentTimeoutMinutes * 60 * 1000);
    const returnUrl = this.buildFrontendReturnUrl('VNPAY', { orderId, transactionId });

    const params: Record<string, string> = {
      vnp_Amount: String(Math.max(0, Math.round(amount)) * 100),
      vnp_Command: 'pay',
      vnp_CreateDate: this.formatVnpayDate(now),
      vnp_CurrCode: 'VND',
      vnp_ExpireDate: this.formatVnpayDate(expiresAt),
      vnp_IpAddr: '127.0.0.1',
      vnp_Locale: 'vn',
      vnp_OrderInfo: `Thanh toan don ${orderId}`,
      vnp_OrderType: 'other',
      vnp_ReturnUrl: returnUrl,
      vnp_TmnCode: this.vnpayTerminalCode,
      vnp_TxnRef: orderId,
      vnp_Version: '2.1.0',
    };

    const signData = this.buildVnpaySignData(params);
    const secureHash = createHmac('sha512', this.vnpayHashSecret).update(signData, 'utf8').digest('hex');

    const url = new URL(this.vnpayPayUrl);
    Object.keys(params)
      .sort()
      .forEach((key) => {
        url.searchParams.set(key, params[key]);
      });
    url.searchParams.set('vnp_SecureHashType', 'HMACSHA512');
    url.searchParams.set('vnp_SecureHash', secureHash);

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
    const branchId = String((metadata as any).branchId || '').trim() || null;
    return {
      paymentId: payment.id,
      orderId: payment.orderId,
      tableId: payment.tableId,
      branchId,
      amount: Number(payment.amount),
      status: payment.status,
      provider: payment.provider,
      transactionId: payment.transactionId,
      transferContent: payment.transferContent,
      paymentUrl: (metadata as any).paymentUrl || null,
      vietQr: (metadata as any).vietQr || null,
      amountReceived: (metadata as any).amountReceived ?? null,
      changeDue: (metadata as any).changeDue ?? null,
      expiresAt: (metadata as any).expiresAt ?? null,
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

    let targetStatus = status;
    if (current.status === PaymentStatus.PAID && status !== PaymentStatus.PAID) {
      targetStatus = PaymentStatus.PAID;
    }

    const hasMetadataPatch = !!(metadataPatch && Object.keys(metadataPatch).length > 0);
    const nextMetadata = hasMetadataPatch
      ? {
          ...((current.metadata && typeof current.metadata === 'object' ? current.metadata : {}) as Record<string, any>),
          ...metadataPatch,
        }
      : current.metadata;

    const statusChanged = current.status !== targetStatus;
    const transactionChanged = !!transactionId && transactionId !== current.transactionId;
    const shouldUpdate = statusChanged || transactionChanged || hasMetadataPatch;
    if (!shouldUpdate) {
      return current;
    }

    const data: Record<string, any> = {
      ...(statusChanged ? { status: targetStatus } : {}),
      ...(transactionChanged ? { transactionId } : {}),
      ...(statusChanged && targetStatus === PaymentStatus.PAID ? { paidAt: new Date() } : {}),
      ...(hasMetadataPatch ? { metadata: nextMetadata } : {}),
    };

    const updated = await this.prisma.payment.update({
      where: { id: paymentId },
      data,
    });

    if (statusChanged && targetStatus === PaymentStatus.PAID) {
      await this.emitPaymentCompleted(updated);
    }

    return updated;
  }

  private buildOnlinePaymentMetadata(baseMetadata: Record<string, any>) {
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + this.onlinePaymentTimeoutMinutes);
    return {
      ...baseMetadata,
      expiresAt: expiresAt.toISOString(),
    };
  }

  private async verifyOnlinePaymentRecord(
    payment: any,
    transactionIdHint?: string,
    source: 'manual' | 'return' = 'manual',
    extraMetadata?: Record<string, any>,
  ) {
    if (payment.provider === 'CASH') {
      throw new BadRequestException('CASH payment must be confirmed via confirm-cash endpoint');
    }

    const currentStatus = payment.status as PaymentStatus;
    if (this.isPaymentTerminal(currentStatus)) {
      if (extraMetadata && Object.keys(extraMetadata).length > 0) {
        return this.updatePaymentStatus(payment.id, currentStatus, transactionIdHint || payment.transactionId || undefined, {
          ...extraMetadata,
          lastVerificationAt: new Date().toISOString(),
        });
      }
      return payment;
    }

    const now = new Date();
    const expiresAt = this.getPaymentExpiryDate(payment);
    if (now.getTime() > expiresAt.getTime()) {
      return this.updatePaymentStatus(
        payment.id,
        PaymentStatus.EXPIRED,
        transactionIdHint || payment.transactionId || undefined,
        {
          ...extraMetadata,
          expiresAt: expiresAt.toISOString(),
          verificationSource: source,
          lastVerificationAt: now.toISOString(),
          verificationResult: {
            source: 'local-timeout',
            status: PaymentStatus.EXPIRED,
          },
        },
      );
    }

    const provider = this.ensureOnlineProvider(this.normalizeProvider(String(payment.provider)));
    const verification = await this.verifyWithProviderApi(payment, provider, transactionIdHint);
    const verificationMetadata = {
      ...extraMetadata,
      expiresAt: expiresAt.toISOString(),
      verificationSource: source,
      lastVerificationAt: now.toISOString(),
      verificationResult: {
        source: 'provider-api',
        status: verification.status,
        transactionFound: verification.transactionFound,
        raw: verification.raw,
      },
    };

    const transactionId = verification.transactionId || transactionIdHint || payment.transactionId || undefined;

    if (verification.status === PaymentStatus.PAID && verification.transactionFound) {
      return this.updatePaymentStatus(payment.id, PaymentStatus.PAID, transactionId, verificationMetadata);
    }

    if (
      verification.status === PaymentStatus.FAILED ||
      verification.status === PaymentStatus.EXPIRED ||
      verification.status === PaymentStatus.CANCELLED
    ) {
      return this.updatePaymentStatus(payment.id, verification.status, transactionId, verificationMetadata);
    }

    return this.updatePaymentStatus(payment.id, PaymentStatus.WAITING_TRANSFER, transactionId, verificationMetadata);
  }

  async create(createPaymentDto: CreatePaymentDto) {
    const { orderId, amount, tableId, customerName } = createPaymentDto;
    const branchId = String(createPaymentDto.branchId || '').trim() || null;
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
            branchId,
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

    if (provider === 'SEPAY') {
      const onlineQr = this.getOnlineQr();
      const providerPrefix = provider.toLowerCase();
      const transactionId = `${providerPrefix}_${String(orderId).slice(0, 24)}_${Date.now()}`;
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
          metadata: this.buildOnlinePaymentMetadata({
            branchId,
            gateway: provider,
            vietQr: {
              qrImageUrl: onlineQr.qrImageUrl,
              htmlTag: onlineQr.htmlTag,
              accountName: onlineQr.accountName,
              accountNo: onlineQr.accountNo,
              bankCode: onlineQr.bankCode,
              transferContent,
            },
          }),
        },
      });

      this.logger.log(`Created ${provider} payment ${payment.id} for order ${orderId}`);
      return this.buildResponse(payment);
    }

    const normalizedAmount = Math.max(0, Math.round(Number(amount || 0)));
    const providerPrefix = provider.toLowerCase();
    const transactionId = `${providerPrefix}_${String(orderId).slice(0, 24)}_${Date.now()}`;
    const paymentUrl = this.buildVnpayPaymentUrl(orderId, normalizedAmount, transactionId);

    const payment = await this.prisma.payment.create({
      data: {
        orderId,
        tableId,
        amount,
        provider,
        status: PaymentStatus.WAITING_TRANSFER,
        transactionId,
        transferContent: `${provider} ${String(orderId).toUpperCase()}`,
        metadata: this.buildOnlinePaymentMetadata({
          branchId,
          paymentUrl,
          gateway: provider,
          gatewayRequest: {
            orderId,
            amount: normalizedAmount,
            transactionId,
          },
          returnUrl: this.buildFrontendReturnUrl(provider, { orderId, transactionId }),
        }),
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

  async listRecentPayments(options?: {
    limit?: string | number;
    provider?: string;
    status?: string;
    reconcileOnline?: boolean;
  }) {
    const requestedLimit = Number(options?.limit ?? 50);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 200)
      : 50;

    const where: Record<string, any> = {};

    if (options?.provider) {
      where.provider = this.normalizeProvider(options.provider);
    }

    if (options?.status) {
      const normalizedStatus = this.normalizePaymentStatus(options.status);
      if (!normalizedStatus) {
        throw new BadRequestException(`Unsupported payment status: ${options.status}`);
      }
      where.status = normalizedStatus;
    }

    const payments = await this.prisma.payment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    if (!options?.reconcileOnline) {
      return payments.map((payment) => this.buildResponse(payment));
    }

    const refreshedPayments: any[] = [];
    for (const payment of payments) {
      const currentStatus = payment.status as PaymentStatus;
      if (payment.provider === 'CASH' || this.isPaymentTerminal(currentStatus)) {
        refreshedPayments.push(payment);
        continue;
      }

      try {
        const updated = await this.verifyOnlinePaymentRecord(
          payment,
          payment.transactionId || undefined,
          'manual',
          { realtimeRefreshAt: new Date().toISOString() },
        );
        refreshedPayments.push(updated);
      } catch (error) {
        this.logger.warn(
          `Realtime refresh failed for payment ${payment.id}: ${(error as Error).message}`,
        );
        refreshedPayments.push(payment);
      }
    }

    return refreshedPayments.map((payment) => this.buildResponse(payment));
  }

  async verifyOnlinePayment(paymentId: string, transactionIdHint?: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) {
      throw new NotFoundException(`Payment ${paymentId} not found`);
    }
    const updated = await this.verifyOnlinePaymentRecord(payment, transactionIdHint, 'manual');
    return this.buildResponse(updated);
  }

  async handleWebhook(webhookDto: WebhookDto | Record<string, any>, headers?: RequestHeaders) {
    const payload = (webhookDto || {}) as Record<string, any>;

    const isSepayIpnFormat =
      Object.prototype.hasOwnProperty.call(payload, 'transferType') ||
      Object.prototype.hasOwnProperty.call(payload, 'transfer_type') ||
      Object.prototype.hasOwnProperty.call(payload, 'transferAmount') ||
      Object.prototype.hasOwnProperty.call(payload, 'amount');

    if (isSepayIpnFormat) {
      this.verifySepayWebhookAuth(headers);

      const mappedStatus = this.normalizeSepayWebhookStatus(payload);
      if (!mappedStatus) {
        return { success: true, ignored: true, reason: 'unsupported-transfer-type' };
      }

      const payment = await this.resolvePaymentFromSepayPayload(payload);
      if (!payment) {
        return { success: true, ignored: true, reason: 'payment-not-found' };
      }

      if (payment.provider !== 'SEPAY') {
        throw new BadRequestException(`Order ${payment.orderId} is not using SEPAY`);
      }

      const transactionId =
        String(payload.id || payload.transaction_id || '').trim() ||
        payment.transactionId ||
        undefined;

      const rawAmount = Number(payload.transferAmount ?? payload.amount ?? 0);
      const paidAmount = Number.isFinite(rawAmount) ? rawAmount : 0;

      const updated = await this.updatePaymentStatus(payment.id, mappedStatus, transactionId, {
        webhookAt: new Date().toISOString(),
        webhookStatus: mappedStatus,
        webhookRaw: payload,
        amountReceived: paidAmount > 0 ? paidAmount : undefined,
        verificationSource: 'sepay-ipn',
      });

      this.logger.log(`Updated SEPAY payment ${updated.id} to ${updated.status} via webhook ${transactionId || '-'}`);
      return { success: true, paymentId: updated.id, newStatus: updated.status };
    }

    const legacyWebhook = webhookDto as WebhookDto;
    const provider = this.ensureOnlineProvider(this.normalizeProvider(legacyWebhook.provider));
    this.verifyIncomingWebhookSignature(provider, legacyWebhook);

    const existingPayment = await this.prisma.payment.findUnique({
      where: { orderId: legacyWebhook.orderId },
    });
    if (!existingPayment) {
      throw new NotFoundException(`Payment for order ${legacyWebhook.orderId} not found`);
    }
    if (existingPayment.provider !== provider) {
      throw new BadRequestException(`Order ${legacyWebhook.orderId} is not using ${provider}`);
    }

    const mappedStatus = this.normalizePaymentStatus(legacyWebhook.status);
    if (!mappedStatus) {
      throw new BadRequestException(`Unsupported webhook payment status: ${legacyWebhook.status}`);
    }

    const updated = await this.updatePaymentStatus(
      existingPayment.id,
      mappedStatus,
      legacyWebhook.transactionId || existingPayment.transactionId || undefined,
      {
        webhookAt: new Date().toISOString(),
        webhookStatus: legacyWebhook.status,
        webhookRaw: legacyWebhook.rawData || null,
      },
    );

    this.logger.log(`Updated ${provider} payment ${updated.id} to ${updated.status} via webhook ${legacyWebhook.transactionId}`);
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

    const returnMetadata = {
      returnResultCode: returnDto.resultCode ?? null,
      returnMessage: returnDto.message ?? null,
      returnAt: new Date().toISOString(),
      returnTransactionId: returnDto.transactionId ?? null,
    };

    const hint = this.mapReturnCodeToStatusHint(returnDto.resultCode);
    if (
      hint === PaymentStatus.FAILED ||
      hint === PaymentStatus.CANCELLED ||
      hint === PaymentStatus.EXPIRED
    ) {
      const updatedFailure = await this.updatePaymentStatus(
        payment.id,
        hint,
        returnDto.transactionId || payment.transactionId || undefined,
        returnMetadata,
      );
      this.logger.log(`Handled return for order ${payment.orderId} via ${provider} -> ${updatedFailure.status}`);
      return this.buildResponse(updatedFailure);
    }

    const updated = await this.verifyOnlinePaymentRecord(
      payment,
      returnDto.transactionId || payment.transactionId || undefined,
      'return',
      returnMetadata,
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
