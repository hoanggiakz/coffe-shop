import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateOrderStatusDto {
  @ApiProperty({ example: 'CONFIRMED', enum: ['PENDING', 'CONFIRMED', 'PREPARING', 'COMPLETED'] })
  @IsEnum(['PENDING', 'CONFIRMED', 'PREPARING', 'COMPLETED'])
  status: string;
}


