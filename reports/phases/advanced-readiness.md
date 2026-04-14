# Advanced Readiness Report

- Updated: `2026-04-14`
- Source script: `ops/scripts/check-advanced-phase.mjs`

## Command

```bash
BASE_URL=https://localhost node ops/scripts/check-advanced-phase.mjs
```

## Coverage summary

- Endpoint nâng cao: inventory, payment, reports, promotion, staff, branch.
- Tài sản vận hành: manifests K8s, scripts perf/phase check, CI workflow.
- Kiểm tra tồn tại cấu hình monitoring/logging.

## Result source of truth

- Script JSON output tại thời điểm chạy.
- File `reports/phases/advanced-readiness-live.json` nếu đã được tạo.

## Latest local snapshot

- Chưa chạy lại trong đợt cập nhật docs.
