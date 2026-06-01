import {
  Body,
  Controller,
  ForbiddenException,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CreateIngredientDto } from './dto/create-ingredient.dto';
import { UpdateIngredientDto } from './dto/update-ingredient.dto';
import {
  CreatePurchaseOrderDto,
  InventoryAdjustDto,
  QueryExpiryAlertDto,
  QueryInventoryReportDto,
  QueryInventoryMovementsDto,
  QueryPurchaseOrderDto,
  UpdateBranchInventoryPolicyDto,
  UpdatePurchaseOrderDto,
  UpsertBranchRecipeDto,
} from './dto/spec-inventory.dto';
import { InventoryService } from './inventory.service';
import { Response } from 'express';

@ApiTags('inventory-spec')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class InventorySpecController {
  constructor(private readonly inventoryService: InventoryService) {}

  private actorRole(req: any) {
    const roles = Array.isArray(req?.user?.roles)
      ? req.user.roles.map((role: unknown) => String(role).toUpperCase())
      : [];
    if (roles.includes('ADMIN')) return 'ADMIN';
    if (roles.includes('MANAGER')) return 'MANAGER';
    if (roles.includes('INTERNAL_SERVICE')) return 'INTERNAL_SERVICE';
    return '';
  }

  private actorBranchId(req: any) {
    return String(
      req?.user?.branchId ||
        req?.user?.branch_id ||
        req?.headers?.['x-actor-branch-id'] ||
        req?.headers?.['x-branch-id'] ||
        '',
    ).trim();
  }

  private requireRoles(req: any, allowed: Array<'ADMIN' | 'MANAGER'>) {
    const role = this.actorRole(req);
    if (role === 'INTERNAL_SERVICE') return;
    if (!allowed.includes(role as 'ADMIN' | 'MANAGER')) {
      throw new ForbiddenException('Insufficient role for this endpoint');
    }
  }

  private assertBranchScope(req: any, branchId: string) {
    const role = this.actorRole(req);
    if (role === 'ADMIN' || role === 'INTERNAL_SERVICE') return;
    const actorBranchId = this.actorBranchId(req);
    if (!actorBranchId || actorBranchId !== String(branchId || '').trim()) {
      throw new ForbiddenException('Manager can only access inventory in own branch');
    }
  }

  private actor(req: any) {
    return String(req?.user?.email || req?.user?.sub || '').trim() || 'system';
  }

  @Get('branches/:branchId/inventory/ingredients')
  listIngredients(@Req() req: any, @Param('branchId') branchId: string) {
    this.requireRoles(req, ['ADMIN', 'MANAGER']);
    this.assertBranchScope(req, branchId);
    return this.inventoryService.findAllIngredients({ branchId, includeInactive: 'false' });
  }

  @Post('branches/:branchId/inventory/ingredients')
  createIngredient(@Req() req: any, @Param('branchId') branchId: string, @Body() dto: CreateIngredientDto) {
    this.requireRoles(req, ['ADMIN', 'MANAGER']);
    this.assertBranchScope(req, branchId);
    return this.inventoryService.createIngredient({ ...dto, branchId });
  }

  @Get('ingredients/:id')
  async getIngredient(@Req() req: any, @Param('id') id: string) {
    this.requireRoles(req, ['ADMIN', 'MANAGER']);
    const ingredient = await this.inventoryService.getIngredientById(id);
    this.assertBranchScope(req, ingredient.branchId);
    return ingredient;
  }

  @Put('ingredients/:id')
  async updateIngredient(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateIngredientDto) {
    this.requireRoles(req, ['ADMIN', 'MANAGER']);
    const ingredient = await this.inventoryService.getIngredientById(id);
    this.assertBranchScope(req, ingredient.branchId);
    return this.inventoryService.updateIngredient(id, dto);
  }

  @Patch('ingredients/:id/deactivate')
  async deactivateIngredient(@Req() req: any, @Param('id') id: string) {
    this.requireRoles(req, ['ADMIN']);
    const ingredient = await this.inventoryService.getIngredientById(id);
    this.assertBranchScope(req, ingredient.branchId);
    return this.inventoryService.deleteIngredient(id);
  }

  @Get('branches/:branchId/inventory/low-stock')
  lowStock(@Req() req: any, @Param('branchId') branchId: string) {
    this.requireRoles(req, ['ADMIN', 'MANAGER']);
    this.assertBranchScope(req, branchId);
    return this.inventoryService.listLowStock(branchId);
  }

  @Get('menu-items/:menuItemId/recipe')
  getDefaultRecipe(@Req() req: any, @Param('menuItemId') menuItemId: string) {
    this.requireRoles(req, ['ADMIN', 'MANAGER']);
    return this.inventoryService.getDefaultRecipe(menuItemId);
  }

  @Get('branches/:branchId/menu-items/:menuItemId/recipe')
  getBranchRecipe(@Req() req: any, @Param('branchId') branchId: string, @Param('menuItemId') menuItemId: string) {
    this.requireRoles(req, ['ADMIN', 'MANAGER']);
    this.assertBranchScope(req, branchId);
    return this.inventoryService.getMergedRecipe(branchId, menuItemId);
  }

  @Post('branches/:branchId/recipes')
  upsertRecipe(@Req() req: any, @Param('branchId') branchId: string, @Body() dto: UpsertBranchRecipeDto) {
    this.requireRoles(req, ['ADMIN', 'MANAGER']);
    this.assertBranchScope(req, branchId);
    return this.inventoryService.upsertBranchRecipe(branchId, dto);
  }

  @Put('recipes/:id')
  updateDefaultRecipe(@Req() req: any, @Param('id') id: string, @Body() dto: UpsertBranchRecipeDto) {
    this.requireRoles(req, ['ADMIN']);
    return this.inventoryService.updateDefaultRecipe(id, dto);
  }

  @Delete('branches/:branchId/recipes/:menuItemId')
  deleteBranchRecipe(@Req() req: any, @Param('branchId') branchId: string, @Param('menuItemId') menuItemId: string) {
    this.requireRoles(req, ['ADMIN', 'MANAGER']);
    this.assertBranchScope(req, branchId);
    return this.inventoryService.deleteBranchRecipe(branchId, menuItemId);
  }

  @Get('branches/:branchId/purchase-orders')
  listPurchaseOrders(@Req() req: any, @Param('branchId') branchId: string, @Query() query: QueryPurchaseOrderDto) {
    this.requireRoles(req, ['ADMIN', 'MANAGER']);
    this.assertBranchScope(req, branchId);
    return this.inventoryService.listPurchaseOrders(branchId, query);
  }

  @Post('branches/:branchId/purchase-orders')
  createPurchaseOrder(
    @Req() req: any,
    @Param('branchId') branchId: string,
    @Body() dto: CreatePurchaseOrderDto,
  ) {
    this.requireRoles(req, ['ADMIN', 'MANAGER']);
    this.assertBranchScope(req, branchId);
    return this.inventoryService.createPurchaseOrder(branchId, dto, this.actor(req));
  }

  @Get('purchase-orders/:id')
  async getPurchaseOrder(@Req() req: any, @Param('id') id: string) {
    this.requireRoles(req, ['ADMIN', 'MANAGER']);
    const po = await this.inventoryService.getPurchaseOrderById(id);
    this.assertBranchScope(req, po.branchId);
    return po;
  }

  @Put('purchase-orders/:id')
  async updatePurchaseOrder(@Req() req: any, @Param('id') id: string, @Body() dto: UpdatePurchaseOrderDto) {
    this.requireRoles(req, ['ADMIN', 'MANAGER']);
    const po = await this.inventoryService.getPurchaseOrderById(id);
    this.assertBranchScope(req, po.branchId);
    return this.inventoryService.updatePurchaseOrder(id, dto);
  }

  @Patch('purchase-orders/:id/submit')
  async submitPurchaseOrder(@Req() req: any, @Param('id') id: string) {
    this.requireRoles(req, ['ADMIN', 'MANAGER']);
    const po = await this.inventoryService.getPurchaseOrderById(id);
    this.assertBranchScope(req, po.branchId);
    return this.inventoryService.submitPurchaseOrder(id);
  }

  @Patch('purchase-orders/:id/receive')
  async receivePurchaseOrder(@Req() req: any, @Param('id') id: string) {
    this.requireRoles(req, ['ADMIN', 'MANAGER']);
    const po = await this.inventoryService.getPurchaseOrderById(id);
    this.assertBranchScope(req, po.branchId);
    return this.inventoryService.receivePurchaseOrder(id, this.actor(req));
  }

  @Patch('purchase-orders/:id/cancel')
  async cancelPurchaseOrder(@Req() req: any, @Param('id') id: string) {
    this.requireRoles(req, ['ADMIN', 'MANAGER']);
    const po = await this.inventoryService.getPurchaseOrderById(id);
    this.assertBranchScope(req, po.branchId);
    return this.inventoryService.cancelPurchaseOrder(id);
  }

  @Get('branches/:branchId/inventory/movements')
  listMovements(@Req() req: any, @Param('branchId') branchId: string, @Query() query: QueryInventoryMovementsDto) {
    this.requireRoles(req, ['ADMIN', 'MANAGER']);
    this.assertBranchScope(req, branchId);
    return this.inventoryService.getStockMovements({ ...query, branchId });
  }

  @Get('ingredients/:id/movements')
  async ingredientMovements(@Req() req: any, @Param('id') id: string, @Query() query: QueryInventoryMovementsDto) {
    this.requireRoles(req, ['ADMIN', 'MANAGER']);
    const ingredient = await this.inventoryService.getIngredientById(id);
    this.assertBranchScope(req, ingredient.branchId);
    return this.inventoryService.getStockMovements({ ...query, ingredientId: id });
  }

  @Post('branches/:branchId/inventory/adjust')
  adjustInventory(
    @Req() req: any,
    @Param('branchId') branchId: string,
    @Body() dto: InventoryAdjustDto,
  ) {
    this.requireRoles(req, ['ADMIN', 'MANAGER']);
    this.assertBranchScope(req, branchId);
    return this.inventoryService.adjustInventoryByBranch(branchId, dto, this.actor(req));
  }

  @Get('branches/:branchId/inventory/reports/summary')
  async exportInventorySummary(
    @Req() req: any,
    @Res({ passthrough: true }) res: Response,
    @Param('branchId') branchId: string,
    @Query() query: QueryInventoryReportDto,
  ) {
    this.requireRoles(req, ['ADMIN', 'MANAGER']);
    this.assertBranchScope(req, branchId);
    const format = String(query.format || 'json').toLowerCase();
    if (format === 'csv') {
      const csv = await this.inventoryService.exportInventorySummaryCsv(branchId);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="inventory-summary-${branchId}.csv"`);
      return new StreamableFile(Buffer.from(csv, 'utf8'));
    }
    if (format === 'pdf') {
      const pdf = await this.inventoryService.exportInventorySummaryPdf(branchId);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="inventory-summary-${branchId}.pdf"`);
      return new StreamableFile(pdf);
    }
    return this.inventoryService.getInventorySummary(branchId);
  }

  @Get('branches/:branchId/inventory/batches/expiry-alerts')
  expiryAlerts(
    @Req() req: any,
    @Param('branchId') branchId: string,
    @Query() query: QueryExpiryAlertDto,
  ) {
    this.requireRoles(req, ['ADMIN', 'MANAGER']);
    this.assertBranchScope(req, branchId);
    return this.inventoryService.listBatchExpiryAlerts(branchId, query.days);
  }

  @Put('branches/:branchId/inventory/policy')
  updateInventoryPolicy(
    @Req() req: any,
    @Param('branchId') branchId: string,
    @Body() dto: UpdateBranchInventoryPolicyDto,
  ) {
    this.requireRoles(req, ['ADMIN', 'MANAGER']);
    this.assertBranchScope(req, branchId);
    return this.inventoryService.upsertBranchInventoryPolicy(branchId, dto.allowNegativeStock);
  }
}
