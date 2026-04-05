import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { PaymentProvider } from '../interfaces/payment-provider.interface';

@Injectable()
export class ZaloPayProvider implements PaymentProvider {
  private readonly logger = new Logger(ZaloPayProvider.name);

  constructor(private configService: ConfigService) {}

  async pay(amount: number, orderId: string): Promise<{ paymentUrl: string; transactionId: string }> {
    const appId = this.configService.get('ZALOPAY_APP_ID', '2554');
    const returnUrl = this.configService.get('ZALOPAY_RETURN_URL', 'https://localhost/payment/return');
    const appTransId = `${new Date().toISOString().slice(0, 10).replace(/-/g, '')}_${orderId.slice(-8)}`;

    // NOTE: URL nay la URL sandbox mo phong de test luong redirect tren UI.
    // Khi ket noi that, can goi server-to-server API create order cua ZaloPay.
    const paymentUrl =
      `https://sbgateway.zalopay.vn/openinapp?` +
      `appid=${encodeURIComponent(appId)}` +
      `&apptransid=${encodeURIComponent(appTransId)}` +
      `&amount=${encodeURIComponent(String(amount))}` +
      `&orderid=${encodeURIComponent(orderId)}` +
      `&redirecturl=${encodeURIComponent(
        `${returnUrl}?provider=ZALOPAY&orderId=${encodeURIComponent(orderId)}&resultCode=1&message=Payment%20success`,
      )}`;

    this.logger.log(`Generated ZaloPay URL for order ${orderId}`);
    return {
      paymentUrl,
      transactionId: `zlp_${Date.now()}`,
    };
  }

  verifySignature(body: any, signature: string): boolean {
    const key2 = this.configService.get('ZALOPAY_KEY2');
    if (!key2) {
      this.logger.warn('ZALOPAY_KEY2 is empty, skip signature verification in current environment');
      return true;
    }
    const hash = crypto.createHmac('sha256', key2).update(JSON.stringify(body)).digest('hex');
    return hash === signature;
  }

  async verifyWebhook(body: any): Promise<{ orderId: string; status: 'PAID' | 'FAILED'; transactionId: string }> {
    if (body?.orderId && body?.status && body?.transactionId) {
      return {
        orderId: body.orderId,
        status: body.status,
        transactionId: body.transactionId,
      };
    }

    const orderId = String(body?.app_trans_id || body?.orderId || '');
    const status = Number(body?.return_code) === 1 ? 'PAID' : 'FAILED';
    return {
      orderId,
      status,
      transactionId: String(body?.zp_trans_id || body?.transactionId || ''),
    };
  }
}
