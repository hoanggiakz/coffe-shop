import { Transform } from 'class-transformer';
import { IsIn, IsString } from 'class-validator';

export class UpdateOrderStatusDto {
  @Transform(({ value }) => String(value || '').trim().toUpperCase())
  @IsString()
  @IsIn(['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED'])
  status: string;
}

