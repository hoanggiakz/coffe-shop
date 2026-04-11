# Integration Test Report

- Date: `2026-04-10`
- Script: `scripts/integration-test.sh`

## Command

```bash
BASE_URL=https://localhost ./scripts/integration-test.sh
```

## Coverage

- `GET /api/users/health`
- `GET /api/tables/health`
- `GET /api/orders/health`
- `GET /api/chats/health`
- `GET /api/v1/ingredients/health`
- `GET /api/v1/payments/health`
- `GET /api/reports/health`
- `GET /api/orders/menu`

## Pass criteria

- All requests return HTTP `2xx`.
- Script exits with code `0`.

## Current execution status

- Not executed in this local editing session.
