export interface ChannelProvider {
  send(data: any): Promise<void>;
  getType(): string;
}

export interface NotificationData {
  type: 'PaymentCompleted' | 'LowStock';
  title: string;
  message: string;
  recipient?: string; // email or userId
  extra?: any;
}

