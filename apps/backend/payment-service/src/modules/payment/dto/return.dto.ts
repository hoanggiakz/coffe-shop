import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

const RETURN_PROVIDERS = ['VIETQR', 'VNPAY'] as const;

export class PaymentReturnDto {
  @ApiProperty({ enum: RETURN_PROVIDERS, example: 'VIETQR' })
  @IsString()
  @IsIn(RETURN_PROVIDERS, { message: 'Provider must be VIETQR or VNPAY' })
  provider: string;

  @ApiProperty({ example: 'order_123' })
  @IsString()
  orderId: string;

  @ApiProperty({ example: '0', required: false, description: 'Provider-specific result code (0 or 00 = success)' })
  @IsOptional()
  @IsString()
  resultCode?: string;

  @ApiProperty({ example: 'Thanh toán thành công', required: false })
  @IsOptional()
  @IsString()
  message?: string;

  @ApiProperty({ example: 'txn_123456', required: false })
  @IsOptional()
  @IsString()
  transactionId?: string;
}
