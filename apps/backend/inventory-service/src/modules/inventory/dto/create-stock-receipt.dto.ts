import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsNotEmpty, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

export class StockReceiptItemDto {
  @ApiProperty({ example: 'ingredient-id-123' })
  @IsString()
  @IsNotEmpty()
  ingredientId: string;

  @ApiProperty({ example: 10.5 })
  @IsNumber()
  @Min(0.01)
  quantity: number;

  @ApiProperty({ example: 230000, required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  unitPrice?: number;

  @ApiProperty({ example: 'Lo cafe A2', required: false })
  @IsOptional()
  @IsString()
  note?: string;
}

export class CreateStockReceiptDto {
  @ApiProperty({ example: 'branch-hcm-01', required: false })
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiProperty({ example: 'Nha cung cap ABC', required: false })
  @IsOptional()
  @IsString()
  supplier?: string;

  @ApiProperty({ example: 'Nhap hang dau tuan', required: false })
  @IsOptional()
  @IsString()
  note?: string;

  @ApiProperty({ example: 'manager-1', required: false })
  @IsOptional()
  @IsString()
  createdBy?: string;

  @ApiProperty({ type: [StockReceiptItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StockReceiptItemDto)
  items: StockReceiptItemDto[];
}
