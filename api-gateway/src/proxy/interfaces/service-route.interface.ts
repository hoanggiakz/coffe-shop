export interface ServiceRoute {
  path: string;     // prefix: /api/users, /api/tables, ...
  target: string;   // backend service URL
  public: boolean;  // true = no JWT needed
  roles?: string[]; // optional roles required for access
}

export const SERVICE_ROUTES: ServiceRoute[] = [
  // User Service (Spring Boot) – login/register are public
  { path: '/api/users', target: process.env.USER_SERVICE_URL || 'http://localhost:3000', public: true },
  // Table Service (Spring Boot)
  { path: '/api/tables', target: process.env.TABLE_SERVICE_URL || 'http://localhost:3003', public: true },
  // Order Service (NestJS) – menu + orders
  { path: '/api/orders', target: process.env.ORDER_SERVICE_URL || 'http://localhost:3001', public: true },
  // Chat Service (NestJS) – REST endpoints
  { path: '/api/chats', target: process.env.CHAT_SERVICE_URL || 'http://localhost:3007', public: true },
  // Inventory Service (NestJS)
  { path: '/api/v1/ingredients', target: process.env.INVENTORY_SERVICE_URL || 'http://localhost:3005', public: true },
  // Payment Service (NestJS)
  { path: '/api/v1/payments', target: process.env.PAYMENT_SERVICE_URL || 'http://localhost:3004', public: true },
  // Report Service (NestJS)
  { path: '/api/reports', target: process.env.REPORT_SERVICE_URL || 'http://localhost:3006', public: true },
];
