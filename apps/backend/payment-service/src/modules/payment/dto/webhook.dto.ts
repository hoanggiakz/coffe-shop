import { IsString, IsOptional, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

const WEBHOOK_PROVIDERS = ['SEPAY'] as const;

export class WebhookDto {
  @ApiProperty({ example: 'order_123' })
  @IsString()
  orderId: string;

  @ApiProperty({ example: 'txn_456' })
  @IsString()
  transactionId: string;

  @ApiProperty({ enum: ['PAID', 'FAILED', 'EXPIRED', 'CANCELLED', 'WAITING_TRANSFER'], example: 'PAID' })
  @IsIn(['PAID', 'FAILED', 'EXPIRED', 'CANCELLED', 'WAITING_TRANSFER'])
  status: 'PAID' | 'FAILED' | 'EXPIRED' | 'CANCELLED' | 'WAITING_TRANSFER';

  @ApiProperty({ example: 'sepay_signature', required: false })
  @IsOptional()
  @IsString()
  signature?: string;

  @ApiProperty({ example: 'SEPAY', enum: WEBHOOK_PROVIDERS })
  @IsIn(WEBHOOK_PROVIDERS, { message: 'Provider must be SEPAY' })
  @IsString()
  provider: string;

  @ApiProperty({ required: false })
  @IsOptional()
  rawData?: Record<string, any> | string;
}
