import {
  ForbiddenException,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { CreateIngredientDto } from './dto/create-ingredient.dto';
import { StockMovementDto } from './dto/stock-movement.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { UpdateIngredientDto } from './dto/update-ingredient.dto';
import { CreateStockReceiptDto } from './dto/create-stock-receipt.dto';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { QueryIngredientDto, QueryMovementDto } from './dto/query-movements.dto';
import { BulkExportStockDto } from './dto/bulk-export-stock.dto';

@ApiTags('inventory')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('ingredients')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  private requireInventoryRole(req: any) {
    const roles = Array.isArray(req?.user?.roles) ? req.user.roles : [];
    const normalized = roles.map((role: unknown) => String(role || '').trim().toUpperCase());
    if (normalized.includes('INTERNAL_SERVICE')) return;
    if (!normalized.some((role) => role === 'ADMIN' || role === 'MANAGER')) {
      throw new ForbiddenException('FORBIDDEN_ROLE');
    }
  }

  private resolveActor(req: any) {
    const user = (req && req.user) || {};
    const email = String(user.email || '').trim();
    const sub = String(user.sub || '').trim();
    if (email) return email;
    if (sub) return sub;
    return 'unknown';
  }

  @Post()
  @ApiOperation({ summary: 'Create new ingredient' })
  @ApiResponse({ status: 201, description: 'Ingredient created' })
  @HttpCode(HttpStatus.CREATED)
  create(@Req() req: any, @Body() createIngredientDto: CreateIngredientDto) {
    this.requireInventoryRole(req);
    return this.inventoryService.createIngredient(createIngredientDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all ingredients' })
  @ApiResponse({ status: 200, description: 'List of ingredients' })
  findAll(@Req() req: any, @Query() query: QueryIngredientDto) {
    this.requireInventoryRole(req);
    return this.inventoryService.findAllIngredients(query);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update ingredient' })
  @ApiResponse({ status: 200, description: 'Ingredient updated' })
  update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateIngredientDto) {
    this.requireInventoryRole(req);
    return this.inventoryService.updateIngredient(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft delete ingredient' })
  @ApiResponse({ status: 200, description: 'Ingredient deleted' })
  remove(@Req() req: any, @Param('id') id: string) {
    this.requireInventoryRole(req);
    return this.inventoryService.deleteIngredient(id);
  }

  @Post('stock/import')
  @ApiOperation({ summary: 'Import stock (add to inventory)' })
  @ApiResponse({ status: 200, description: 'Stock imported' })
  @HttpCode(HttpStatus.OK)
  importStock(@Req() req: any, @Body() stockMovementDto: StockMovementDto) {
    this.requireInventoryRole(req);
    return this.inventoryService.importStock({
      ...stockMovementDto,
      createdBy: stockMovementDto.createdBy || this.resolveActor(req),
    });
  }

  @Post('stock/receipts')
  @ApiOperation({ summary: 'Create stock import receipt' })
  @ApiResponse({ status: 201, description: 'Receipt created' })
  @HttpCode(HttpStatus.CREATED)
  createReceipt(@Req() req: any, @Body() dto: CreateStockReceiptDto) {
    this.requireInventoryRole(req);
    return this.inventoryService.createStockReceipt({
      ...dto,
      createdBy: dto.createdBy || this.resolveActor(req),
    });
  }

  @Post('stock/adjust')
  @ApiOperation({ summary: 'Adjust stock manually after stocktaking' })
  @ApiResponse({ status: 200, description: 'Stock adjusted' })
  @HttpCode(HttpStatus.OK)
  adjustStock(@Req() req: any, @Body() dto: AdjustStockDto) {
    this.requireInventoryRole(req);
    return this.inventoryService.adjustStock({
      ...dto,
      createdBy: dto.createdBy || this.resolveActor(req),
    });
  }

  @Post('stock/export-bulk')
  @ApiOperation({ summary: 'Export stock in bulk (atomic)' })
  @ApiResponse({ status: 200, description: 'Stock exported in bulk' })
  @HttpCode(HttpStatus.OK)
  exportBulk(@Req() req: any, @Body() dto: BulkExportStockDto) {
    this.requireInventoryRole(req);
    return this.inventoryService.exportStockBulk({
      ...dto,
      createdBy: dto.createdBy || this.resolveActor(req),
    });
  }

  @Get('stock/movements')
  @ApiOperation({ summary: 'Get stock movement history' })
  @ApiResponse({ status: 200, description: 'Stock movement list' })
  getMovements(@Req() req: any, @Query() query: QueryMovementDto) {
    this.requireInventoryRole(req);
    return this.inventoryService.getStockMovements(query);
  }

  @Post('sync-menu')
  @ApiOperation({ summary: 'Sync menu items as inventory ingredients' })
  @ApiResponse({ status: 200, description: 'Menu items synced to inventory' })
  @HttpCode(HttpStatus.OK)
  syncMenu(@Req() req: any, @Body() body: { branchId?: string; items: { id: string; name: string; unit?: string }[] }) {
    this.requireInventoryRole(req);
    return this.inventoryService.syncMenuItems(body.items || [], body.branchId);
  }
}
