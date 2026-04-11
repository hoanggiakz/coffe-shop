import { IsNotEmpty, IsString } from 'class-validator';
import { StaffUpdateOrderItemsDto } from './staff-update-order-items.dto';

export class CustomerUpdateOrderItemsDto extends StaffUpdateOrderItemsDto {
  @IsString()
  @IsNotEmpty()
  tableId: string;
}
