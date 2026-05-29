import { IsString, IsNotEmpty, IsArray, IsOptional, IsNumber, IsPositive, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class SelectedOptionValueDto {
  @IsString() @IsNotEmpty()
  name: string;

  @IsNumber()
  priceModifier: number;
}

export class SelectedOptionsDto {
  @IsOptional() @ValidateNested() @Type(() => SelectedOptionValueDto)
  size?: SelectedOptionValueDto;

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => SelectedOptionValueDto)
  toppings?: SelectedOptionValueDto[];

  @IsOptional() @IsString()
  note?: string;
}

export class OrderItemDto {
  @IsOptional() @IsString()
  branchMenuItemId?: string;

  @IsOptional() @IsString()
  menuItemId?: string;

  @IsNumber() @IsPositive()
  quantity: number;

  @IsOptional() @IsString()
  note?: string;

  @IsOptional() @IsString()
  options?: string; // JSON string cho tuỳ chọn (size, sugar, ice…)

  @IsOptional() @ValidateNested() @Type(() => SelectedOptionsDto)
  selectedOptions?: SelectedOptionsDto;
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

  @IsOptional() @IsString()
  discountCode?: string;

  @IsOptional() @IsString()
  paymentMethod?: string;

  @IsArray() @IsNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];
}

