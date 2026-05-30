import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateIngredientDto } from './dto/create-ingredient.dto';
import { StockMovementDto } from './dto/stock-movement.dto';
import { Prisma, StockSource, StockType } from '@prisma/client';
import { UpdateIngredientDto } from './dto/update-ingredient.dto';
import { CreateStockReceiptDto } from './dto/create-stock-receipt.dto';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { QueryIngredientDto, QueryMovementDto } from './dto/query-movements.dto';
import { BulkExportStockDto } from './dto/bulk-export-stock.dto';
import {
  CreatePurchaseOrderDto,
  InventoryAdjustDto,
  QueryPurchaseOrderDto,
  UpdatePurchaseOrderDto,
  UpsertBranchRecipeDto,
} from './dto/spec-inventory.dto';
import nodemailer, { Transporter } from 'nodemailer';

type ApplyMovementInput = {
  branchId?: string | null;
  ingredientId: string;
  type: StockType;
  source: StockSource;
  quantity?: number;
  actualStock?: number;
  unitPrice?: number;
  reason?: string;
  note?: string;
  referenceCode?: string;
  createdBy?: string;
};

@Injectable()
export class InventoryService {
  private logger = new Logger(InventoryService.name);
  private readonly lowStockState = new Map<string, boolean>();
  private readonly emailTransporter: Transporter | null;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {
    const smtpHost = String(this.configService.get('SMTP_HOST') || '').trim();
    if (!smtpHost) {
      this.emailTransporter = null;
    } else {
      this.emailTransporter = nodemailer.createTransport({
        host: smtpHost,
        port: Number(this.configService.get('SMTP_PORT', 587)),
        secure: false,
        auth: {
          user: this.configService.get('SMTP_USER'),
          pass: this.configService.get('SMTP_PASS'),
        },
      });
    }
  }

  private get chatServiceApiUrl() {
    return this.configService.get('CHAT_SERVICE_URL') || 'http://chat-service:3007/api/chats';
  }

  private get lowStockAlertEmails(): string[] {
    return String(this.configService.get('LOW_STOCK_ALERT_EMAILS') || 'manager@coffeeshop.com')
      .split(',')
      .map((email) => email.trim())
      .filter(Boolean);
  }

  private async fetchWithRetry(
    url: string,
    init?: RequestInit,
    options?: { attempts?: number; retryDelayMs?: number; retryOnStatuses?: number[]; timeoutMs?: number },
  ) {
    const attempts = Math.max(options?.attempts || 3, 1);
    const retryDelayMs = Math.max(options?.retryDelayMs || 250, 0);
    const retryOnStatuses = options?.retryOnStatuses || [429, 500, 502, 503, 504];
    const timeoutMs = Math.max(options?.timeoutMs || 0, 0);
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      let timeoutHandle: NodeJS.Timeout | null = null;
      try {
        const controller = timeoutMs > 0 ? new AbortController() : null;
        const requestInit: RequestInit = {
          ...(init || {}),
          ...(controller ? { signal: controller.signal } : {}),
        };

        if (controller) {
          timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);
        }

        const response = await fetch(url, requestInit);
        if (timeoutHandle) clearTimeout(timeoutHandle);
        if (attempt < attempts && retryOnStatuses.includes(response.status)) {
          this.logger.warn(`Retry ${attempt}/${attempts - 1} for ${url} after status ${response.status}`);
          await this.sleep(retryDelayMs * attempt);
          continue;
        }
        return response;
      } catch (error) {
        if (timeoutHandle) clearTimeout(timeoutHandle);
        lastError = error as Error;
        if (attempt >= attempts) {
          throw error;
        }
        this.logger.warn(`Retry ${attempt}/${attempts - 1} for ${url} after network error: ${lastError.message}`);
        await this.sleep(retryDelayMs * attempt);
      }
    }

    throw lastError || new Error(`Request failed: ${url}`);
  }

  private async sleep(ms: number) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  async createIngredient(dto: CreateIngredientDto) {
    const branchId = this.normalizeBranchId(dto.branchId);
    const payload: Prisma.IngredientUncheckedCreateInput = {
      id: dto.id || undefined,
      branchId,
      name: String(dto.name || '').trim(),
      unit: String(dto.unit || '').trim(),
      stock: dto.stock ?? 0,
      minStock: dto.minStock ?? 0,
      importPrice: dto.importPrice ?? 0,
      isActive: true,
    };

    if (!payload.name || !payload.unit) {
      throw new BadRequestException('Ten va don vi nguyen lieu khong duoc de trong');
    }

    const ingredient = await this.prisma.ingredient.create({
      data: payload,
    });

    await this.checkAndAlertLowStock(ingredient, 'CREATE');
    this.logger.log(`Created ingredient: ${ingredient.id}`);
    return this.mapIngredient(ingredient);
  }

  async updateIngredient(id: string, dto: UpdateIngredientDto) {
    await this.ensureIngredientExists(id);

    const ingredient = await this.prisma.ingredient.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: String(dto.name || '').trim() } : {}),
        ...(dto.unit !== undefined ? { unit: String(dto.unit || '').trim() } : {}),
        ...(dto.minStock !== undefined ? { minStock: dto.minStock } : {}),
        ...(dto.importPrice !== undefined ? { importPrice: dto.importPrice } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });

    await this.checkAndAlertLowStock(ingredient, 'UPDATE');
    return this.mapIngredient(ingredient);
  }

  async deleteIngredient(id: string) {
    await this.ensureIngredientExists(id);
    await this.prisma.ingredient.update({
      where: { id },
      data: { isActive: false },
    });
    return { id, deleted: true };
  }

  async findAllIngredients(query: QueryIngredientDto = {}) {
    const includeInactive = query.includeInactive === 'true';
    const lowOnly = query.lowOnly === 'true';
    const keyword = String(query.keyword || '').trim();
    const branchId = this.normalizeBranchId(query.branchId);

    const ingredients = await this.prisma.ingredient.findMany({
      where: {
        ...(includeInactive ? {} : { isActive: true }),
        ...(branchId ? { branchId } : {}),
        ...(keyword
          ? {
              OR: [
                { name: { contains: keyword, mode: 'insensitive' } },
                { unit: { contains: keyword, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: [{ name: 'asc' }],
    });

    const normalized = ingredients.map((item) => this.mapIngredient(item));
    if (!lowOnly) {
      return normalized;
    }

    return normalized.filter((item) => Number(item.stock) <= Number(item.minStock));
  }

  async importStock(dto: StockMovementDto) {
    if (dto.type === StockType.ADJUST) {
      throw new BadRequestException('Endpoint stock/import khong ho tro ADJUST');
    }
    const branchId = this.normalizeBranchId(dto.branchId);
    const result = await this.prisma.$transaction(async (tx) =>
      this.applyMovementWithClient(tx, {
        branchId,
        ingredientId: dto.ingredientId,
        type: dto.type,
        source: dto.source || StockSource.MANUAL,
        quantity: Number(dto.quantity),
        unitPrice: dto.unitPrice ?? 0,
        reason: dto.reason,
        note: dto.note,
        referenceCode: dto.referenceCode,
        createdBy: dto.createdBy,
      }),
    );

    await this.checkAndAlertLowStock(result.ingredient, 'MOVEMENT');
    return {
      movement: this.mapMovement(result.movement),
      ingredient: this.mapIngredient(result.ingredient),
    };
  }

  async createStockReceipt(dto: CreateStockReceiptDto) {
    const items = Array.isArray(dto.items) ? dto.items : [];
    if (!items.length) {
      throw new BadRequestException('Phieu nhap can it nhat 1 dong nguyen lieu');
    }
    const branchId = this.normalizeBranchId(dto.branchId);

    const now = new Date();
    const receiptCode = `RCPT-${now.toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(Math.random() * 100000)}`;
    const receiptReason = dto.supplier
      ? `Nhap hang tu ${String(dto.supplier).trim()}`
      : 'Nhap kho';
    const receiptNote = String(dto.note || '').trim() || undefined;

    const payload = await this.prisma.$transaction(async (tx) => {
      const rows: Array<{ movement: any; ingredient: any }> = [];
      let totalAmount = 0;

      for (const item of items) {
        const row = await this.applyMovementWithClient(tx, {
          branchId,
          ingredientId: item.ingredientId,
          type: StockType.IMPORT,
          source: StockSource.RECEIPT,
          quantity: Number(item.quantity),
          unitPrice: Number(item.unitPrice || 0),
          reason: receiptReason,
          note: item.note || receiptNote,
          referenceCode: receiptCode,
          createdBy: dto.createdBy,
        });
        totalAmount += Number(row.movement.totalPrice || 0);
        rows.push(row);
      }

      return {
        receiptCode,
        supplier: dto.supplier || null,
        note: receiptNote || null,
        totalAmount,
        items: rows,
      };
    });

    for (const row of payload.items) {
      await this.checkAndAlertLowStock(row.ingredient, 'RECEIPT');
    }

    return {
      receiptCode: payload.receiptCode,
      supplier: payload.supplier,
      note: payload.note,
      totalAmount: payload.totalAmount,
      items: payload.items.map((row) => ({
        movement: this.mapMovement(row.movement),
        ingredient: this.mapIngredient(row.ingredient),
      })),
    };
  }

  async adjustStock(dto: AdjustStockDto) {
    const actualStock = Number(dto.actualStock);
    if (!Number.isFinite(actualStock) || actualStock < 0) {
      throw new BadRequestException('So luong ton kho thuc te khong hop le');
    }
    const branchId = this.normalizeBranchId(dto.branchId);

    const result = await this.prisma.$transaction(async (tx) =>
      this.applyMovementWithClient(tx, {
        branchId,
        ingredientId: dto.ingredientId,
        type: StockType.ADJUST,
        source: StockSource.STOCKTAKE,
        actualStock,
        reason: dto.reason || 'Dieu chinh kiem ke',
        note: dto.reason,
        createdBy: dto.createdBy,
      }),
    );

    await this.checkAndAlertLowStock(result.ingredient, 'STOCKTAKE');
    return {
      movement: this.mapMovement(result.movement),
      ingredient: this.mapIngredient(result.ingredient),
    };
  }

  async exportStockBulk(dto: BulkExportStockDto) {
    const items = Array.isArray(dto.items) ? dto.items : [];
    if (!items.length) {
      throw new BadRequestException('Danh sach nguyen lieu xuat kho khong duoc rong');
    }
    const branchId = this.normalizeBranchId(dto.branchId);

    const payload = await this.prisma.$transaction(async (tx) => {
      const rows: Array<{ movement: any; ingredient: any }> = [];

      for (const item of items) {
        const quantity = Number(item.quantity);
        if (!Number.isFinite(quantity) || quantity <= 0) {
          throw new BadRequestException(`So luong xuat khong hop le cho ingredient ${item.ingredientId}`);
        }

        const row = await this.applyMovementWithClient(tx, {
          branchId,
          ingredientId: item.ingredientId,
          type: StockType.EXPORT,
          source: dto.source || StockSource.ORDER,
          quantity,
          reason: dto.reason,
          note: item.note,
          referenceCode: dto.referenceCode,
          createdBy: dto.createdBy,
        });
        rows.push(row);
      }

      return rows;
    });

    for (const row of payload) {
      await this.checkAndAlertLowStock(row.ingredient, 'MOVEMENT');
    }

    return {
      exported: payload.length,
      items: payload.map((row) => ({
        movement: this.mapMovement(row.movement),
        ingredient: this.mapIngredient(row.ingredient),
      })),
    };
  }

  async getStockMovements(query: QueryMovementDto = {}) {
    const limit = Math.min(Math.max(Number(query.limit || 200), 1), 1000);
    const dateFrom = this.parseDateBoundary(query.dateFrom, 'dateFrom', 'start');
    const dateTo = this.parseDateBoundary(query.dateTo, 'dateTo', 'end');
    const branchId = this.normalizeBranchId(query.branchId);

    if (dateFrom && dateTo && dateFrom.getTime() > dateTo.getTime()) {
      throw new BadRequestException('dateFrom phai <= dateTo');
    }

    const movements = await this.prisma.stockMovement.findMany({
      where: {
        ...(branchId ? { branchId } : {}),
        ...(query.ingredientId ? { ingredientId: String(query.ingredientId).trim() } : {}),
        ...(query.referenceCode ? { referenceCode: String(query.referenceCode).trim() } : {}),
        ...(query.type ? { type: query.type } : {}),
        ...(query.source ? { source: query.source } : {}),
        ...(dateFrom || dateTo
          ? {
              createdAt: {
                ...(dateFrom ? { gte: dateFrom } : {}),
                ...(dateTo ? { lte: dateTo } : {}),
              },
            }
          : {}),
      },
      include: { ingredient: true },
      orderBy: [{ createdAt: 'desc' }],
      take: limit,
    });

    return movements.map((movement) => ({
      ...this.mapMovement(movement),
      ingredient: movement.ingredient ? this.mapIngredient(movement.ingredient) : null,
    }));
  }

  async getIngredientById(id: string) {
    const ingredient = await this.ensureIngredientExists(id);
    return this.mapIngredient(ingredient);
  }

  async listLowStock(branchId: string) {
    const normalizedBranchId = this.normalizeBranchId(branchId);
    return this.findAllIngredients({
      branchId: normalizedBranchId || undefined,
      lowOnly: 'true',
      includeInactive: 'false',
    });
  }

  async upsertBranchRecipe(branchId: string, dto: UpsertBranchRecipeDto) {
    const normalizedBranchId = this.normalizeBranchId(branchId);
    if (!normalizedBranchId) throw new BadRequestException('branchId khong hop le');
    return this.prisma.branchRecipe.upsert({
      where: {
        branchId_menuItemId_ingredientId: {
          branchId: normalizedBranchId,
          menuItemId: String(dto.menuItemId).trim(),
          ingredientId: String(dto.ingredientId).trim(),
        },
      },
      update: {
        quantity: Number(dto.quantity),
        wastageRate: Number(dto.wastageRate || 0),
      },
      create: {
        branchId: normalizedBranchId,
        menuItemId: String(dto.menuItemId).trim(),
        ingredientId: String(dto.ingredientId).trim(),
        quantity: Number(dto.quantity),
        wastageRate: Number(dto.wastageRate || 0),
      },
    });
  }

  async updateDefaultRecipe(id: string, dto: UpsertBranchRecipeDto) {
    const exists = await this.prisma.recipe.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException('Khong tim thay recipe');
    return this.prisma.recipe.update({
      where: { id },
      data: {
        menuItemId: String(dto.menuItemId).trim(),
        ingredientId: String(dto.ingredientId).trim(),
        quantity: Number(dto.quantity),
        wastageRate: Number(dto.wastageRate || 0),
      },
    });
  }

  async getMergedRecipe(branchId: string, menuItemId: string) {
    const normalizedBranchId = this.normalizeBranchId(branchId);
    const normalizedMenuItemId = String(menuItemId || '').trim();
    const branchRows = await this.prisma.branchRecipe.findMany({
      where: { branchId: normalizedBranchId || undefined, menuItemId: normalizedMenuItemId },
      orderBy: { createdAt: 'asc' },
    });
    if (branchRows.length) return branchRows;
    return this.prisma.recipe.findMany({
      where: { menuItemId: normalizedMenuItemId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getDefaultRecipe(menuItemId: string) {
    return this.prisma.recipe.findMany({
      where: { menuItemId: String(menuItemId || '').trim() },
      orderBy: { createdAt: 'asc' },
    });
  }

  async deleteBranchRecipe(branchId: string, menuItemId: string) {
    const normalizedBranchId = this.normalizeBranchId(branchId);
    const normalizedMenuItemId = String(menuItemId || '').trim();
    await this.prisma.branchRecipe.deleteMany({
      where: {
        branchId: normalizedBranchId || undefined,
        menuItemId: normalizedMenuItemId,
      },
    });
    return { branchId: normalizedBranchId, menuItemId: normalizedMenuItemId, deleted: true };
  }

  async listPurchaseOrders(branchId: string, query: QueryPurchaseOrderDto = {}) {
    const normalizedBranchId = this.normalizeBranchId(branchId);
    return this.prisma.purchaseOrder.findMany({
      where: {
        branchId: normalizedBranchId || undefined,
        ...(query.status ? { status: query.status } : {}),
      },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createPurchaseOrder(branchId: string, dto: CreatePurchaseOrderDto, createdBy?: string) {
    const normalizedBranchId = this.normalizeBranchId(branchId);
    if (!normalizedBranchId) throw new BadRequestException('branchId khong hop le');
    if (!Array.isArray(dto.items) || !dto.items.length) {
      throw new BadRequestException('Don nhap phai co it nhat 1 dong');
    }
    const supplierName = String(dto.supplierName || '').trim();
    if (!supplierName) throw new BadRequestException('supplierName khong hop le');
    const totalAmount = dto.items.reduce((sum, item) => sum + Number(item.quantity) * Number(item.unitPrice), 0);

    return this.prisma.purchaseOrder.create({
      data: {
        branchId: normalizedBranchId,
        supplierName,
        notes: String(dto.notes || '').trim() || null,
        status: 'DRAFT',
        totalAmount,
        createdBy: createdBy || null,
        items: {
          create: dto.items.map((item) => ({
            ingredientId: String(item.ingredientId).trim(),
            quantity: Number(item.quantity),
            unitPrice: Number(item.unitPrice),
            ...(item.expiryDate ? { expiryDate: new Date(item.expiryDate) } : {}),
          })),
        },
      },
      include: { items: true },
    });
  }

  async getPurchaseOrderById(id: string) {
    const found = await this.prisma.purchaseOrder.findUnique({ where: { id }, include: { items: true } });
    if (!found) throw new NotFoundException('Khong tim thay purchase order');
    return found;
  }

  async updatePurchaseOrder(id: string, dto: UpdatePurchaseOrderDto) {
    const found = await this.getPurchaseOrderById(id);
    if (found.status !== 'DRAFT') throw new BadRequestException('Chi cho phep sua don o trang thai DRAFT');
    const totalAmount = dto.items.reduce((sum, item) => sum + Number(item.quantity) * Number(item.unitPrice), 0);
    return this.prisma.$transaction(async (tx) => {
      await tx.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: id } });
      return tx.purchaseOrder.update({
        where: { id },
        data: {
          supplierName: String(dto.supplierName || '').trim(),
          notes: String(dto.notes || '').trim() || null,
          totalAmount,
          items: {
            create: dto.items.map((item) => ({
              ingredientId: String(item.ingredientId).trim(),
              quantity: Number(item.quantity),
              unitPrice: Number(item.unitPrice),
              ...(item.expiryDate ? { expiryDate: new Date(item.expiryDate) } : {}),
            })),
          },
        },
        include: { items: true },
      });
    });
  }

  async submitPurchaseOrder(id: string) {
    const found = await this.getPurchaseOrderById(id);
    if (found.status !== 'DRAFT') throw new BadRequestException('Chi don DRAFT moi duoc submit');
    return this.prisma.purchaseOrder.update({ where: { id }, data: { status: 'SUBMITTED' }, include: { items: true } });
  }

  async cancelPurchaseOrder(id: string) {
    const found = await this.getPurchaseOrderById(id);
    if (found.status === 'RECEIVED') throw new BadRequestException('Don RECEIVED khong duoc huy');
    return this.prisma.purchaseOrder.update({ where: { id }, data: { status: 'CANCELLED' }, include: { items: true } });
  }

  async receivePurchaseOrder(id: string, actor?: string) {
    const po = await this.getPurchaseOrderById(id);
    if (po.status !== 'SUBMITTED' && po.status !== 'DRAFT') {
      throw new BadRequestException('Chi don DRAFT/SUBMITTED moi duoc nhan hang');
    }
    const rows = await this.prisma.$transaction(async (tx) => {
      const movements: any[] = [];
      for (const item of po.items) {
        const ingredient = await tx.ingredient.findUnique({ where: { id: item.ingredientId } });
        if (!ingredient) throw new NotFoundException(`Ingredient not found: ${item.ingredientId}`);
        const beforeStock = Number(ingredient.stock || 0);
        const importQty = Number(item.quantity || 0);
        const importPrice = Number(item.unitPrice || 0);
        const nextStock = beforeStock + importQty;
        const oldCost = Number(ingredient.importPrice || 0);
        const nextCost = nextStock <= 0 ? oldCost : ((beforeStock * oldCost) + (importQty * importPrice)) / nextStock;

        const movement = await tx.stockMovement.create({
          data: {
            ingredientId: ingredient.id,
            branchId: po.branchId,
            type: StockType.IMPORT,
            source: StockSource.RECEIPT,
            quantity: importQty,
            unitPrice: importPrice,
            totalPrice: importQty * importPrice,
            reason: 'PURCHASE_ORDER_RECEIVED',
            note: po.notes || null,
            referenceCode: po.id,
            beforeStock,
            afterStock: nextStock,
            createdBy: actor || po.createdBy || null,
          },
        });
        const updatedIngredient = await tx.ingredient.update({
          where: { id: ingredient.id },
          data: {
            stock: nextStock,
            importPrice: nextCost,
          },
        });
        movements.push({ movement, ingredient: updatedIngredient });
      }
      const updatedPo = await tx.purchaseOrder.update({
        where: { id: po.id },
        data: { status: 'RECEIVED', receivedAt: new Date() },
        include: { items: true },
      });
      return { updatedPo, movements };
    });

    for (const row of rows.movements) {
      await this.checkAndAlertLowStock(row.ingredient, 'RECEIPT');
    }
    return rows.updatedPo;
  }

  async adjustInventoryByBranch(branchId: string, dto: InventoryAdjustDto, actor?: string) {
    return this.adjustStock({
      branchId,
      ingredientId: dto.ingredientId,
      actualStock: dto.actualStock,
      reason: dto.note,
      createdBy: actor,
    });
  }

  async syncMenuItems(items: { id: string; name: string; unit?: string }[], branchIdRaw?: string) {
    const branchId = this.normalizeBranchId(branchIdRaw);
    const results = [];
    const skipped: Array<{ id: string; reason: string }> = [];
    for (const item of items) {
      const ingredientId = String(item.id || '').trim();
      const ingredientName = String(item.name || '').trim();
      if (!ingredientId || !ingredientName) {
        skipped.push({
          id: ingredientId || '(empty)',
          reason: 'Thieu id hoac ten mon',
        });
        continue;
      }

      const existing = await this.prisma.ingredient.findUnique({
        where: { id: ingredientId },
      });

      if (existing && branchId && existing.branchId && existing.branchId !== branchId) {
        skipped.push({
          id: ingredientId,
          reason: `Ingredient ${ingredientId} dang thuoc chi nhanh khac (${existing.branchId})`,
        });
        continue;
      }

      const ingredient = existing
        ? await this.prisma.ingredient.update({
            where: { id: ingredientId },
            data: {
              name: ingredientName,
              branchId: existing.branchId || branchId || null,
              unit: String(item.unit || 'portion'),
              isActive: true,
            },
          })
        : await this.prisma.ingredient.create({
            data: {
              id: ingredientId,
              branchId,
              name: ingredientName,
              unit: String(item.unit || 'portion'),
              stock: 0,
              minStock: 0,
              importPrice: 0,
              isActive: true,
            },
          });
      results.push(this.mapIngredient(ingredient));
    }
    return {
      synced: results.length,
      skipped: skipped.length,
      skippedItems: skipped,
      items: results,
    };
  }

  private async applyMovementWithClient(client: any, input: ApplyMovementInput) {
    const ingredient = await client.ingredient.findUnique({
      where: { id: input.ingredientId },
    });
    if (!ingredient) {
      throw new NotFoundException(`Ingredient not found: ${input.ingredientId}`);
    }

    const normalizedBranchId = this.normalizeBranchId(input.branchId);
    const ingredientBranchId = this.normalizeBranchId(ingredient.branchId);
    if (normalizedBranchId && ingredientBranchId && normalizedBranchId !== ingredientBranchId) {
      throw new BadRequestException(`Ingredient ${ingredient.id} khong thuoc chi nhanh ${normalizedBranchId}`);
    }

    const beforeStock = Number(ingredient.stock || 0);
    let afterStock = beforeStock;
    let quantity = Number(input.quantity || 0);

    if (input.type === StockType.ADJUST) {
      if (input.actualStock === undefined || input.actualStock === null) {
        throw new BadRequestException('ADJUST can actualStock');
      }
      afterStock = Number(input.actualStock);
      quantity = Math.abs(afterStock - beforeStock);
    } else if (input.type === StockType.IMPORT) {
      if (!Number.isFinite(quantity) || quantity <= 0) {
        throw new BadRequestException('Số lượng nhập không hợp lệ!');
      }
      afterStock = beforeStock + quantity;
    } else if (input.type === StockType.EXPORT) {
      if (!Number.isFinite(quantity) || quantity <= 0) {
        throw new BadRequestException('Số lượng xuất không hợp lệ!');
      }
      afterStock = beforeStock - quantity;
      if (afterStock < 0) {
        throw new BadRequestException(`Tồn kho không đủ cho ingredient ${ingredient.id}`);
      }
    } else {
      throw new BadRequestException(`Không hỗ trợ loại ${input.type}`);
    }

    const unitPrice = Number(input.unitPrice || 0);
    const totalPrice = input.type === StockType.IMPORT ? quantity * unitPrice : 0;

    const movement = await client.stockMovement.create({
      data: {
        ingredientId: ingredient.id,
        branchId: ingredient.branchId || normalizedBranchId || null,
        type: input.type,
        source: input.source || StockSource.MANUAL,
        quantity,
        unitPrice,
        totalPrice,
        reason: input.reason ? String(input.reason).trim() : null,
        note: input.note ? String(input.note).trim() : null,
        referenceCode: input.referenceCode ? String(input.referenceCode).trim() : null,
        beforeStock,
        afterStock,
        createdBy: input.createdBy ? String(input.createdBy).trim() : null,
      },
    });

    const updatedIngredient = await client.ingredient.update({
      where: { id: ingredient.id },
      data: {
        stock: afterStock,
        ...(input.type === StockType.IMPORT && unitPrice > 0 ? { importPrice: unitPrice } : {}),
      },
    });

    return { movement, ingredient: updatedIngredient };
  }

  private async checkAndAlertLowStock(ingredient: any, action: 'CREATE' | 'UPDATE' | 'MOVEMENT' | 'RECEIPT' | 'STOCKTAKE') {
    const stock = Number(ingredient.stock || 0);
    const minStock = Number(ingredient.minStock || 0);
    const isLow = stock <= minStock;
    const prevLow = this.lowStockState.get(String(ingredient.id));

    if (!isLow) {
      this.lowStockState.set(String(ingredient.id), false);
      return;
    }
    if (prevLow) {
      return;
    }

    this.lowStockState.set(String(ingredient.id), true);
    const title = `Cảnh báo tồn kho thấp: ${ingredient.name}`;
    const message = `${ingredient.name} con ${stock} ${ingredient.unit}, thap hon/ bang muc toi thieu ${minStock}`;

    // Fire-and-forget: khong de luong canh bao lam tre request chinh.
    void Promise.allSettled([
      this.sendInAppLowStockAlert({
        ingredientId: ingredient.id,
        ingredientName: ingredient.name,
        stock,
        minStock,
        title,
        message,
        action,
      }),
      this.sendLowStockEmail({
        ingredientId: ingredient.id,
        ingredientName: ingredient.name,
        stock,
        minStock,
        title,
        message,
        action,
      }),
    ]);
  }

  private async sendInAppLowStockAlert(payload: {
    ingredientId: string;
    ingredientName: string;
    stock: number;
    minStock: number;
    title: string;
    message: string;
    action: string;
  }) {
    try {
      const response = await this.fetchWithRetry(`${this.chatServiceApiUrl}/staff-notifications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'LOW_STOCK',
          id: `low-stock:${payload.ingredientId}:${Date.now()}`,
          title: payload.title,
          message: payload.message,
          createdAt: new Date().toISOString(),
        }),
      }, { attempts: 1, timeoutMs: 1500, retryOnStatuses: [500, 502, 503, 504] });
      if (!response.ok) {
        const body = await response.text();
        this.logger.warn(`Khong gui duoc in-app low stock: ${response.status} ${body}`);
      }
    } catch (error) {
      this.logger.warn(`Chat service khong san sang gui low stock: ${(error as Error).message}`);
    }
  }

  private async sendLowStockEmail(payload: {
    ingredientId: string;
    ingredientName: string;
    stock: number;
    minStock: number;
    title: string;
    message: string;
    action: string;
  }) {
    if (!this.emailTransporter) {
      this.logger.warn('SMTP chua cau hinh, bo qua gui email low stock');
      return;
    }

    const recipients = this.lowStockAlertEmails;
    if (!recipients.length) {
      return;
    }

    try {
      await this.emailTransporter.sendMail({
        from: this.configService.get('SMTP_FROM') || '"Coffee Shop" <noreply@coffeeshop.com>',
        to: recipients.join(','),
        subject: payload.title,
        html: `
          <h3>${payload.title}</h3>
          <p>${payload.message}</p>
          <p><strong>Ingredient:</strong> ${payload.ingredientId}</p>
          <p><strong>Action:</strong> ${payload.action}</p>
          <p><strong>Time:</strong> ${new Date().toISOString()}</p>
        `,
      });
      this.logger.log(`Low stock email sent for ingredient ${payload.ingredientId}`);
    } catch (error) {
      this.logger.warn(`Gui email low stock that bai: ${(error as Error).message}`);
    }
  }

  private parseDateBoundary(input: string | undefined, label: string, boundary: 'start' | 'end') {
    const raw = String(input || '').trim();
    if (!raw) {
      return undefined;
    }

    // If only date is provided (YYYY-MM-DD), make dateTo inclusive by expanding to end-of-day.
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      const parsed = new Date(`${raw}T00:00:00.000Z`);
      if (Number.isNaN(parsed.getTime())) {
        throw new BadRequestException(`${label} khong hop le`);
      }
      if (boundary === 'end') {
        parsed.setUTCHours(23, 59, 59, 999);
      }
      return parsed;
    }

    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`${label} khong hop le`);
    }
    return parsed;
  }

  private normalizeBranchId(input?: string | null) {
    const normalized = String(input || '').trim();
    return normalized || null;
  }

  private mapIngredient(item: any) {
    return {
      ...item,
      stock: Number(item.stock || 0),
      minStock: Number(item.minStock || 0),
      importPrice: Number(item.importPrice || 0),
      isLowStock: Number(item.stock || 0) <= Number(item.minStock || 0),
    };
  }

  private mapMovement(item: any) {
    return {
      ...item,
      quantity: Number(item.quantity || 0),
      unitPrice: Number(item.unitPrice || 0),
      totalPrice: Number(item.totalPrice || 0),
      beforeStock: Number(item.beforeStock || 0),
      afterStock: Number(item.afterStock || 0),
    };
  }

  private async ensureIngredientExists(id: string) {
    const ingredient = await this.prisma.ingredient.findUnique({ where: { id } });
    if (!ingredient) {
      throw new NotFoundException(`Ingredient not found: ${id}`);
    }
    return ingredient;
  }
}
