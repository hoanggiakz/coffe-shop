import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class AdjustStockDto {
  @ApiProperty({ example: 'branch-hcm-01', required: false })
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiProperty({ example: 'ingredient-id-123' })
  @IsString()
  @IsNotEmpty()
  ingredientId: string;

  @ApiProperty({ example: 12.5, description: 'So luong ton kho thuc te sau kiem ke' })
  @IsNumber()
  @Min(0)
  actualStock: number;

  @ApiProperty({ example: 'Kiem ke cuoi ngay', required: false })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiProperty({ example: 'manager-1', required: false })
  @IsOptional()
  @IsString()
  createdBy?: string;
}
