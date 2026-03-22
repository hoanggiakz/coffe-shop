import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class UpdateIngredientDto {
  @ApiProperty({ example: 'Arabica Beans', required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ example: 'kg', required: false })
  @IsOptional()
  @IsString()
  unit?: string;

  @ApiProperty({ example: 25, required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  minStock?: number;

  @ApiProperty({ example: 220000, required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  importPrice?: number;

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
