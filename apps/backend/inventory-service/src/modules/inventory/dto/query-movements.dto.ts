import { ApiProperty } from '@nestjs/swagger';
import { StockSource, StockType } from '@prisma/client';
import { IsBooleanString, IsEnum, IsOptional, IsString } from 'class-validator';

export class QueryIngredientDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBooleanString()
  includeInactive?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBooleanString()
  lowOnly?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  keyword?: string;
}

export class QueryMovementDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  ingredientId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  referenceCode?: string;

  @ApiProperty({ enum: StockType, required: false })
  @IsOptional()
  @IsEnum(StockType)
  type?: StockType;

  @ApiProperty({ enum: StockSource, required: false })
  @IsOptional()
  @IsEnum(StockSource)
  source?: StockSource;

  @ApiProperty({ required: false, example: '2026-03-01' })
  @IsOptional()
  @IsString()
  dateFrom?: string;

  @ApiProperty({ required: false, example: '2026-03-19' })
  @IsOptional()
  @IsString()
  dateTo?: string;

  @ApiProperty({ required: false, example: '200' })
  @IsOptional()
  @IsString()
  limit?: string;
}
