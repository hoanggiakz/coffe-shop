import { IsString, IsNotEmpty, IsNumber, IsPositive, MinLength } from 'class-validator';

export class CreateOptionValueDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  name: string;

  @IsNumber()
  @IsPositive()
  price: number;

  @IsString()
  @IsNotEmpty()
  groupId: string;
}
