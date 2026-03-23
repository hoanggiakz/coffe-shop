export interface PaymentProvider {
  pay(amount: number, orderId: string): Promise<{
    paymentUrl: string;
    transactionId: string;
  }>;

  verifySignature(body: unknown, signature: string): boolean;

  verifyWebhook(body: unknown): Promise<{
    orderId: string;
    status: 'PAID' | 'FAILED';
    transactionId: string;
  }>;
}
