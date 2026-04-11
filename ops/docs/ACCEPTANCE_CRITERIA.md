# Acceptance Criteria (Section 3)

Ngày cập nhật: `2026-04-10`

## 1) Cách chạy bộ nghiệm thu tự động

```bash
node ops/scripts/check-acceptance-criteria.mjs
```

Kết quả được ghi vào:

- `reports/acceptance/acceptance-live.json`
- `reports/acceptance/acceptance-live.md`

## 2) Mapping tiêu chí -> kiểm tra

### 3.1 Chất lượng mã nguồn

- `3.1.1` TypeScript cho Node.js:
  - Kiểm tra `tsconfig.json` cho `apps/backend/api-gateway`, `apps/backend/order-service`, `apps/backend/chat-service`.
- `3.1.2` Java 17+:
  - Kiểm tra `sourceCompatibility = '17'` trong `apps/backend/user-service/build.gradle`, `apps/backend/table-service/build.gradle`.
- `3.1.3` Coding convention:
  - Chạy ESLint không auto-fix cho `apps/backend/api-gateway`, `apps/backend/order-service`, `apps/backend/chat-service`.
  - Kiểm tra tồn tại `checkstyle.xml` cho `apps/backend/user-service`, `apps/backend/table-service`.
- `3.1.4` Coverage >= 70%:
  - `apps/backend/order-service`: `npm run test:cov` và đọc `coverage-summary.json`.
  - `apps/backend/user-service`, `apps/backend/table-service`: chạy `gradle test jacocoTestReport` bằng Docker và đọc Jacoco XML.
- `3.1.5` Không critical bug luồng chính:
  - Chạy `node ops/scripts/check-mvp-phase.mjs`.

### 3.2 Hiệu năng

- `3.2.1` API Gateway >= 100 req/s, avg < 200ms:
  - Chạy `node ops/scripts/perf-100-users.mjs`.
- `3.2.2` WebSocket chat < 100ms với 50 phiên:
  - Chạy `npm --prefix apps/frontend exec node ./scripts/ws-latency-50.mjs`.
- `3.2.3` Tạo đơn < 1s:
  - Chạy `node ops/scripts/order-create-latency.mjs`.

### 3.3 Bảo mật

- `3.3.1` Password bcrypt:
  - Kiểm tra static code `bcrypt.hash/compare`, `BCryptPasswordEncoder`.
- `3.3.2` JWT expiration 1 ngày:
  - Kiểm tra `JWT_EXPIRATION=86400000` trong config.
- `3.3.3` SQLi/XSS scan:
  - Kiểm tra có artifact scan tại `reports/security/` (OWASP ZAP hoặc tương tự).
- `3.3.4` Endpoint quan trọng yêu cầu quyền quản lý:
  - Test runtime với token `staff` và `manager` trên endpoint quản trị.

### 3.4 Khả năng triển khai

- `3.4.1` Docker Compose chạy được:
  - Kiểm tra `docker compose ps --format json`.
- `3.4.2` Hướng dẫn triển khai đầy đủ:
  - Kiểm tra `ops/docs/deployment-guide.md` có phần Docker Compose + Kubernetes.
- `3.4.3` Không hardcode IP/mật khẩu:
  - Scan `docker-compose.yml` cho pattern secret hardcode.

### 3.5 UX

- `3.5.1` Responsive:
  - Scan token responsive (`sm:`, `md:`, `lg:`, `xl:`) trong các trang chính.
- `3.5.2` Luồng thao tác trực quan:
  - Dùng kết quả smoke flow MVP.
- `3.5.3` Thông báo lỗi rõ ràng:
  - Scan số lượng thông báo lỗi frontend/backend có ý nghĩa nghiệp vụ.

## 3) Lưu ý

- Script nghiệm thu sẽ trả exit code `1` nếu còn bất kỳ tiêu chí `FAIL`.
- Các tiêu chí chưa đạt sẽ được liệt kê rõ `code`, `chi tiết`, và `evidence` để xử lý tiếp.




