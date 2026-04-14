# MVP Readiness Report

- Updated: `2026-04-14`
- Source script: `ops/scripts/check-mvp-phase.mjs`

## Command

```bash
BASE_URL=https://localhost node ops/scripts/check-mvp-phase.mjs
```

## Coverage summary

- Gateway + auth/profile flow.
- Tables list/create/QR.
- Menu + create order + update order/item status.
- Chat create/send/list.

## Result source of truth

- Script JSON output tại thời điểm chạy (stdout hoặc artifact do pipeline lưu).
- File `reports/phases/mvp-readiness-live.json` nếu đã được tạo.

## Latest local snapshot

- Chưa chạy lại trong đợt cập nhật docs.
