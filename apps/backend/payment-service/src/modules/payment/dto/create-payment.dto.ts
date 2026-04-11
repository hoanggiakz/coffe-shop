import { IsString, IsNumber, IsIn, Min, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreatePaymentDto {
  @ApiProperty({ example: 'order_123' })
  @IsString()
  orderId: string;

  @ApiProperty({ example: 100000 })
  @IsNumber()
  @Min(0)
  amount: number;

  @ApiProperty({ enum: ['VIETQR', 'CASH'], example: 'VIETQR' })
  @IsIn(['VIETQR', 'CASH'], {
    message: 'Provider must be VIETQR or CASH',
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
