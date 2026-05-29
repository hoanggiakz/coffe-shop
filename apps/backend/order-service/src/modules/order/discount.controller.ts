import { BadRequestException, Body, Controller, HttpCode, HttpStatus, Post, UsePipes, ValidationPipe } from '@nestjs/common';
import { OrderService } from './order.service';
import { ValidateDiscountDto } from './dto/validate-discount.dto';

@Controller('api/discount')
@UsePipes(new ValidationPipe({ transform: true }))
export class DiscountController {
  constructor(private readonly orderService: OrderService) {}

  @Post('validate')
  @HttpCode(HttpStatus.OK)
  async validate(@Body() dto: ValidateDiscountDto) {
    try {
      const result = await this.orderService.validatePromotion(
        dto.code,
        Number(dto.subtotal || 0),
        dto.menuItemIds || [],
        dto.branchId,
        dto.tableId,
      );
      return {
        valid: true,
        code: result.code,
        discountType: result.discountType,
        discountValue: result.discountValue,
        discountAmount: result.discountAmount,
        maxDiscount: result.maxDiscount,
        finalAmount: result.finalAmount,
        message: result.description || '',
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        return { valid: false, message: 'Mã giảm giá không tồn tại hoặc đã hết hạn' };
      }
      throw error;
    }
  }
}
