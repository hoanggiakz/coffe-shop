import { ApiProperty } from '@nestjs/swagger';
import { StockSource } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class BulkExportStockItemDto {
  @ApiProperty({ example: 'ingredient-id-123' })
  @IsString()
  @IsNotEmpty()
  ingredientId: string;

  @ApiProperty({ example: 2.5 })
  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  quantity: number;

  @ApiProperty({ example: 'menuItemId=abc123', required: false })
  @IsOptional()
  @IsString()
  note?: string;
}

export class BulkExportStockDto {
  @ApiProperty({ example: 'branch-hcm-01', required: false })
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiProperty({ type: [BulkExportStockItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkExportStockItemDto)
  items: BulkExportStockItemDto[];

  @ApiProperty({ enum: StockSource, example: StockSource.ORDER, required: false })
  @IsOptional()
  @IsEnum(StockSource)
  source?: StockSource;

  @ApiProperty({ example: 'Xuat tu dong cho don order-1', required: false })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiProperty({ example: 'order-1', required: false })
  @IsOptional()
  @IsString()
  referenceCode?: string;

  @ApiProperty({ example: 'kitchen-bot', required: false })
  @IsOptional()
  @IsString()
  createdBy?: string;
}
