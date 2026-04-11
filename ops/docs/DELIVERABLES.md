# Delivery Package Checklist

## 1) Source code
- `apps/backend/api-gateway` (Node.js)
- `apps/backend/user-service` (Spring Boot)
- `apps/backend/table-service` (Spring Boot)
- `apps/backend/order-service` (Node.js)
- `apps/backend/chat-service` (Node.js + Socket.IO)
- `frontend` (React + Vite)

## 2) Required scripts
- `seed-database.sh`
- `build-all.sh`
- `deploy.sh`

## 3) Environment and compose
- `docker-compose.yml`
- `docker-compose.dev.yml`
- `docker-compose.prod.yml`
- `.env.example` (root + service-level examples)

## 4) Technical docs
- `README.md`
- `README_DEPLOY.md`
- `ops/docs/architecture.md`
- `ops/docs/deployment-guide.md`
- `ops/docs/PHASED_OUTPUTS.md`
- `ops/docs/ACCEPTANCE_CRITERIA.md`
- `ops/docs/api/coffee-shop.postman_collection.json`

## 5) Database schema and seed
- Prisma schemas: `*/prisma/schema.prisma`
- Seed scripts:
  - `apps/backend/user-service` auto seeder (`TestAccountSeeder`)
  - `apps/backend/table-service` auto seeder (`TableDataSeeder`) with at least 10 tables
  - `apps/backend/order-service/prisma/seed.(ts|js)` for menu/promotions/recipes
  - `apps/backend/inventory-service/prisma/seed.js` for ingredients baseline

## 6) Test artifacts
- Unit tests (sanity baseline) for each required service
- Integration smoke script: `ops/scripts/integration-test.sh`
- 100 concurrent users performance script: `ops/scripts/perf-100-users.mjs`
- Phase check scripts:
  - `ops/scripts/check-mvp-phase.mjs`
  - `ops/scripts/check-advanced-phase.mjs`
  - `ops/scripts/check-acceptance-criteria.mjs`
  - `ops/scripts/order-create-latency.mjs`
  - `apps/frontend/scripts/ws-latency-50.mjs`
- Reports:
  - `reports/tests/unit-test-report.md`
  - `reports/tests/integration-test-report.md`
  - `reports/tests/performance-test-report.md`
  - `reports/phases/mvp-readiness.md`
  - `reports/phases/advanced-readiness.md`
  - `reports/acceptance/acceptance-live.md`

## 7) Kubernetes manifests (optional package included)
- `ops/k8s/configmap.yaml`
- `ops/k8s/secret.example.yaml`
- `ops/k8s/*.yaml` deployments/services
- `ops/k8s/ingress.yaml`




