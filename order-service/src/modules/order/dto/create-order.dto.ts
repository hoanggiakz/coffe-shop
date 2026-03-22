import { IsString, IsNotEmpty, IsArray, IsOptional, IsNumber, IsPositive, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class OrderItemDto {
  @IsString() @IsNotEmpty()
  menuItemId: string;

  @IsNumber() @IsPositive()
  quantity: number;

  @IsOptional() @IsString()
  note?: string;

  @IsOptional() @IsString()
  options?: string; // JSON string cho tuỳ chọn (size, sugar, ice…)
}

export class CreateOrderDto {
  @IsString() @IsNotEmpty()
  tableId: string;

  @IsOptional() @IsString()
  branchId?: string;

  @IsOptional() @IsString()
  customerId?: string;

  @IsOptional() @IsString()
  customerEmail?: string;

  @IsOptional() @IsString()
  customerName?: string;

  @IsOptional() @IsString()
  customerPhone?: string;

  @IsOptional() @IsString()
  promoCode?: string;

  @IsArray() @IsNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];
}

