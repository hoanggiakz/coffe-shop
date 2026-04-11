import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { TableStatus } from '@prisma/client';

export class UpdateTableStatusDto {
  @ApiProperty({ enum: TableStatus })
  @IsEnum(TableStatus)
  status: TableStatus;
}

