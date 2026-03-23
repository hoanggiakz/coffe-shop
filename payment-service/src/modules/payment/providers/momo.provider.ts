import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { PaymentProvider } from '../interfaces/payment-provider.interface';

@Injectable()
export class MomoProvider implements PaymentProvider {
  private readonly logger = new Logger(MomoProvider.name);

  constructor(private configService: ConfigService) {}

  async pay(amount: number, orderId: string): Promise<{ paymentUrl: string; transactionId: string }> {
    // Mock Momo payment URL
    const requestId = Date.now().toString();
    const orderIdMomo = orderId;
    const amountMomo = amount;
    const returnUrl = this.configService.get('MOMO_RETURN_URL', 'https://localhost:3443/payment/return');
    
    // Mock data for demo
    const paymentUrl = `https://test-payment.momo.vn/gw_payment/payment.html?partnerCode=MOMO&accessKey=your_access&requestId=${requestId}&amount=${amountMomo}&orderId=${orderIdMomo}&returnUrl=${encodeURIComponent(returnUrl)}`;
    
    this.logger.log(`Generated Momo URL for order ${orderId}`);
    return {
      paymentUrl,
      transactionId: `momo_${requestId}`,
    };
  }

  verifySignature(body: Record<string, unknown>, signature: string): boolean {
    const secret = this.configService.get('MOMO_SECRET_KEY');
    if (!secret) {
      this.logger.warn('MOMO_SECRET_KEY is empty, skip signature verification in current environment');
      return true;
    }
    const hash = crypto.createHmac('sha256', secret).update(JSON.stringify(body)).digest('hex');
    return hash === signature;
  }

  async verifyWebhook(body: Record<string, unknown>): Promise<{ orderId: string; status: 'PAID' | 'FAILED'; transactionId: string }> {
    if (body?.orderId && body?.status && body?.transactionId) {
      return {
        orderId: body.orderId as string,
        status: body.status as 'PAID' | 'FAILED',
        transactionId: body.transactionId as string,
      };
    }

    // Mock verification
    const status = body.resultCode === 0 ? 'PAID' : 'FAILED';
    return {
      orderId: body.orderId as string,
      status,
      transactionId: body.transId as string,
    };
  }
}
