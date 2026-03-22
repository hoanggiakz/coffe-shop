# API Gateway TODO

## Setup
- [ ] `cd api-gateway && npm install`
- [ ] `npm run start:dev`
- [ ] Configure services URLs in .env (USER_SERVICE_URL=http://localhost:3000)

## Routes
- [ ] /users/** → user-service
- [ ] /orders/** → order-service
- [ ] /menu/** → menu-service
- [ ] /tables/** → table-service
- [ ] /payments/** → payment-service
- [ ] /reports/** → report-service

## Middleware
- [ ] JWT auth (reuse user-service strategy)
- [ ] RBAC (roles/permissions)
- [ ] Rate limit Redis IP 100/min
- [ ] CORS, Helmet

## Future
- [ ] Service discovery (Consul)
- [ ] Circuit breaker (opossum)
- [ ] Metrics (Prometheus)

