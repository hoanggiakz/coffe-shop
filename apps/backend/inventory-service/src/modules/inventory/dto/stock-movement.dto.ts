import { IsString, IsEnum, IsNumber, Min, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { StockSource, StockType } from '@prisma/client';
import { IsOptional } from 'class-validator';

export class StockMovementDto {
  @ApiProperty({ example: 'branch-hcm-01', required: false })
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiProperty({ example: 'ingredient-id-123' })
  @IsString()
  @IsNotEmpty()
  ingredientId: string;

  @ApiProperty({ enum: StockType, example: StockType.IMPORT })
  @IsEnum(StockType)
  type: StockType;

  @ApiProperty({ example: 50.5 })
  @IsNumber()
  @Min(0.01)
  quantity: number;

  @ApiProperty({ enum: StockSource, example: StockSource.MANUAL, required: false })
  @IsOptional()
  @IsEnum(StockSource)
  source?: StockSource;

  @ApiProperty({ example: 250000, required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  unitPrice?: number;

  @ApiProperty({ example: 'Nhap bo sung', required: false })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiProperty({ example: 'Lo 2026-03', required: false })
  @IsOptional()
  @IsString()
  note?: string;

  @ApiProperty({ example: 'RCPT-20260319-001', required: false })
  @IsOptional()
  @IsString()
  referenceCode?: string;

  @ApiProperty({ example: 'manager-1', required: false })
  @IsOptional()
  @IsString()
  createdBy?: string;
}
