import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ConfirmCashDto {
  @ApiProperty({ example: 'Cashier A', required: false })
  @IsOptional()
  @IsString()
  confirmedBy?: string;

  @ApiProperty({ example: 200000, required: false, description: 'So tien khach dua' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amountReceived?: number;
}
