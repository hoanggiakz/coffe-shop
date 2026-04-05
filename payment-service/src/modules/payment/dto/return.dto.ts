import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class PaymentReturnDto {
  @ApiProperty({ enum: ['MOMO', 'VNPAY', 'ZALOPAY', 'VIETQR', 'CASH'], example: 'MOMO' })
  @IsString()
  @IsEnum(['MOMO', 'VNPAY', 'ZALOPAY', 'VIETQR', 'CASH'])
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

  @ApiProperty({ example: 'momo_123456', required: false })
  @IsOptional()
  @IsString()
  transactionId?: string;
}
