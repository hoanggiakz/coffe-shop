import { IsString, IsNotEmpty, IsOptional, MinLength } from 'class-validator';

export class CreateOptionGroupDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  name: string;

  @IsString()
  @IsOptional()
  menuItemId?: string;
}
