# Performance Test Report (100 Concurrent Users)

- Updated: `2026-04-14`
- Source script: `ops/scripts/perf-100-users.mjs`

## Command

```bash
BASE_URL=https://localhost \
TARGET_PATH=/api/orders/health \
CONCURRENCY=100 \
ROUNDS=5 \
node ops/scripts/perf-100-users.mjs
```

## Output fields

- `totalRequests`
- `concurrency` (kỳ vọng `100`)
- `rounds`
- `failures`
- `successRate`
- `avgMs`
- `p95Ms`
- `requestsPerSecond`

## Baseline pass criteria

- `successRate >= 99%`
- `p95Ms <= 1000`
- `failures = 0`

## Latest local snapshot

- Chưa chạy lại trong đợt cập nhật docs.

## Notes

- Kết quả perf phụ thuộc cấu hình máy và tải hệ thống tại thời điểm chạy.
