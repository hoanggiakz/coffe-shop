import { Type } from 'class-transformer';
import { IsArray, IsInt, IsNotEmpty, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

export class StaffOrderItemInputDto {
  @IsString()
  @IsNotEmpty()
  menuItemId: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  options?: string;
}

export class StaffUpdateOrderItemsDto {
  @IsArray()
  @IsNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => StaffOrderItemInputDto)
  items: StaffOrderItemInputDto[];
}
