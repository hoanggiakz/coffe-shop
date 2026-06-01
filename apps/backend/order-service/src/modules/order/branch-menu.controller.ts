import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Headers, HttpCode, HttpStatus, Param, Post, Put, Query } from '@nestjs/common';
import { OrderService } from './order.service';

@Controller('api/branches')
export class BranchMenuController {
  constructor(private readonly orderService: OrderService) {}

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

  @Get(':branchId/menu')
  getBranchMenu(
    @Param('branchId') branchId: string,
    @Query('tableId') tableId?: string,
  ) {
    return this.orderService.getBranchMenu(branchId, tableId);
  }

  @Get(':branchId/orders')
  getBranchOrders(
    @Param('branchId') branchId: string,
    @Query('tableId') tableId?: string,
    @Query('status') status?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Headers('x-actor-role') actorRole?: string,
    @Headers('x-actor-branch-id') actorBranchId?: string,
  ) {
    const role = this.assertRoleAllowed(actorRole, ['ADMIN', 'MANAGER', 'WAITER', 'BARISTA', 'STAFF']);
    this.assertBranchScope(role, actorBranchId, branchId);
    return this.orderService.findByBranch(branchId, { tableId, status, dateFrom, dateTo });
  }

  @Get(':branchId/orders/:orderId')
  getBranchOrderDetail(
    @Param('branchId') branchId: string,
    @Param('orderId') orderId: string,
    @Headers('x-actor-role') actorRole?: string,
    @Headers('x-actor-branch-id') actorBranchId?: string,
  ) {
    const role = this.assertRoleAllowed(actorRole, ['ADMIN', 'MANAGER', 'WAITER', 'BARISTA', 'STAFF']);
    this.assertBranchScope(role, actorBranchId, branchId);
    return this.orderService.findOneByBranch(branchId, orderId);
  }

  @Get(':branchId/kds')
  getKdsQueue(
    @Param('branchId') branchId: string,
    @Query('limit') limit?: string,
    @Headers('x-actor-role') actorRole?: string,
    @Headers('x-actor-branch-id') actorBranchId?: string,
  ) {
    const role = this.assertRoleAllowed(actorRole, ['ADMIN', 'MANAGER', 'BARISTA']);
    this.assertBranchScope(role, actorBranchId, branchId);
    const parsed = limit ? Number(limit) : undefined;
    if (parsed !== undefined && (!Number.isFinite(parsed) || parsed <= 0)) {
      throw new BadRequestException('limit khong hop le');
    }
    return this.orderService.getKdsQueueByBranch(branchId, { limit: parsed });
  }

  @Post(':branchId/cart/validate')
  @HttpCode(HttpStatus.OK)
  validateBranchCart(
    @Param('branchId') branchId: string,
    @Body() body?: { items?: Array<{ branchMenuItemId?: string; menuItemId?: string; quantity?: number; unitPrice?: number }> },
  ) {
    return this.orderService.validateBranchCart(branchId, body?.items || []);
  }

  @Post(':branchId/menu/items/:itemId')
  @HttpCode(HttpStatus.CREATED)
  activateItem(
    @Param('branchId') branchId: string,
    @Param('itemId') itemId: string,
    @Body() body?: { price?: number; is_available?: boolean; display_order?: number; custom_options?: any },
    @Headers('x-actor-role') actorRole?: string,
    @Headers('x-actor-branch-id') actorBranchId?: string,
  ) {
    return this.orderService.activateBranchMenuItem(
      branchId,
      itemId,
      body || {},
      { role: actorRole, branchId: actorBranchId },
    );
  }

  @Put(':branchId/menu/items/:itemId')
  updateItem(
    @Param('branchId') branchId: string,
    @Param('itemId') itemId: string,
    @Body() body: { price?: number; is_available?: boolean; display_order?: number; custom_options?: any },
    @Headers('x-actor-role') actorRole?: string,
    @Headers('x-actor-branch-id') actorBranchId?: string,
  ) {
    return this.orderService.updateBranchMenuItem(
      branchId,
      itemId,
      body || {},
      { role: actorRole, branchId: actorBranchId },
    );
  }

  @Delete(':branchId/menu/items/:itemId')
  @HttpCode(HttpStatus.OK)
  removeItem(
    @Param('branchId') branchId: string,
    @Param('itemId') itemId: string,
    @Headers('x-actor-role') actorRole?: string,
    @Headers('x-actor-branch-id') actorBranchId?: string,
  ) {
    return this.orderService.removeBranchMenuItem(
      branchId,
      itemId,
      { role: actorRole, branchId: actorBranchId },
    );
  }
}
