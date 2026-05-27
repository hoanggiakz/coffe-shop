import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { TableActionDto, TableActionMode } from './dto/table-action.dto';
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
import { Prisma, PromotionScope } from '@prisma/client';
import { KafkaService } from '../../kafka/kafka.service';

const ACTIVE_ORDER_STATUSES = ['PENDING', 'CONFIRMED', 'PREPARING', 'READY'] as const;

type MenuAdminListQuery = {
  keyword?: string;
  categoryId?: string;
  includeInactive?: boolean;
  branchId?: string;
};
type ActorScope = {
  role?: string | null;
  branchId?: string | null;
};

type PromotionOrderItemInput = {
  menuItemId: string;
  quantity: number;
  unitPrice: number;
};

type EnrichedOrderItem = {
  menuItemName?: string | null;
};

type EnrichedOrder = {
  tableNumber?: number | null;
  orderItems?: EnrichedOrderItem[];
};

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);
  private readonly tableOrderRateWindowMs = Math.max(Number(process.env.ORDER_TABLE_RATE_LIMIT_WINDOW_MS || 30000), 1000);
  private readonly tableOrderRateMax = Math.max(Number(process.env.ORDER_TABLE_RATE_LIMIT_MAX || 10), 1);
  private readonly tableOrderRateHits = new Map<string, number[]>();

  constructor(
    private prisma: PrismaService,
    private kafkaService: KafkaService,
  ) {}

  private get inventoryServiceUrl() {
    return process.env.INVENTORY_SERVICE_URL || 'http://inventory-service:3005';
  }

  private get userServiceUrl() {
    return process.env.USER_SERVICE_URL || 'http://user-service:3000';
  }

  private get chatServiceApiUrl() {
    return process.env.CHAT_SERVICE_URL || 'http://chat-service:3007/api/chats';
  }

  private get paymentServiceUrl() {
    return process.env.PAYMENT_SERVICE_URL || 'http://payment-service:3004';
  }

  private get tableServiceUrl() {
    return process.env.TABLE_SERVICE_URL || 'http://table-service:3003';
  }

  private get internalServiceToken() {
    return process.env.INTERNAL_SERVICE_TOKEN || 'internal-service-token';
  }

  private async fetchWithRetry(
    url: string,
    init?: RequestInit,
    options?: { attempts?: number; retryDelayMs?: number; retryOnStatuses?: number[] },
  ) {
    const attempts = Math.max(options?.attempts || 3, 1);
    const retryDelayMs = Math.max(options?.retryDelayMs || 250, 0);
    const retryOnStatuses = options?.retryOnStatuses || [429, 500, 502, 503, 504];
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const response = await fetch(url, init);
        if (attempt < attempts && retryOnStatuses.includes(response.status)) {
          this.logger.warn(`Retry ${attempt}/${attempts - 1} for ${url} after status ${response.status}`);
          await this.sleep(retryDelayMs * attempt);
          continue;
        }
        return response;
      } catch (error) {
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

  private enforceTableOrderRateLimit(tableId: string) {
    const normalizedTableId = String(tableId || '').trim();
    if (!normalizedTableId) {
      return;
    }

    const now = Date.now();
    const windowStart = now - this.tableOrderRateWindowMs;
    const currentHits = this.tableOrderRateHits.get(normalizedTableId) || [];
    const activeHits = currentHits.filter((ts) => ts > windowStart);

    if (activeHits.length >= this.tableOrderRateMax) {
      throw new BadRequestException('Ban dang gui yeu cau dat mon qua nhanh, vui long thu lai sau');
    }

    activeHits.push(now);
    this.tableOrderRateHits.set(normalizedTableId, activeHits);

    if (this.tableOrderRateHits.size > 5000) {
      for (const [key, timestamps] of this.tableOrderRateHits.entries()) {
        const recent = timestamps.filter((ts) => ts > windowStart);
        if (recent.length === 0) {
          this.tableOrderRateHits.delete(key);
        } else {
          this.tableOrderRateHits.set(key, recent);
        }
      }
    }
  }

  private normalizeIncomingItemStatus(status: string) {
    const normalized = String(status || '').trim().toUpperCase();
    return normalized === 'READY' ? 'DONE' : normalized;
  }

  private toKitchenItemStatus(status: string) {
    const normalized = String(status || '').trim().toUpperCase();
    return normalized === 'DONE' ? 'READY' : normalized;
  }

  // ── Menu Items ──────────────────────────────────────────
  async getMenu(query: { branchId?: string; tableId?: string } = {}) {
    const requestedBranchId = this.normalizeBranchId(query.branchId);
    const tableId = String(query.tableId || '').trim();
    const resolvedBranchId = requestedBranchId || (tableId ? await this.resolveBranchIdFromTable(tableId) : null);

    if (!resolvedBranchId) {
      const items = await this.prisma.menuItem.findMany({
        where: {
          available: true,
          ingredients: { some: {} },
        },
        include: {
          categoryRef: true,
          optionGroups: {
            include: {
              group: {
                include: {
                  values: {
                    where: { isActive: true },
                    orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
                  },
                },
              },
            },
            orderBy: { sortOrder: 'asc' },
          },
        },
        orderBy: [{ category: 'asc' }, { name: 'asc' }],
      });
      return items.map((item) => this.mapMenuItemForCustomer(item));
    }

    const branchItems = await this.prisma.branchMenuItem.findMany({
      where: {
        branchId: resolvedBranchId,
        isAvailable: true,
        menuItem: {
          available: true,
          ingredients: { some: {} },
        },
      },
      include: {
        menuItem: {
          include: {
            categoryRef: true,
            optionGroups: {
              include: {
                group: {
                  include: {
                    values: {
                      where: { isActive: true },
                      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
                    },
                  },
                },
              },
              orderBy: { sortOrder: 'asc' },
            },
          },
        },
      },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
    });

    return branchItems.map((entry) => this.mapMenuItemForCustomer(entry.menuItem, entry));
  }

  async getBranchMenu(branchId: string, tableId?: string) {
    const requestedBranchId = this.normalizeBranchId(branchId);
    if (!requestedBranchId) {
      throw new BadRequestException('branchId khong hop le');
    }
    const tableIdNormalized = String(tableId || '').trim();
    const resolvedBranchId =
      requestedBranchId || (tableIdNormalized ? await this.resolveBranchIdFromTable(tableIdNormalized) : null);
    if (!resolvedBranchId) {
      throw new BadRequestException('Khong xac dinh duoc chi nhanh');
    }

    const entries = await this.prisma.branchMenuItem.findMany({
      where: {
        branchId: resolvedBranchId,
        isAvailable: true,
        menuItem: { available: true },
      },
      include: {
        menuItem: {
          include: {
            categoryRef: true,
            optionGroups: {
              include: {
                group: {
                  include: {
                    values: {
                      where: { isActive: true },
                      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
                    },
                  },
                },
              },
              orderBy: [{ sortOrder: 'asc' }],
            },
          },
        },
      },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
    });

    return entries.map((entry) => this.mapBranchMenuItemResponse(entry.menuItem, entry));
  }

  async activateBranchMenuItem(
    branchId: string,
    itemId: string,
    payload: { price?: number; is_available?: boolean; display_order?: number; custom_options?: any },
    actor?: ActorScope,
  ) {
    const normalizedBranchId = this.normalizeBranchId(branchId);
    if (!normalizedBranchId) {
      throw new BadRequestException('branchId khong hop le');
    }
    this.assertManagerCanManageBranch(normalizedBranchId, actor);

    const normalizedItemId = String(itemId || '').trim();
    if (!normalizedItemId) {
      throw new BadRequestException('itemId khong hop le');
    }

    const existingBranchItem = await this.prisma.branchMenuItem.findUnique({
      where: { branchId_menuItemId: { branchId: normalizedBranchId, menuItemId: normalizedItemId } },
      include: {
        menuItem: { include: { categoryRef: true, optionGroups: { include: { group: { include: { values: true } } } } } },
      },
    });
    if (existingBranchItem) {
      const updated = await this.prisma.branchMenuItem.update({
        where: { id: existingBranchItem.id },
        data: {
          isAvailable: payload.is_available ?? true,
          ...(payload.price !== undefined ? { price: Number(payload.price) } : {}),
          ...(payload.custom_options !== undefined ? { customOptions: payload.custom_options } : {}),
          ...(payload.display_order !== undefined ? { displayOrder: Number(payload.display_order) } : {}),
        },
        include: {
          menuItem: { include: { categoryRef: true, optionGroups: { include: { group: { include: { values: true } } } } } },
        },
      });
      return this.mapBranchMenuItemResponse(updated.menuItem, updated);
    }

    const source = await this.prisma.menuItem.findUnique({
      where: { id: normalizedItemId },
      select: { id: true, price: true, available: true },
    });
    if (!source) {
      throw new NotFoundException(`Khong tim thay mon ${normalizedItemId}`);
    }

    const created = await this.prisma.branchMenuItem.create({
      data: {
        branchId: normalizedBranchId,
        menuItemId: source.id,
        price: payload.price !== undefined ? Number(payload.price) : Number(source.price || 0),
        isAvailable: payload.is_available ?? true,
        displayOrder: Number.isFinite(payload.display_order) ? Number(payload.display_order) : 0,
        customOptions: payload.custom_options,
      },
      include: {
        menuItem: {
          include: {
            categoryRef: true,
            optionGroups: { include: { group: { include: { values: true } } } },
          },
        },
      },
    });
    return this.mapBranchMenuItemResponse(created.menuItem, created);
  }

  async updateBranchMenuItem(
    branchId: string,
    itemId: string,
    payload: { price?: number; is_available?: boolean; display_order?: number; custom_options?: any },
    actor?: ActorScope,
  ) {
    const normalizedBranchId = this.normalizeBranchId(branchId);
    if (!normalizedBranchId) {
      throw new BadRequestException('branchId khong hop le');
    }
    this.assertManagerCanManageBranch(normalizedBranchId, actor);

    const normalizedItemId = String(itemId || '').trim();
    const existing = await this.prisma.branchMenuItem.findUnique({
      where: { branchId_menuItemId: { branchId: normalizedBranchId, menuItemId: normalizedItemId } },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException(`Khong tim thay mon ${normalizedItemId} trong chi nhanh`);
    }

    const updated = await this.prisma.branchMenuItem.update({
      where: { id: existing.id },
      data: {
        ...(payload.price !== undefined ? { price: Number(payload.price) } : {}),
        ...(payload.is_available !== undefined ? { isAvailable: payload.is_available } : {}),
        ...(payload.custom_options !== undefined ? { customOptions: payload.custom_options } : {}),
        ...(payload.display_order !== undefined ? { displayOrder: Number(payload.display_order) } : {}),
      },
      include: {
        menuItem: {
          include: {
            categoryRef: true,
            optionGroups: {
              include: {
                group: {
                  include: {
                    values: {
                      where: { isActive: true },
                      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
                    },
                  },
                },
              },
              orderBy: [{ sortOrder: 'asc' }],
            },
          },
        },
      },
    });

    return this.mapBranchMenuItemResponse(updated.menuItem, updated);
  }

  async removeBranchMenuItem(branchId: string, itemId: string, actor?: ActorScope) {
    const normalizedBranchId = this.normalizeBranchId(branchId);
    if (!normalizedBranchId) {
      throw new BadRequestException('branchId khong hop le');
    }
    this.assertManagerCanManageBranch(normalizedBranchId, actor);

    const normalizedItemId = String(itemId || '').trim();
    const existing = await this.prisma.branchMenuItem.findUnique({
      where: { branchId_menuItemId: { branchId: normalizedBranchId, menuItemId: normalizedItemId } },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException(`Khong tim thay mon ${normalizedItemId} trong chi nhanh`);
    }

    await this.prisma.branchMenuItem.update({
      where: { id: existing.id },
      data: { isAvailable: false },
    });
    return { id: existing.id, deleted: true };
  }

  async listMenuCategories(query: { includeInactive?: boolean; branchId?: string }) {
    const branchId = this.normalizeBranchId(query.branchId);
    return this.prisma.menuCategory.findMany({
      where: {
        ...(query.includeInactive ? {} : { isActive: true }),
        ...(branchId
          ? {
              OR: [{ branchId }, { branchId: null }],
            }
          : {}),
      },
      include: {
        _count: {
          select: { menuItems: true },
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async createMenuCategory(dto: CreateMenuCategoryDto) {
    const name = String(dto.name || '').trim();
    if (!name) {
      throw new BadRequestException('Ten danh muc khong duoc de trong');
    }
    const branchId = this.normalizeBranchId(dto.branchId);

    const existed = await this.prisma.menuCategory.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        branchId: branchId ?? null,
      },
      select: { id: true },
    });
    if (existed) {
      throw new BadRequestException('Danh muc da ton tai');
    }

    return this.prisma.menuCategory.create({
      data: {
        name,
        branchId,
        description: dto.description ? String(dto.description).trim() : null,
        sortOrder: Number.isFinite(dto.sortOrder) ? Number(dto.sortOrder) : 0,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async updateMenuCategory(id: string, dto: UpdateMenuCategoryDto) {
    const existingCategory = await this.ensureMenuCategoryExists(id);
    const branchId =
      dto.branchId !== undefined
        ? this.normalizeBranchId(dto.branchId)
        : existingCategory.branchId;

    const data: Prisma.MenuCategoryUpdateInput = {};
    if (dto.name !== undefined) {
      const name = String(dto.name || '').trim();
      if (!name) {
        throw new BadRequestException('Ten danh muc khong duoc de trong');
      }
      const existed = await this.prisma.menuCategory.findFirst({
        where: {
          name: { equals: name, mode: 'insensitive' },
          branchId: branchId ?? null,
          NOT: { id },
        },
        select: { id: true },
      });
      if (existed) {
        throw new BadRequestException('Ten danh muc da ton tai');
      }
      data.name = name;
    }

    if (dto.description !== undefined) {
      data.description = String(dto.description || '').trim() || null;
    }

    if (dto.sortOrder !== undefined) {
      data.sortOrder = Number(dto.sortOrder);
    }

    if (dto.isActive !== undefined) {
      data.isActive = dto.isActive;
    }

    if (dto.branchId !== undefined) {
      const duplicate = await this.prisma.menuCategory.findFirst({
        where: {
          name: { equals: dto.name !== undefined ? String(dto.name || '').trim() : existingCategory.name, mode: 'insensitive' },
          branchId: branchId ?? null,
          NOT: { id },
        },
        select: { id: true },
      });
      if (duplicate) {
        throw new BadRequestException('Ten danh muc da ton tai trong chi nhanh');
      }
      data.branchId = this.normalizeBranchId(dto.branchId);
    }

    return this.prisma.menuCategory.update({
      where: { id },
      data,
    });
  }

  async deleteMenuCategory(id: string) {
    await this.ensureMenuCategoryExists(id);
    await this.prisma.menuCategory.delete({ where: { id } });
    return { id, deleted: true };
  }

  async listMenuOptionGroups(query: { includeInactive?: boolean; branchId?: string }) {
    const branchId = this.normalizeBranchId(query.branchId);
    const includeInactive = query.includeInactive === true;
    return this.prisma.menuOptionGroup.findMany({
      where: {
        ...(includeInactive ? {} : { isActive: true }),
        ...(branchId
          ? {
              OR: [{ branchId }, { branchId: null }],
            }
          : {}),
      },
      include: {
        values: {
          where: includeInactive ? undefined : { isActive: true },
          orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
        },
        _count: {
          select: { menuItems: true },
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async createMenuOptionGroup(dto: CreateMenuOptionGroupDto) {
    const name = String(dto.name || '').trim();
    if (!name) {
      throw new BadRequestException('Ten nhom tuy chon khong duoc de trong');
    }
    const branchId = this.normalizeBranchId(dto.branchId);

    return this.prisma.menuOptionGroup.create({
      data: {
        name,
        branchId,
        type: dto.type || 'SINGLE',
        isGlobal: branchId ? false : dto.isGlobal ?? true,
        isActive: dto.isActive ?? true,
        sortOrder: Number.isFinite(dto.sortOrder) ? Number(dto.sortOrder) : 0,
      },
      include: { values: true },
    });
  }

  async updateMenuOptionGroup(id: string, dto: UpdateMenuOptionGroupDto) {
    await this.ensureOptionGroupExists(id);
    return this.prisma.menuOptionGroup.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: String(dto.name || '').trim() } : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.isGlobal !== undefined ? { isGlobal: dto.isGlobal } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: Number(dto.sortOrder) } : {}),
        ...(dto.branchId !== undefined ? { branchId: this.normalizeBranchId(dto.branchId) } : {}),
      },
      include: {
        values: {
          orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
        },
      },
    });
  }

  async deleteMenuOptionGroup(id: string) {
    await this.ensureOptionGroupExists(id);
    await this.prisma.menuOptionGroup.delete({ where: { id } });
    return { id, deleted: true };
  }

  async createMenuOptionValue(groupId: string, dto: CreateMenuOptionValueDto) {
    const group = await this.ensureOptionGroupExists(groupId);
    if (group.type === 'TEXT') {
      throw new BadRequestException('Nhom tuy chon kieu TEXT khong ho tro option value');
    }

    const payload: Prisma.MenuOptionValueCreateInput = {
      value: String(dto.value || '').trim(),
      label: String(dto.label || '').trim(),
      priceDelta: Number.isFinite(dto.priceDelta) ? Number(dto.priceDelta) : 0,
      isDefault: dto.isDefault ?? false,
      isActive: dto.isActive ?? true,
      sortOrder: Number.isFinite(dto.sortOrder) ? Number(dto.sortOrder) : 0,
      group: { connect: { id: groupId } },
    };

    if (!payload.value || !payload.label) {
      throw new BadRequestException('Value va label khong duoc de trong');
    }

    return this.prisma.$transaction(async (tx) => {
      if (payload.isDefault) {
        await tx.menuOptionValue.updateMany({
          where: { groupId },
          data: { isDefault: false },
        });
      }
      return tx.menuOptionValue.create({ data: payload });
    });
  }

  async updateMenuOptionValue(id: string, dto: UpdateMenuOptionValueDto) {
    const existing = await this.prisma.menuOptionValue.findUnique({
      where: { id },
      select: { id: true, groupId: true },
    });
    if (!existing) {
      throw new NotFoundException(`Khong tim thay option value ${id}`);
    }

    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault === true) {
        await tx.menuOptionValue.updateMany({
          where: { groupId: existing.groupId },
          data: { isDefault: false },
        });
      }
      return tx.menuOptionValue.update({
        where: { id },
        data: {
          ...(dto.value !== undefined ? { value: String(dto.value || '').trim() } : {}),
          ...(dto.label !== undefined ? { label: String(dto.label || '').trim() } : {}),
          ...(dto.priceDelta !== undefined ? { priceDelta: Number(dto.priceDelta) } : {}),
          ...(dto.isDefault !== undefined ? { isDefault: dto.isDefault } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          ...(dto.sortOrder !== undefined ? { sortOrder: Number(dto.sortOrder) } : {}),
        },
      });
    });
  }

  async deleteMenuOptionValue(id: string) {
    const existing = await this.prisma.menuOptionValue.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException(`Khong tim thay option value ${id}`);
    }

    await this.prisma.menuOptionValue.delete({ where: { id } });
    return { id, deleted: true };
  }

  async listMenuItemsForAdmin(query: MenuAdminListQuery, actor?: ActorScope) {
    const keyword = String(query.keyword || '').trim();
    const categoryId = String(query.categoryId || '').trim();
    const branchId = this.resolveAdminMenuBranchScope(this.normalizeBranchId(query.branchId), actor);
    const andConditions: Prisma.MenuItemWhereInput[] = [];
    if (keyword) {
      andConditions.push({
        OR: [
          { name: { contains: keyword, mode: Prisma.QueryMode.insensitive } },
          { description: { contains: keyword, mode: Prisma.QueryMode.insensitive } },
          { category: { contains: keyword, mode: Prisma.QueryMode.insensitive } },
        ],
      });
    }

    const where: Prisma.MenuItemWhereInput = {
      ...(query.includeInactive ? {} : { available: true }),
      ...(categoryId ? { categoryId } : {}),
      ...(andConditions.length ? { AND: andConditions } : {}),
    };

    const items = await this.prisma.menuItem.findMany({
      where,
      include: {
        categoryRef: true,
        optionGroups: {
          include: {
            group: {
              include: {
                values: {
                  orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
                },
              },
            },
          },
          orderBy: [{ sortOrder: 'asc' }],
        },
        ingredients: {
          orderBy: [{ createdAt: 'asc' }],
        },
        ...(branchId
          ? {
              branchMenuItems: {
                where: { branchId },
                take: 1,
                orderBy: [{ updatedAt: 'desc' }],
              },
            }
          : {}),
      },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });

    return items
      .map((item) => {
        const mapped = this.mapMenuItemForAdmin(item);
        const override = Array.isArray((item as any).branchMenuItems) ? (item as any).branchMenuItems[0] : null;
        if (override) {
          return {
            ...mapped,
            branchId,
            price: Number(override.price || 0),
            available: Boolean(override.isAvailable),
            customizations: override.customOptions ?? mapped.customizations,
            displayOrder: Number(override.displayOrder || 0),
          };
        }
        if (branchId) {
          return {
            ...mapped,
            branchId,
            available: false,
          };
        }
        return mapped;
      });
  }

  async createMenuItemForAdmin(dto: CreateMenuItemManagementDto, actor?: ActorScope) {
    const normalizedName = String(dto.name || '').trim();
    if (!normalizedName) {
      throw new BadRequestException('Ten mon khong duoc de trong');
    }
    const branchId = this.resolveAdminMenuBranchScope(this.normalizeBranchId(dto.branchId), actor);

    const category = await this.resolveCategory(dto.categoryId, undefined);
    const optionBindings = this.normalizeOptionBindings(dto.optionGroups);
    const recipe = await this.hydrateRecipeWithInventory(this.normalizeRecipe(dto.recipe), branchId);
    const nextAvailable = dto.available ?? true;
    if (nextAvailable && !recipe.length) {
      throw new BadRequestException('Mon dang ban phai co cong thuc nguyen lieu de tru kho tu dong');
    }
    const optionGroups = await this.loadOptionGroupsForBinding(optionBindings, branchId);
    const customizations = this.buildCustomizations(optionGroups, optionBindings);

    const created = await this.prisma.$transaction(async (tx) => {
      const menuItem = await tx.menuItem.create({
        data: {
          name: normalizedName,
          description: dto.description ? String(dto.description).trim() : null,
          price: Number(dto.price),
          image: dto.image ? String(dto.image).trim() : null,
          available: dto.available ?? true,
          categoryId: category?.id ?? null,
          category: category?.name || 'Khac',
          customizations,
        },
      });

      if (branchId) {
        await tx.branchMenuItem.upsert({
          where: { branchId_menuItemId: { branchId, menuItemId: menuItem.id } },
          update: {
            price: Number(dto.price),
            isAvailable: dto.available ?? true,
            customOptions: customizations,
          },
          create: {
            branchId,
            menuItemId: menuItem.id,
            price: Number(dto.price),
            isAvailable: dto.available ?? true,
            displayOrder: 0,
            customOptions: customizations,
          },
        });
      }

      if (optionBindings.length) {
        await tx.menuItemOptionGroup.createMany({
          data: optionBindings.map((binding) => ({
            menuItemId: menuItem.id,
            groupId: binding.groupId,
            required: binding.required,
            sortOrder: binding.sortOrder,
          })),
        });
      }

      if (recipe.length) {
        await tx.menuItemIngredient.createMany({
          data: recipe.map((entry) => ({
            menuItemId: menuItem.id,
            ingredientId: entry.ingredientId,
            ingredientName: entry.ingredientName || null,
            quantity: entry.quantity,
            unit: entry.unit || null,
          })),
        });
      }

      return menuItem;
    });

    return this.getMenuItemForAdmin(created.id);
  }

  async updateMenuItemForAdmin(id: string, dto: UpdateMenuItemManagementDto, actor?: ActorScope) {
    const existing = await this.prisma.menuItem.findUnique({
      where: { id },
      select: {
        id: true,
        categoryId: true,
        available: true,
        _count: {
          select: {
            ingredients: true,
          },
        },
      },
    });
    if (!existing) {
      throw new NotFoundException(`Khong tim thay mon ${id}`);
    }
    if (dto.branchId) {
      this.assertManagerCanManageBranch(dto.branchId, actor);
    }

    const nextBranchId =
      dto.branchId !== undefined
        ? this.resolveAdminMenuBranchScope(this.normalizeBranchId(dto.branchId), actor)
        : this.resolveAdminMenuBranchScope(this.normalizeBranchId(actor?.branchId), actor);

    const shouldUpdateOptionBindings = Array.isArray(dto.optionGroups);
    const shouldUpdateRecipe = Array.isArray(dto.recipe);
    const optionBindings = shouldUpdateOptionBindings ? this.normalizeOptionBindings(dto.optionGroups) : [];
    const recipe = shouldUpdateRecipe
      ? await this.hydrateRecipeWithInventory(this.normalizeRecipe(dto.recipe), nextBranchId)
      : [];

    const optionGroups = shouldUpdateOptionBindings
      ? await this.loadOptionGroupsForBinding(optionBindings, nextBranchId)
      : [];

    const nextAvailable = dto.available !== undefined ? dto.available : existing.available;
    const nextRecipeCount = shouldUpdateRecipe ? recipe.length : Number(existing._count?.ingredients || 0);
    if (nextAvailable && nextRecipeCount <= 0) {
      throw new BadRequestException('Mon dang ban phai co cong thuc nguyen lieu de tru kho tu dong');
    }

    const hasCategoryField = dto.categoryId !== undefined;
    const category = hasCategoryField ? await this.resolveCategory(dto.categoryId, undefined) : undefined;

    const data: Prisma.MenuItemUpdateInput = {
      ...(dto.name !== undefined ? { name: String(dto.name || '').trim() } : {}),
      ...(dto.description !== undefined ? { description: String(dto.description || '').trim() || null } : {}),
      ...(dto.price !== undefined ? { price: Number(dto.price) } : {}),
      ...(dto.image !== undefined ? { image: String(dto.image || '').trim() || null } : {}),
      ...(dto.available !== undefined ? { available: dto.available } : {}),
      ...(hasCategoryField ? { categoryId: category?.id || null } : {}),
      ...(hasCategoryField ? { category: category?.name || 'Khac' } : {}),
      ...(shouldUpdateOptionBindings ? { customizations: this.buildCustomizations(optionGroups, optionBindings) } : {}),
    };

    await this.prisma.$transaction(async (tx) => {
      await tx.menuItem.update({
        where: { id },
        data,
      });

      if (nextBranchId) {
        const nextPrice = dto.price !== undefined ? Number(dto.price) : undefined;
        const nextAvailable = dto.available !== undefined ? dto.available : undefined;
        const nextCustomOptions = shouldUpdateOptionBindings ? this.buildCustomizations(optionGroups, optionBindings) : undefined;
        await tx.branchMenuItem.upsert({
          where: { branchId_menuItemId: { branchId: nextBranchId, menuItemId: id } },
          update: {
            ...(nextPrice !== undefined ? { price: nextPrice } : {}),
            ...(nextAvailable !== undefined ? { isAvailable: nextAvailable } : {}),
            ...(nextCustomOptions !== undefined ? { customOptions: nextCustomOptions } : {}),
          },
          create: {
            branchId: nextBranchId,
            menuItemId: id,
            price: nextPrice ?? Number(dto.price ?? 0),
            isAvailable: nextAvailable ?? true,
            displayOrder: 0,
            customOptions: nextCustomOptions,
          },
        });
      }

      if (shouldUpdateOptionBindings) {
        await tx.menuItemOptionGroup.deleteMany({ where: { menuItemId: id } });
        if (optionBindings.length) {
          await tx.menuItemOptionGroup.createMany({
            data: optionBindings.map((binding) => ({
              menuItemId: id,
              groupId: binding.groupId,
              required: binding.required,
              sortOrder: binding.sortOrder,
            })),
          });
        }
      }

      if (shouldUpdateRecipe) {
        await tx.menuItemIngredient.deleteMany({ where: { menuItemId: id } });
        if (recipe.length) {
          await tx.menuItemIngredient.createMany({
            data: recipe.map((entry) => ({
              menuItemId: id,
              ingredientId: entry.ingredientId,
              ingredientName: entry.ingredientName || null,
              quantity: entry.quantity,
              unit: entry.unit || null,
            })),
          });
        }
      }
    });

    return this.getMenuItemForAdmin(id);
  }

  async deleteMenuItemForAdmin(id: string, actor?: ActorScope) {
    const existing = await this.prisma.menuItem.findUnique({
      where: { id },
      select: { id: true, available: true },
    });
    if (!existing) {
      throw new NotFoundException(`Khong tim thay mon ${id}`);
    }
    const actorBranchId = this.normalizeBranchId(actor?.branchId);
    if (String(actor?.role || '').trim().toUpperCase() === 'MANAGER' && actorBranchId) {
      await this.prisma.branchMenuItem.updateMany({
        where: { menuItemId: id, branchId: actorBranchId },
        data: { isAvailable: false },
      });
    } else {
      await this.prisma.menuItem.update({
        where: { id },
        data: { available: false },
      });
      await this.prisma.branchMenuItem.updateMany({
        where: { menuItemId: id },
        data: { isAvailable: false },
      });
    }

    return { id, deleted: true };
  }

  private async getMenuItemForAdmin(id: string) {
    const item = await this.prisma.menuItem.findUnique({
      where: { id },
      include: {
        categoryRef: true,
        optionGroups: {
          include: {
            group: {
              include: {
                values: {
                  orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
                },
              },
            },
          },
          orderBy: [{ sortOrder: 'asc' }],
        },
        ingredients: {
          orderBy: [{ createdAt: 'asc' }],
        },
      },
    });

    if (!item) {
      throw new NotFoundException(`Khong tim thay mon ${id}`);
    }

    return this.mapMenuItemForAdmin(item);
  }

  private mapMenuItemForCustomer(item: any, branchItem?: any) {
    return {
      id: item.id,
      branchId: branchItem?.branchId || null,
      name: item.name,
      description: item.description,
      price: Number(branchItem?.price ?? item.price),
      image: item.image,
      categoryId: item.categoryId || null,
      category: item.categoryRef?.name || item.category || 'Khac',
      available: Boolean(branchItem?.isAvailable ?? item.available),
      customizations: branchItem?.customOptions ?? this.resolveCustomizations(item),
    };
  }

  private mapMenuItemForAdmin(item: any) {
    return {
      id: item.id,
      branchId: null,
      name: item.name,
      description: item.description,
      price: Number(item.price),
      image: item.image,
      categoryId: item.categoryId || null,
      category: item.categoryRef?.name || item.category || 'Khac',
      available: Boolean(item.available),
      customizations: this.resolveCustomizations(item),
      optionGroups: (item.optionGroups || []).map((binding: any) => ({
        id: binding.group?.id,
        name: binding.group?.name,
        type: binding.group?.type,
        required: Boolean(binding.required),
        sortOrder: Number(binding.sortOrder || 0),
        isGlobal: Boolean(binding.group?.isGlobal),
        isActive: Boolean(binding.group?.isActive),
        values: (binding.group?.values || []).map((value: any) => ({
          id: value.id,
          value: value.value,
          label: value.label,
          priceDelta: Number(value.priceDelta || 0),
          isDefault: Boolean(value.isDefault),
          isActive: Boolean(value.isActive),
          sortOrder: Number(value.sortOrder || 0),
        })),
      })),
      recipe: (item.ingredients || []).map((ingredient: any) => ({
        id: ingredient.id,
        ingredientId: ingredient.ingredientId,
        ingredientName: ingredient.ingredientName,
        quantity: Number(ingredient.quantity),
        unit: ingredient.unit,
      })),
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }

  private resolveCustomizations(item: any) {
    if (Array.isArray(item.customizations) && item.customizations.length) {
      return item.customizations;
    }

    const bindings = (item.optionGroups || []).map((binding: any) => ({
      groupId: binding.groupId,
      required: Boolean(binding.required),
      sortOrder: Number(binding.sortOrder || 0),
    }));

    const groups = (item.optionGroups || []).map((binding: any) => binding.group).filter(Boolean);
    return this.buildCustomizations(groups, bindings);
  }

  private buildCustomizations(groups: any[], bindings: Array<{ groupId: string; required: boolean; sortOrder: number }>) {
    if (!groups?.length || !bindings?.length) {
      return [];
    }

    const groupMap = new Map(groups.map((group) => [group.id, group]));
    return [...bindings]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((binding) => {
        const group = groupMap.get(binding.groupId);
        if (!group) {
          return null;
        }

        const type = String(group.type || 'SINGLE').toLowerCase();
        const values = Array.isArray(group.values) ? [...group.values] : [];

        return {
          id: group.id,
          label: group.name,
          type,
          required: binding.required,
          options: values
            .filter((value: any) => value.isActive !== false)
            .sort((a: any, b: any) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0))
            .map((value: any) => ({
              value: value.value,
              label: value.label,
              priceDelta: Number(value.priceDelta || 0),
              isDefault: Boolean(value.isDefault),
            })),
        };
      })
      .filter(Boolean);
  }

  private normalizeOptionBindings(values?: CreateMenuItemManagementDto['optionGroups']) {
    if (!Array.isArray(values) || !values.length) {
      return [] as Array<{ groupId: string; required: boolean; sortOrder: number }>;
    }

    const normalized = values.map((value, index) => ({
      groupId: String(value.groupId || '').trim(),
      required: Boolean(value.required),
      sortOrder: Number.isFinite(value.sortOrder) ? Number(value.sortOrder) : index,
    }));

    const groupIds = normalized.map((item) => item.groupId).filter(Boolean);
    if (groupIds.length !== normalized.length) {
      throw new BadRequestException('Co option group khong hop le');
    }

    const uniqueSize = new Set(groupIds).size;
    if (uniqueSize !== groupIds.length) {
      throw new BadRequestException('Option group bi trung trong cung mot mon');
    }

    return normalized;
  }

  private normalizeRecipe(values?: CreateMenuItemManagementDto['recipe']) {
    if (!Array.isArray(values) || !values.length) {
      return [] as Array<{ ingredientId: string; ingredientName?: string; quantity: number; unit?: string }>;
    }

    const normalized = values.map((entry) => ({
      ingredientId: String(entry.ingredientId || '').trim(),
      ingredientName: entry.ingredientName ? String(entry.ingredientName).trim() : undefined,
      quantity: Number(entry.quantity),
      unit: entry.unit ? String(entry.unit).trim() : undefined,
    }));

    if (normalized.some((entry) => !entry.ingredientId || !Number.isFinite(entry.quantity) || entry.quantity <= 0)) {
      throw new BadRequestException('Cong thuc mon khong hop le');
    }

    const uniqueSize = new Set(normalized.map((entry) => entry.ingredientId)).size;
    if (uniqueSize !== normalized.length) {
      throw new BadRequestException('Cong thuc mon bi trung ingredient');
    }

    return normalized;
  }

  private async hydrateRecipeWithInventory(
    recipe: Array<{ ingredientId: string; ingredientName?: string; quantity: number; unit?: string }>,
    branchId?: string | null,
  ) {
    if (!recipe.length) {
      return recipe;
    }

    const params = new URLSearchParams();
    params.set('includeInactive', 'true');
    if (branchId) {
      params.set('branchId', branchId);
    }

    try {
      const response = await this.fetchWithRetry(
        `${this.inventoryServiceUrl}/api/v1/ingredients?${params.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${this.internalServiceToken}`,
          },
        },
      );

      if (!response.ok) {
        const body = await response.text();
        this.logger.warn(`Khong tai duoc danh sach nguyen lieu de xac thuc cong thuc: ${response.status} ${body}`);
        throw new BadRequestException('Khong the xac thuc cong thuc nguyen lieu voi kho hien tai');
      }

      const payload = (await response.json()) as Array<{
        id?: string;
        name?: string;
        unit?: string;
        isActive?: boolean;
      }>;

      const ingredientMap = new Map(
        (Array.isArray(payload) ? payload : [])
          .filter((item) => String(item?.id || '').trim())
          .map((item) => [String(item.id).trim(), item]),
      );

      return recipe.map((entry) => {
        const ingredient = ingredientMap.get(entry.ingredientId);
        if (!ingredient) {
          throw new BadRequestException(
            branchId
              ? `Nguyen lieu ${entry.ingredientId} khong ton tai trong chi nhanh ${branchId}`
              : `Nguyen lieu ${entry.ingredientId} khong ton tai`,
          );
        }

        return {
          ...entry,
          ingredientName: String(ingredient.name || entry.ingredientName || '').trim() || entry.ingredientName,
          unit: String(ingredient.unit || entry.unit || '').trim() || entry.unit,
        };
      });
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      this.logger.warn(`Inventory service khong san sang de xac thuc cong thuc: ${(error as Error).message}`);
      throw new BadRequestException('Inventory service khong san sang de xac thuc cong thuc nguyen lieu');
    }
  }

  private async loadOptionGroupsForBinding(
    bindings: Array<{ groupId: string; required: boolean; sortOrder: number }>,
    branchId?: string | null,
  ) {
    if (!bindings.length) {
      return [];
    }

    const groups = await this.prisma.menuOptionGroup.findMany({
      where: {
        id: { in: bindings.map((binding) => binding.groupId) },
        ...(branchId
          ? {
              OR: [{ branchId }, { branchId: null }],
            }
          : {}),
      },
      include: {
        values: {
          where: { isActive: true },
          orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
        },
      },
    });

    if (groups.length !== bindings.length) {
      throw new BadRequestException('Co option group khong ton tai');
    }

    return groups;
  }

  private async resolveCategory(categoryId?: string, branchId?: string | null) {
    if (categoryId === undefined) {
      return undefined;
    }

    const normalized = String(categoryId || '').trim();
    if (!normalized) {
      return null;
    }

    const category = await this.prisma.menuCategory.findUnique({
      where: { id: normalized },
    });
    if (!category) {
      throw new BadRequestException('Danh muc khong ton tai');
    }

    if (branchId && category.branchId && category.branchId !== branchId) {
      throw new BadRequestException('Danh muc khong thuoc chi nhanh duoc chon');
    }
    if (!branchId && category.branchId) {
      throw new BadRequestException('Danh muc nay chi ap dung cho chi nhanh cu the');
    }

    return category;
  }

  private async ensureMenuCategoryExists(id: string) {
    const category = await this.prisma.menuCategory.findUnique({
      where: { id },
    });
    if (!category) {
      throw new NotFoundException(`Khong tim thay danh muc ${id}`);
    }
    return category;
  }

  private async ensureOptionGroupExists(id: string) {
    const optionGroup = await this.prisma.menuOptionGroup.findUnique({
      where: { id },
    });
    if (!optionGroup) {
      throw new NotFoundException(`Khong tim thay option group ${id}`);
    }
    return optionGroup;
  }

  private extractExtraAmount(options?: string): number {
    if (!options) return 0;
    try {
      const parsed = JSON.parse(options);
      const extra = Number(parsed?.extraAmount || 0);
      return Number.isFinite(extra) && extra > 0 ? Math.round(extra) : 0;
    } catch {
      return 0;
    }
  }

  async listPromotions(query: QueryPromotionDto = {}) {
    const includeInactive = query.includeInactive === 'true';
    const keyword = String(query.keyword || '').trim();
    const branchId = this.normalizeBranchId(query.branchId);
    const andConditions: Prisma.PromotionCodeWhereInput[] = [];
    if (branchId) {
      andConditions.push({
        OR: [{ branchId }, { branchId: null }],
      });
    }
    if (keyword) {
      andConditions.push({
        OR: [
          { code: { contains: keyword, mode: Prisma.QueryMode.insensitive } },
          { description: { contains: keyword, mode: Prisma.QueryMode.insensitive } },
        ],
      });
    }

    const promotions = await this.prisma.promotionCode.findMany({
      where: {
        ...(includeInactive ? {} : { isActive: true }),
        ...(query.appliesTo ? { appliesTo: query.appliesTo } : {}),
        ...(andConditions.length ? { AND: andConditions } : {}),
      },
      orderBy: [{ createdAt: 'desc' }],
    });

    return promotions.map((promo) => this.mapPromotion(promo));
  }

  async createPromotion(dto: CreatePromotionDto) {
    const code = String(dto.code || '').trim().toUpperCase();
    const branchId = this.normalizeBranchId(dto.branchId);
    if (!code) {
      throw new BadRequestException('Ma khuyen mai khong duoc de trong');
    }

    if (dto.discountType === 'PERCENT' && dto.discountValue > 100) {
      throw new BadRequestException('Khuyen mai phan tram khong duoc vuot qua 100');
    }

    const appliesTo = dto.appliesTo || PromotionScope.ORDER;
    const menuItemIds = this.normalizePromotionMenuItemIds(dto.menuItemIds);
    if (appliesTo === PromotionScope.ITEM && !menuItemIds.length) {
      throw new BadRequestException('Khuyen mai theo mon can it nhat 1 mon ap dung');
    }

    if (menuItemIds.length) {
      await this.ensureMenuItemsExist(menuItemIds, branchId);
    }

    const startAt = dto.startAt ? new Date(dto.startAt) : null;
    const endAt = dto.endAt ? new Date(dto.endAt) : null;
    if (startAt && endAt && startAt.getTime() > endAt.getTime()) {
      throw new BadRequestException('Thoi gian bat dau phai nho hon hoac bang thoi gian ket thuc');
    }

    const existed = await this.prisma.promotionCode.findUnique({
      where: { code },
      select: { id: true },
    });
    if (existed) {
      throw new BadRequestException('Ma khuyen mai da ton tai');
    }

    const created = await this.prisma.promotionCode.create({
      data: {
        code,
        branchId,
        description: String(dto.description || '').trim() || null,
        discountType: dto.discountType,
        discountValue: Number(dto.discountValue),
        appliesTo,
        menuItemIds: appliesTo === PromotionScope.ITEM ? menuItemIds : [],
        minOrderAmount: dto.minOrderAmount ?? 0,
        maxDiscount: dto.maxDiscount ?? null,
        usageLimit: dto.usageLimit ?? null,
        isActive: dto.isActive ?? true,
        startAt,
        endAt,
      },
    });

    return this.mapPromotion(created);
  }

  async updatePromotion(id: string, dto: UpdatePromotionDto) {
    const existing = await this.prisma.promotionCode.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException(`Khong tim thay ma khuyen mai ${id}`);
    }

    const nextCode = dto.code !== undefined
      ? String(dto.code || '').trim().toUpperCase()
      : existing.code;
    if (!nextCode) {
      throw new BadRequestException('Ma khuyen mai khong duoc de trong');
    }

    if (dto.code !== undefined && nextCode !== existing.code) {
      const duplicate = await this.prisma.promotionCode.findUnique({
        where: { code: nextCode },
        select: { id: true },
      });
      if (duplicate) {
        throw new BadRequestException('Ma khuyen mai da ton tai');
      }
    }

    const nextBranchId = dto.branchId !== undefined
      ? this.normalizeBranchId(dto.branchId)
      : existing.branchId;

    const nextDiscountType = dto.discountType ?? existing.discountType;
    const nextDiscountValue = dto.discountValue ?? existing.discountValue;
    if (nextDiscountType === 'PERCENT' && nextDiscountValue > 100) {
      throw new BadRequestException('Khuyen mai phan tram khong duoc vuot qua 100');
    }

    const existingMenuItemIds = this.parsePromotionMenuItemIds(existing.menuItemIds);
    const nextAppliesTo = dto.appliesTo ?? existing.appliesTo;
    const nextMenuItemIds = dto.menuItemIds !== undefined
      ? this.normalizePromotionMenuItemIds(dto.menuItemIds)
      : existingMenuItemIds;

    if (nextAppliesTo === PromotionScope.ITEM && !nextMenuItemIds.length) {
      throw new BadRequestException('Khuyen mai theo mon can it nhat 1 mon ap dung');
    }
    if (nextMenuItemIds.length) {
      await this.ensureMenuItemsExist(nextMenuItemIds, nextBranchId);
    }

    const nextStartAt = dto.startAt !== undefined ? (dto.startAt ? new Date(dto.startAt) : null) : existing.startAt;
    const nextEndAt = dto.endAt !== undefined ? (dto.endAt ? new Date(dto.endAt) : null) : existing.endAt;
    if (nextStartAt && nextEndAt && nextStartAt.getTime() > nextEndAt.getTime()) {
      throw new BadRequestException('Thoi gian bat dau phai nho hon hoac bang thoi gian ket thuc');
    }

    const updated = await this.prisma.promotionCode.update({
      where: { id },
      data: {
        ...(dto.code !== undefined ? { code: nextCode } : {}),
        ...(dto.branchId !== undefined ? { branchId: this.normalizeBranchId(dto.branchId) } : {}),
        ...(dto.description !== undefined ? { description: String(dto.description || '').trim() || null } : {}),
        ...(dto.discountType !== undefined ? { discountType: dto.discountType } : {}),
        ...(dto.discountValue !== undefined ? { discountValue: Number(dto.discountValue) } : {}),
        ...(dto.appliesTo !== undefined ? { appliesTo: dto.appliesTo } : {}),
        ...(dto.menuItemIds !== undefined || dto.appliesTo !== undefined
          ? { menuItemIds: nextAppliesTo === PromotionScope.ITEM ? nextMenuItemIds : [] }
          : {}),
        ...(dto.minOrderAmount !== undefined ? { minOrderAmount: Number(dto.minOrderAmount) } : {}),
        ...(dto.maxDiscount !== undefined ? { maxDiscount: dto.maxDiscount === null ? null : Number(dto.maxDiscount) } : {}),
        ...(dto.usageLimit !== undefined ? { usageLimit: dto.usageLimit === null ? null : Number(dto.usageLimit) } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.startAt !== undefined ? { startAt: dto.startAt ? new Date(dto.startAt) : null } : {}),
        ...(dto.endAt !== undefined ? { endAt: dto.endAt ? new Date(dto.endAt) : null } : {}),
      },
    });

    return this.mapPromotion(updated);
  }

  async disablePromotion(id: string) {
    const existing = await this.prisma.promotionCode.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException(`Khong tim thay ma khuyen mai ${id}`);
    }

    const updated = await this.prisma.promotionCode.update({
      where: { id },
      data: { isActive: false },
    });
    return this.mapPromotion(updated);
  }

  private parsePromotionMenuItemIds(value: Prisma.JsonValue | null): string[] {
    if (!Array.isArray(value)) {
      return [];
    }
    const normalized = value
      .map((item) => String(item || '').trim())
      .filter(Boolean);
    return [...new Set(normalized)];
  }

  private normalizePromotionMenuItemIds(values?: string[]) {
    if (!Array.isArray(values) || !values.length) {
      return [];
    }
    const normalized = values
      .map((value) => String(value || '').trim())
      .filter(Boolean);
    return [...new Set(normalized)];
  }

  private async ensureMenuItemsExist(menuItemIds: string[], branchId?: string | null) {
    const existed = await this.prisma.menuItem.findMany({
      where: {
        id: { in: menuItemIds },
      },
      select: { id: true },
    });
    if (existed.length !== menuItemIds.length) {
      throw new BadRequestException('Mot hoac nhieu mon ap dung khong ton tai');
    }
    if (branchId) {
      const branchMapped = await this.prisma.branchMenuItem.count({
        where: {
          branchId,
          menuItemId: { in: menuItemIds },
          isAvailable: true,
        },
      });
      if (branchMapped !== menuItemIds.length) {
        throw new BadRequestException('Mot hoac nhieu mon ap dung chua bat tai chi nhanh');
      }
    }
  }

  private mapPromotion(item: any) {
    return {
      ...item,
      menuItemIds: this.parsePromotionMenuItemIds(item.menuItemIds),
    };
  }

  private calculateEligiblePromotionAmount(
    promo: { appliesTo: PromotionScope; menuItemIds: Prisma.JsonValue | null },
    subtotalAmount: number,
    orderItems?: PromotionOrderItemInput[],
    validationMenuItemIds?: string[],
  ) {
    if (promo.appliesTo !== PromotionScope.ITEM) {
      return subtotalAmount;
    }

    const allowedMenuItemIds = new Set(this.parsePromotionMenuItemIds(promo.menuItemIds));
    if (!allowedMenuItemIds.size) {
      throw new BadRequestException('Ma khuyen mai cau hinh sai pham vi ap dung');
    }

    if (Array.isArray(orderItems) && orderItems.length) {
      const eligible = orderItems.reduce((sum, item) => {
        if (!allowedMenuItemIds.has(item.menuItemId)) {
          return sum;
        }
        return sum + Number(item.unitPrice || 0) * Number(item.quantity || 0);
      }, 0);
      return Math.max(0, Math.round(eligible));
    }

    const selected = new Set((validationMenuItemIds || []).map((id) => String(id || '').trim()).filter(Boolean));
    for (const menuItemId of selected) {
      if (allowedMenuItemIds.has(menuItemId)) {
        // Validation endpoint does not send item prices, so use subtotal as best-effort preview.
        return subtotalAmount;
      }
    }
    return 0;
  }

  private async resolvePromotion(
    code: string | undefined,
    subtotalAmount: number,
    orderItems?: PromotionOrderItemInput[],
    validationMenuItemIds?: string[],
    branchId?: string | null,
  ) {
    const normalized = String(code || '').trim().toUpperCase();
    const normalizedBranchId = this.normalizeBranchId(branchId || undefined);
    if (!normalized) {
      return { promo: null, code: null, discountAmount: 0, eligibleAmount: subtotalAmount };
    }

    const promo = await this.prisma.promotionCode.findFirst({
      where: {
        code: normalized,
        ...(normalizedBranchId
          ? {
              OR: [{ branchId: normalizedBranchId }, { branchId: null }],
            }
          : {}),
      },
      orderBy: [{ branchId: 'desc' }],
    });
    if (!promo || !promo.isActive) {
      throw new BadRequestException('Ma khuyen mai khong hop le hoac da ngung hoat dong');
    }

    if (normalizedBranchId && promo.branchId && promo.branchId !== normalizedBranchId) {
      throw new BadRequestException('Ma khuyen mai khong ap dung cho chi nhanh nay');
    }

    const now = new Date();
    if (promo.startAt && now < promo.startAt) {
      throw new BadRequestException('Ma khuyen mai chua den thoi gian su dung');
    }
    if (promo.endAt && now > promo.endAt) {
      throw new BadRequestException('Ma khuyen mai da het han');
    }
    if (subtotalAmount < promo.minOrderAmount) {
      throw new BadRequestException(`Don toi thieu de dung ma la ${promo.minOrderAmount.toLocaleString()}đ`);
    }
    if (promo.usageLimit !== null && promo.usedCount >= promo.usageLimit) {
      throw new BadRequestException('Ma khuyen mai da het luot su dung');
    }

    const eligibleAmount = this.calculateEligiblePromotionAmount(
      promo,
      subtotalAmount,
      orderItems,
      validationMenuItemIds,
    );
    if (eligibleAmount <= 0) {
      throw new BadRequestException('Ma khuyen mai khong ap dung cho cac mon da chon');
    }

    let discountAmount = 0;
    if (promo.discountType === 'PERCENT') {
      discountAmount = Math.round((eligibleAmount * promo.discountValue) / 100);
    } else {
      discountAmount = promo.discountValue;
    }

    if (promo.maxDiscount !== null) {
      discountAmount = Math.min(discountAmount, promo.maxDiscount);
    }

    discountAmount = Math.max(0, Math.min(discountAmount, eligibleAmount, subtotalAmount));

    return { promo, code: normalized, discountAmount, eligibleAmount };
  }

  async validatePromotion(
    code: string,
    subtotalAmount: number,
    menuItemIds?: string[],
    branchId?: string,
    tableId?: string,
  ) {
    if (!Number.isFinite(subtotalAmount) || subtotalAmount < 0) {
      throw new BadRequestException('Tong tien tam tinh khong hop le');
    }

    const normalizedSubtotal = Math.round(subtotalAmount);
    const normalizedBranchId = this.normalizeBranchId(branchId);
    const resolvedBranchId = normalizedBranchId || (tableId ? await this.resolveBranchIdFromTable(tableId) : null);
    const result = await this.resolvePromotion(code, normalizedSubtotal, undefined, menuItemIds, resolvedBranchId);
    if (!result.promo) {
      throw new BadRequestException('Ma khuyen mai khong hop le');
    }

    return {
      code: result.code,
      description: result.promo.description,
      discountType: result.promo.discountType,
      appliesTo: result.promo.appliesTo,
      discountValue: result.promo.discountValue,
      discountAmount: result.discountAmount,
      finalAmount: Math.max(normalizedSubtotal - result.discountAmount, 0),
      eligibleAmount: result.eligibleAmount,
      minOrderAmount: result.promo.minOrderAmount,
      maxDiscount: result.promo.maxDiscount,
      menuItemIds: this.parsePromotionMenuItemIds(result.promo.menuItemIds),
    };
  }

  private normalizeOrderStatus(status?: string) {
    const normalized = String(status || '').trim().toUpperCase();
    if (!normalized) return undefined;

    const allowed = ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED'];
    if (!allowed.includes(normalized)) {
      throw new BadRequestException(`Trang thai don khong hop le: ${status}`);
    }

    return normalized;
  }

  private normalizeBranchId(branchId?: string | null) {
    const normalized = String(branchId || '').trim();
    return normalized || null;
  }

  private async resolveBranchIdFromTable(tableId: string): Promise<string | null> {
    const normalizedTableId = String(tableId || '').trim();
    if (!normalizedTableId) {
      throw new BadRequestException('tableId khong hop le');
    }

    try {
      const response = await this.fetchWithRetry(
        `${this.tableServiceUrl}/api/tables/${encodeURIComponent(normalizedTableId)}`,
      );
      if (!response.ok) {
        const body = await response.text();
        this.logger.warn(`Khong lay duoc thong tin ban ${normalizedTableId}: ${response.status} ${body}`);
        throw new BadRequestException('Khong tim thay ban hoac ban khong hop le');
      }

      const payload = (await response.json()) as { branchId?: string | null };
      return this.normalizeBranchId(payload?.branchId);
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      this.logger.warn(`Table service khong san sang de truy van chi nhanh cua ban ${normalizedTableId}: ${(error as Error).message}`);
      throw new BadRequestException('Khong the xac dinh chi nhanh cua ban');
    }
  }

  private async resolveTableNumber(tableId: string): Promise<number | null> {
    const normalizedTableId = String(tableId || '').trim();
    if (!normalizedTableId) {
      return null;
    }

    try {
      const response = await this.fetchWithRetry(
        `${this.tableServiceUrl}/api/tables/${encodeURIComponent(normalizedTableId)}`,
      );
      if (!response.ok) {
        return null;
      }

      const payload = (await response.json()) as { number?: number | string | null };
      const numberValue = Number(payload?.number);
      return Number.isFinite(numberValue) ? numberValue : null;
    } catch (error) {
      this.logger.warn(`Khong lay duoc so ban ${normalizedTableId}: ${(error as Error).message}`);
      return null;
    }
  }

  private async enrichOrder<T extends { tableId?: string; orderItems?: Array<{ menuItemId?: string }> }>(
    order: T,
  ): Promise<T & EnrichedOrder> {
    const [enriched] = await this.enrichOrders([order]);
    return enriched;
  }

  private async enrichOrders<T extends { tableId?: string; orderItems?: Array<{ menuItemId?: string }> }>(
    orders: T[],
  ): Promise<Array<T & EnrichedOrder>> {
    if (!orders.length) {
      return [];
    }

    const uniqueMenuItemIds = [
      ...new Set(
        orders
          .flatMap((order) => (order.orderItems || []).map((item) => String(item.menuItemId || '').trim()))
          .filter((id) => id.length > 0),
      ),
    ];
    const uniqueTableIds = [
      ...new Set(
        orders
          .map((order) => String(order.tableId || '').trim())
          .filter((id) => id.length > 0),
      ),
    ];

    const [menuItems, tableEntries] = await Promise.all([
      uniqueMenuItemIds.length
        ? this.prisma.menuItem.findMany({
            where: { id: { in: uniqueMenuItemIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
      Promise.all(
        uniqueTableIds.map(async (tableId) => [tableId, await this.resolveTableNumber(tableId)] as const),
      ),
    ]);

    const menuNamesById = new Map(menuItems.map((item) => [item.id, item.name]));
    const tableNumbersById = new Map(tableEntries);

    return orders.map((order) => ({
      ...order,
      tableNumber: tableNumbersById.get(String(order.tableId || '').trim()) ?? null,
      orderItems: (order.orderItems || []).map((item) => ({
        ...item,
        menuItemName: menuNamesById.get(String(item.menuItemId || '').trim()) ?? null,
      })),
    }));
  }

  private parseDateParam(value?: string, key = 'date'): Date | undefined {
    const raw = String(value || '').trim();
    if (!raw) return undefined;

    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`${key} khong hop le`);
    }

    return parsed;
  }

  // ── Orders ──────────────────────────────────────────────
  async create(dto: CreateOrderDto) {
    this.enforceTableOrderRateLimit(dto.tableId);

    const branchIdFromPayload = this.normalizeBranchId(dto.branchId);
    const branchIdFromTable = await this.resolveBranchIdFromTable(dto.tableId);
    const resolvedBranchId = branchIdFromTable || branchIdFromPayload || null;

    if (branchIdFromPayload && branchIdFromTable && branchIdFromPayload !== branchIdFromTable) {
      throw new BadRequestException('branchId khong khop voi chi nhanh cua ban');
    }

    const menuItemIds = dto.items.map((i) => i.menuItemId);
    const menuItems = await this.prisma.menuItem.findMany({
      select: {
        id: true,
        name: true,
        price: true,
        _count: {
          select: {
            ingredients: true,
          },
        },
      },
      where: {
        id: { in: menuItemIds },
        available: true,
      },
    });

    if (menuItems.length !== menuItemIds.length) {
      throw new BadRequestException('Một hoặc nhiều món không hợp lệ hoặc đã hết');
    }
    if (resolvedBranchId) {
      const branchMappings = await this.prisma.branchMenuItem.count({
        where: {
          branchId: resolvedBranchId,
          menuItemId: { in: menuItemIds },
          isAvailable: true,
        },
      });
      if (branchMappings !== menuItemIds.length) {
        throw new BadRequestException('Một hoặc nhiều món chưa được bật tại chi nhánh');
      }
    }
    this.ensureSellableMenuItemsHaveRecipe(menuItems);

    const priceMap = await this.buildMenuPriceMap(menuItemIds, resolvedBranchId, menuItems);
    const normalizedItems = dto.items.map((item) => {
      const basePrice = priceMap.get(item.menuItemId) || 0;
      const extraAmount = this.extractExtraAmount(item.options);
      return {
        ...item,
        unitPrice: basePrice + extraAmount,
      };
    });

    const subtotalAmount = normalizedItems.reduce(
      (sum, item) => sum + item.unitPrice * item.quantity,
      0,
    );

    const promotion = await this.resolvePromotion(dto.promoCode, subtotalAmount, normalizedItems, undefined, resolvedBranchId);
    const discountAmount = promotion.discountAmount;
    const totalAmount = Math.max(subtotalAmount - discountAmount, 0);

    const order = await this.prisma.$transaction(async (tx) => {
      const createdOrder = await tx.order.create({
        data: {
          tableId: dto.tableId,
          branchId: resolvedBranchId,
          customerId: dto.customerId || null,
          customerEmail: dto.customerEmail || null,
          customerName: dto.customerName,
          customerPhone: dto.customerPhone,
          subtotalAmount,
          discountAmount,
          promotionCode: promotion.code || null,
          totalAmount,
          orderItems: {
            create: normalizedItems.map((item) => ({
              menuItemId: item.menuItemId,
              quantity: item.quantity,
              price: item.unitPrice,
              note: item.note,
              options: item.options,
            })),
          },
        },
        include: { orderItems: true },
      });

      if (promotion.promo) {
        await tx.promotionCode.update({
          where: { id: promotion.promo.id },
          data: {
            usedCount: { increment: 1 },
          },
        });
      }

      return createdOrder;
    });

    this.logger.log(
      `Tạo đơn ${order.id} cho bàn ${dto.tableId} – subtotal ${subtotalAmount.toLocaleString()}₫, discount ${discountAmount.toLocaleString()}₫, total ${totalAmount.toLocaleString()}₫`,
    );
    const enrichedOrder = await this.enrichOrder(order);
    const kafkaPublished = await this.kafkaService.orderCreated({
      id: enrichedOrder.id,
      tableId: enrichedOrder.tableId,
      status: enrichedOrder.status,
      totalAmount: Number(enrichedOrder.totalAmount || 0),
      items: (enrichedOrder.orderItems || []).map((item) => ({
        id: item.id,
        menuItemId: item.menuItemId,
        quantity: item.quantity,
        price: item.price,
      })),
    });

    // Fallback path when Kafka is disabled/unavailable: keep realtime ORDER_NEW via chat-service.
    if (!kafkaPublished) {
      await this.notifyNewOrder(enrichedOrder);
    }
    return enrichedOrder;
  }

  async findAll(params: { tableId?: string; status?: string; dateFrom?: string; dateTo?: string; branchId?: string }) {
    const tableId = String(params.tableId || '').trim();
    const branchId = this.normalizeBranchId(params.branchId);
    const status = this.normalizeOrderStatus(params.status);
    const dateFrom = this.parseDateParam(params.dateFrom, 'dateFrom');
    const dateTo = this.parseDateParam(params.dateTo, 'dateTo');

    const where: any = {};
    if (tableId) {
      where.tableId = tableId;
    }
    if (branchId) {
      where.branchId = branchId;
    }
    if (status) {
      where.status = status;
    }
    if (dateFrom || dateTo) {
      where.createdAt = {
        ...(dateFrom ? { gte: dateFrom } : {}),
        ...(dateTo ? { lte: dateTo } : {}),
      };
    }

    const orders = await this.prisma.order.findMany({
      where,
      include: { orderItems: true },
      orderBy: { createdAt: 'desc' },
    });
    return this.enrichOrders(orders);
  }

  async transferOrMergeTables(dto: TableActionDto) {
    const fromTableId = String(dto.fromTableId || '').trim();
    const toTableId = String(dto.toTableId || '').trim();

    if (!fromTableId || !toTableId) {
      throw new BadRequestException('Can fromTableId va toTableId');
    }

    if (fromTableId === toTableId) {
      throw new BadRequestException('Ban nguon va ban dich khong duoc trung nhau');
    }

    const fromBranchId = await this.resolveBranchIdFromTable(fromTableId);
    const toBranchId = await this.resolveBranchIdFromTable(toTableId);
    if (fromBranchId && toBranchId && fromBranchId !== toBranchId) {
      throw new BadRequestException('Khong the chuyen/ghep don giua 2 chi nhanh khac nhau');
    }

    const payload = await this.prisma.$transaction(async (tx) => {
      const sourceOrder = await tx.order.findFirst({
        where: {
          tableId: fromTableId,
          status: { in: ACTIVE_ORDER_STATUSES as any },
        },
        include: { orderItems: true },
        orderBy: { createdAt: 'desc' },
      });

      if (!sourceOrder) {
        throw new BadRequestException('Ban nguon khong co don dang xu ly de chuyen/ghap');
      }

      const targetOrder = await tx.order.findFirst({
        where: {
          tableId: toTableId,
          status: { in: ACTIVE_ORDER_STATUSES as any },
        },
        include: { orderItems: true },
        orderBy: { createdAt: 'desc' },
      });

      if (dto.mode === TableActionMode.TRANSFER) {
        if (targetOrder && targetOrder.id !== sourceOrder.id) {
          throw new BadRequestException('Ban dich dang co don dang xu ly, khong the chuyen don thuong');
        }

        const updatedOrder = await tx.order.update({
          where: { id: sourceOrder.id },
          data: { tableId: toTableId, branchId: toBranchId || sourceOrder.branchId || null },
          include: { orderItems: true },
        });

        return {
          mode: TableActionMode.TRANSFER,
          sourceOrderId: sourceOrder.id,
          targetOrderId: updatedOrder.id,
          resultOrder: updatedOrder,
          note: 'Da chuyen don sang ban moi',
        };
      }

      if (!targetOrder || targetOrder.id === sourceOrder.id) {
        const movedOrder = await tx.order.update({
          where: { id: sourceOrder.id },
          data: { tableId: toTableId, branchId: toBranchId || sourceOrder.branchId || null },
          include: { orderItems: true },
        });

        return {
          mode: TableActionMode.MERGE,
          sourceOrderId: sourceOrder.id,
          targetOrderId: movedOrder.id,
          resultOrder: movedOrder,
          note: 'Ban dich chua co don, da chuyen don sang ban dich',
        };
      }

      const targetItems = [...targetOrder.orderItems];
      for (const sourceItem of sourceOrder.orderItems) {
        const duplicated = targetItems.find((item) =>
          item.menuItemId === sourceItem.menuItemId &&
          (item.options || '') === (sourceItem.options || '') &&
          (item.note || '') === (sourceItem.note || '') &&
          item.price === sourceItem.price &&
          item.status === sourceItem.status,
        );

        if (duplicated) {
          await tx.orderItem.update({
            where: { id: duplicated.id },
            data: { quantity: duplicated.quantity + sourceItem.quantity },
          });
          duplicated.quantity += sourceItem.quantity;
        } else {
          const createdItem = await tx.orderItem.create({
            data: {
              orderId: targetOrder.id,
              menuItemId: sourceItem.menuItemId,
              quantity: sourceItem.quantity,
              price: sourceItem.price,
              note: sourceItem.note,
              options: sourceItem.options,
              status: sourceItem.status,
            } as any,
          });
          targetItems.push(createdItem as any);
        }
      }

      await tx.order.update({
        where: { id: targetOrder.id },
        data: {
          branchId: toBranchId || targetOrder.branchId || sourceOrder.branchId || null,
          customerId: targetOrder.customerId || sourceOrder.customerId,
          customerEmail: targetOrder.customerEmail || sourceOrder.customerEmail,
          customerName: targetOrder.customerName || sourceOrder.customerName,
          customerPhone: targetOrder.customerPhone || sourceOrder.customerPhone,
          subtotalAmount: (targetOrder.subtotalAmount || 0) + (sourceOrder.subtotalAmount || 0),
          discountAmount: (targetOrder.discountAmount || 0) + (sourceOrder.discountAmount || 0),
          totalAmount: (targetOrder.totalAmount || 0) + (sourceOrder.totalAmount || 0),
          pointsEarned: (targetOrder.pointsEarned || 0) + (sourceOrder.pointsEarned || 0),
          // Don merge se khong giu ma promo cu de tranh sai logic khuyen mai tong
          promotionCode: null,
        },
      });

      await tx.order.update({
        where: { id: sourceOrder.id },
        data: { status: 'CANCELLED' as any },
      });

      const mergedOrder = await tx.order.findUnique({
        where: { id: targetOrder.id },
        include: { orderItems: true },
      });

      return {
        mode: TableActionMode.MERGE,
        sourceOrderId: sourceOrder.id,
        targetOrderId: targetOrder.id,
        resultOrder: mergedOrder,
        note: 'Da ghep don tu ban nguon vao ban dich',
      };
    });

    await this.syncTablesAfterAction(fromTableId, toTableId);
    return payload;
  }

  async findCustomerHistory(params: { customerId?: string; email?: string; phone?: string; limit?: number }) {
    const customerId = String(params.customerId || '').trim();
    const email = String(params.email || '').trim();
    const phone = String(params.phone || '').trim();
    const limit = Number.isFinite(params.limit) && (params.limit || 0) > 0 ? Math.min(params.limit || 0, 50) : 20;

    const orConditions: any[] = [];
    if (customerId) orConditions.push({ customerId });
    if (email) orConditions.push({ customerEmail: email });
    if (phone) orConditions.push({ customerPhone: phone });

    if (!orConditions.length) {
      throw new BadRequestException('Can customerId hoac email hoac phone de lay lich su don');
    }

    const orders = await this.prisma.order.findMany({
      where: {
        OR: orConditions,
      },
      include: { orderItems: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return this.enrichOrders(orders);
  }

  private mapBranchMenuItemResponse(item: any, branchItem?: any) {
    if (!item) return null;
    return {
      id: branchItem?.id || item.id,
      branch_id: branchItem?.branchId || null,
      menu_item_id: item.id,
      name: item.name,
      description: item.description || null,
      image_url: item.image || null,
      category_id: item.categoryId || null,
      category_name: item.categoryRef?.name || item.category || 'Khac',
      price: Number(branchItem?.price ?? item.price ?? 0),
      is_available: Boolean(branchItem?.isAvailable ?? item.available),
      display_order: Number(branchItem?.displayOrder ?? 0),
      custom_options: branchItem?.customOptions ?? this.resolveCustomizations(item),
    };
  }

  private resolveAdminMenuBranchScope(requestedBranchId?: string | null, actor?: ActorScope) {
    const role = String(actor?.role || '').trim().toUpperCase();
    const actorBranchId = this.normalizeBranchId(actor?.branchId);
    const requested = this.normalizeBranchId(requestedBranchId);

    if (role !== 'MANAGER') {
      return requested;
    }

    if (!actorBranchId) {
      throw new BadRequestException('Tai khoan MANAGER thieu branchId');
    }

    if (requested && requested !== actorBranchId) {
      throw new BadRequestException('MANAGER chi duoc thao tac menu trong chi nhanh cua minh');
    }

    return actorBranchId;
  }

  private assertManagerCanManageBranch(targetBranchId?: string | null, actor?: ActorScope) {
    const role = String(actor?.role || '').trim().toUpperCase();
    if (role !== 'MANAGER') return;

    const actorBranchId = this.normalizeBranchId(actor?.branchId);
    if (!actorBranchId) {
      throw new BadRequestException('Tai khoan MANAGER thieu branchId');
    }

    const target = this.normalizeBranchId(targetBranchId);
    if (!target || target !== actorBranchId) {
      throw new BadRequestException('MANAGER khong duoc sua/xoa mon ngoai chi nhanh cua minh');
    }
  }

  async getCustomerRecommendations(params: {
    customerId?: string;
    email?: string;
    phone?: string;
    branchId?: string;
    tableId?: string;
    limit?: number;
  }) {
    const customerId = String(params.customerId || '').trim();
    const email = String(params.email || '').trim();
    const phone = String(params.phone || '').trim();
    const limit = Number.isFinite(params.limit) && (params.limit || 0) > 0 ? Math.min(params.limit || 0, 20) : 8;

    const requestedBranchId = this.normalizeBranchId(params.branchId);
    const tableId = String(params.tableId || '').trim();
    const resolvedBranchId = requestedBranchId || (tableId ? await this.resolveBranchIdFromTable(tableId) : null);

    const menuItems = await this.getMenu({
      branchId: resolvedBranchId || undefined,
      tableId: tableId || undefined,
    });
    if (!menuItems.length) {
      return [];
    }

    const menuById = new Map(menuItems.map((item: any) => [String(item.id), item]));
    const allMenuIds = Array.from(menuById.keys());
    const identityFilters = this.buildCustomerIdentityOrConditions({ customerId, email, phone });

    if (!identityFilters.length) {
      const popularIds = await this.getPopularMenuItemIds(allMenuIds, resolvedBranchId, limit);
      return popularIds
        .map((id, index) => {
          const item = menuById.get(id);
          if (!item) return null;
          return {
            ...item,
            recommendationReason: index === 0 ? 'popular_now' : 'popular',
            recommendationScore: Number((limit - index).toFixed(2)),
          };
        })
        .filter(Boolean);
    }

    const completedOrders = await this.prisma.order.findMany({
      where: {
        status: 'COMPLETED' as any,
        OR: identityFilters,
        ...(resolvedBranchId ? { branchId: resolvedBranchId } : {}),
      },
      include: { orderItems: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    if (!completedOrders.length) {
      const popularIds = await this.getPopularMenuItemIds(allMenuIds, resolvedBranchId, limit);
      return popularIds
        .map((id, index) => {
          const item = menuById.get(id);
          if (!item) return null;
          return {
            ...item,
            recommendationReason: index === 0 ? 'popular_now' : 'popular',
            recommendationScore: Number((limit - index).toFixed(2)),
          };
        })
        .filter(Boolean);
    }

    const now = Date.now();
    const scoreByMenuId = new Map<string, number>();
    for (const order of completedOrders) {
      const orderAgeDays = Math.max(0, (now - new Date(order.createdAt).getTime()) / (1000 * 60 * 60 * 24));
      const recencyBoost = Math.max(0.25, 1.25 - Math.min(orderAgeDays / 30, 1));
      for (const item of order.orderItems || []) {
        const menuItemId = String(item.menuItemId || '').trim();
        if (!menuById.has(menuItemId)) {
          continue;
        }
        const qty = Number(item.quantity || 0);
        if (!Number.isFinite(qty) || qty <= 0) {
          continue;
        }
        const current = scoreByMenuId.get(menuItemId) || 0;
        scoreByMenuId.set(menuItemId, current + qty * recencyBoost);
      }
    }

    const personalizedIds = Array.from(scoreByMenuId.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([menuItemId]) => menuItemId);

    const popularIds = await this.getPopularMenuItemIds(allMenuIds, resolvedBranchId, limit);
    const selectedIds: string[] = [];
    for (const id of personalizedIds) {
      if (selectedIds.length >= limit) break;
      selectedIds.push(id);
    }
    for (const id of popularIds) {
      if (selectedIds.length >= limit) break;
      if (!selectedIds.includes(id)) {
        selectedIds.push(id);
      }
    }

    return selectedIds
      .map((id, index) => {
        const item = menuById.get(id);
        if (!item) return null;
        const personalizedScore = scoreByMenuId.get(id);
        return {
          ...item,
          recommendationReason: personalizedScore ? 'history_preference' : 'popular',
          recommendationScore: Number((personalizedScore || limit - index).toFixed(2)),
        };
      })
      .filter(Boolean);
  }

  async findOne(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { orderItems: true },
    });
    if (!order) throw new NotFoundException(`Không tìm thấy đơn ${id}`);
    return this.enrichOrder(order);
  }

  async updateStatus(id: string, dto: UpdateOrderStatusDto) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException(`Không tìm thấy đơn ${id}`);

    const allowedTransitions: Record<string, string[]> = {
      PENDING: ['CONFIRMED', 'CANCELLED'],
      CONFIRMED: ['PREPARING', 'CANCELLED'],
      PREPARING: ['READY'],
      READY: ['PREPARING', 'COMPLETED'],
      COMPLETED: [],
      CANCELLED: [],
    };
    const nextStatus = String(dto.status || '').trim().toUpperCase();
    if (!allowedTransitions[String(order.status)]?.includes(nextStatus)) {
      throw new BadRequestException(`INVALID_STATUS_TRANSITION: ${order.status} -> ${nextStatus}`);
    }

    await this.prisma.order.update({
      where: { id },
      data: { status: nextStatus as any },
    });

    if (order.status !== 'COMPLETED' && nextStatus === 'COMPLETED' && order.customerId) {
      const points = await this.awardCustomerPoints(order.customerId, order.id, order.totalAmount);
      if (points > 0) {
        await this.prisma.order.update({
          where: { id: order.id },
          data: { pointsEarned: points },
        });
      }
    }

    const updated = await this.prisma.order.findUnique({
      where: { id },
      include: { orderItems: true },
    });

    if (!updated) throw new NotFoundException(`Không tìm thấy đơn ${id}`);

    if (nextStatus === 'COMPLETED') {
      await this.updateTableStatus(order.tableId, 'AVAILABLE');
    }

    this.logger.log(`Cập nhật đơn ${id} → ${nextStatus}`);
    return this.enrichOrder(updated);
  }

  async findByBranch(branchId: string, params: { status?: string; dateFrom?: string; dateTo?: string; tableId?: string }) {
    return this.findAll({
      ...params,
      branchId,
    });
  }

  async findOneByBranch(branchId: string, orderId: string) {
    const order = await this.findOne(orderId);
    if (String((order as any).branchId || '') !== String(branchId || '').trim()) {
      throw new BadRequestException('ORDER_NOT_IN_BRANCH');
    }
    return order;
  }

  async cancelOrder(orderId: string, reason?: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException(`Không tìm thấy đơn ${orderId}`);
    if (!['PENDING', 'CONFIRMED'].includes(String(order.status))) {
      throw new BadRequestException('Chi duoc huy don o trang thai PENDING/CONFIRMED');
    }
    const cancelled = await this.updateStatus(orderId, { status: 'CANCELLED' });
    return { ...cancelled, cancelReason: reason || null };
  }

  async getOrderBill(orderId: string) {
    const order = await this.findOne(orderId);
    return {
      orderId: (order as any).id,
      items: (order as any).orderItems || [],
      total: Number((order as any).subtotalAmount || 0),
      discount: Number((order as any).discountAmount || 0),
      final_amount: Number((order as any).totalAmount || 0),
    };
  }

  async confirmOrderPayment(orderId: string, payload?: { method?: string; amount?: number }) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException(`Không tìm thấy đơn ${orderId}`);
    if (String(order.status) === 'COMPLETED') {
      throw new BadRequestException('ORDER_ALREADY_PAID');
    }
    const completed = await this.updateStatus(orderId, { status: 'COMPLETED' });
    return {
      ...completed,
      payment_status: 'PAID',
      payment_method: String(payload?.method || '').trim().toUpperCase() || null,
      paid_amount: Number(payload?.amount || 0) || Number(order.totalAmount || 0),
    };
  }

  async applyOrderDiscount(orderId: string, payload?: { discount?: number; reason?: string }) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException(`Không tìm thấy đơn ${orderId}`);
    if (['COMPLETED', 'CANCELLED'].includes(String(order.status))) {
      throw new BadRequestException('Khong the giam gia don da hoan tat/huy');
    }
    const discount = Math.max(0, Math.floor(Number(payload?.discount || 0)));
    const subtotal = Number(order.subtotalAmount || 0);
    const total = Math.max(subtotal - discount, 0);
    await this.prisma.order.update({
      where: { id: orderId },
      data: {
        discountAmount: discount,
        totalAmount: total,
      },
    });
    return {
      orderId,
      discount,
      reason: String(payload?.reason || '').trim() || null,
      final_amount: total,
    };
  }

  async updateOrderItems(orderId: string, dto: StaffUpdateOrderItemsDto) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { orderItems: true },
    });

    if (!order) {
      throw new NotFoundException(`Không tìm thấy đơn ${orderId}`);
    }

    if (order.status === 'COMPLETED' || order.status === 'CANCELLED') {
      throw new BadRequestException('Khong the sua don da hoan tat hoac da huy');
    }

    const items = (dto.items || [])
      .map((item) => ({
        menuItemId: String(item.menuItemId || '').trim(),
        quantity: Number(item.quantity || 0),
        note: item.note,
        options: item.options,
      }))
      .filter((item) => item.menuItemId && item.quantity > 0);

    if (!items.length) {
      throw new BadRequestException('Don hang phai co it nhat 1 mon');
    }

    const uniqueMenuIds = [...new Set(items.map((item) => item.menuItemId))];
    const menuItems = await this.prisma.menuItem.findMany({
      select: {
        id: true,
        name: true,
        price: true,
        _count: {
          select: {
            ingredients: true,
          },
        },
      },
      where: {
        id: { in: uniqueMenuIds },
        available: true,
      },
    });

    if (menuItems.length !== uniqueMenuIds.length) {
      throw new BadRequestException('Mot hoac nhieu mon khong hop le');
    }
    if (order.branchId) {
      const branchMappings = await this.prisma.branchMenuItem.count({
        where: {
          branchId: order.branchId,
          menuItemId: { in: uniqueMenuIds },
          isAvailable: true,
        },
      });
      if (branchMappings !== uniqueMenuIds.length) {
        throw new BadRequestException('Mot hoac nhieu mon chua duoc bat tai chi nhanh');
      }
    }
    this.ensureSellableMenuItemsHaveRecipe(menuItems);

    const priceMap = await this.buildMenuPriceMap(uniqueMenuIds, order.branchId || null, menuItems);
    const normalizedItems = items.map((item) => {
      const basePrice = priceMap.get(item.menuItemId) || 0;
      const extraAmount = this.extractExtraAmount(item.options);
      return {
        ...item,
        unitPrice: basePrice + extraAmount,
      };
    });

    const subtotalAmount = normalizedItems.reduce(
      (sum, item) => sum + item.unitPrice * item.quantity,
      0,
    );

    let discountAmount = 0;
    let promotionCode: string | null = null;
    if (order.promotionCode) {
      try {
        const promotion = await this.resolvePromotion(
          order.promotionCode,
          subtotalAmount,
          normalizedItems,
          undefined,
          order.branchId,
        );
        discountAmount = promotion.discountAmount;
        promotionCode = promotion.code || null;
      } catch {
        discountAmount = 0;
        promotionCode = null;
      }
    }

    const totalAmount = Math.max(subtotalAmount - discountAmount, 0);

    await this.prisma.$transaction(async (tx) => {
      await tx.orderItem.deleteMany({
        where: { orderId },
      });

      await tx.orderItem.createMany({
        data: normalizedItems.map((item) => ({
          orderId,
          menuItemId: item.menuItemId,
          quantity: item.quantity,
          price: item.unitPrice,
          note: item.note,
          options: item.options,
          status: 'WAITING' as any,
        })),
      });

      await tx.order.update({
        where: { id: orderId },
        data: {
          subtotalAmount,
          discountAmount,
          promotionCode,
          totalAmount,
          status: order.status === 'READY' ? ('CONFIRMED' as any) : undefined,
        },
      });
    });

    const updated = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { orderItems: true },
    });

    if (!updated) {
      throw new NotFoundException(`Không tìm thấy đơn ${orderId}`);
    }

    this.logger.log(`Cap nhat mon trong don ${orderId}`);
    return this.enrichOrder(updated);
  }

  async updateCustomerOrderItems(orderId: string, dto: CustomerUpdateOrderItemsDto) {
    const tableId = String(dto.tableId || '').trim();
    if (!tableId) {
      throw new BadRequestException('tableId la bat buoc khi khach sua don');
    }

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { orderItems: true },
    });

    if (!order) {
      throw new NotFoundException(`Không tìm thấy đơn ${orderId}`);
    }

    if (String(order.tableId || '').trim() !== tableId) {
      throw new BadRequestException('Khong the sua don cua ban khac');
    }

    if (order.status !== 'PENDING') {
      throw new BadRequestException('Chi duoc sua don khi don dang cho xac nhan');
    }

    const payment = await this.findPaymentByOrderId(orderId);
    if (payment) {
      throw new BadRequestException('Khong the sua don da co giao dich thanh toan');
    }

    return this.updateOrderItems(orderId, dto);
  }

  // ── KDS: cập nhật trạng thái từng món ──────────────────
  async updateItemStatus(orderId: string, itemId: string, status: string) {
    const nextStatus = this.normalizeIncomingItemStatus(status);
    if (!['WAITING', 'PREPARING', 'DONE'].includes(nextStatus)) {
      throw new BadRequestException(`Trang thai mon khong hop le: ${status}`);
    }

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, tableId: true, branchId: true },
    });
    if (!order) throw new NotFoundException(`Không tìm thấy đơn ${orderId}`);

    const item = await this.prisma.orderItem.findFirst({
      where: { id: itemId, orderId },
    });
    if (!item) throw new NotFoundException(`Không tìm thấy item ${itemId}`);
    const previousStatus = item.status;

    if (previousStatus === nextStatus) {
      return item;
    }

    const allowedTransitions: Record<string, string[]> = {
      WAITING: ['PREPARING', 'DONE'],
      PREPARING: ['DONE'],
      DONE: [],
    };
    if (!allowedTransitions[previousStatus]?.includes(nextStatus)) {
      throw new BadRequestException(
        `Khong the chuyen trang thai mon tu ${previousStatus} sang ${nextStatus}`,
      );
    }

    if (nextStatus === 'DONE') {
      await this.deductInventoryByRecipe(
        item.id,
        item.menuItemId,
        item.quantity,
        orderId,
        order.branchId || null,
        item.options || undefined,
      );
    }

    const updated = await this.prisma.orderItem.update({
      where: { id: itemId },
      data: { status: nextStatus as any },
    });

    if (nextStatus === 'PREPARING') {
      await this.prisma.order.update({
        where: { id: orderId },
        data: { status: 'PREPARING' },
      });
    }

    if (previousStatus !== nextStatus) {
      await this.notifyKitchenItemStatus(orderId, order.tableId, itemId, this.toKitchenItemStatus(nextStatus));
    }

    // Nếu tất cả items đều DONE → tự động chuyển order sang READY
    const allItems = await this.prisma.orderItem.findMany({ where: { orderId } });
    const allDone = allItems.every((i) => i.status === 'DONE');
    if (allDone) {
      await this.prisma.order.update({
        where: { id: orderId },
        data: { status: 'READY' },
      });
      this.logger.log(`Tất cả món done → đơn ${orderId} chuyển sang READY`);
      await this.notifyKitchenOrderReady(orderId, order.tableId);
    }

    return {
      ...updated,
      status: this.toKitchenItemStatus(updated.status),
    };
  }

  private async deductInventoryByRecipe(
    orderItemId: string,
    menuItemId: string,
    orderQuantity: number,
    orderId: string,
    branchId?: string | null,
    _orderItemOptions?: string,
  ) {
    const recipeIngredients = await this.buildInventoryExportItemsFromRecipe(menuItemId, orderQuantity);
    const ingredientsToExport = this.mergeInventoryExportItems(recipeIngredients);

    if (!ingredientsToExport.length) {
      return;
    }

    const kafkaPublished = await this.kafkaService.itemCompleted({
      orderId,
      orderItemId,
      menuItemId,
      quantity: orderQuantity,
      branchId: branchId || null,
      ingredients: ingredientsToExport,
      occurredAt: new Date().toISOString(),
    });

    if (kafkaPublished) {
      this.logger.log(
        `Da phat ItemCompleted cho order ${orderId}, item ${orderItemId} (${ingredientsToExport.length} nguyen lieu)`,
      );
      return;
    }

    await this.deductInventoryBulk(ingredientsToExport, {
      orderId,
      menuItemId,
      branchId: branchId || undefined,
    });
  }

  private async buildInventoryExportItemsFromRecipe(menuItemId: string, orderQuantity: number) {
    const recipe = await this.prisma.menuItemIngredient.findMany({
      where: { menuItemId },
      orderBy: { createdAt: 'asc' },
    });

    if (!recipe.length) {
      this.logger.warn(`Mon ${menuItemId} chua khai bao cong thuc nguyen lieu, bo qua tru kho`);
      return [] as Array<{ ingredientId: string; quantity: number; note?: string }>;
    }

    const ingredientsToExport: Array<{ ingredientId: string; quantity: number; note?: string }> = [];

    for (const ingredient of recipe) {
      const required = Number(ingredient.quantity) * orderQuantity;
      if (!Number.isFinite(required) || required <= 0) {
        continue;
      }
      ingredientsToExport.push({
        ingredientId: ingredient.ingredientId,
        quantity: required,
        note: `menuItemId=${menuItemId}`,
      });
    }

    return ingredientsToExport;
  }

  private mergeInventoryExportItems(items: Array<{ ingredientId: string; quantity: number; note?: string }>) {
    const merged = new Map<string, { ingredientId: string; quantity: number; note?: string }>();

    for (const item of items) {
      const ingredientId = String(item.ingredientId || '').trim();
      const quantity = Number(item.quantity || 0);
      if (!ingredientId || !Number.isFinite(quantity) || quantity <= 0) {
        continue;
      }

      const existing = merged.get(ingredientId);
      if (!existing) {
        merged.set(ingredientId, {
          ingredientId,
          quantity,
          note: item.note ? String(item.note).trim() : undefined,
        });
        continue;
      }

      existing.quantity += quantity;
      merged.set(ingredientId, existing);
    }

    return Array.from(merged.values());
  }

  private ensureSellableMenuItemsHaveRecipe(
    menuItems: Array<{ id: string; name: string; _count?: { ingredients?: number } }>,
  ) {
    const invalid = menuItems.filter((item) => Number(item._count?.ingredients || 0) <= 0);
    if (!invalid.length) {
      return;
    }

    const names = invalid.map((item) => String(item.name || item.id)).slice(0, 5);
    const suffix = invalid.length > 5 ? '...' : '';
    throw new BadRequestException(
      `Mon chua khai bao cong thuc kho, khong the ban: ${names.join(', ')}${suffix}`,
    );
  }

  private async deductInventoryBulk(
    items: Array<{ ingredientId: string; quantity: number; note?: string }>,
    context?: { orderId?: string; menuItemId?: string; branchId?: string },
  ) {
    try {
      const response = await this.fetchWithRetry(`${this.inventoryServiceUrl}/api/v1/ingredients/stock/export-bulk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.internalServiceToken}`,
        },
        body: JSON.stringify({
          items,
          branchId: context?.branchId || undefined,
          source: 'ORDER',
          reason: context?.orderId ? `Xuat tu dong cho don ${context.orderId}` : 'Xuat tu dong khi ban hang',
          referenceCode: context?.orderId || undefined,
          createdBy: 'order-service:auto-deduct',
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        this.logger.warn(`Khong tru kho duoc theo cong thuc mon ${context?.menuItemId || 'unknown'}: ${response.status} ${body}`);
        throw new BadRequestException('Khong the tru kho tu dong cho mon da hoan thanh');
      }

      this.logger.log(
        `Da tru kho theo cong thuc mon ${context?.menuItemId || 'unknown'} (${items.length} nguyen lieu)`,
      );
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      this.logger.warn(`Inventory service khong san sang de tru kho tu dong: ${(error as Error).message}`);
      throw new BadRequestException('Inventory service khong san sang de tru kho tu dong');
    }
  }

  private async awardCustomerPoints(customerId: string, orderId: string, amount: number) {
    try {
      const response = await this.fetchWithRetry(`${this.userServiceUrl}/api/users/customer/points/accrual`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          customerId,
          orderId,
          amount,
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        this.logger.warn(
          `Khong cong duoc diem cho customer ${customerId}, order ${orderId}: ${response.status} ${body}`,
        );
        return 0;
      }

      const payload = (await response.json()) as { pointsEarned?: number };
      return Number(payload?.pointsEarned || 0);
    } catch (error) {
      this.logger.warn(
        `User service khong san sang khi cong diem cho customer ${customerId}: ${(error as Error).message}`,
      );
      return 0;
    }
  }

  private async buildMenuPriceMap(
    menuItemIds: string[],
    branchId: string | null,
    baseItems: Array<{ id: string; price: number }>,
  ) {
    const fallback = new Map(baseItems.map((item) => [item.id, Number(item.price || 0)]));
    if (!branchId || !menuItemIds.length) {
      return fallback;
    }

    const branchItems = await this.prisma.branchMenuItem.findMany({
      where: {
        branchId,
        menuItemId: { in: menuItemIds },
        isAvailable: true,
      },
      select: {
        menuItemId: true,
        price: true,
      },
    });

    const branchMap = new Map(branchItems.map((item) => [item.menuItemId, Number(item.price || 0)]));
    for (const menuItemId of menuItemIds) {
      if (branchMap.has(menuItemId)) {
        fallback.set(menuItemId, Number(branchMap.get(menuItemId) || 0));
      }
    }
    return fallback;
  }

  private buildCustomerIdentityOrConditions(identity: { customerId?: string; email?: string; phone?: string }) {
    const conditions: Prisma.OrderWhereInput[] = [];
    if (identity.customerId) {
      conditions.push({ customerId: identity.customerId });
    }
    if (identity.email) {
      conditions.push({ customerEmail: identity.email });
    }
    if (identity.phone) {
      conditions.push({ customerPhone: identity.phone });
    }
    return conditions;
  }

  private async getPopularMenuItemIds(menuItemIds: string[], branchId: string | null, limit: number) {
    if (!menuItemIds.length) {
      return [];
    }
    const fromDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const orders = await this.prisma.order.findMany({
      where: {
        status: 'COMPLETED' as any,
        createdAt: { gte: fromDate },
        ...(branchId ? { branchId } : {}),
      },
      include: {
        orderItems: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 300,
    });

    const allowed = new Set(menuItemIds);
    const totals = new Map<string, number>();
    for (const order of orders) {
      for (const item of order.orderItems || []) {
        const id = String(item.menuItemId || '').trim();
        if (!allowed.has(id)) continue;
        const qty = Number(item.quantity || 0);
        if (!Number.isFinite(qty) || qty <= 0) continue;
        totals.set(id, (totals.get(id) || 0) + qty);
      }
    }

    const sorted = Array.from(totals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([id]) => id);

    if (sorted.length >= limit) {
      return sorted;
    }

    for (const id of menuItemIds) {
      if (sorted.length >= limit) break;
      if (!sorted.includes(id)) {
        sorted.push(id);
      }
    }
    return sorted;
  }

  private async notifyNewOrder(order: {
    id: string;
    tableId: string;
    tableNumber?: number | null;
    totalAmount: number;
    orderItems?: Array<{ quantity?: number; menuItemId?: string; menuItemName?: string | null }>;
    customerName?: string | null;
  }) {
    try {
      const chatId = await this.getOrCreateOpenChatId(order.tableId, order.customerName || undefined);
      const items = Array.isArray(order.orderItems) ? order.orderItems : [];
      const missingMenuItemIds = [
        ...new Set(
          items
            .flatMap((item) => {
              const menuItemId = String(item.menuItemId || '').trim();
              const menuItemName = String(item.menuItemName || '').trim();
              if (!menuItemId || menuItemName) {
                return [];
              }
              return [menuItemId];
            }),
        ),
      ];
      const menuNamesById = new Map<string, string>();
      if (missingMenuItemIds.length > 0) {
        const menuItems = await this.prisma.menuItem.findMany({
          where: { id: { in: missingMenuItemIds } },
          select: { id: true, name: true },
        });
        for (const menuItem of menuItems) {
          menuNamesById.set(menuItem.id, menuItem.name);
        }
      }
      const itemCount = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
      const tableLabel =
        order.tableNumber !== null && order.tableNumber !== undefined
          ? `Bàn ${order.tableNumber}`
          : 'Bàn không xác định';
      const itemSummary = items
        .slice(0, 4)
        .map((item) => {
          const normalizedMenuItemId = String(item.menuItemId || '').trim();
          const itemName = String(
            item.menuItemName ||
              menuNamesById.get(normalizedMenuItemId) ||
              normalizedMenuItemId ||
              'Món không xác định',
          ).trim();
          return `${Number(item.quantity || 0)}x ${itemName}`;
        })
        .join(', ');
      const remainingItems = Math.max(items.length - 4, 0);
      const billSummary = [
        tableLabel,
        itemSummary || 'Chưa có món',
        `Tổng tiền ${Number(order.totalAmount || 0).toLocaleString('vi-VN')}đ`,
        remainingItems > 0 ? `+ ${remainingItems} món khác` : '',
      ]
        .filter(Boolean)
        .join(' | ');
      const encodedSummary = encodeURIComponent(billSummary);
      const content =
        `[ORDER_NEW] ` +
        `orderId=${order.id}; ` +
        `tableId=${order.tableId}; ` +
        `tableNumber=${order.tableNumber ?? ''}; ` +
        `items=${itemCount}; ` +
        `total=${order.totalAmount}; ` +
        `summary=${encodedSummary}`;

      const response = await this.fetchWithRetry(`${this.chatServiceApiUrl}/${chatId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          senderType: 'STAFF',
          senderName: 'System',
          content,
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        this.logger.warn(`Khong gui duoc thong bao don moi ${order.id}: ${response.status} ${body}`);
      }
    } catch (error) {
      this.logger.warn(`Chat service khong san sang de thong bao don moi ${order.id}: ${(error as Error).message}`);
    }
  }

  private async notifyKitchenItemStatus(
    orderId: string,
    tableId: string,
    itemId: string,
    status: string,
  ) {
    await this.emitStaffNotification({
      type: 'KDS_ITEM_STATUS',
      title: `Bếp cập nhật món - Bàn ${tableId}`,
      message: `Đơn ${orderId}: món ${itemId} -> ${status}`,
      orderId,
      tableId,
    });
  }

  private async notifyKitchenOrderReady(orderId: string, tableId: string) {
    await this.emitStaffNotification({
      type: 'KDS_ORDER_READY',
      title: `Bếp hoàn thành đơn - Bàn ${tableId}`,
      message: `Đơn ${orderId} đã sẵn sàng phục vụ`,
      orderId,
      tableId,
    });
  }

  private async emitStaffNotification(payload: {
    type: 'KDS_ITEM_STATUS' | 'KDS_ORDER_READY';
    title: string;
    message: string;
    orderId?: string;
    tableId?: string;
  }) {
    try {
      const response = await this.fetchWithRetry(`${this.chatServiceApiUrl}/staff-notifications`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = await response.text();
        this.logger.warn(
          `Khong gui duoc staff notification ${payload.type}: ${response.status} ${body}`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `Chat service khong san sang de gui staff notification ${payload.type}: ${(error as Error).message}`,
      );
    }
  }

  private async getOrCreateOpenChatId(tableId: string, customerName?: string) {
    const listResponse = await this.fetchWithRetry(`${this.chatServiceApiUrl}?tableId=${encodeURIComponent(tableId)}`);
    if (!listResponse.ok) {
      throw new Error(`Khong lay duoc danh sach chat (${listResponse.status})`);
    }

    const chats = (await listResponse.json()) as Array<{ id?: string; status?: string }>;
    const openChat = chats.find((chat) => String(chat.status || '').toUpperCase() === 'OPEN' && chat.id);
    if (openChat?.id) {
      return String(openChat.id);
    }

    const createResponse = await this.fetchWithRetry(this.chatServiceApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tableId,
        customerName: customerName || `Ban ${tableId}`,
      }),
    });

    if (!createResponse.ok) {
      throw new Error(`Khong tao duoc chat (${createResponse.status})`);
    }

    const created = (await createResponse.json()) as { id?: string };
    if (!created?.id) {
      throw new Error('Chat moi khong co id');
    }

    return String(created.id);
  }

  private async syncTablesAfterAction(fromTableId: string, toTableId: string) {
    const fromHasActiveOrder = await this.tableHasActiveOrders(fromTableId);
    const toHasActiveOrder = await this.tableHasActiveOrders(toTableId);

    await Promise.all([
      this.updateTableStatus(fromTableId, fromHasActiveOrder ? 'OCCUPIED' : 'AVAILABLE'),
      this.updateTableStatus(toTableId, toHasActiveOrder ? 'OCCUPIED' : 'AVAILABLE'),
    ]);
  }

  private async tableHasActiveOrders(tableId: string) {
    const count = await this.prisma.order.count({
      where: {
        tableId,
        status: { in: ACTIVE_ORDER_STATUSES as any },
      },
    });
    return count > 0;
  }

  private async updateTableStatus(tableId: string, status: 'AVAILABLE' | 'OCCUPIED') {
    try {
      const response = await this.fetchWithRetry(`${this.tableServiceUrl}/api/tables/${tableId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status }),
      });

      if (!response.ok) {
        const body = await response.text();
        this.logger.warn(`Khong dong bo duoc trang thai ban ${tableId} -> ${status}: ${response.status} ${body}`);
      }
    } catch (error) {
      this.logger.warn(`Table service khong san sang de dong bo ban ${tableId}: ${(error as Error).message}`);
    }
  }

  private async findPaymentByOrderId(orderId: string) {
    try {
      const response = await this.fetchWithRetry(`${this.paymentServiceUrl}/api/v1/payments/orders/${orderId}`);
      if (response.status === 404) {
        return null;
      }

      if (!response.ok) {
        const body = await response.text();
        this.logger.warn(`Khong kiem tra duoc thanh toan cua don ${orderId}: ${response.status} ${body}`);
        throw new BadRequestException('Khong the xac minh trang thai thanh toan cua don');
      }

      return (await response.json()) as { paymentId?: string; status?: string } | null;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      this.logger.warn(`Payment service khong san sang khi kiem tra don ${orderId}: ${(error as Error).message}`);
      throw new BadRequestException('Khong the xac minh trang thai thanh toan cua don');
    }
  }
}

