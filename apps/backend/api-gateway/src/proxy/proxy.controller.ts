import { All, BadRequestException, Controller, ForbiddenException, Get, Logger, Req, Res, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { SERVICE_ROUTES } from './interfaces/service-route.interface';
import { Request, Response } from 'express';
import { createProxyMiddleware, RequestHandler } from 'http-proxy-middleware';

type StaffRole = 'ADMIN' | 'MANAGER' | 'WAITER' | 'BARISTA' | 'STAFF' | 'CUSTOMER';

@Controller()
export class ProxyController {
  private logger = new Logger('ProxyController');
  private proxies = new Map<string, RequestHandler>();
  private inventoryCompatProxy: RequestHandler;
  private readonly staffRoles = new Set<StaffRole>(['ADMIN', 'MANAGER', 'WAITER', 'BARISTA', 'STAFF', 'CUSTOMER']);
  private readonly jwtSecretKey: Buffer;

  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
  ) {
    this.jwtSecretKey = this.buildJwtSecretKey(this.configService.get<string>('JWT_SECRET') || '');
    const inventoryTarget = this.configService.get<string>('INVENTORY_SERVICE_URL') || 'http://inventory-service:3005';
    this.inventoryCompatProxy = createProxyMiddleware({
      target: inventoryTarget,
      changeOrigin: true,
      pathRewrite: (path) => (path.startsWith('/api/v1/') ? path : path.replace(/^\/api/, '/api/v1')),
    });

    // Tạo proxy middleware cho mỗi service route
    for (const route of SERVICE_ROUTES) {
      const target = this.resolveRouteTarget(route.path);
      const pathRewrite =
        route.path === '/api/v1/payments'
          ? (path: string) => {
              if (/^\/api\/v1\/payments\/webhook(?:\/|$)/.test(path)) {
                return path.replace(/^\/api\/v1\/payments\/webhook/, '/api/payment/webhook/sepay');
              }
              return path;
            }
          : route.path === '/api/invoices'
            ? (path: string) => (path.startsWith('/api/v1/') ? path : path.replace(/^\/api/, '/api/v1'))
          : undefined;
      const proxy = createProxyMiddleware({
        target,
        changeOrigin: true,
        proxyTimeout: route.path === '/api/ai' ? 2000 : undefined,
        timeout: route.path === '/api/ai' ? 2000 : undefined,
        // Keep /api/v1/payments for normal payment APIs, but bridge webhook to compat endpoint.
        pathRewrite,
        onError: (err, req, res: any) => {
          this.logger.error(`Proxy error → ${target}: ${err.message}`);
          if (!res.headersSent) {
            res.status(502).json({ message: 'Service unavailable' });
          }
        },
      });
      this.logger.log(`Proxy route configured: ${route.path} -> ${target}`);
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
  async handleProxy(@Req() req: Request, @Res() res: Response) {
    this.attachBearerFromQueryForRealtime(req);
    const isBranchOrdersPath = /^\/api\/branches\/[^/]+\/orders(\/|$)/.test(req.path);
    const isBranchCartValidatePath = /^\/api\/branches\/[^/]+\/cart\/validate(\/|$)/.test(req.path);
    const isBranchInvoicesPath = /^\/api\/branches\/[^/]+\/invoices(\/|$)/.test(req.path);
    const isBranchChatPath = /^\/api\/branches\/[^/]+\/chat\/sessions(\/|$)/.test(req.path);
    const isChatSessionPath = /^\/api\/chat\/sessions\/[^/]+(\/|$)/.test(req.path);
    const isNotificationsPath = /^\/api\/notifications(\/|$)/.test(req.path);
    const isOrderInvoiceRegeneratePath = /^\/api\/orders\/[^/]+\/invoice\/regenerate(\/|$)/.test(req.path);
    const isPublicInvoicePath = /^\/api\/public\/invoices\/[^/]+(\/|$)/.test(req.path);
    const isPublicOrderInvoiceLinkPath = /^\/api\/public\/orders\/[^/]+\/invoice-link(\/|$)/.test(req.path);
    const inventoryCompatPath = this.isInventoryCompatPath(req.path);
    const route = inventoryCompatPath
      ? ({ path: '__inventory_compat__' } as any)
      : isBranchInvoicesPath || isOrderInvoiceRegeneratePath || isPublicInvoicePath || isPublicOrderInvoiceLinkPath
        ? ({ path: '/api/invoices' } as any)
      : isBranchChatPath || isChatSessionPath
        ? ({ path: '/api/chats' } as any)
      : isNotificationsPath
        ? ({ path: '/api/chats' } as any)
      : isBranchOrdersPath || isBranchCartValidatePath
        ? ({ path: '/api/orders' } as any)
      : SERVICE_ROUTES.find((r) => req.originalUrl.startsWith(r.path));
    if (!route) {
      return res.status(404).json({ message: 'Route not found' });
    }
    this.authorizeRequest(req);
    this.attachActorContextHeaders(req);
    await this.validateQrOrderMenuRequest(req);

    const proxy = inventoryCompatPath ? this.inventoryCompatProxy : this.proxies.get(route.path);
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
    const isBranchChatPath = /^\/api\/branches\/[^/]+\/chat\/sessions(\/|$)/.test(path);
    const isChatSessionPath = /^\/api\/chat\/sessions\/[^/]+(\/|$)/.test(path);
    const isBranchInvoicesPath = /^\/api\/branches\/[^/]+\/invoices(\/|$)/.test(path);
    const isInvoiceDetailPath = /^\/api\/invoices\/[^/]+(\/|$)/.test(path);
    const isOrderInvoiceRegeneratePath = /^\/api\/orders\/[^/]+\/invoice\/regenerate(\/|$)/.test(path);
    const isPublicInvoicePath = /^\/api\/public\/invoices\/[^/]+(\/|$)/.test(path);
    const isPublicOrderInvoiceLinkPath = /^\/api\/public\/orders\/[^/]+\/invoice-link(\/|$)/.test(path);
    const isBranchCartValidatePath = /^\/api\/branches\/[^/]+\/cart\/validate(\/|$)/.test(path);
    const isNotificationsPath = /^\/api\/notifications(\/|$)/.test(path);

    // Public auth/customer endpoints
    if (
      path === '/api/users/login' ||
      path.startsWith('/api/users/customer/')
    ) {
      return;
    }
    if (
      path === '/api/auth/login' ||
      path === '/api/auth/register' ||
      path === '/api/auth/refresh' ||
      path === '/api/auth/forgot-password' ||
      path === '/api/auth/reset-password' ||
      path === '/api/auth/otp/request' ||
      path === '/api/auth/otp/verify' ||
      path.startsWith('/api/auth/google/')
    ) {
      return;
    }
    if (path.startsWith('/api/customer/')) {
      this.requireRoles(req, ['CUSTOMER']);
      return;
    }

    if (isPublicInvoicePath || isPublicOrderInvoiceLinkPath) {
      return;
    }

    // Customer QR flow: validate cart without staff token
    if (method === 'POST' && isBranchCartValidatePath) {
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
    if (method === 'GET' && /^\/api\/branches\/[^/]+\/orders(\/|$)/.test(path)) {
      this.requireRoles(req, ['ADMIN', 'MANAGER', 'WAITER', 'BARISTA', 'STAFF']);
      return;
    }
    if (method === 'GET' && /^\/api\/branches\/[^/]+\/invoices(\/|$)/.test(path)) {
      this.requireRoles(req, ['ADMIN', 'MANAGER', 'WAITER', 'STAFF']);
      return;
    }
    if (method === 'GET' && /^\/api\/branches\/[^/]+\/chat\/sessions(\/|$)/.test(path)) {
      this.requireRoles(req, ['ADMIN', 'MANAGER', 'WAITER', 'STAFF']);
      return;
    }
    if (method === 'GET' && path.startsWith('/api/branches')) {
      this.requireRoles(req, ['ADMIN', 'MANAGER'])
      return
    }

    // Branch management write actions (admin only)
    if (path.startsWith('/api/users/admin/branches')) {
      this.requireRoles(req, ['ADMIN']);
      return;
    }
    if (path.startsWith('/api/branches')) {
      const isStaffWrite = method === 'POST' && /^\/api\/branches\/[^/]+\/staff$/.test(path);
      if (isStaffWrite) {
        this.requireRoles(req, ['ADMIN', 'MANAGER']);
        return;
      }
      this.requireRoles(req, ['ADMIN']);
      return;
    }

    // Staff management module (manager/admin)
    if (path.startsWith('/api/users/staff')) {
      this.requireRoles(req, ['ADMIN', 'MANAGER']);
      return;
    }
    if (path.startsWith('/api/staff')) {
      this.requireRoles(req, ['ADMIN', 'MANAGER']);
      return;
    }
    if (path.startsWith('/api/attendance')) {
      this.requireRoles(req, ['ADMIN', 'MANAGER', 'WAITER', 'BARISTA', 'STAFF']);
      return;
    }
    if (path.startsWith('/api/payroll')) {
      this.requireRoles(req, ['ADMIN', 'MANAGER', 'WAITER', 'BARISTA', 'STAFF']);
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

    if (method === 'GET' && path === '/api/ai/health') {
      return;
    }

    // AI analytics module (manager/admin)
    if (path.startsWith('/api/ai')) {
      this.requireRoles(req, ['ADMIN', 'MANAGER']);
      return;
    }

    // Waiter/barista/manager/admin can move order lifecycle
    if (method === 'PATCH' && /^\/api\/orders\/[^/]+\/status$/.test(path)) {
      this.requireRoles(req, ['ADMIN', 'MANAGER', 'WAITER', 'BARISTA', 'STAFF']);
      return;
    }

    // Waiter/manager/admin can update order items
    if (method === 'PATCH' && /^\/api\/orders\/[^/]+\/items$/.test(path)) {
      this.requireRoles(req, ['ADMIN', 'MANAGER', 'WAITER', 'STAFF']);
      return;
    }
    if (method === 'POST' && /^\/api\/orders\/[^/]+\/items$/.test(path)) {
      this.requireRoles(req, ['ADMIN', 'MANAGER', 'WAITER', 'STAFF']);
      return;
    }
    if ((method === 'PATCH' || method === 'DELETE') && /^\/api\/orders\/[^/]+\/items\/[^/]+$/.test(path)) {
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
    if (method === 'PATCH' && /^\/api\/orders\/[^/]+\/items\/batch-status$/.test(path)) {
      this.requireRoles(req, ['ADMIN', 'MANAGER', 'BARISTA']);
      return;
    }
    if (method === 'PATCH' && /^\/api\/orders\/[^/]+\/cancel$/.test(path)) {
      this.requireRoles(req, ['ADMIN', 'MANAGER']);
      return;
    }
    if (method === 'POST' && /^\/api\/orders\/[^/]+\/payment$/.test(path)) {
      this.requireRoles(req, ['ADMIN', 'MANAGER', 'WAITER', 'STAFF']);
      return;
    }
    if (method === 'POST' && /^\/api\/orders\/[^/]+\/discount$/.test(path)) {
      this.requireRoles(req, ['ADMIN', 'MANAGER']);
      return;
    }

    // Chat staff module (S-16..S-18)
    if (path.startsWith('/api/chats') || isBranchChatPath || isChatSessionPath) {
      this.requireRoles(req, ['ADMIN', 'MANAGER', 'WAITER', 'STAFF']);
      return;
    }
    if (isNotificationsPath) {
      this.requireRoles(req, ['ADMIN', 'MANAGER', 'WAITER', 'BARISTA', 'STAFF']);
      return;
    }

    if (isBranchInvoicesPath || isInvoiceDetailPath || path.startsWith('/api/invoices')) {
      this.requireRoles(req, ['ADMIN', 'MANAGER', 'WAITER', 'STAFF']);
      return;
    }
    if (isOrderInvoiceRegeneratePath) {
      this.requireRoles(req, ['ADMIN']);
      return;
    }

    // Inventory endpoints: manager/admin only
    if (
      path.startsWith('/api/v1/ingredients') ||
      this.isInventoryCompatPath(path)
    ) {
      this.requireRoles(req, ['ADMIN', 'MANAGER']);
      return;
    }

    // Staff-only payment confirmation actions
    if (method === 'POST' && /^\/api\/v1\/payments\/[^/]+\/confirm-cash$/.test(path)) {
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
    const payload = this.parseTokenPayload(req);
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
  }

  private isInventoryCompatPath(path: string): boolean {
    return (
      /^\/api\/branches\/[^/]+\/inventory(\/|$)/.test(path) ||
      /^\/api\/branches\/[^/]+\/purchase-orders(\/|$)/.test(path) ||
      /^\/api\/branches\/[^/]+\/menu-items\/[^/]+\/recipe(\/|$)/.test(path) ||
      /^\/api\/branches\/[^/]+\/recipes(\/|$)/.test(path) ||
      /^\/api\/ingredients(\/|$)/.test(path) ||
      /^\/api\/menu-items\/[^/]+\/recipe(\/|$)/.test(path) ||
      /^\/api\/recipes\/[^/]+(\/|$)/.test(path) ||
      /^\/api\/purchase-orders(\/|$)/.test(path)
    );
  }

  private parseTokenPayload(req: Request): Record<string, any> {
    const authHeader = String(req.headers.authorization || '');
    const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : '';
    const queryToken = String(req.query.access_token || '').trim();
    const token = bearer || (this.isRealtimeStreamPath(req.path) ? queryToken : '');
    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    try {
      return this.jwtService.verify<Record<string, any>>(token, {
        secret: this.jwtSecretKey,
      });
    } catch (error) {
      throw new UnauthorizedException('Invalid token');
    }
  }

  private attachActorContextHeaders(req: Request) {
    const authHeader = String(req.headers.authorization || '');
    if (!authHeader.startsWith('Bearer ')) {
      return;
    }

    try {
      const payload = this.parseTokenPayload(req);
      const roles = this.parseRolesFromToken(req);
      const primaryRole = roles[0] || '';
      const branchId = String(payload?.branchId || '').trim();
      const userId = String(payload?.sub || payload?.userId || '').trim();
      req.headers['x-actor-role'] = primaryRole;
      req.headers['x-actor-branch-id'] = branchId;
      req.headers['x-actor-user-id'] = userId;
    } catch {
      // ignore: auth errors are handled by authorizeRequest
    }
  }

  private hasQueryValue(req: Request, key: string): boolean {
    const value = req.query[key];
    if (Array.isArray(value)) {
      return value.some((item) => String(item || '').trim().length > 0);
    }
    return String(value || '').trim().length > 0;
  }

  private resolveRouteTarget(path: string): string {
    switch (path) {
      case '/api/users':
      case '/api/auth':
      case '/api/customer':
      case '/api/branches':
      case '/api/staff':
      case '/api/attendance':
      case '/api/payroll':
        return this.configService.get<string>('USER_SERVICE_URL') || 'http://user-service:3000';
      case '/api/tables':
        return this.configService.get<string>('TABLE_SERVICE_URL') || 'http://table-service:3003';
      case '/api/orders':
        return this.configService.get<string>('ORDER_SERVICE_URL') || 'http://order-service:3001';
      case '/api/discount':
        return this.configService.get<string>('ORDER_SERVICE_URL') || 'http://order-service:3001';
      case '/api/chats':
        return this.configService.get<string>('CHAT_SERVICE_URL') || 'http://chat-service:3007';
      case '/api/v1/ingredients':
        return this.configService.get<string>('INVENTORY_SERVICE_URL') || 'http://inventory-service:3005';
      case '/api/v1/payments':
        return this.configService.get<string>('PAYMENT_SERVICE_URL') || 'http://payment-service:3004';
      case '/api/payment':
        return this.configService.get<string>('PAYMENT_SERVICE_URL') || 'http://payment-service:3004';
      case '/api/invoices':
        return this.configService.get<string>('PAYMENT_SERVICE_URL') || 'http://payment-service:3004';
      case '/api/reports':
        return this.configService.get<string>('REPORT_SERVICE_URL') || 'http://report-service:3006';
      case '/api/ai':
        return this.configService.get<string>('AI_SERVICE_URL') || 'http://ai-service:3010';
      default:
        throw new Error(`Unsupported route path: ${path}`);
    }
  }

  private async validateQrOrderMenuRequest(req: Request) {
    const method = req.method.toUpperCase();
    const path = req.path;

    // QR menu public flow: enforce tableId validation at gateway before proxying to order-service.
    if (method !== 'GET' || path !== '/api/orders/menu') {
      return;
    }

    let isStaffRequest = false;
    if (String(req.headers.authorization || '').startsWith('Bearer ')) {
      try {
        const roles = this.parseRolesFromToken(req);
        isStaffRequest = roles.length > 0;
      } catch {
        isStaffRequest = false;
      }
    }

    if (isStaffRequest) {
      return;
    }

    const tableId = String(req.query.tableId || '').trim();
    const branchId = String(req.query.branchId || '').trim();
    const allowBranchOnlyForTest = this.configService.get<boolean>('MENU_QR_ALLOW_BRANCH_ONLY_TEST') === true;
    if (!tableId) {
      // Test-only shortcut: allow customer menu loading by branchId without tableId.
      if (allowBranchOnlyForTest && branchId) {
        return;
      }
      throw new BadRequestException('tableId la bat buoc cho luong quet QR');
    }

    const tableServiceUrl = this.configService.get<string>('TABLE_SERVICE_URL') || 'http://table-service:3003';
    let response: globalThis.Response;
    try {
      response = await fetch(`${tableServiceUrl}/api/tables/${encodeURIComponent(tableId)}`);
    } catch {
      throw new ForbiddenException('Khong the ket noi table-service de xac thuc ban');
    }

    if (response.status === 404) {
      throw new BadRequestException('tableId khong hop le');
    }

    if (!response.ok) {
      throw new ForbiddenException('Khong the xac thuc ban tu table-service');
    }

    let payload: Record<string, any> | null = null;
    try {
      payload = (await response.json()) as Record<string, any>;
    } catch {
      payload = null;
    }

    const tableStatus = String(payload?.status || '').toUpperCase();
    if (tableStatus === 'MAINTENANCE' || tableStatus === 'UNAVAILABLE' || tableStatus === 'CLEANING') {
      throw new ForbiddenException('Ban hien khong kha dung');
    }
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

  private isRealtimeStreamPath(path: string): boolean {
    return (
      path.startsWith('/api/reports/realtime/stream') ||
      /^\/api\/branches\/[^/]+\/hr\/events(\/|$)/.test(path)
    );
  }

  private attachBearerFromQueryForRealtime(req: Request) {
    if (String(req.headers.authorization || '').startsWith('Bearer ')) {
      return;
    }
    if (!this.isRealtimeStreamPath(req.path)) {
      return;
    }
    const queryToken = String(req.query.access_token || '').trim();
    if (!queryToken) {
      return;
    }
    req.headers.authorization = `Bearer ${queryToken}`;
  }
}
