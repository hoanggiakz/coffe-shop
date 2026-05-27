import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Query, UsePipes, ValidationPipe, HttpCode, HttpStatus, Headers } from '@nestjs/common';
import { OrderService } from './order.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { TableActionDto } from './dto/table-action.dto';
import { StaffUpdateOrderItemsDto } from './dto/staff-update-order-items.dto';
import { CustomerUpdateOrderItemsDto } from './dto/customer-update-order-items.dto';
import { CreateMenuCategoryDto, UpdateMenuCategoryDto } from './dto/menu-category.dto';
import {
  CreateMenuOptionGroupDto,
  CreateMenuOptionValueDto,
  UpdateMenuOptionGroupDto,
  UpdateMenuOptionValueDto,
} from './dto/menu-option.dto';
import { CreateMenuItemManagementDto, UpdateMenuItemManagementDto } from './dto/menu-item-management.dto';
import { CreatePromotionDto, QueryPromotionDto, UpdatePromotionDto } from './dto/promotion.dto';

@Controller('api/orders')
@UsePipes(new ValidationPipe({ transform: true }))
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Get('health')
  health() {
    return {
      service: 'order-service',
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  // ── Menu ────────────────────────────────────────────────
  @Get('menu')
  getMenu(
    @Query('branchId') branchId?: string,
    @Query('tableId') tableId?: string,
  ) {
    return this.orderService.getMenu({ branchId, tableId });
  }

  @Get('branches/:branchId/menu')
  getBranchMenu(
    @Param('branchId') branchId: string,
    @Query('tableId') tableId?: string,
  ) {
    return this.orderService.getBranchMenu(branchId, tableId);
  }

  @Post('branches/:branchId/menu/items/:itemId')
  @HttpCode(HttpStatus.CREATED)
  activateBranchMenuItem(
    @Param('branchId') branchId: string,
    @Param('itemId') itemId: string,
    @Body() body?: { price?: number; is_available?: boolean; display_order?: number; custom_options?: any },
    @Headers('x-actor-role') actorRole?: string,
    @Headers('x-actor-branch-id') actorBranchId?: string,
  ) {
    return this.orderService.activateBranchMenuItem(branchId, itemId, body || {}, {
      role: actorRole,
      branchId: actorBranchId,
    });
  }

  @Put('branches/:branchId/menu/items/:itemId')
  updateBranchMenuItem(
    @Param('branchId') branchId: string,
    @Param('itemId') itemId: string,
    @Body() body: { price?: number; is_available?: boolean; display_order?: number; custom_options?: any },
    @Headers('x-actor-role') actorRole?: string,
    @Headers('x-actor-branch-id') actorBranchId?: string,
  ) {
    return this.orderService.updateBranchMenuItem(branchId, itemId, body || {}, {
      role: actorRole,
      branchId: actorBranchId,
    });
  }

  @Delete('branches/:branchId/menu/items/:itemId')
  @HttpCode(HttpStatus.OK)
  removeBranchMenuItem(
    @Param('branchId') branchId: string,
    @Param('itemId') itemId: string,
    @Headers('x-actor-role') actorRole?: string,
    @Headers('x-actor-branch-id') actorBranchId?: string,
  ) {
    return this.orderService.removeBranchMenuItem(branchId, itemId, { role: actorRole, branchId: actorBranchId });
  }

  // ── Admin Menu Management (M-04..M-06) ──────────────────
  @Get('admin/menu/categories')
  listCategories(
    @Query('includeInactive') includeInactive?: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.orderService.listMenuCategories({
      includeInactive: includeInactive === 'true',
      branchId,
    });
  }

  @Post('admin/menu/categories')
  @HttpCode(HttpStatus.CREATED)
  createCategory(@Body() dto: CreateMenuCategoryDto) {
    return this.orderService.createMenuCategory(dto);
  }

  @Patch('admin/menu/categories/:id')
  updateCategory(@Param('id') id: string, @Body() dto: UpdateMenuCategoryDto) {
    return this.orderService.updateMenuCategory(id, dto);
  }

  @Delete('admin/menu/categories/:id')
  @HttpCode(HttpStatus.OK)
  deleteCategory(@Param('id') id: string) {
    return this.orderService.deleteMenuCategory(id);
  }

  @Get('admin/menu/options/groups')
  listOptionGroups(
    @Query('includeInactive') includeInactive?: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.orderService.listMenuOptionGroups({
      includeInactive: includeInactive === 'true',
      branchId,
    });
  }

  @Post('admin/menu/options/groups')
  @HttpCode(HttpStatus.CREATED)
  createOptionGroup(@Body() dto: CreateMenuOptionGroupDto) {
    return this.orderService.createMenuOptionGroup(dto);
  }

  @Patch('admin/menu/options/groups/:id')
  updateOptionGroup(@Param('id') id: string, @Body() dto: UpdateMenuOptionGroupDto) {
    return this.orderService.updateMenuOptionGroup(id, dto);
  }

  @Delete('admin/menu/options/groups/:id')
  @HttpCode(HttpStatus.OK)
  deleteOptionGroup(@Param('id') id: string) {
    return this.orderService.deleteMenuOptionGroup(id);
  }

  @Post('admin/menu/options/groups/:groupId/values')
  @HttpCode(HttpStatus.CREATED)
  createOptionValue(@Param('groupId') groupId: string, @Body() dto: CreateMenuOptionValueDto) {
    return this.orderService.createMenuOptionValue(groupId, dto);
  }

  @Patch('admin/menu/options/values/:id')
  updateOptionValue(@Param('id') id: string, @Body() dto: UpdateMenuOptionValueDto) {
    return this.orderService.updateMenuOptionValue(id, dto);
  }

  @Delete('admin/menu/options/values/:id')
  @HttpCode(HttpStatus.OK)
  deleteOptionValue(@Param('id') id: string) {
    return this.orderService.deleteMenuOptionValue(id);
  }

  @Get('admin/menu/items')
  listMenuItems(
    @Query('keyword') keyword?: string,
    @Query('categoryId') categoryId?: string,
    @Query('includeInactive') includeInactive?: string,
    @Query('branchId') branchId?: string,
    @Headers('x-actor-role') actorRole?: string,
    @Headers('x-actor-branch-id') actorBranchId?: string,
  ) {
    return this.orderService.listMenuItemsForAdmin({
      keyword,
      categoryId,
      includeInactive: includeInactive === 'true',
      branchId,
    }, { role: actorRole, branchId: actorBranchId });
  }

  @Post('admin/menu/items')
  @HttpCode(HttpStatus.CREATED)
  createMenuItem(
    @Body() dto: CreateMenuItemManagementDto,
    @Headers('x-actor-role') actorRole?: string,
    @Headers('x-actor-branch-id') actorBranchId?: string,
  ) {
    return this.orderService.createMenuItemForAdmin(dto, { role: actorRole, branchId: actorBranchId });
  }

  @Patch('admin/menu/items/:id')
  updateMenuItem(
    @Param('id') id: string,
    @Body() dto: UpdateMenuItemManagementDto,
    @Headers('x-actor-role') actorRole?: string,
    @Headers('x-actor-branch-id') actorBranchId?: string,
  ) {
    return this.orderService.updateMenuItemForAdmin(id, dto, { role: actorRole, branchId: actorBranchId });
  }

  @Delete('admin/menu/items/:id')
  @HttpCode(HttpStatus.OK)
  deleteMenuItem(
    @Param('id') id: string,
    @Headers('x-actor-role') actorRole?: string,
    @Headers('x-actor-branch-id') actorBranchId?: string,
  ) {
    return this.orderService.deleteMenuItemForAdmin(id, { role: actorRole, branchId: actorBranchId });
  }

  // ── Promotion Management (M-17..M-18) ───────────────────
  @Get('admin/promotions')
  listPromotions(@Query() query: QueryPromotionDto) {
    return this.orderService.listPromotions(query);
  }

  @Post('admin/promotions')
  @HttpCode(HttpStatus.CREATED)
  createPromotion(@Body() dto: CreatePromotionDto) {
    return this.orderService.createPromotion(dto);
  }

  @Patch('admin/promotions/:id')
  updatePromotion(@Param('id') id: string, @Body() dto: UpdatePromotionDto) {
    return this.orderService.updatePromotion(id, dto);
  }

  @Post('admin/promotions/:id/disable')
  @HttpCode(HttpStatus.OK)
  disablePromotion(@Param('id') id: string) {
    return this.orderService.disablePromotion(id);
  }

  // ── Orders ──────────────────────────────────────────────
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateOrderDto) {
    return this.orderService.create(dto);
  }

  @Get()
  findAll(
    @Query('tableId') tableId?: string,
    @Query('status') status?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.orderService.findAll({ tableId, status, dateFrom, dateTo, branchId });
  }

  @Get('/branches/:branchId/orders')
  findAllByBranch(
    @Param('branchId') branchId: string,
    @Query('tableId') tableId?: string,
    @Query('status') status?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.orderService.findByBranch(branchId, { tableId, status, dateFrom, dateTo });
  }

  @Post('table-actions/transfer')
  @HttpCode(HttpStatus.OK)
  transferOrMergeTables(@Body() dto: TableActionDto) {
    return this.orderService.transferOrMergeTables(dto);
  }

  @Get('history')
  getCustomerHistory(
    @Query('customerId') customerId?: string,
    @Query('email') email?: string,
    @Query('phone') phone?: string,
    @Query('limit') limit?: string,
  ) {
    return this.orderService.findCustomerHistory({
      customerId,
      email,
      phone,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('recommendations')
  getCustomerRecommendations(
    @Query('customerId') customerId?: string,
    @Query('email') email?: string,
    @Query('phone') phone?: string,
    @Query('branchId') branchId?: string,
    @Query('tableId') tableId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.orderService.getCustomerRecommendations({
      customerId,
      email,
      phone,
      branchId,
      tableId,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('promotions/validate')
  validatePromotion(
    @Query('code') code?: string,
    @Query('subtotal') subtotal?: string,
    @Query('menuItemIds') menuItemIdsRaw?: string,
    @Query('branchId') branchId?: string,
    @Query('tableId') tableId?: string,
  ) {
    if (!code) {
      return { valid: false, message: 'Missing code' };
    }
    const subtotalAmount = Number(subtotal || '0');
    const menuItemIds = String(menuItemIdsRaw || '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
    return this.orderService.validatePromotion(code, subtotalAmount, menuItemIds, branchId, tableId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.orderService.findOne(id);
  }

  @Get('/branches/:branchId/orders/:orderId')
  findOneByBranch(
    @Param('branchId') branchId: string,
    @Param('orderId') orderId: string,
  ) {
    return this.orderService.findOneByBranch(branchId, orderId);
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateOrderStatusDto) {
    return this.orderService.updateStatus(id, dto);
  }

  @Patch(':id/items')
  updateItems(@Param('id') id: string, @Body() dto: StaffUpdateOrderItemsDto) {
    return this.orderService.updateOrderItems(id, dto);
  }

  @Post(':id/items')
  async addItems(@Param('id') id: string, @Body() dto: { items?: any[] }) {
    const order = await this.orderService.findOne(id) as any;
    const mergedItems = [...(order?.orderItems || []), ...(dto?.items || [])].map((item: any) => ({
      menuItemId: item.menuItemId,
      quantity: item.quantity,
      note: item.note,
      options: item.options,
    }));
    return this.orderService.updateOrderItems(id, { items: mergedItems } as any);
  }

  @Patch(':id/items/:itemId')
  async patchOneItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() payload: { quantity?: number; note?: string; options?: string },
  ) {
    const order = await this.orderService.findOne(id) as any;
    const mapped = (order?.orderItems || []).map((item: any) =>
      item.id === itemId
        ? {
            menuItemId: item.menuItemId,
            quantity: payload.quantity ?? item.quantity,
            note: payload.note ?? item.note,
            options: payload.options ?? item.options,
          }
        : {
            menuItemId: item.menuItemId,
            quantity: item.quantity,
            note: item.note,
            options: item.options,
          },
    );
    return this.orderService.updateOrderItems(id, { items: mapped } as any);
  }

  @Delete(':id/items/:itemId')
  async removeOneItem(@Param('id') id: string, @Param('itemId') itemId: string) {
    const order = await this.orderService.findOne(id) as any;
    const mapped = (order?.orderItems || [])
      .filter((item: any) => item.id !== itemId)
      .map((item: any) => ({
        menuItemId: item.menuItemId,
        quantity: item.quantity,
        note: item.note,
        options: item.options,
      }));
    return this.orderService.updateOrderItems(id, { items: mapped } as any);
  }

  @Patch(':id/customer-items')
  updateCustomerItems(@Param('id') id: string, @Body() dto: CustomerUpdateOrderItemsDto) {
    return this.orderService.updateCustomerOrderItems(id, dto);
  }

  // ── KDS: cập nhật trạng thái từng món ──────────────────
  @Patch(':id/items/:itemId/status')
  updateItemStatus(
    @Param('id') orderId: string,
    @Param('itemId') itemId: string,
    @Body('status') status: string,
  ) {
    return this.orderService.updateItemStatus(orderId, itemId, status);
  }

  @Patch(':id/items/batch-status')
  async updateItemBatchStatus(
    @Param('id') orderId: string,
    @Body() body: { items?: Array<{ itemId: string; status: string }> },
  ) {
    const items = Array.isArray(body?.items) ? body.items : [];
    const results = [];
    for (const item of items) {
      results.push(await this.orderService.updateItemStatus(orderId, item.itemId, item.status));
    }
    return { updated: results.length, items: results };
  }

  @Patch(':id/cancel')
  cancelOrder(@Param('id') orderId: string, @Body('reason') reason?: string) {
    return this.orderService.cancelOrder(orderId, reason);
  }

  @Get(':id/bill')
  getBill(@Param('id') orderId: string) {
    return this.orderService.getOrderBill(orderId);
  }

  @Post(':id/payment')
  confirmPayment(
    @Param('id') orderId: string,
    @Body() payload?: { method?: string; amount?: number },
  ) {
    return this.orderService.confirmOrderPayment(orderId, payload);
  }

  @Post(':id/discount')
  applyDiscount(
    @Param('id') orderId: string,
    @Body() payload?: { discount?: number; reason?: string },
  ) {
    return this.orderService.applyOrderDiscount(orderId, payload);
  }
}


