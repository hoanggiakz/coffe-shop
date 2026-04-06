import { All, Controller, ForbiddenException, Get, Logger, Req, Res, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { SERVICE_ROUTES } from './interfaces/service-route.interface';
import { Request, Response } from 'express';
import { createProxyMiddleware, RequestHandler } from 'http-proxy-middleware';

type StaffRole = 'ADMIN' | 'MANAGER' | 'WAITER' | 'BARISTA' | 'STAFF';

@Controller()
export class ProxyController {
  private logger = new Logger('ProxyController');
  private proxies = new Map<string, RequestHandler>();
  private readonly staffRoles = new Set<StaffRole>(['ADMIN', 'MANAGER', 'WAITER', 'BARISTA', 'STAFF']);
  private readonly jwtSecretKey: Buffer;

  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
  ) {
    this.jwtSecretKey = this.buildJwtSecretKey(this.configService.get<string>('JWT_SECRET') || '');

    // Tạo proxy middleware cho mỗi service route
    for (const route of SERVICE_ROUTES) {
      const proxy = createProxyMiddleware({
        target: route.target,
        changeOrigin: true,
        // Giữ nguyên path – backend service cũng lắng nghe /api/...
        pathRewrite: undefined,
        onError: (err, req, res: any) => {
          this.logger.error(`Proxy error → ${route.target}: ${err.message}`);
          if (!res.headersSent) {
            res.status(502).json({ message: 'Service unavailable' });
          }
        },
      });
      this.proxies.set(route.path, proxy);
    }
  }

  @Get()
  healthCheck() {
    return {
      message: 'API Gateway is running',
      status: 'ok',
    };
  }

  @All('api/*path')
  handleProxy(@Req() req: Request, @Res() res: Response) {
    const route = SERVICE_ROUTES.find((r) => req.originalUrl.startsWith(r.path));
    if (!route) {
      return res.status(404).json({ message: 'Route not found' });
    }
    this.authorizeRequest(req);

    const proxy = this.proxies.get(route.path);
    if (!proxy) {
      return res.status(500).json({ message: 'Proxy not configured' });
    }

    proxy(req, res, (err?: any) => {
      if (err) {
        this.logger.error(`Proxy middleware error: ${err.message}`);
        if (!res.headersSent) {
          res.status(502).json({ message: 'Service unavailable' });
        }
      }
    });
  }

  private authorizeRequest(req: Request) {
    const path = req.path;
    const method = req.method.toUpperCase();

    // Public auth/customer endpoints
    if (
      path === '/api/users/login' ||
      path.startsWith('/api/users/customer/')
    ) {
      return;
    }

    // Staff profile endpoint
    if (method === 'GET' && path === '/api/users/profile') {
      this.requireRoles(req, ['ADMIN', 'MANAGER', 'WAITER', 'BARISTA', 'STAFF']);
      return;
    }

    // Staff account provisioning must be done by manager/admin only
    if (method === 'POST' && path === '/api/users/register') {
      this.requireRoles(req, ['ADMIN', 'MANAGER']);
      return;
    }

    if (method === 'GET' && path === '/api/users/staff') {
      this.requireRoles(req, ['ADMIN', 'MANAGER', 'WAITER', 'BARISTA', 'STAFF']);
      return;
    }

    if (method === 'GET' && path === '/api/users/staff/attendance') {
      this.requireRoles(req, ['ADMIN', 'MANAGER', 'WAITER', 'BARISTA', 'STAFF']);
      return;
    }

    if (
      method === 'GET' &&
      (path.startsWith('/api/users/staff/shift-overview') || path.startsWith('/api/users/staff/payroll'))
    ) {
      this.requireRoles(req, ['ADMIN', 'MANAGER', 'WAITER', 'BARISTA', 'STAFF']);
      return;
    }

    // Staff attendance check in/out can be done by any staff role
    if (
      method === 'POST' &&
      (path === '/api/users/staff/attendance/check-in' || path === '/api/users/staff/attendance/check-out')
    ) {
      this.requireRoles(req, ['ADMIN', 'MANAGER', 'WAITER', 'BARISTA', 'STAFF']);
      return;
    }

    // Branch list/details can be viewed by manager/admin
    if (method === 'GET' && path.startsWith('/api/users/admin/branches')) {
      this.requireRoles(req, ['ADMIN', 'MANAGER'])
      return
    }

    // Branch management write actions (admin only)
    if (path.startsWith('/api/users/admin/branches')) {
      this.requireRoles(req, ['ADMIN']);
      return;
    }

    // Staff management module (manager/admin)
    if (path.startsWith('/api/users/staff')) {
      this.requireRoles(req, ['ADMIN', 'MANAGER']);
      return;
    }

    // Staff dashboard orders list: customer flow only needs plain tableId query
    if (method === 'GET' && path === '/api/orders') {
      const hasTableId = this.hasQueryValue(req, 'tableId');
      const hasStaffFilters =
        this.hasQueryValue(req, 'status') ||
        this.hasQueryValue(req, 'dateFrom') ||
        this.hasQueryValue(req, 'dateTo');

      if (!hasTableId || hasStaffFilters) {
        this.requireRoles(req, ['ADMIN', 'MANAGER', 'WAITER', 'BARISTA', 'STAFF']);
        return;
      }
    }

    // Menu management (manager/admin)
    if (path.startsWith('/api/orders/admin/menu')) {
      this.requireRoles(req, ['ADMIN', 'MANAGER']);
      return;
    }

    // Promotion management (manager/admin)
    if (path.startsWith('/api/orders/admin/promotions')) {
      this.requireRoles(req, ['ADMIN', 'MANAGER']);
      return;
    }

    // Reports module (manager/admin)
    if (path.startsWith('/api/reports')) {
      this.requireRoles(req, ['ADMIN', 'MANAGER']);
      return;
    }

    // Waiter/manager/admin can move order lifecycle
    if (method === 'PATCH' && /^\/api\/orders\/[^/]+\/status$/.test(path)) {
      this.requireRoles(req, ['ADMIN', 'MANAGER', 'WAITER', 'STAFF']);
      return;
    }

    // Waiter/manager/admin can update order items
    if (method === 'PATCH' && /^\/api\/orders\/[^/]+\/items$/.test(path)) {
      this.requireRoles(req, ['ADMIN', 'MANAGER', 'WAITER', 'STAFF']);
      return;
    }

    // Waiter/manager/admin can transfer/merge tables
    if (path === '/api/orders/table-actions/transfer') {
      this.requireRoles(req, ['ADMIN', 'MANAGER', 'WAITER', 'STAFF']);
      return;
    }

    // Barista/manager/admin can update item cooking status in KDS
    if (method === 'PATCH' && /^\/api\/orders\/[^/]+\/items\/[^/]+\/status$/.test(path)) {
      this.requireRoles(req, ['ADMIN', 'MANAGER', 'BARISTA']);
      return;
    }

    // Chat staff module (S-16..S-18)
    if (path.startsWith('/api/chats')) {
      this.requireRoles(req, ['ADMIN', 'MANAGER', 'WAITER', 'BARISTA', 'STAFF']);
      return;
    }

    // Inventory endpoints: manager/admin only
    if (path.startsWith('/api/v1/ingredients')) {
      this.requireRoles(req, ['ADMIN', 'MANAGER']);
      return;
    }

    // Staff-only payment confirmation actions
    if (method === 'POST' && /^\/api\/v1\/payments\/[^/]+\/confirm-cash$/.test(path)) {
      this.requireRoles(req, ['ADMIN', 'MANAGER', 'WAITER', 'STAFF']);
      return;
    }
    if (method === 'POST' && /^\/api\/v1\/payments\/[^/]+\/confirm-transfer$/.test(path)) {
      this.requireRoles(req, ['ADMIN', 'MANAGER', 'WAITER', 'STAFF']);
      return;
    }
  }

  private requireRoles(req: Request, allowedRoles: StaffRole[]) {
    const userRoles = this.parseRolesFromToken(req);
    const hasAllowedRole = allowedRoles.some((role) => userRoles.includes(role));

    if (!hasAllowedRole) {
      throw new ForbiddenException('Insufficient permissions');
    }
  }

  private parseRolesFromToken(req: Request): StaffRole[] {
    const authHeader = String(req.headers.authorization || '');
    if (!authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const token = authHeader.slice('Bearer '.length).trim();
    if (!token) {
      throw new UnauthorizedException('Invalid bearer token');
    }

    try {
      const payload = this.jwtService.verify<Record<string, any>>(token, {
        secret: this.jwtSecretKey,
      });

      const rawRoles = Array.isArray(payload?.roles)
        ? payload.roles
        : payload?.role
          ? [payload.role]
          : [];

      const normalized = rawRoles
        .map((role) => String(role).toUpperCase())
        .filter((role): role is StaffRole => this.staffRoles.has(role as StaffRole));

      if (!normalized.length) {
        throw new ForbiddenException('Insufficient permissions');
      }

      return normalized;
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid token');
    }
  }

  private hasQueryValue(req: Request, key: string): boolean {
    const value = req.query[key];
    if (Array.isArray(value)) {
      return value.some((item) => String(item || '').trim().length > 0);
    }
    return String(value || '').trim().length > 0;
  }

  private buildJwtSecretKey(secret: string): Buffer {
    const key = Buffer.from(secret, 'utf8');
    if (key.length >= 32) {
      return key;
    }

    const padded = Buffer.alloc(32);
    key.copy(padded);
    return padded;
  }
}
