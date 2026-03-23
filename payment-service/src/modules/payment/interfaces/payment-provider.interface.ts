export interface PaymentProvider {
  pay(amount: number, orderId: string): Promise<{
    paymentUrl: string;
    transactionId: string;
  }>;

  verifySignature(body: Record<string, unknown>, signature: string): boolean;

  verifyWebhook(body: Record<string, unknown>): Promise<{
    orderId: string;
    status: 'PAID' | 'FAILED';
    transactionId: string;
  }>;
}
