import { IsArray, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class ValidateDiscountDto {
  @IsString()
  @IsNotEmpty()
  code: string;

  @IsNumber()
  @Min(0)
  subtotal: number;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  tableId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  menuItemIds?: string[];
}

