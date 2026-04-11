# Advanced Readiness Report

Ngày cập nhật: `2026-04-10`

## Cách chạy

```bash
BASE_URL=https://localhost node scripts/check-advanced-phase.mjs
```

## Tiêu chí bao phủ

- Endpoint nâng cao: inventory/payment/report/promotion/staff/branch.
- Hiện diện tài sản vận hành: K8s manifests, performance scripts, CI workflow.
- Kiểm tra cảnh báo cho phần chưa đủ: PWA, monitoring, centralized logging.

## Kết luận

- Dùng output JSON của script để đánh giá pass/fail/warn theo từng hạng mục phase nâng cao.
