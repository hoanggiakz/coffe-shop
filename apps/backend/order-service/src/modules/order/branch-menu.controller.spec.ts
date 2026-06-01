import { BranchMenuController } from './branch-menu.controller';

describe('BranchMenuController', () => {
  const orderService = {
    getBranchMenu: jest.fn(),
    findByBranch: jest.fn(),
    findOneByBranch: jest.fn(),
    getKdsQueueByBranch: jest.fn(),
    validateBranchCart: jest.fn(),
    activateBranchMenuItem: jest.fn(),
    updateBranchMenuItem: jest.fn(),
    removeBranchMenuItem: jest.fn(),
  };

  const controller = new BranchMenuController(orderService as any);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('forwards branch kds queue request', () => {
    controller.getKdsQueue('branch-1', '8', 'BARISTA', 'branch-1');
    expect(orderService.getKdsQueueByBranch).toHaveBeenCalledWith('branch-1', { limit: 8 });
  });
});
