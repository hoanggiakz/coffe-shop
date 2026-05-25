export interface ServiceRoute {
  path: string;     // prefix: /api/users, /api/tables, ...
  target?: string;  // backend service URL (resolved in runtime)
  public: boolean;  // true = no JWT needed
  roles?: string[]; // optional roles required for access
}

export const SERVICE_ROUTES: ServiceRoute[] = [
  // User Service (Spring Boot) – login/register are public
  { path: '/api/users', public: true },
  // Branch API alias mapped to user-service
  { path: '/api/branches', public: true },
  // Table Service (Spring Boot)
  { path: '/api/tables', public: true },
  // Order Service (NestJS) – menu + orders
  { path: '/api/orders', public: true },
  // Chat Service (NestJS) – REST endpoints
  { path: '/api/chats', public: true },
  // Inventory Service (NestJS)
  { path: '/api/v1/ingredients', public: true },
  // Payment Service (NestJS)
  { path: '/api/v1/payments', public: true },
  // Payment compatibility alias (legacy/public docs)
  { path: '/api/payment', public: true },
  // Report Service (NestJS)
  { path: '/api/reports', public: true },
];
