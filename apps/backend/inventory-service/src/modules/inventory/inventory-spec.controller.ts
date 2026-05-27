import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CreateIngredientDto } from './dto/create-ingredient.dto';
import { UpdateIngredientDto } from './dto/update-ingredient.dto';
import {
  CreatePurchaseOrderDto,
  InventoryAdjustDto,
  QueryInventoryMovementsDto,
  QueryPurchaseOrderDto,
  UpdatePurchaseOrderDto,
  UpsertBranchRecipeDto,
} from './dto/spec-inventory.dto';
import { InventoryService } from './inventory.service';

@ApiTags('inventory-spec')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class InventorySpecController {
  constructor(private readonly inventoryService: InventoryService) {}

  private actor(req: any) {
    return String(req?.user?.email || req?.user?.sub || '').trim() || 'system';
  }

  @Get('branches/:branchId/inventory/ingredients')
  listIngredients(@Param('branchId') branchId: string) {
    return this.inventoryService.findAllIngredients({ branchId, includeInactive: 'false' });
  }

  @Post('branches/:branchId/inventory/ingredients')
  createIngredient(@Param('branchId') branchId: string, @Body() dto: CreateIngredientDto) {
    return this.inventoryService.createIngredient({ ...dto, branchId });
  }

  @Get('ingredients/:id')
  getIngredient(@Param('id') id: string) {
    return this.inventoryService.getIngredientById(id);
  }

  @Put('ingredients/:id')
  updateIngredient(@Param('id') id: string, @Body() dto: UpdateIngredientDto) {
    return this.inventoryService.updateIngredient(id, dto);
  }

  @Patch('ingredients/:id/deactivate')
  deactivateIngredient(@Param('id') id: string) {
    return this.inventoryService.deleteIngredient(id);
  }

  @Get('branches/:branchId/inventory/low-stock')
  lowStock(@Param('branchId') branchId: string) {
    return this.inventoryService.listLowStock(branchId);
  }

  @Get('menu-items/:menuItemId/recipe')
  getDefaultRecipe(@Param('menuItemId') menuItemId: string) {
    return this.inventoryService.getDefaultRecipe(menuItemId);
  }

  @Get('branches/:branchId/menu-items/:menuItemId/recipe')
  getBranchRecipe(@Param('branchId') branchId: string, @Param('menuItemId') menuItemId: string) {
    return this.inventoryService.getMergedRecipe(branchId, menuItemId);
  }

  @Post('branches/:branchId/recipes')
  upsertRecipe(@Param('branchId') branchId: string, @Body() dto: UpsertBranchRecipeDto) {
    return this.inventoryService.upsertBranchRecipe(branchId, dto);
  }

  @Put('recipes/:id')
  updateDefaultRecipe(@Param('id') id: string, @Body() dto: UpsertBranchRecipeDto) {
    return this.inventoryService.updateDefaultRecipe(id, dto);
  }

  @Delete('branches/:branchId/recipes/:menuItemId')
  deleteBranchRecipe(@Param('branchId') branchId: string, @Param('menuItemId') menuItemId: string) {
    return this.inventoryService.deleteBranchRecipe(branchId, menuItemId);
  }

  @Get('branches/:branchId/purchase-orders')
  listPurchaseOrders(@Param('branchId') branchId: string, @Query() query: QueryPurchaseOrderDto) {
    return this.inventoryService.listPurchaseOrders(branchId, query);
  }

  @Post('branches/:branchId/purchase-orders')
  createPurchaseOrder(
    @Req() req: any,
    @Param('branchId') branchId: string,
    @Body() dto: CreatePurchaseOrderDto,
  ) {
    return this.inventoryService.createPurchaseOrder(branchId, dto, this.actor(req));
  }

  @Get('purchase-orders/:id')
  getPurchaseOrder(@Param('id') id: string) {
    return this.inventoryService.getPurchaseOrderById(id);
  }

  @Put('purchase-orders/:id')
  updatePurchaseOrder(@Param('id') id: string, @Body() dto: UpdatePurchaseOrderDto) {
    return this.inventoryService.updatePurchaseOrder(id, dto);
  }

  @Patch('purchase-orders/:id/submit')
  submitPurchaseOrder(@Param('id') id: string) {
    return this.inventoryService.submitPurchaseOrder(id);
  }

  @Patch('purchase-orders/:id/receive')
  receivePurchaseOrder(@Req() req: any, @Param('id') id: string) {
    return this.inventoryService.receivePurchaseOrder(id, this.actor(req));
  }

  @Patch('purchase-orders/:id/cancel')
  cancelPurchaseOrder(@Param('id') id: string) {
    return this.inventoryService.cancelPurchaseOrder(id);
  }

  @Get('branches/:branchId/inventory/movements')
  listMovements(@Param('branchId') branchId: string, @Query() query: QueryInventoryMovementsDto) {
    return this.inventoryService.getStockMovements({ ...query, branchId });
  }

  @Get('ingredients/:id/movements')
  ingredientMovements(@Param('id') id: string, @Query() query: QueryInventoryMovementsDto) {
    return this.inventoryService.getStockMovements({ ...query, ingredientId: id });
  }

  @Post('branches/:branchId/inventory/adjust')
  adjustInventory(
    @Req() req: any,
    @Param('branchId') branchId: string,
    @Body() dto: InventoryAdjustDto,
  ) {
    return this.inventoryService.adjustInventoryByBranch(branchId, dto, this.actor(req));
  }
}
