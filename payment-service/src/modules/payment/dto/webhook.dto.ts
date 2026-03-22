import { IsString, IsOptional, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

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

  @ApiProperty({ example: 'vnpay_hmac_sha512_hash', required: false })
  @IsOptional()
  @IsString()
  signature?: string;

  @ApiProperty({ example: 'VNPAY', enum: ['VNPAY', 'MOMO', 'VIETQR'] })
  @IsString()
  provider: string;

  @ApiProperty({ required: false })
  @IsOptional()
  rawData?: Record<string, any> | string;
}
