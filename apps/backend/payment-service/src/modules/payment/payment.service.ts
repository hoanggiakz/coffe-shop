import { Injectable, BadRequestException, ForbiddenException, NotFoundException, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { KafkaService } from '../../kafka/kafka.service';
import { ConfigService } from '@nestjs/config';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { WebhookDto } from './dto/webhook.dto';
import { PaymentReturnDto } from './dto/return.dto';
import { InvoiceStatus, PaymentStatus } from '@prisma/client';

type SupportedProvider = 'SEPAY' | 'CASH';
type OnlineProvider = Exclude<SupportedProvider, 'CASH'>;
type ReturnStatusHint = PaymentStatus | 'SUCCESS_HINT' | null;
type RequestHeaders = Record<string, string | string[] | undefined>;
type InvoiceListStatus = 'ISSUED' | 'VOIDED' | 'ALL';

export interface ActorContext {
  role?: string;
  branchId?: string;
  userId?: string;
}

type PublicInvoiceTokenPayload = {
  invoiceId: string;
  exp: number;
};

const TERMINAL_PAYMENT_STATUSES = new Set<PaymentStatus>([
  PaymentStatus.PAID,
  PaymentStatus.FAILED,
  PaymentStatus.EXPIRED,
  PaymentStatus.CANCELLED,
]);

@Injectable()
export class PaymentService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PaymentService.name);
  private relayPullTimer: NodeJS.Timeout | null = null;
  private relayLastEventId = 0;

  constructor(
    private prisma: PrismaService,
    private kafka: KafkaService,
    private config: ConfigService,
  ) {}

  onModuleInit() {
    void this.startRelayPullerIfEnabled();
  }

  onModuleDestroy() {
    if (!this.relayPullTimer) return;
    clearInterval(this.relayPullTimer);
    this.relayPullTimer = null;
  }

  private get chatServiceUrl() {
    return this.config.get<string>('CHAT_SERVICE_URL', 'http://chat-service:3007/api/chats');
  }

  private get orderServiceUrl() {
    return this.config.get<string>('ORDER_SERVICE_URL', 'http://order-service:3001');
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
    const explicit = String(this.config.get<string>('SEPAY_QUERY_URL', '') || '').trim();
    if (explicit) {
      return explicit;
    }
    return this.sepayDefaultQueryUrl;
  }

  private get invoicePublicSecret() {
    return String(
      this.config.get<string>('INVOICE_PUBLIC_SECRET', this.config.get<string>('JWT_SECRET', 'invoice-public-secret')) ||
        'invoice-public-secret',
    ).trim();
  }

  private get sepayEnv() {
    const raw = String(this.config.get<string>('SEPAY_ENV', 'production') || 'production')
      .trim()
      .toLowerCase();
    return raw === 'sandbox' ? 'sandbox' : 'production';
  }

  private get sepayDefaultQueryUrl() {
    if (this.sepayEnv === 'sandbox') {
      return 'https://pgapi-sandbox.sepay.vn';
    }
    return 'https://pgapi.sepay.vn';
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

  private get onlineQrAccountName() {
    return String(this.config.get<string>('ONLINE_PAYMENT_QR_ACCOUNT_NAME', 'Coffee Shop') || 'Coffee Shop').trim();
  }

  private get onlineQrAccountNo() {
    return String(this.config.get<string>('ONLINE_PAYMENT_QR_ACCOUNT_NO', '1026422235') || '1026422235').trim();
  }

  private get onlineQrBankCode() {
    return String(this.config.get<string>('ONLINE_PAYMENT_QR_BANK_CODE', 'VCB') || 'VCB').trim().toUpperCase();
  }

  private get onlineQrBankName() {
    return String(this.config.get<string>('ONLINE_PAYMENT_QR_BANK_NAME', '') || '').trim();
  }

  private get sepayIpnAuthType() {
    const raw = String(this.config.get<string>('SEPAY_IPN_AUTH_TYPE', 'either') || 'either')
      .trim()
      .toLowerCase();
    if (raw === 'none' || raw === 'apikey' || raw === 'secret' || raw === 'either') {
      return raw;
    }
    return 'either';
  }

  private get relaySharedSecret() {
    return String(this.config.get<string>('SEPAY_RELAY_SHARED_SECRET', '') || '').trim();
  }

  private get relayBufferSize() {
    const value = Number(this.config.get<string>('SEPAY_RELAY_BUFFER_SIZE', '1000'));
    if (!Number.isFinite(value) || value <= 0) return 1000;
    return Math.min(Math.trunc(value), 10000);
  }

  private get relaySourceUrl() {
    return String(this.config.get<string>('SEPAY_RELAY_SOURCE_URL', '') || '').trim();
  }

  private get relayPullEnabled() {
    return String(this.config.get<string>('SEPAY_RELAY_PULL_ENABLED', 'false') || 'false').trim().toLowerCase() === 'true';
  }

  private get relayPullIntervalMs() {
    const value = Number(this.config.get<string>('SEPAY_RELAY_PULL_INTERVAL_MS', '3000'));
    if (!Number.isFinite(value) || value < 1000) return 3000;
    return Math.min(Math.trunc(value), 60000);
  }

  private get relayConsumerId() {
    return String(this.config.get<string>('SEPAY_RELAY_CONSUMER_ID', 'local-dev') || 'local-dev').trim();
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
    if (provider === 'SEPAY') return this.sepayQueryUrl || this.vietQrQueryUrl;
    return this.sepayQueryUrl || this.vietQrQueryUrl;
  }

  private getHeaderValue(headers: RequestHeaders | undefined, key: string) {
    if (!headers) return '';
    const lowerKey = key.toLowerCase();
    const entry = Object.entries(headers).find(([k]) => k.toLowerCase() === lowerKey)?.[1];
    if (Array.isArray(entry)) return String(entry[0] || '').trim();
    return String(entry || '').trim();
  }

  private sanitizeHeaders(headers?: RequestHeaders) {
    const sanitized: Record<string, string> = {};
    if (!headers) return sanitized;
    for (const [key, value] of Object.entries(headers)) {
      if (value === undefined || value === null) continue;
      const normalized = Array.isArray(value) ? String(value[0] || '').trim() : String(value).trim();
      if (!normalized) continue;
      sanitized[String(key).toLowerCase()] = normalized;
    }
    return sanitized;
  }

  private canBypassSepayAuth(headers?: RequestHeaders) {
    const marker = this.getHeaderValue(headers, 'x-relay-internal');
    const token = this.getHeaderValue(headers, 'x-relay-token');
    const shared = this.relaySharedSecret;
    return marker === '1' && !!shared && token === shared;
  }

  private verifySepayWebhookAuth(headers?: RequestHeaders) {
    if (this.canBypassSepayAuth(headers)) {
      return;
    }
    this.logger.log(`SePay IPN auth mode: ${this.sepayIpnAuthType}`);
    if (this.sepayIpnAuthType === 'none') {
      return;
    }

    const expectedApiKey = String(this.config.get<string>('SEPAY_IPN_API_KEY', '') || '').trim();
    const expectedSecretKey =
      String(this.config.get<string>('SEPAY_WEBHOOK_SECRET', '') || '').trim() ||
      String(this.config.get<string>('SEPAY_SECRET_KEY', '') || '').trim() ||
      this.commonWebhookSecret;

    const authHeader = this.getHeaderValue(headers, 'authorization');
    const secretHeader = this.getHeaderValue(headers, 'x-secret-key');

    const isApiKeyMatch = expectedApiKey
      ? authHeader.toLowerCase() === `apikey ${expectedApiKey}`.toLowerCase()
      : false;
    const isSecretMatch = expectedSecretKey ? secretHeader === expectedSecretKey : false;

    if (this.sepayIpnAuthType === 'apikey') {
      if (!expectedApiKey || !isApiKeyMatch) {
        throw new BadRequestException('Invalid SePay webhook API key');
      }
      return;
    }

    if (this.sepayIpnAuthType === 'secret') {
      if (!expectedSecretKey || !isSecretMatch) {
        throw new BadRequestException('Invalid SePay webhook secret key');
      }
      return;
    }

    if (!expectedApiKey && !expectedSecretKey) {
      return;
    }

    if (!isApiKeyMatch && !isSecretMatch) {
      throw new BadRequestException('Invalid SePay webhook authentication');
    }
  }

  private async pushRelayEvent(payload: Record<string, any>, headers?: RequestHeaders) {
    const created = await this.prisma.paymentRelayEvent.create({
      data: {
        payload,
        headers: this.sanitizeHeaders(headers),
      },
    });

    const keep = this.relayBufferSize;
    const oldestKept = await this.prisma.paymentRelayEvent.findFirst({
      orderBy: { id: 'desc' },
      skip: Math.max(keep - 1, 0),
      select: { id: true },
    });
    if (oldestKept?.id) {
      await this.prisma.paymentRelayEvent.deleteMany({
        where: { id: { lt: oldestKept.id } },
      });
    }

    return {
      id: created.id,
      createdAt: created.createdAt.toISOString(),
    };
  }

  private async pullRelayEvents(sinceId: number, limit: number) {
    const safeSinceId = Number.isFinite(sinceId) ? Math.max(0, Math.trunc(sinceId)) : 0;
    const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(Math.trunc(limit), 1), 200) : 50;
    const rows = await this.prisma.paymentRelayEvent.findMany({
      where: { id: { gt: safeSinceId } },
      orderBy: { id: 'asc' },
      take: safeLimit,
    });
    return rows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      payload: (row.payload && typeof row.payload === 'object' ? row.payload : {}) as Record<string, any>,
      headers: (row.headers && typeof row.headers === 'object' ? row.headers : {}) as Record<string, string>,
    }));
  }

  private async startRelayPullerIfEnabled() {
    if (!this.relayPullEnabled || !this.relaySourceUrl) {
      return;
    }

    this.logger.log(`SePay relay puller enabled: source=${this.relaySourceUrl}, consumer=${this.relayConsumerId}`);

    const runOnce = async () => {
      const url = new URL(this.relaySourceUrl);
      url.searchParams.set('sinceId', String(this.relayLastEventId));
      url.searchParams.set('limit', '50');
      url.searchParams.set('consumer', this.relayConsumerId);

      const headers: Record<string, string> = {};
      if (this.relaySharedSecret) {
        headers['x-relay-token'] = this.relaySharedSecret;
      }

      try {
        const response = await this.fetchWithRetry(
          url.toString(),
          {
            method: 'GET',
            headers,
          },
          { attempts: 2, retryDelayMs: 200 },
        );
        if (!response.ok) {
          this.logger.warn(`Relay pull failed: ${response.status}`);
          return;
        }

        const body = (await response.json()) as {
          events?: Array<{ id?: number; payload?: Record<string, any>; headers?: Record<string, string> }>;
        };
        const events = Array.isArray(body?.events) ? body.events : [];
        for (const event of events) {
          const eventId = Number(event?.id || 0);
          if (!Number.isFinite(eventId) || eventId <= this.relayLastEventId) continue;
          try {
            await this.handleWebhook(event?.payload || {}, {
              ...(event?.headers || {}),
              'x-relay-internal': '1',
              ...(this.relaySharedSecret ? { 'x-relay-token': this.relaySharedSecret } : {}),
            });
            this.relayLastEventId = eventId;
          } catch (error) {
            this.logger.warn(`Relay event ${eventId} processing failed: ${(error as Error).message}`);
          }
        }
      } catch (error) {
        this.logger.warn(`Relay pull error: ${(error as Error).message}`);
      }
    };

    await runOnce();
    this.relayPullTimer = setInterval(() => {
      void runOnce();
    }, this.relayPullIntervalMs);
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

  getOnlineQr(options?: { amount?: number; transferContent?: string }) {
    let qrImageUrl = String(this.onlineQrImageUrl || '').trim();
    const amount = Number(options?.amount || 0);
    const transferContent = String(options?.transferContent || '').trim();
    const sepayBank = this.onlineQrBankName || this.onlineQrBankCode;

    if (this.onlineQrAccountNo && sepayBank) {
      const url = new URL('https://qr.sepay.vn/img');
      url.searchParams.set('acc', this.onlineQrAccountNo);
      url.searchParams.set('bank', sepayBank);
      if (Number.isFinite(amount) && amount > 0) {
        url.searchParams.set('amount', String(Math.round(amount)));
      }
      if (transferContent) {
        url.searchParams.set('des', transferContent);
      }
      qrImageUrl = url.toString();
    }

    return {
      provider: 'VIETQR',
      qrImageUrl,
      htmlTag: `<img src='${qrImageUrl}'/>`,
      accountName: this.onlineQrAccountName,
      accountNo: this.onlineQrAccountNo,
      bankCode: this.onlineQrBankCode,
    };
  }

  private buildResponse(payment: any) {
    const metadata =
      payment.metadata && typeof payment.metadata === 'object' && !Array.isArray(payment.metadata)
        ? payment.metadata
        : {};
    const branchId = String((metadata as any).branchId || '').trim() || null;
    const paidBy =
      String((metadata as any).confirmedBy || '').trim() ||
      String((metadata as any).customerName || '').trim() ||
      String((metadata as any).payerName || '').trim() ||
      null;
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
      paidBy,
      customerName: (metadata as any).customerName ?? null,
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

  private toBase64Url(value: string) {
    return Buffer.from(value, 'utf8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
  }

  private fromBase64Url(value: string) {
    const normalized = String(value || '')
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    return Buffer.from(padded, 'base64').toString('utf8');
  }

  private signInvoiceTokenPayload(payloadB64: string) {
    return createHmac('sha256', this.invoicePublicSecret)
      .update(payloadB64, 'utf8')
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
  }

  private buildPublicInvoiceToken(payload: PublicInvoiceTokenPayload) {
    const payloadB64 = this.toBase64Url(JSON.stringify(payload));
    const signature = this.signInvoiceTokenPayload(payloadB64);
    return `${payloadB64}.${signature}`;
  }

  private verifyPublicInvoiceToken(invoiceId: string, token: string) {
    const raw = String(token || '').trim();
    if (!raw.includes('.')) {
      throw new ForbiddenException('Invoice token không hợp lệ');
    }
    const [payloadB64, signature] = raw.split('.', 2);
    const expected = this.signInvoiceTokenPayload(payloadB64);
    if (!this.safeCompare(expected, signature || '')) {
      throw new ForbiddenException('Invoice token không hợp lệ');
    }

    let payload: PublicInvoiceTokenPayload | null = null;
    try {
      payload = JSON.parse(this.fromBase64Url(payloadB64)) as PublicInvoiceTokenPayload;
    } catch {
      throw new ForbiddenException('Invoice token không hợp lệ');
    }

    if (!payload?.invoiceId || payload.invoiceId !== invoiceId) {
      throw new ForbiddenException('Invoice token không hợp lệ');
    }
    const nowEpoch = Math.floor(Date.now() / 1000);
    if (!payload.exp || nowEpoch >= payload.exp) {
      throw new ForbiddenException('Invoice token đã hết hạn');
    }
  }

  private buildPublicInvoiceUrl(invoiceId: string, token: string) {
    const baseUrl = this.appBaseUrl.replace(/\/+$/, '');
    return `${baseUrl}/invoice/public/${encodeURIComponent(invoiceId)}?token=${encodeURIComponent(token)}`;
  }

  private enforceBranchAccess(actor: ActorContext, branchId: string) {
    const actorRole = String(actor.role || '').toUpperCase();
    const actorBranchId = String(actor.branchId || '').trim();
    if (actorRole === 'ADMIN') return;
    if (!actorBranchId || actorBranchId !== String(branchId || '').trim()) {
      throw new ForbiddenException('Không có quyền truy cập dữ liệu chi nhánh khác');
    }
  }

  private requireRoles(actor: ActorContext, allowedRoles: string[]) {
    const actorRole = String(actor.role || '').toUpperCase();
    if (!allowedRoles.includes(actorRole)) {
      throw new ForbiddenException('Insufficient permissions');
    }
  }

  private normalizeInvoiceListStatus(status?: string): InvoiceListStatus {
    const normalized = String(status || 'ALL').trim().toUpperCase();
    if (normalized === 'ISSUED' || normalized === 'VOIDED') return normalized;
    return 'ALL';
  }

  private async fetchOrderForInvoice(orderId: string) {
    const response = await this.fetchWithRetry(`${this.orderServiceUrl}/api/orders/${encodeURIComponent(orderId)}`);
    if (!response.ok) {
      throw new BadRequestException(`Không lấy được thông tin đơn hàng ${orderId}`);
    }
    return (await response.json()) as any;
  }

  private async nextInvoiceNumber(branchId: string, now: Date) {
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() + 1;
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO invoice_sequence (id, branch_id, year, month, current_number)
       VALUES ($1, $2, $3, $4, 1)
       ON CONFLICT (branch_id, year, month) DO NOTHING`,
      `invseq_${Math.random().toString(36).slice(2, 14)}`,
      branchId,
      year,
      month,
    );

    const rows = await this.prisma.$queryRawUnsafe<Array<{ seq: number }>>(
      `UPDATE invoice_sequence
       SET current_number = current_number + 1
       WHERE branch_id = $1 AND year = $2 AND month = $3
       RETURNING current_number - 1 AS seq`,
      branchId,
      year,
      month,
    );
    const seq = Number(rows?.[0]?.seq || 1);
    const yyyymm = `${year}${String(month).padStart(2, '0')}`;
    return `HD-${yyyymm}-${String(seq).padStart(6, '0')}`;
  }

  private async getBranchTaxConfig(branchId: string) {
    const existing = await this.prisma.branchTaxConfig.findUnique({ where: { branchId } });
    if (existing) return existing;
    return this.prisma.branchTaxConfig.create({
      data: { branchId, taxRate: 0, isTaxInclusive: false },
    });
  }

  private to2(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private computeTaxAmounts(subtotal: number, discount: number, taxRate: number, isTaxInclusive: boolean) {
    const base = Math.max(subtotal - discount, 0);
    if (isTaxInclusive) {
      const taxAmount = taxRate > 0 ? base - base / (1 + taxRate / 100) : 0;
      return {
        taxAmount: this.to2(taxAmount),
        totalAmount: this.to2(base),
      };
    }
    const taxAmount = base * (taxRate / 100);
    return {
      taxAmount: this.to2(taxAmount),
      totalAmount: this.to2(base + taxAmount),
    };
  }

  private mapPaymentMethod(provider?: string) {
    const p = String(provider || '').toUpperCase();
    if (p === 'CASH') return 'CASH';
    if (p === 'SEPAY') return 'SEPAY';
    return 'BANK_TRANSFER';
  }

  private escapePdfText(value: string) {
    return String(value || '')
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)');
  }

  private buildMinimalInvoicePdf(invoice: any) {
    const lines = [
      'COFFEE SHOP - HOA DON',
      `So hoa don: ${invoice.invoiceNumber}`,
      `Ngay: ${new Date(invoice.issueDate).toLocaleString('vi-VN')}`,
      `Khach: ${invoice.customerName || 'Khach vang lai'}`,
      `Tam tinh: ${Number(invoice.subtotal).toLocaleString('vi-VN')}d`,
      `Giam gia: ${Number(invoice.discount).toLocaleString('vi-VN')}d`,
      `Thue (${Number(invoice.taxRate)}%): ${Number(invoice.taxAmount).toLocaleString('vi-VN')}d`,
      `Tong cong: ${Number(invoice.totalAmount).toLocaleString('vi-VN')}d`,
      `Thanh toan: ${invoice.paymentMethod}`,
    ];

    const contentStream = [
      'BT',
      '/F1 12 Tf',
      '50 780 Td',
      ...lines.map((line, index) => `${index === 0 ? '' : '0 -18 Td ' }(${this.escapePdfText(line)}) Tj`),
      'ET',
    ].join('\n');

    const contentLength = Buffer.byteLength(contentStream, 'utf8');
    const objects = [
      '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
      '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
      '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj',
      '4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
      `5 0 obj << /Length ${contentLength} >> stream\n${contentStream}\nendstream endobj`,
    ];

    let pdf = '%PDF-1.4\n';
    const offsets = [0];
    for (const object of objects) {
      offsets.push(Buffer.byteLength(pdf, 'utf8'));
      pdf += `${object}\n`;
    }

    const xrefOffset = Buffer.byteLength(pdf, 'utf8');
    pdf += `xref\n0 ${objects.length + 1}\n`;
    pdf += '0000000000 65535 f \n';
    for (let i = 1; i <= objects.length; i += 1) {
      pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
    }
    pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
    return Buffer.from(pdf, 'utf8');
  }

  async ensureInvoiceForPayment(payment: any, createdBy?: string) {
    const existing = await this.prisma.invoice.findUnique({ where: { orderId: payment.orderId } });
    if (existing) return existing;

    const order = await this.fetchOrderForInvoice(payment.orderId);
    const branchId = String(order?.branchId || payment?.metadata?.branchId || '').trim();
    if (!branchId) {
      throw new BadRequestException(`Thiếu branchId để tạo hóa đơn cho order ${payment.orderId}`);
    }

    const subtotal = Number(order?.subtotalAmount || 0);
    const discount = Number(order?.discountAmount || 0);
    const taxConfig = await this.getBranchTaxConfig(branchId);
    const taxRate = Number(taxConfig.taxRate || 0);
    const { taxAmount, totalAmount } = this.computeTaxAmounts(
      subtotal,
      discount,
      taxRate,
      Boolean(taxConfig.isTaxInclusive),
    );

    const now = new Date();
    const invoiceNumber = await this.nextInvoiceNumber(branchId, now);
    const created = await this.prisma.invoice.create({
      data: {
        branchId,
        orderId: payment.orderId,
        invoiceNumber,
        issueDate: now,
        customerName: order?.customerName || null,
        customerPhone: order?.customerPhone || null,
        subtotal,
        discount,
        taxRate,
        taxAmount,
        totalAmount,
        paymentMethod: this.mapPaymentMethod(payment.provider),
        paymentTransactionId: payment.id,
        createdBy: createdBy || null,
      },
    });
    return created;
  }

  async listInvoices(
    branchId: string,
    query: { start_date?: string; end_date?: string; status?: string; page?: number; limit?: number },
    actor: ActorContext,
  ) {
    this.requireRoles(actor, ['ADMIN', 'MANAGER', 'WAITER', 'STAFF']);
    this.enforceBranchAccess(actor, branchId);
    const status = this.normalizeInvoiceListStatus(query.status);
    const page = Number.isFinite(query.page) ? Math.max(1, Math.floor(Number(query.page))) : 1;
    const limit = Number.isFinite(query.limit) ? Math.min(100, Math.max(1, Math.floor(Number(query.limit)))) : 20;
    const skip = (page - 1) * limit;

    const where: any = { branchId };
    if (status !== 'ALL') where.status = status;
    if (query.start_date || query.end_date) {
      where.issueDate = {};
      if (query.start_date) where.issueDate.gte = new Date(`${query.start_date}T00:00:00.000Z`);
      if (query.end_date) where.issueDate.lte = new Date(`${query.end_date}T23:59:59.999Z`);
    }

    const [rows, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        orderBy: { issueDate: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.invoice.count({ where }),
    ]);

    return {
      data: rows.map((row) => ({
        id: row.id,
        invoiceNumber: row.invoiceNumber,
        issueDate: row.issueDate,
        customerName: row.customerName,
        subtotal: Number(row.subtotal),
        discount: Number(row.discount),
        taxRate: Number(row.taxRate),
        taxAmount: Number(row.taxAmount),
        totalAmount: Number(row.totalAmount),
        paymentMethod: row.paymentMethod,
        status: row.status,
        pdfUrl: row.pdfUrl,
      })),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getInvoiceDetail(invoiceId: string, actor: ActorContext) {
    this.requireRoles(actor, ['ADMIN', 'MANAGER', 'WAITER', 'STAFF']);
    const invoice = await this.prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) throw new NotFoundException('Invoice not found');
    this.enforceBranchAccess(actor, invoice.branchId);
    const order = await this.fetchOrderForInvoice(invoice.orderId);
    return {
      id: invoice.id,
      branchId: invoice.branchId,
      branchName: null,
      invoiceNumber: invoice.invoiceNumber,
      issueDate: invoice.issueDate,
      orderId: invoice.orderId,
      customerName: invoice.customerName,
      customerPhone: invoice.customerPhone,
      items: (order?.orderItems || []).map((item: any) => ({
        name: item.menuItemName || item.name || item.menuItemId,
        quantity: Number(item.quantity || 0),
        unitPrice: Number(item.price || 0),
        totalPrice: Number(item.price || 0) * Number(item.quantity || 0),
      })),
      subtotal: Number(invoice.subtotal),
      discount: Number(invoice.discount),
      taxRate: Number(invoice.taxRate),
      taxAmount: Number(invoice.taxAmount),
      totalAmount: Number(invoice.totalAmount),
      paymentMethod: invoice.paymentMethod,
      status: invoice.status,
      pdfUrl: invoice.pdfUrl,
      voidReason: invoice.voidReason,
      voidedAt: invoice.voidedAt,
    };
  }

  async getPublicInvoiceLinkByOrder(orderId: string) {
    const invoice = await this.prisma.invoice.findUnique({ where: { orderId: String(orderId || '').trim() } });
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }
    const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60 * 24;
    const token = this.buildPublicInvoiceToken({ invoiceId: invoice.id, exp: expiresAt });
    return {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      url: this.buildPublicInvoiceUrl(invoice.id, token),
      token,
      expiresAt: new Date(expiresAt * 1000).toISOString(),
    };
  }

  async getPublicInvoiceDetail(invoiceId: string, token: string) {
    this.verifyPublicInvoiceToken(invoiceId, token);
    const invoice = await this.prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) throw new NotFoundException('Invoice not found');
    const order = await this.fetchOrderForInvoice(invoice.orderId);
    return {
      id: invoice.id,
      branchId: invoice.branchId,
      invoiceNumber: invoice.invoiceNumber,
      issueDate: invoice.issueDate,
      orderId: invoice.orderId,
      customerName: invoice.customerName,
      customerPhone: invoice.customerPhone,
      items: (order?.orderItems || []).map((item: any) => ({
        name: item.menuItemName || item.name || item.menuItemId,
        quantity: Number(item.quantity || 0),
        unitPrice: Number(item.price || 0),
        totalPrice: Number(item.price || 0) * Number(item.quantity || 0),
      })),
      subtotal: Number(invoice.subtotal),
      discount: Number(invoice.discount),
      taxRate: Number(invoice.taxRate),
      taxAmount: Number(invoice.taxAmount),
      totalAmount: Number(invoice.totalAmount),
      paymentMethod: invoice.paymentMethod,
      status: invoice.status,
      pdfUrl: invoice.pdfUrl,
      voidReason: invoice.voidReason,
      voidedAt: invoice.voidedAt,
    };
  }

  async getPublicInvoicePdf(invoiceId: string, token: string) {
    const detail = await this.getPublicInvoiceDetail(invoiceId, token);
    return this.buildMinimalInvoicePdf(detail);
  }

  async getInvoicePdf(invoiceId: string, actor: ActorContext) {
    const detail = await this.getInvoiceDetail(invoiceId, actor);
    return this.buildMinimalInvoicePdf(detail);
  }

  async voidInvoice(invoiceId: string, reason: string, actor: ActorContext) {
    this.requireRoles(actor, ['ADMIN', 'MANAGER']);
    const invoice = await this.prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) throw new NotFoundException('Invoice not found');
    this.enforceBranchAccess(actor, invoice.branchId);
    if (invoice.status === InvoiceStatus.VOIDED) {
      throw new BadRequestException('Invoice already voided');
    }
    const trimmedReason = String(reason || '').trim();
    if (!trimmedReason) throw new BadRequestException('Void reason is required');
    const updated = await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: InvoiceStatus.VOIDED,
        voidReason: trimmedReason,
        voidedAt: new Date(),
      },
    });
    return {
      success: true,
      message: 'Invoice voided successfully',
      invoice: {
        id: updated.id,
        status: updated.status,
        voidReason: updated.voidReason,
        voidedAt: updated.voidedAt,
      },
    };
  }

  async regenerateInvoice(orderId: string, actor: ActorContext) {
    this.requireRoles(actor, ['ADMIN']);
    const payment = await this.prisma.payment.findUnique({ where: { orderId } });
    if (!payment) throw new NotFoundException('Payment not found for order');
    if (payment.status !== PaymentStatus.PAID) {
      throw new BadRequestException('Order payment is not completed');
    }
    const existing = await this.prisma.invoice.findUnique({ where: { orderId } });
    if (existing) return existing;
    return this.ensureInvoiceForPayment(payment, actor.userId || 'system');
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
      try {
        await this.ensureInvoiceForPayment(updated, String((nextMetadata as any)?.confirmedBy || 'system'));
      } catch (error) {
        this.logger.warn(`Auto invoice generation failed for order ${updated.orderId}: ${(error as Error).message}`);
      }
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
      if (provider === 'SEPAY' && existing.status !== PaymentStatus.PAID) {
        const transferContent = `PAY ${String(orderId).toUpperCase()}`;
        const onlineQr = this.getOnlineQr({ amount, transferContent });
        const providerPrefix = provider.toLowerCase();
        const transactionId = `${providerPrefix}_${String(orderId).slice(0, 24)}_${Date.now()}`;
        const updated = await this.prisma.payment.update({
          where: { id: existing.id },
          data: {
            amount,
            tableId,
            status: PaymentStatus.WAITING_TRANSFER,
            transactionId,
            transferContent,
            metadata: this.buildOnlinePaymentMetadata({
              ...((existing.metadata && typeof existing.metadata === 'object' ? existing.metadata : {}) as Record<string, any>),
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
        return this.buildResponse(updated);
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

    const transferContent = `PAY ${String(orderId).toUpperCase()}`;
    const onlineQr = this.getOnlineQr({ amount, transferContent });
    const providerPrefix = provider.toLowerCase();
    const transactionId = `${providerPrefix}_${String(orderId).slice(0, 24)}_${Date.now()}`;
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
      this.logger.log(
        `SePay IPN received: transferType=${String(payload.transferType || payload.transfer_type || '').toLowerCase()} transactionId=${String(payload.id || payload.transaction_id || '-')}`,
      );
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
        payerName: String(payload.accountName || payload.account_name || payload.counterAccountName || '').trim() || undefined,
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

  async relayIngest(webhookDto: Record<string, any>, headers?: RequestHeaders) {
    const payload = (webhookDto || {}) as Record<string, any>;
    const event = await this.pushRelayEvent(payload, headers);
    return {
      success: true,
      eventId: event.id,
      receivedAt: event.createdAt,
    };
  }

  async relayPull(
    params?: { sinceId?: string | number; limit?: string | number; consumer?: string },
    headers?: RequestHeaders,
  ) {
    if (this.relaySharedSecret) {
      const token = this.getHeaderValue(headers, 'x-relay-token');
      if (token !== this.relaySharedSecret) {
        throw new BadRequestException('Invalid relay token');
      }
    }

    const sinceId = Number(params?.sinceId ?? 0);
    const limit = Number(params?.limit ?? 50);
    const events = await this.pullRelayEvents(sinceId, limit);
    return {
      success: true,
      consumer: String(params?.consumer || '').trim() || 'anonymous',
      nextSinceId: events.length ? events[events.length - 1].id : sinceId,
      events,
    };
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
