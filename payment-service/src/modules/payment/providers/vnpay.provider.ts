import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { PaymentProvider } from '../interfaces/payment-provider.interface';

@Injectable()
export class VNPayProvider implements PaymentProvider {
  private readonly logger = new Logger(VNPayProvider.name);

  constructor(private configService: ConfigService) {}

  async pay(amount: number, orderId: string): Promise<{ paymentUrl: string; transactionId: string }> {
    // Mock VNPay payment URL generation
    const vnp_Amount = amount * 100; // VND unit
    const vnp_TxnRef = orderId;
    const vnp_OrderInfo = `Pay for order ${orderId}`;
    const vnp_ReturnUrl = this.configService.get('VNPAY_RETURN_URL', 'http://localhost:3000/payment/return');
    const vnp_IpAddr = '127.0.0.1';

    // Mock data for demo
    const paymentUrl = `https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?vnp_Amount=${vnp_Amount}&vnp_TxnRef=${vnp_TxnRef}&vnp_OrderInfo=${encodeURIComponent(vnp_OrderInfo)}&vnp_ReturnUrl=${encodeURIComponent(vnp_ReturnUrl)}&vnp_IpAddr=${vnp_IpAddr}`;
    
    this.logger.log(`Generated VNPay URL for order ${orderId}`);
    return {
      paymentUrl,
      transactionId: `vnp_${Date.now()}`,
    };
  }

  verifySignature(body: Record<string, unknown>, signature: string): boolean {
    const secret = this.configService.get('VNPAY_SECRET_KEY');
    if (!secret) {
      this.logger.warn('VNPAY_SECRET_KEY is empty, skip signature verification in current environment');
      return true;
    }
    const hash = crypto.createHmac('sha512', secret).update(JSON.stringify(body)).digest('hex');
    return hash === signature;
  }

  async verifyWebhook(
    body: Record<string, unknown>,
  ): Promise<{ orderId: string; status: 'PAID' | 'FAILED'; transactionId: string }> {
    if (body?.orderId && body?.status && body?.transactionId) {
      return {
        orderId: String(body.orderId),
        status: body.status as 'PAID' | 'FAILED',
        transactionId: String(body.transactionId),
      };
    }

    // Mock verification
    const responseCode = body['vnp_ResponseCode'];
    const status = responseCode === '00' ? 'PAID' : 'FAILED';
    return {
      orderId: String(body['vnp_TxnRef'] ?? ''),
      status,
      transactionId: String(body['vnp_TransactionNo'] ?? ''),
    };
  }
}
