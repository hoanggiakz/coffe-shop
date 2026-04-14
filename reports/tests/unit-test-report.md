# Unit Test Report

- Updated: `2026-04-14`
- Source script: `ops/scripts/run-unit-tests.sh`
- Scope:
  - `apps/backend/api-gateway`
  - `apps/backend/user-service`
  - `apps/backend/table-service`
  - `apps/backend/order-service`
  - `apps/backend/chat-service`
  - `apps/frontend`

## Command

```bash
./ops/scripts/run-unit-tests.sh
```

## Expected result

- Script exits with code `0`.
- Mỗi module báo PASS trong log của script.

## Latest local snapshot

- `api-gateway`: PASS (sanity)
- `order-service`: PASS (sanity)
- `chat-service`: PASS (sanity)
- `frontend`: chưa chạy lại trong đợt cập nhật docs
- `user-service`: chưa chạy lại trong đợt cập nhật docs
- `table-service`: chưa chạy lại trong đợt cập nhật docs

## Notes

- Đây là báo cáo tài liệu/snapshot, không thay thế kết quả runtime mới nhất.
- Khi nghiệm thu chính thức, chạy lại script để lấy trạng thái hiện tại.
