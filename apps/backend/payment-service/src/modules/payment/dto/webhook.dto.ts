import { IsString, IsOptional, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

const WEBHOOK_PROVIDERS = ['VIETQR', 'VNPAY', 'MOMO'] as const;

export class WebhookDto {
  @ApiProperty({ example: 'order_123' })
  @IsString()
  orderId: string;

  @ApiProperty({ example: 'txn_456' })
  @IsString()
  transactionId: string;

  @ApiProperty({ enum: ['PAID', 'FAILED'], example: 'PAID' })
  @IsIn(['PAID', 'FAILED'])
  status: 'PAID' | 'FAILED';

  @ApiProperty({ example: 'vietqr_signature', required: false })
  @IsOptional()
  @IsString()
  signature?: string;

  @ApiProperty({ example: 'VIETQR', enum: WEBHOOK_PROVIDERS })
  @IsIn(WEBHOOK_PROVIDERS, { message: 'Provider must be VIETQR, VNPAY or MOMO' })
  @IsString()
  provider: string;

  @ApiProperty({ required: false })
  @IsOptional()
  rawData?: Record<string, any> | string;
}
