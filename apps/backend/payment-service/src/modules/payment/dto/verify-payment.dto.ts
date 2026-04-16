import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class VerifyPaymentDto {
  @ApiProperty({
    example: 'txn_123456',
    required: false,
    description: 'Optional provider transaction id hint for reconciliation',
  })
  @IsOptional()
  @IsString()
  transactionId?: string;
}
