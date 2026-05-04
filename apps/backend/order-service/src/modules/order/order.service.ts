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
const TOPPING_INGREDIENT_PREFIX = 'topping::';
const INVENTORY_ID_CACHE_TTL_MS = 30 * 1000;

type MenuAdminListQuery = {
  keyword?: string;
  categoryId?: string;
  includeInactive?: boolean;
  branchId?: string;
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
  private readonly inventoryIngredientIdCache = new Map<string, { expiresAt: number; ids: Set<string> }>();

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

    const items = await this.prisma.menuItem.findMany({
      where: {
        available: true,
        ...(resolvedBranchId
          ? {
              OR: [{ branchId: resolvedBranchId }, { branchId: null }],
            }
          : {}),
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

  async listMenuItemsForAdmin(query: MenuAdminListQuery) {
    const keyword = String(query.keyword || '').trim();
    const categoryId = String(query.categoryId || '').trim();
    const branchId = this.normalizeBranchId(query.branchId);
    const andConditions: Prisma.MenuItemWhereInput[] = [];
    if (branchId) {
      andConditions.push({
        OR: [{ branchId }, { branchId: null }],
      });
    }
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
      },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });

    return items.map((item) => this.mapMenuItemForAdmin(item));
  }

  async createMenuItemForAdmin(dto: CreateMenuItemManagementDto) {
    const normalizedName = String(dto.name || '').trim();
    if (!normalizedName) {
      throw new BadRequestException('Ten mon khong duoc de trong');
    }
    const branchId = this.normalizeBranchId(dto.branchId);

    const category = await this.resolveCategory(dto.categoryId, branchId);
    const optionBindings = this.normalizeOptionBindings(dto.optionGroups);
    const recipe = await this.hydrateRecipeWithInventory(this.normalizeRecipe(dto.recipe), branchId);
    const optionGroups = await this.loadOptionGroupsForBinding(optionBindings, branchId);
    const customizations = this.buildCustomizations(optionGroups, optionBindings);

    const created = await this.prisma.$transaction(async (tx) => {
      const menuItem = await tx.menuItem.create({
        data: {
          name: normalizedName,
          description: dto.description ? String(dto.description).trim() : null,
          price: Number(dto.price),
          image: dto.image ? String(dto.image).trim() : null,
          branchId,
          available: dto.available ?? true,
          categoryId: category?.id ?? null,
          category: category?.name || 'Khac',
          customizations,
        },
      });

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

  async updateMenuItemForAdmin(id: string, dto: UpdateMenuItemManagementDto) {
    const existing = await this.prisma.menuItem.findUnique({
      where: { id },
      select: { id: true, branchId: true, categoryId: true },
    });
    if (!existing) {
      throw new NotFoundException(`Khong tim thay mon ${id}`);
    }

    const nextBranchId =
      dto.branchId !== undefined
        ? this.normalizeBranchId(dto.branchId)
        : existing.branchId;

    const shouldUpdateOptionBindings = Array.isArray(dto.optionGroups);
    const shouldUpdateRecipe = Array.isArray(dto.recipe);
    const optionBindings = shouldUpdateOptionBindings ? this.normalizeOptionBindings(dto.optionGroups) : [];
    const recipe = shouldUpdateRecipe
      ? await this.hydrateRecipeWithInventory(this.normalizeRecipe(dto.recipe), nextBranchId)
      : [];

    const optionGroups = shouldUpdateOptionBindings
      ? await this.loadOptionGroupsForBinding(optionBindings, nextBranchId)
      : [];

    const hasCategoryField = dto.categoryId !== undefined;
    const category = hasCategoryField ? await this.resolveCategory(dto.categoryId, nextBranchId) : undefined;

    if (!hasCategoryField && dto.branchId !== undefined && existing.categoryId) {
      await this.resolveCategory(existing.categoryId, nextBranchId);
    }

    const data: Prisma.MenuItemUpdateInput = {
      ...(dto.name !== undefined ? { name: String(dto.name || '').trim() } : {}),
      ...(dto.description !== undefined ? { description: String(dto.description || '').trim() || null } : {}),
      ...(dto.price !== undefined ? { price: Number(dto.price) } : {}),
      ...(dto.image !== undefined ? { image: String(dto.image || '').trim() || null } : {}),
      ...(dto.branchId !== undefined ? { branchId: this.normalizeBranchId(dto.branchId) } : {}),
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

  async deleteMenuItemForAdmin(id: string) {
    const existing = await this.prisma.menuItem.findUnique({
      where: { id },
      select: { id: true, available: true },
    });
    if (!existing) {
      throw new NotFoundException(`Khong tim thay mon ${id}`);
    }

    await this.prisma.menuItem.update({
      where: { id },
      data: { available: false },
    });

    return { id, deleted: true };
  }

  async setMenuItemImageForAdmin(id: string, imageUrl: string) {
    const normalizedUrl = String(imageUrl || '').trim();
    if (!normalizedUrl) {
      throw new BadRequestException('imageUrl khong hop le');
    }

    const existing = await this.prisma.menuItem.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException(`Khong tim thay mon ${id}`);
    }

    await this.prisma.menuItem.update({
      where: { id },
      data: { image: normalizedUrl },
    });

    return this.getMenuItemForAdmin(id);
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

  private mapMenuItemForCustomer(item: any) {
    return {
      id: item.id,
      branchId: item.branchId || null,
      name: item.name,
      description: item.description,
      price: Number(item.price),
      image: item.image,
      categoryId: item.categoryId || null,
      category: item.categoryRef?.name || item.category || 'Khac',
      available: Boolean(item.available),
      customizations: this.resolveCustomizations(item),
    };
  }

  private mapMenuItemForAdmin(item: any) {
    return {
      id: item.id,
      branchId: item.branchId || null,
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
        ...(branchId
          ? {
              OR: [{ branchId }, { branchId: null }],
            }
          : {}),
      },
      select: { id: true },
    });
    if (existed.length !== menuItemIds.length) {
      throw new BadRequestException('Mot hoac nhieu mon ap dung khong ton tai');
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
    const branchIdFromPayload = this.normalizeBranchId(dto.branchId);
    const branchIdFromTable = await this.resolveBranchIdFromTable(dto.tableId);
    const resolvedBranchId = branchIdFromTable || branchIdFromPayload || null;

    if (branchIdFromPayload && branchIdFromTable && branchIdFromPayload !== branchIdFromTable) {
      throw new BadRequestException('branchId khong khop voi chi nhanh cua ban');
    }

    const menuItemIds = dto.items.map((i) => i.menuItemId);
    const menuItems = await this.prisma.menuItem.findMany({
      where: {
        id: { in: menuItemIds },
        available: true,
        ...(resolvedBranchId
          ? {
              OR: [{ branchId: resolvedBranchId }, { branchId: null }],
            }
          : {}),
      },
    });

    if (menuItems.length !== menuItemIds.length) {
      throw new BadRequestException('Một hoặc nhiều món không hợp lệ hoặc đã hết');
    }

    const priceMap = new Map(menuItems.map((m) => [m.id, m.price]));
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

    await this.prisma.order.update({
      where: { id },
      data: { status: dto.status as any },
    });

    if (order.status !== 'COMPLETED' && dto.status === 'COMPLETED' && order.customerId) {
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

    this.logger.log(`Cập nhật đơn ${id} → ${dto.status}`);
    return this.enrichOrder(updated);
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
      where: { id: { in: uniqueMenuIds } },
    });

    if (menuItems.length !== uniqueMenuIds.length) {
      throw new BadRequestException('Mot hoac nhieu mon khong hop le');
    }

    const priceMap = new Map(menuItems.map((item) => [item.id, item.price]));
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
    orderItemOptions?: string,
  ) {
    const recipeIngredients = await this.buildInventoryExportItemsFromRecipe(menuItemId, orderQuantity);
    const toppingIngredients = await this.buildInventoryExportItemsFromSelectedToppings(
      menuItemId,
      orderQuantity,
      orderItemOptions,
      branchId,
    );
    const ingredientsToExport = this.mergeInventoryExportItems([...recipeIngredients, ...toppingIngredients]);

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

  private parseSelectedOptionValues(options?: string) {
    if (!options) return [] as string[];

    try {
      const parsed = JSON.parse(options);
      const selections = parsed?.selections;
      if (!selections || typeof selections !== 'object' || Array.isArray(selections)) {
        return [] as string[];
      }

      const values: string[] = [];
      for (const value of Object.values(selections as Record<string, unknown>)) {
        if (Array.isArray(value)) {
          value.forEach((entry) => {
            const normalized = String(entry || '').trim();
            if (normalized) values.push(normalized);
          });
          continue;
        }

        const normalized = String(value || '').trim();
        if (normalized) values.push(normalized);
      }

      return values;
    } catch {
      return [] as string[];
    }
  }

  private toToppingIngredientId(optionValue: string) {
    const normalized = String(optionValue || '').trim().toLowerCase();
    if (!normalized) return '';
    return `${TOPPING_INGREDIENT_PREFIX}${encodeURIComponent(normalized)}`;
  }

  private async getExistingInventoryIngredientIds(branchId?: string | null) {
    const normalizedBranchId = String(branchId || '').trim();
    const cacheKey = normalizedBranchId || '__all__';
    const now = Date.now();
    const cached = this.inventoryIngredientIdCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return cached.ids;
    }

    const params = new URLSearchParams();
    params.set('includeInactive', 'false');
    if (normalizedBranchId) {
      params.set('branchId', normalizedBranchId);
    }

    try {
      const response = await this.fetchWithRetry(
        `${this.inventoryServiceUrl}/api/v1/ingredients?${params.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${this.internalServiceToken}`,
          },
        },
        { attempts: 2, retryDelayMs: 200 },
      );

      if (!response.ok) {
        const body = await response.text();
        this.logger.warn(`Khong lay duoc ingredient ids de tru topping: ${response.status} ${body}`);
        return new Set<string>();
      }

      const payload = (await response.json()) as Array<{ id?: string }>;
      const ids = new Set(
        (Array.isArray(payload) ? payload : [])
          .map((item) => String(item?.id || '').trim())
          .filter(Boolean),
      );

      this.inventoryIngredientIdCache.set(cacheKey, {
        ids,
        expiresAt: now + INVENTORY_ID_CACHE_TTL_MS,
      });
      return ids;
    } catch (error) {
      this.logger.warn(`Inventory service khong san sang de resolve topping ingredient ids: ${(error as Error).message}`);
      return new Set<string>();
    }
  }

  private async buildInventoryExportItemsFromSelectedToppings(
    menuItemId: string,
    orderQuantity: number,
    options?: string,
    branchId?: string | null,
  ) {
    if (!options) {
      return [] as Array<{ ingredientId: string; quantity: number; note?: string }>;
    }

    const selectedValues = this.parseSelectedOptionValues(options);
    if (!selectedValues.length) {
      return [] as Array<{ ingredientId: string; quantity: number; note?: string }>;
    }

    const existingIngredientIds = await this.getExistingInventoryIngredientIds(branchId);
    if (!existingIngredientIds.size) {
      return [] as Array<{ ingredientId: string; quantity: number; note?: string }>;
    }

    const toppingItems: Array<{ ingredientId: string; quantity: number; note?: string }> = [];
    for (const selectedValue of selectedValues) {
      const ingredientId = this.toToppingIngredientId(selectedValue);
      if (!ingredientId || !existingIngredientIds.has(ingredientId)) {
        continue;
      }

      toppingItems.push({
        ingredientId,
        quantity: orderQuantity,
        note: `menuItemId=${menuItemId}; topping=${selectedValue}`,
      });
    }

    return this.mergeInventoryExportItems(toppingItems);
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

