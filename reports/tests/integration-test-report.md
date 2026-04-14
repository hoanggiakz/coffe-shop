# Integration Test Report

- Updated: `2026-04-14`
- Source script: `ops/scripts/integration-test.sh`

## Command

```bash
BASE_URL=https://localhost ./ops/scripts/integration-test.sh
```

## Coverage (smoke)

- `GET /api/users/health`
- `GET /api/tables/health`
- `GET /api/orders/health`
- `GET /api/chats/health`
- `GET /api/v1/ingredients/health`
- `GET /api/v1/payments/health`
- `GET /api/reports/health`
- `GET /api/orders/menu`

## Pass criteria

- Tất cả request trả HTTP `2xx`.
- Script exit code `0`.

## Latest local snapshot

- Chưa chạy lại trong đợt cập nhật docs.

## Notes

- Báo cáo này mô tả phạm vi test; kết quả thực tế cần chạy lại script theo thời điểm nghiệm thu.
