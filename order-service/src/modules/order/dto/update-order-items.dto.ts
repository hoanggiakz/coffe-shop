import { IsArray, IsNotEmpty, IsString, IsNumber, IsPositive, Min, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class OrderItemDto {
  @ApiProperty({ example: 'menu_123', description: 'Menu item ID' })
  @IsString()
  @IsNotEmpty()
  menuItemId: string;

  @ApiProperty({ example: 2 })
  @IsNumber()
  @IsPositive()
  @Min(1)
  quantity: number;

  @ApiProperty({ example: 5.5 })
  @IsNumber()
  @IsPositive()
  price: number;

  @ApiProperty({ example: 'Less ice', required: false })
  @IsOptional()
  @IsString()
  note?: string;
}

export class UpdateOrderItemsDto {
  @ApiProperty({ type: [OrderItemDto] })
  @IsArray()
  @IsNotEmpty()
  items: OrderItemDto[];
}

