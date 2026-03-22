import { IsString, IsOptional, MinLength } from 'class-validator';

export class UpdateCategoryDto {
  @IsString()
  @IsOptional()
  @MinLength(3)
  name?: string;
}
