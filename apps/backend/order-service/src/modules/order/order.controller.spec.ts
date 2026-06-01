import { OrderController } from './order.controller';

describe('OrderController', () => {
  const orderService = {
    getMenu: jest.fn(),
    getBranchMenu: jest.fn(),
    activateBranchMenuItem: jest.fn(),
    updateBranchMenuItem: jest.fn(),
    removeBranchMenuItem: jest.fn(),
    listMenuCategories: jest.fn(),
    createMenuCategory: jest.fn(),
    updateMenuCategory: jest.fn(),
    deleteMenuCategory: jest.fn(),
    listMenuOptionGroups: jest.fn(),
    createMenuOptionGroup: jest.fn(),
    updateMenuOptionGroup: jest.fn(),
    deleteMenuOptionGroup: jest.fn(),
    createMenuOptionValue: jest.fn(),
    updateMenuOptionValue: jest.fn(),
    deleteMenuOptionValue: jest.fn(),
    listMenuItemsForAdmin: jest.fn(),
    createMenuItemForAdmin: jest.fn(),
    updateMenuItemForAdmin: jest.fn(),
    deleteMenuItemForAdmin: jest.fn(),
    listPromotions: jest.fn(),
    createPromotion: jest.fn(),
    updatePromotion: jest.fn(),
    disablePromotion: jest.fn(),
    create: jest.fn(),
    findAll: jest.fn(),
    hasActiveOrdersForTable: jest.fn(),
    transferOrMergeTables: jest.fn(),
    findCustomerHistory: jest.fn(),
    getCustomerRecommendations: jest.fn(),
    validatePromotion: jest.fn(),
    findOne: jest.fn(),
    updateStatus: jest.fn(),
    updateOrderItems: jest.fn(),
    updateCustomerOrderItems: jest.fn(),
    updateItemStatus: jest.fn(),
  };
  const kafkaService = {
    readiness: jest.fn(() => ({ configured: true, connected: true, required: false, lastError: null })),
  };

  const controller = new OrderController(orderService as any, kafkaService as any);

  beforeEach(() => {
    jest.clearAllMocks();
    orderService.findOne.mockResolvedValue({ id: 'o1', branchId: 'b1', status: 'PENDING', orderItems: [] });
  });

  it('returns health payload', () => {
    const result = controller.health();
    expect(result.service).toBe('order-service');
    expect(result.status).toBe('ok');
    expect(typeof result.timestamp).toBe('string');
  });

  it('forwards menu query', () => {
    controller.getMenu('b1', 't1');
    expect(orderService.getMenu).toHaveBeenCalledWith({ branchId: 'b1', tableId: 't1' });
  });

  it('forwards branch menu management requests', () => {
    controller.getBranchMenu('b1', 't1');
    controller.activateBranchMenuItem('b1', 'm1', { price: 32000 } as any, 'MANAGER', 'b1');
    controller.updateBranchMenuItem('b1', 'm1', { is_available: false } as any, 'MANAGER', 'b1');
    controller.removeBranchMenuItem('b1', 'm1', 'MANAGER', 'b1');

    expect(orderService.getBranchMenu).toHaveBeenCalledWith('b1', 't1');
    expect(orderService.activateBranchMenuItem).toHaveBeenCalledWith('b1', 'm1', { price: 32000 }, { role: 'MANAGER', branchId: 'b1' });
    expect(orderService.updateBranchMenuItem).toHaveBeenCalledWith('b1', 'm1', { is_available: false }, { role: 'MANAGER', branchId: 'b1' });
    expect(orderService.removeBranchMenuItem).toHaveBeenCalledWith('b1', 'm1', { role: 'MANAGER', branchId: 'b1' });
  });

  it('forwards category management requests', () => {
    const createDto = { name: 'Coffee' };
    const updateDto = { name: 'Tea' };

    controller.listCategories('true', 'b1');
    controller.createCategory(createDto as any);
    controller.updateCategory('c1', updateDto as any);
    controller.deleteCategory('c1');

    expect(orderService.listMenuCategories).toHaveBeenCalledWith({ includeInactive: true, branchId: 'b1' });
    expect(orderService.createMenuCategory).toHaveBeenCalledWith(createDto);
    expect(orderService.updateMenuCategory).toHaveBeenCalledWith('c1', updateDto);
    expect(orderService.deleteMenuCategory).toHaveBeenCalledWith('c1');
  });

  it('forwards option group/value management requests', () => {
    const groupDto = { name: 'Size' };
    const groupUpdateDto = { name: 'Cup Size' };
    const valueDto = { value: 'L', priceDelta: 5000 };
    const valueUpdateDto = { value: 'XL' };

    controller.listOptionGroups('false', 'b2');
    controller.createOptionGroup(groupDto as any);
    controller.updateOptionGroup('g1', groupUpdateDto as any);
    controller.deleteOptionGroup('g1');
    controller.createOptionValue('g1', valueDto as any);
    controller.updateOptionValue('v1', valueUpdateDto as any);
    controller.deleteOptionValue('v1');

    expect(orderService.listMenuOptionGroups).toHaveBeenCalledWith({ includeInactive: false, branchId: 'b2' });
    expect(orderService.createMenuOptionGroup).toHaveBeenCalledWith(groupDto);
    expect(orderService.updateMenuOptionGroup).toHaveBeenCalledWith('g1', groupUpdateDto);
    expect(orderService.deleteMenuOptionGroup).toHaveBeenCalledWith('g1');
    expect(orderService.createMenuOptionValue).toHaveBeenCalledWith('g1', valueDto);
    expect(orderService.updateMenuOptionValue).toHaveBeenCalledWith('v1', valueUpdateDto);
    expect(orderService.deleteMenuOptionValue).toHaveBeenCalledWith('v1');
  });

  it('forwards menu item management requests', () => {
    const createDto = { name: 'Latte' };
    const updateDto = { name: 'Iced Latte' };

    controller.listMenuItems('latte', 'cat1', 'true', 'branch1', 'MANAGER', 'branch1');
    controller.createMenuItem(createDto as any, 'MANAGER', 'branch1');
    controller.updateMenuItem('m1', updateDto as any, 'MANAGER', 'branch1');
    controller.deleteMenuItem('m1', 'MANAGER', 'branch1');

    expect(orderService.listMenuItemsForAdmin).toHaveBeenCalledWith({
      keyword: 'latte',
      categoryId: 'cat1',
      includeInactive: true,
      branchId: 'branch1',
    }, { role: 'MANAGER', branchId: 'branch1' });
    expect(orderService.createMenuItemForAdmin).toHaveBeenCalledWith(createDto, { role: 'MANAGER', branchId: 'branch1' });
    expect(orderService.updateMenuItemForAdmin).toHaveBeenCalledWith('m1', updateDto, { role: 'MANAGER', branchId: 'branch1' });
    expect(orderService.deleteMenuItemForAdmin).toHaveBeenCalledWith('m1', { role: 'MANAGER', branchId: 'branch1' });
  });

  it('forwards promotion management requests', () => {
    const createDto = { code: 'PROMO10' };
    const updateDto = { description: 'updated' };
    const queryDto = { keyword: 'promo' };

    controller.listPromotions(queryDto as any);
    controller.createPromotion(createDto as any);
    controller.updatePromotion('p1', updateDto as any);
    controller.disablePromotion('p1');

    expect(orderService.listPromotions).toHaveBeenCalledWith(queryDto);
    expect(orderService.createPromotion).toHaveBeenCalledWith(createDto);
    expect(orderService.updatePromotion).toHaveBeenCalledWith('p1', updateDto);
    expect(orderService.disablePromotion).toHaveBeenCalledWith('p1');
  });

  it('forwards order requests', async () => {
    const createOrderDto = { tableId: 't1', items: [] };
    const tableActionDto = { fromTableId: 't1', toTableId: 't2' };
    const staffItemsDto = { items: [] };
    const customerItemsDto = { items: [] };
    const statusDto = { status: 'PREPARING' };

    controller.create(createOrderDto as any);
    controller.findAll('t1', 'PENDING', '2026-01-01', '2026-01-31', 'b1', 'MANAGER', 'b1');
    controller.hasActiveOrdersForTable('t1');
    controller.transferOrMergeTables(tableActionDto as any);
    controller.getCustomerHistory('c1', 'e@x.com', '0909', '5');
    controller.getCustomerRecommendations('c1', 'e@x.com', '0909', 'b1', 't1', '6');
    controller.findOne('o1');
    await controller.updateStatus('o1', statusDto as any, 'MANAGER', 'b1');
    await controller.updateItems('o1', staffItemsDto as any, 'WAITER', 'b1');
    controller.updateCustomerItems('o1', customerItemsDto as any);
    await controller.updateItemStatus('o1', 'i1', 'DONE', 'BARISTA', 'b1');

    expect(orderService.create).toHaveBeenCalledWith(createOrderDto);
    expect(orderService.findAll).toHaveBeenCalledWith({
      tableId: 't1',
      status: 'PENDING',
      dateFrom: '2026-01-01',
      dateTo: '2026-01-31',
      branchId: 'b1',
    });
    expect(orderService.hasActiveOrdersForTable).toHaveBeenCalledWith('t1');
    expect(orderService.transferOrMergeTables).toHaveBeenCalledWith(tableActionDto);
    expect(orderService.findCustomerHistory).toHaveBeenCalledWith({
      customerId: 'c1',
      email: 'e@x.com',
      phone: '0909',
      limit: 5,
    });
    expect(orderService.getCustomerRecommendations).toHaveBeenCalledWith({
      customerId: 'c1',
      email: 'e@x.com',
      phone: '0909',
      branchId: 'b1',
      tableId: 't1',
      limit: 6,
    });
    expect(orderService.findOne).toHaveBeenCalledWith('o1');
    expect(orderService.updateStatus).toHaveBeenCalledWith('o1', statusDto);
    expect(orderService.updateOrderItems).toHaveBeenCalledWith('o1', staffItemsDto);
    expect(orderService.updateCustomerOrderItems).toHaveBeenCalledWith('o1', customerItemsDto);
    expect(orderService.updateItemStatus).toHaveBeenCalledWith('o1', 'i1', 'DONE');
  });

  it('returns invalid response when promotion code missing', () => {
    const result = controller.validatePromotion(undefined, '10000', 'm1,m2', 'b1', 't1');
    expect(result).toEqual({ valid: false, message: 'Missing code' });
    expect(orderService.validatePromotion).not.toHaveBeenCalled();
  });

  it('parses promotion params and calls service', () => {
    controller.validatePromotion('PROMO10', '120000', 'm1, m2,,m3', 'b1', 't1');
    expect(orderService.validatePromotion).toHaveBeenCalledWith('PROMO10', 120000, ['m1', 'm2', 'm3'], 'b1', 't1');
  });
});
