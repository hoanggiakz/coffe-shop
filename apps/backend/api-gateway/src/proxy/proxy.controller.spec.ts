import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ProxyController } from './proxy.controller';

declare function describe(name: string, fn: () => void): void;
declare function it(name: string, fn: () => Promise<void> | void): void;
declare function beforeEach(fn: () => void): void;
declare const jest: any;
declare function expect(value: unknown): {
  toBe(expected: unknown): void;
  toBeInstanceOf(expected: any): void;
  toContain(expected: string): void;
};

jest.mock('http-proxy-middleware', () => ({
  createProxyMiddleware: jest.fn(() => {
    return (_req: unknown, _res: unknown, next?: (err?: Error) => void) => {
      if (next) next();
    };
  }),
}));

describe('ProxyController QR menu validation', () => {
  let controller: ProxyController;
  const configServiceMock = {
    get: jest.fn((key: string) => {
      if (key === 'JWT_SECRET') return 'test-secret-that-has-at-least-32-characters';
      if (key === 'TABLE_SERVICE_URL') return 'http://table-service:3003';
      if (key === 'MENU_QR_ALLOW_BRANCH_ONLY_TEST') return false;
      return undefined;
    }),
  } as unknown as ConfigService;

  const jwtServiceMock = {
    verify: jest.fn(),
  } as unknown as JwtService;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new ProxyController(configServiceMock, jwtServiceMock);
  });

  it('rejects customer menu request when table is CLEANING', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 'CLEANING' }),
    });
    (global as any).fetch = fetchMock;

    const req = {
      method: 'GET',
      path: '/api/orders/menu',
      headers: {},
      query: { tableId: 'tbl-01' },
    } as any;

    let thrown: unknown;
    try {
      await (controller as any).validateQrOrderMenuRequest(req);
    } catch (error) {
      thrown = error;
    }
    expect(thrown instanceof ForbiddenException).toBe(true);
    expect(String((thrown as any)?.message || '')).toContain('Ban hien khong kha dung');
  });

  it('rejects customer menu request without tableId', async () => {
    const req = {
      method: 'GET',
      path: '/api/orders/menu',
      headers: {},
      query: {},
    } as any;

    let thrown: unknown;
    try {
      await (controller as any).validateQrOrderMenuRequest(req);
    } catch (error) {
      thrown = error;
    }
    expect(thrown instanceof BadRequestException).toBe(true);
  });
});
