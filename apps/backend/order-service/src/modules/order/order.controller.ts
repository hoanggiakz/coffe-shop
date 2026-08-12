import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Query, UsePipes, ValidationPipe, HttpCode, HttpStatus, Headers, BadRequestException, ForbiddenException, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
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
import { KafkaService } from '../../kafka/kafka.service';

@Controller('api/orders')
@UsePipes(new ValidationPipe({ transform: true }))
export class OrderController {
  constructor(
    private readonly orderService: OrderService,
    private readonly kafkaService: KafkaService,
  ) {}

  private normalizeRole(role?: string | null) {
    return String(role || '').trim().toUpperCase();
  }

  private assertRoleAllowed(role: string | undefined, allowed: string[]) {
    const normalized = this.normalizeRole(role);
    if (!normalized || !allowed.includes(normalized)) {
      throw new ForbiddenException('FORBIDDEN_ROLE');
    }
    return normalized;
  }

  private assertBranchScope(role: string, actorBranchId: string | undefined, targetBranchId?: string | null) {
    if (role === 'ADMIN') return;
    const actorBranch = String(actorBranchId || '').trim();
    if (!actorBranch) throw new ForbiddenException('MISSING_BRANCH_SCOPE');
    if (targetBranchId && actorBranch !== String(targetBranchId).trim()) {
      throw new ForbiddenException('FORBIDDEN_BRANCH_SCOPE');
    }
  }

  private async assertOrderScope(role: string, actorBranchId: string | undefined, orderId: string) {
    if (role === 'ADMIN') return;
    const actorBranch = String(actorBranchId || '').trim();
    if (!actorBranch) throw new ForbiddenException('MISSING_BRANCH_SCOPE');
    const order = await this.orderService.findOne(orderId) as any;
    if (String(order?.branchId || '') !== actorBranch) {
      throw new ForbiddenException('FORBIDDEN_BRANCH_SCOPE');
    }
  }

  @Get('health')
  health() {
    return {
      service: 'order-service',
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  ready() {
    const kafka = this.kafkaService.readiness();
    const ready = kafka.required ? kafka.connected : kafka.configured ? kafka.connected : true;
    return {
      service: 'order-service',
      status: ready ? 'ready' : 'not-ready',
      checks: { kafka },
      timestamp: new Date().toISOString(),
    };
  }

  @Post('cart/telemetry')
  @HttpCode(HttpStatus.OK)
  recordCartTelemetry(
    @Body()
    body?: {
      tableId?: string;
      orderId?: string;
      branchId?: string;
      localVersion?: string;
      incomingVersion?: string;
      action?: string;
      reason?: string;
      source?: string;
      detail?: Record<string, any>;
    },
  ) {
    return this.orderService.recordCartConflictTelemetry(body || {});
  }

  @Get('cart/telemetry')
  listCartTelemetry(@Query('limit') limit?: string) {
    return this.orderService.listCartConflictTelemetry(Number(limit || 100));
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

  @Post('admin/menu/images/upload')
  @UseInterceptors(FileInterceptor('file'))
  @HttpCode(HttpStatus.CREATED)
  uploadMenuImage(@UploadedFile() file?: any) {
    if (!file) {
      throw new BadRequestException('Thieu file anh');
    }
    if (!String(file.mimetype || '').startsWith('image/')) {
      throw new BadRequestException('Chi chap nhan file anh');
    }
    if ((file.size || 0) > 5 * 1024 * 1024) {
      throw new BadRequestException('Anh toi da 5MB');
    }
    const base64 = file.buffer.toString('base64');
    const dataUrl = `data:${file.mimetype};base64,${base64}`;
    return {
      dataUrl,
      mimeType: file.mimetype,
      size: file.size,
      fileName: file.originalname,
    };
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
  create(@Body() dto: CreateOrderDto, @Headers('idempotency-key') idempotencyKey?: string) {
    return this.orderService.create(dto, idempotencyKey);
  }

  @Get()
  findAll(
    @Query('tableId') tableId?: string,
    @Query('status') status?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('branchId') branchId?: string,
    @Headers('x-actor-role') actorRole?: string,
    @Headers('x-actor-branch-id') actorBranchId?: string,
  ) {
    const role = this.assertRoleAllowed(actorRole, ['ADMIN', 'MANAGER', 'WAITER', 'BARISTA']);
    this.assertBranchScope(role, actorBranchId, branchId || actorBranchId);
    return this.orderService.findAll({ tableId, status, dateFrom, dateTo, branchId });
  }

  @Get('/branches/:branchId/orders')
  findAllByBranch(
    @Param('branchId') branchId: string,
    @Query('tableId') tableId?: string,
    @Query('status') status?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Headers('x-actor-role') actorRole?: string,
    @Headers('x-actor-branch-id') actorBranchId?: string,
  ) {
    const role = this.assertRoleAllowed(actorRole, ['ADMIN', 'MANAGER', 'WAITER', 'BARISTA']);
    this.assertBranchScope(role, actorBranchId, branchId);
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

  @Get('tables/:tableId/active')
  hasActiveOrdersForTable(@Param('tableId') tableId: string) {
    return this.orderService.hasActiveOrdersForTable(tableId);
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
    // Keep compatibility for internal service calls; prefer /branches/:branchId/orders/:orderId for staff flows.
    return this.orderService.findOne(id);
  }

  @Get('/branches/:branchId/orders/:orderId')
  findOneByBranch(
    @Param('branchId') branchId: string,
    @Param('orderId') orderId: string,
    @Headers('x-actor-role') actorRole?: string,
    @Headers('x-actor-branch-id') actorBranchId?: string,
  ) {
    const role = this.assertRoleAllowed(actorRole, ['ADMIN', 'MANAGER', 'WAITER', 'BARISTA']);
    this.assertBranchScope(role, actorBranchId, branchId);
    return this.orderService.findOneByBranch(branchId, orderId);
  }

  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
    @Headers('x-actor-role') actorRole?: string,
    @Headers('x-actor-branch-id') actorBranchId?: string,
  ) {
    const role = this.assertRoleAllowed(actorRole, ['ADMIN', 'MANAGER', 'WAITER', 'BARISTA', 'STAFF']);
    await this.assertOrderScope(role, actorBranchId, id);
    return this.orderService.updateStatus(id, dto);
  }

  @Get(':id/status')
  async getStatus(
    @Param('id') id: string,
    @Headers('x-actor-role') actorRole?: string,
    @Headers('x-actor-branch-id') actorBranchId?: string,
  ) {
    const role = this.assertRoleAllowed(actorRole, ['ADMIN', 'MANAGER', 'WAITER', 'BARISTA']);
    await this.assertOrderScope(role, actorBranchId, id);
    const order = await this.orderService.findOne(id) as any;
    return {
      orderId: order.id,
      status: order.status,
      updatedAt: order.updatedAt,
    };
  }

  @Patch(':id/items')
  async updateItems(
    @Param('id') id: string,
    @Body() dto: StaffUpdateOrderItemsDto,
    @Headers('x-actor-role') actorRole?: string,
    @Headers('x-actor-branch-id') actorBranchId?: string,
  ) {
    const role = this.assertRoleAllowed(actorRole, ['ADMIN', 'MANAGER', 'WAITER']);
    await this.assertOrderScope(role, actorBranchId, id);
    return this.orderService.updateOrderItems(id, dto);
  }

  @Get(':id/items')
  async getOrderItems(
    @Param('id') id: string,
    @Headers('x-actor-role') actorRole?: string,
    @Headers('x-actor-branch-id') actorBranchId?: string,
  ) {
    const role = this.assertRoleAllowed(actorRole, ['ADMIN', 'MANAGER', 'WAITER', 'BARISTA']);
    await this.assertOrderScope(role, actorBranchId, id);
    const order = await this.orderService.findOne(id) as any;
    return order?.orderItems || [];
  }

  @Post(':id/items')
  async addItems(
    @Param('id') id: string,
    @Body() dto: { items?: any[] },
    @Headers('x-actor-role') actorRole?: string,
    @Headers('x-actor-branch-id') actorBranchId?: string,
  ) {
    const role = this.assertRoleAllowed(actorRole, ['ADMIN', 'MANAGER', 'WAITER']);
    await this.assertOrderScope(role, actorBranchId, id);
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
    @Headers('x-actor-role') actorRole?: string,
    @Headers('x-actor-branch-id') actorBranchId?: string,
  ) {
    const role = this.assertRoleAllowed(actorRole, ['ADMIN', 'MANAGER', 'WAITER']);
    await this.assertOrderScope(role, actorBranchId, id);
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
  async removeOneItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Headers('x-actor-role') actorRole?: string,
    @Headers('x-actor-branch-id') actorBranchId?: string,
  ) {
    const role = this.assertRoleAllowed(actorRole, ['ADMIN', 'MANAGER', 'WAITER']);
    await this.assertOrderScope(role, actorBranchId, id);
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
  async updateItemStatus(
    @Param('id') orderId: string,
    @Param('itemId') itemId: string,
    @Body('status') status: string,
    @Headers('x-actor-role') actorRole?: string,
    @Headers('x-actor-branch-id') actorBranchId?: string,
  ) {
    const role = this.assertRoleAllowed(actorRole, ['ADMIN', 'MANAGER', 'BARISTA']);
    await this.assertOrderScope(role, actorBranchId, orderId);
    return this.orderService.updateItemStatus(orderId, itemId, status);
  }

  @Patch(':id/items/batch-status')
  async updateItemBatchStatus(
    @Param('id') orderId: string,
    @Body() body: { items?: Array<{ itemId: string; status: string }> },
    @Headers('x-actor-role') actorRole?: string,
    @Headers('x-actor-branch-id') actorBranchId?: string,
  ) {
    const role = this.assertRoleAllowed(actorRole, ['ADMIN', 'MANAGER', 'BARISTA']);
    await this.assertOrderScope(role, actorBranchId, orderId);
    const items = Array.isArray(body?.items) ? body.items : [];
    const results = [];
    for (const item of items) {
      results.push(await this.orderService.updateItemStatus(orderId, item.itemId, item.status));
    }
    return { updated: results.length, items: results };
  }

  @Patch(':id/cancel')
  async cancelOrder(
    @Param('id') orderId: string,
    @Body('reason') reason?: string,
    @Headers('x-actor-role') actorRole?: string,
    @Headers('x-actor-branch-id') actorBranchId?: string,
  ) {
    const role = this.assertRoleAllowed(actorRole, ['ADMIN', 'MANAGER']);
    await this.assertOrderScope(role, actorBranchId, orderId);
    return this.orderService.cancelOrder(orderId, reason);
  }

  @Get(':id/bill')
  async getBill(
    @Param('id') orderId: string,
    @Headers('x-actor-role') actorRole?: string,
    @Headers('x-actor-branch-id') actorBranchId?: string,
  ) {
    const normalized = this.normalizeRole(actorRole);
    if (normalized) {
      const role = this.assertRoleAllowed(normalized, ['ADMIN', 'MANAGER', 'WAITER']);
      await this.assertOrderScope(role, actorBranchId, orderId);
    }
    return this.orderService.getOrderBill(orderId);
  }

  @Post(':id/payment')
  async confirmPayment(
    @Param('id') orderId: string,
    @Body() payload?: { method?: string; amount?: number },
    @Headers('x-actor-role') actorRole?: string,
    @Headers('x-actor-branch-id') actorBranchId?: string,
  ) {
    const role = this.assertRoleAllowed(actorRole, ['ADMIN', 'MANAGER', 'WAITER', 'STAFF']);
    await this.assertOrderScope(role, actorBranchId, orderId);
    return this.orderService.confirmOrderPayment(orderId, payload);
  }

  @Post(':id/discount')
  async applyDiscount(
    @Param('id') orderId: string,
    @Body() payload?: { discount?: number; reason?: string },
    @Headers('x-actor-role') actorRole?: string,
    @Headers('x-actor-branch-id') actorBranchId?: string,
  ) {
    const role = this.assertRoleAllowed(actorRole, ['ADMIN', 'MANAGER']);
    await this.assertOrderScope(role, actorBranchId, orderId);
    return this.orderService.applyOrderDiscount(orderId, payload);
  }
}


