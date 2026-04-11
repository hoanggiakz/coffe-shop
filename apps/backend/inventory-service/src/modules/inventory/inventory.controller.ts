import {
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  Body,
  Param,
  Query,
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

  @Post()
  @ApiOperation({ summary: 'Create new ingredient' })
  @ApiResponse({ status: 201, description: 'Ingredient created' })
  @HttpCode(HttpStatus.CREATED)
  create(@Body() createIngredientDto: CreateIngredientDto) {
    return this.inventoryService.createIngredient(createIngredientDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all ingredients' })
  @ApiResponse({ status: 200, description: 'List of ingredients' })
  findAll(@Query() query: QueryIngredientDto) {
    return this.inventoryService.findAllIngredients(query);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update ingredient' })
  @ApiResponse({ status: 200, description: 'Ingredient updated' })
  update(@Param('id') id: string, @Body() dto: UpdateIngredientDto) {
    return this.inventoryService.updateIngredient(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft delete ingredient' })
  @ApiResponse({ status: 200, description: 'Ingredient deleted' })
  remove(@Param('id') id: string) {
    return this.inventoryService.deleteIngredient(id);
  }

  @Post('stock/import')
  @ApiOperation({ summary: 'Import stock (add to inventory)' })
  @ApiResponse({ status: 200, description: 'Stock imported' })
  @HttpCode(HttpStatus.OK)
  importStock(@Body() stockMovementDto: StockMovementDto) {
    return this.inventoryService.importStock(stockMovementDto);
  }

  @Post('stock/receipts')
  @ApiOperation({ summary: 'Create stock import receipt' })
  @ApiResponse({ status: 201, description: 'Receipt created' })
  @HttpCode(HttpStatus.CREATED)
  createReceipt(@Body() dto: CreateStockReceiptDto) {
    return this.inventoryService.createStockReceipt(dto);
  }

  @Post('stock/adjust')
  @ApiOperation({ summary: 'Adjust stock manually after stocktaking' })
  @ApiResponse({ status: 200, description: 'Stock adjusted' })
  @HttpCode(HttpStatus.OK)
  adjustStock(@Body() dto: AdjustStockDto) {
    return this.inventoryService.adjustStock(dto);
  }

  @Post('stock/export-bulk')
  @ApiOperation({ summary: 'Export stock in bulk (atomic)' })
  @ApiResponse({ status: 200, description: 'Stock exported in bulk' })
  @HttpCode(HttpStatus.OK)
  exportBulk(@Body() dto: BulkExportStockDto) {
    return this.inventoryService.exportStockBulk(dto);
  }

  @Get('stock/movements')
  @ApiOperation({ summary: 'Get stock movement history' })
  @ApiResponse({ status: 200, description: 'Stock movement list' })
  getMovements(@Query() query: QueryMovementDto) {
    return this.inventoryService.getStockMovements(query);
  }

  @Post('sync-menu')
  @ApiOperation({ summary: 'Sync menu items as inventory ingredients' })
  @ApiResponse({ status: 200, description: 'Menu items synced to inventory' })
  @HttpCode(HttpStatus.OK)
  syncMenu(@Body() body: { branchId?: string; items: { id: string; name: string; unit?: string }[] }) {
    return this.inventoryService.syncMenuItems(body.items || [], body.branchId);
  }
}
