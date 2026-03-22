import { IsEnum } from 'class-validator';

export class UpdateOrderStatusDto {
  @IsEnum(['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED'])
  status: string;
}

