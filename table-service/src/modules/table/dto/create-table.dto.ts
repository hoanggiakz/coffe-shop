import { IsInt, Min, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateTableDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  number: number;

  @ApiProperty({ example: 4 })
  @IsInt()
  @Min(1)
  capacity: number;
}

