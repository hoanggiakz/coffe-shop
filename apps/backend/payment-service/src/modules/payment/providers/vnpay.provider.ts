import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { PaymentProvider } from '../interfaces/payment-provider.interface';

@Injectable()
export class VNPayProvider implements PaymentProvider {
  private readonly logger = new Logger(VNPayProvider.name);

  constructor(private configService: ConfigService) {}

  async pay(amount: number, orderId: string): Promise<{ paymentUrl: string; transactionId: string }> {
    const tmnCode = String(this.configService.get('VNPAY_TMN_CODE') || '').trim();
    const hashSecret = String(this.configService.get('VNPAY_HASH_SECRET') || this.configService.get('VNPAY_SECRET_KEY') || '').trim();
    const paymentBaseUrl = String(
      this.configService.get('VNPAY_PAYMENT_URL') || 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html',
    ).trim();
    const returnUrl = String(this.configService.get('VNPAY_RETURN_URL') || '').trim();

    if (!tmnCode || !hashSecret || !returnUrl) {
      throw new BadRequestException(
        'VNPay is not configured. Please set VNPAY_TMN_CODE, VNPAY_HASH_SECRET, and VNPAY_RETURN_URL.',
      );
    }

    const locale = String(this.configService.get('VNPAY_LOCALE') || 'vn').trim() || 'vn';
    const ipAddr = String(this.configService.get('VNPAY_DEFAULT_IP') || '127.0.0.1').trim() || '127.0.0.1';
    const expireMinutes = Number(this.configService.get('VNPAY_EXPIRE_MINUTES') || 15);

    const now = new Date();
    const expireAt = new Date(now.getTime() + Math.max(expireMinutes, 1) * 60_000);
    const txnRef = String(orderId).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) || `ORDER${Date.now()}`;
    const amountVnd = Math.round(Number(amount) * 100);

    const params: Record<string, string> = {
      vnp_Version: '2.1.0',
      vnp_Command: 'pay',
      vnp_TmnCode: tmnCode,
      vnp_Amount: String(amountVnd),
      vnp_CurrCode: 'VND',
      vnp_TxnRef: txnRef,
      vnp_OrderInfo: `Thanh toan don ${txnRef}`,
      vnp_OrderType: 'other',
      vnp_Locale: locale,
      vnp_ReturnUrl: returnUrl,
      vnp_IpAddr: ipAddr,
      vnp_CreateDate: this.formatDate(now),
      vnp_ExpireDate: this.formatDate(expireAt),
    };

    const hashData = this.buildSignedQuery(params);
    const signature = crypto.createHmac('sha512', hashSecret).update(hashData).digest('hex');
    const paymentUrl = `${paymentBaseUrl}?${hashData}&vnp_SecureHash=${signature}`;

    this.logger.log(`Generated VNPay URL for order ${orderId} with tmnCode ${tmnCode}`);
    return {
      paymentUrl,
      transactionId: `vnp_${txnRef}_${Date.now()}`,
    };
  }

  verifySignature(body: any, signature: string): boolean {
    const secret = this.configService.get('VNPAY_HASH_SECRET') || this.configService.get('VNPAY_SECRET_KEY');
    if (!secret) {
      this.logger.warn('VNPAY_HASH_SECRET is empty, skip signature verification in current environment');
      return true;
    }

    if (body && typeof body === 'object' && body.vnp_SecureHash) {
      const payload = { ...body } as Record<string, string>;
      const received = String(payload.vnp_SecureHash || '');
      delete payload.vnp_SecureHash;
      delete payload.vnp_SecureHashType;

      const hashData = this.buildSignedQuery(payload);
      const calculated = crypto.createHmac('sha512', secret).update(hashData).digest('hex');
      return calculated.toUpperCase() === received.toUpperCase();
    }

    const hash = crypto.createHmac('sha512', secret).update(JSON.stringify(body || {})).digest('hex');
    return hash.toUpperCase() === String(signature || '').toUpperCase();
  }

  async verifyWebhook(body: any): Promise<{ orderId: string; status: 'PAID' | 'FAILED'; transactionId: string }> {
    if (body?.orderId && body?.status && body?.transactionId) {
      return {
        orderId: body.orderId,
        status: body.status,
        transactionId: body.transactionId,
      };
    }

    // Mock verification
    const status = body.vnp_ResponseCode === '00' ? 'PAID' : 'FAILED';
    return {
      orderId: body.vnp_TxnRef,
      status,
      transactionId: body.vnp_TransactionNo,
    };
  }

  private formatDate(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    const ss = String(date.getSeconds()).padStart(2, '0');
    return `${y}${m}${d}${hh}${mm}${ss}`;
  }

  private buildSignedQuery(params: Record<string, string>): string {
    return Object.keys(params)
      .sort()
      .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key] ?? '')}`)
      .join('&');
  }
}
