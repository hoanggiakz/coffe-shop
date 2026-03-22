import { IsString, IsNumber, Min, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateIngredientDto {
  @ApiProperty({ example: 'branch-hcm-01', required: false })
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiProperty({ example: 'menu_item_id_123', required: false })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiProperty({ example: 'Coffee Beans' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'kg' })
  @IsString()
  @IsNotEmpty()
  unit: string;

  @ApiProperty({ example: 100.5, required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  stock?: number;

  @ApiProperty({ example: 10.0, required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  minStock?: number;

  @ApiProperty({ example: 250000, required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  importPrice?: number;
}
