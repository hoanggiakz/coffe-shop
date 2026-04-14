import { IsString, IsNumber, IsIn, Min, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

const SUPPORTED_PROVIDERS = ['VIETQR', 'CASH', 'VNPAY', 'MOMO'] as const;

export class CreatePaymentDto {
  @ApiProperty({ example: 'order_123' })
  @IsString()
  orderId: string;

  @ApiProperty({ example: 100000 })
  @IsNumber()
  @Min(0)
  amount: number;

  @ApiProperty({ enum: SUPPORTED_PROVIDERS, example: 'VIETQR' })
  @IsIn(SUPPORTED_PROVIDERS, {
    message: 'Provider must be one of: VIETQR, CASH, VNPAY, MOMO',
  })
  provider: string;

  @ApiProperty({ example: 'table_12', required: false })
  @IsOptional()
  @IsString()
  tableId?: string;

  @ApiProperty({ example: 'Nguyen Van A', required: false })
  @IsOptional()
  @IsString()
  customerName?: string;
}
