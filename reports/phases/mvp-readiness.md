# MVP Readiness Report

Ngày cập nhật: `2026-04-10`

## Cách chạy

```bash
BASE_URL=https://localhost node scripts/check-mvp-phase.mjs
```

## Tiêu chí bao phủ

- API Gateway + auth/JWT/CORS path.
- User profile flow.
- Table list/create/QR.
- Menu + create order + update trạng thái đơn/món.
- Chat create/send/list.

## Kết luận

- Dùng output JSON của script để chốt pass/fail theo từng hạng mục.
