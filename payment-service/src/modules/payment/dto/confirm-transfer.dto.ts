import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class ConfirmTransferDto {
  @ApiProperty({ example: 'bank_txn_123', required: false })
  @IsOptional()
  @IsString()
  transactionId?: string;
}
