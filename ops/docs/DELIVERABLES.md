# Delivery Package Checklist

## 1) Source code

- `apps/frontend`
- `apps/backend/api-gateway`
- `apps/backend/user-service`
- `apps/backend/table-service`
- `apps/backend/order-service`
- `apps/backend/chat-service`
- `apps/backend/inventory-service`
- `apps/backend/payment-service`
- `apps/backend/report-service`

## 2) Runtime scripts

- `deploy.sh`
- `seed-database.sh`
- `build-all.sh`

## 3) Compose and environment

- `docker-compose.yml` (single compose file)
- profiles `monitoring`/`logging` trong `docker-compose.yml`
- `.env.example`

## 4) Main documentation

- `README.md` (nguồn chính: kiến trúc, runbook, API flow)
- `README_DEPLOY.md` (production)
- `ops/docs/deployment-guide.md` (bản tóm tắt deploy + k8s)
- `ops/docs/architecture.md`
- `ops/docs/PHASED_OUTPUTS.md`
- `ops/docs/ACCEPTANCE_CRITERIA.md`
- `ops/docs/ACCEPTANCE_GUIDE.md`
- `ops/docs/api/coffee-shop.postman_collection.json`

## 5) DB schema and seed

- Prisma schemas: `*/prisma/schema.prisma`
- Seed scripts:
  - `apps/backend/order-service/prisma/seed.(ts|js)`
  - `apps/backend/inventory-service/prisma/seed.js`
- Auto seeder:
  - `apps/backend/user-service` (`TestAccountSeeder`)
  - `apps/backend/table-service` (`TableDataSeeder`)

## 6) Test and quality artifacts

- `ops/scripts/check-mvp-phase.mjs`
- `ops/scripts/check-advanced-phase.mjs`
- `ops/scripts/check-acceptance-criteria.mjs`
- `ops/scripts/integration-test.sh`
- `ops/scripts/perf-100-users.mjs`
- `ops/scripts/order-create-latency.mjs`
- `apps/frontend/scripts/ws-latency-50.mjs`

Reports:

- `reports/README.md`
- `reports/tests/unit-test-report.md`
- `reports/tests/integration-test-report.md`
- `reports/tests/performance-test-report.md`
- `reports/phases/mvp-readiness.md`
- `reports/phases/advanced-readiness.md`
- `reports/acceptance/acceptance-live.md`

## 7) Kubernetes manifests

- `ops/k8s/configmap.yaml`
- `ops/k8s/secret.example.yaml`
- `ops/k8s/*.yaml` (deployments/services)
- `ops/k8s/ingress.yaml`
