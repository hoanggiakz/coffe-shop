export interface PaymentProvider {
  pay(amount: number, orderId: string): Promise<{
    paymentUrl: string;
    transactionId: string;
  }>;

  verifySignature(body: any, signature: string): boolean;

  verifyWebhook(body: any): Promise<{
    orderId: string;
    status: 'PAID' | 'FAILED';
    transactionId: string;
  }>;
}
