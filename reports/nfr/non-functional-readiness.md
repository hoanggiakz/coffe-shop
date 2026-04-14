# Non-Functional Readiness (NFR 4.1 - 4.6)

- Updated: `2026-04-14`
- Scope: đối chiếu code/config hiện tại trong repo với NFR yêu cầu.
- Legend:
  - `DAT`: đã có trong code/config, có bằng chứng rõ.
  - `MOT_PHAN`: đã có một phần, cần hardening/đo kiểm thêm.
  - `CHUA_DAT`: chưa thấy triển khai tương ứng.

## 1) Kết quả tổng hợp

| ID | Status | Ghi chú ngắn |
|---|---|---|
| NFR-01 | MOT_PHAN | Có script đo p95 API, chưa có snapshot pass ngưỡng `<=200ms` gần nhất. |
| NFR-02 | MOT_PHAN | Frontend Vite + Nginx cache static, chưa có đo kiểm chính thức `<=1.5s`. |
| NFR-03 | MOT_PHAN | Có script đo chat latency, chưa có snapshot run mới cho ngưỡng p95 `<=100ms`. |
| NFR-04 | MOT_PHAN | Có script load và order-latency, chưa có benchmark chính thức `>=500 đơn/giờ/chi nhánh`. |
| NFR-05 | MOT_PHAN | Script WebSocket hỗ trợ `WS_SESSIONS`, chưa có artifact run 200 kết nối pass. |
| NFR-06 | DAT | JWT 24h và bcrypt đã có. |
| NFR-07 | DAT | RBAC có ở API Gateway + service-side checks. |
| NFR-08 | DAT | Nginx HTTPS cấu hình TLS 1.2/1.3. |
| NFR-09 | MOT_PHAN | ORM + validate có; CSRF token chưa có cơ chế đầy đủ. |
| NFR-10 | MOT_PHAN | Có logging ở các service chính; cần chuẩn hóa audit log tập trung theo sự kiện nghiệp vụ. |
| NFR-11 | MOT_PHAN | Có healthcheck + restart policy, chưa có SLO/monitoring uptime 99.5% được đo tự động. |
| NFR-12 | DAT | Backup chu kỳ ngày + retention 30 ngày đã cấu hình. |
| NFR-13 | DAT | Gọi liên service có retry mặc định tối thiểu 3 lần. |
| NFR-14 | DAT | Đã bật graceful shutdown cho Nest + Spring Boot. |
| NFR-15 | MOT_PHAN | Có thể scale ngang bằng Compose/K8s, cần hoàn thiện LB/session strategy cho chat realtime. |
| NFR-16 | CHUA_DAT | Chưa có thiết kế sharding theo chi nhánh. |
| NFR-17 | MOT_PHAN | Có Kafka integration trong code, nhưng mặc định có thể chạy không Kafka. |
| NFR-18 | DAT | Có ESLint + Checkstyle trong repo và CI. |
| NFR-19 | MOT_PHAN | Có test/coverage tooling, chưa chứng minh đồng loạt `>=70%` cho service quan trọng. |
| NFR-20 | DAT | Swagger/OpenAPI hiện diện ở các service chính. |
| NFR-21 | MOT_PHAN | Đã có GitHub Actions CI build/test + deploy job có điều kiện secret. |
| NFR-22 | DAT | UI đã có responsive cho mobile khách và desktop staff. |
| NFR-23 | MOT_PHAN | Luồng đặt món nhanh đã tối ưu, chưa có KPI click-count đo tự động. |
| NFR-24 | CHUA_DAT | Chưa có i18n VI/EN thực sự trong frontend. |

## 2) Bằng chứng chính theo nhóm

### 2.1 Performance

- API benchmark script: `ops/scripts/perf-100-users.mjs`
- Order latency script: `ops/scripts/order-create-latency.mjs`
- WebSocket latency script: `apps/frontend/scripts/ws-latency-50.mjs`
- Tài liệu snapshot: `reports/tests/performance-test-report.md`

### 2.2 Security

- JWT 24h:
  - `apps/backend/user-service/src/main/resources/application.properties`
  - `.env.example`
- bcrypt:
  - `apps/backend/user-service/src/modules/auth/auth.service.ts`
  - `apps/backend/user-service/src/main/java/com/coffeeshop/userservice/config/SecurityConfig.java`
- RBAC:
  - `apps/backend/api-gateway/src/proxy/proxy.controller.ts`
  - `apps/backend/api-gateway/src/proxy/proxy.guard.ts`
- HTTPS TLS 1.2+:
  - `apps/frontend/nginx.conf`

### 2.3 Reliability / Availability

- Healthcheck + restart:
  - `docker-compose.yml`
- Graceful shutdown (đã bổ sung):
  - `apps/backend/order-service/src/main.ts`
  - `apps/backend/inventory-service/src/main.ts`
  - `apps/backend/payment-service/src/main.ts`
  - `apps/backend/report-service/src/main.ts`
  - `apps/backend/user-service/src/main/resources/application.properties`
  - `apps/backend/table-service/src/main/resources/application.properties`
- Backup 30 ngày (đã bổ sung):
  - `docker-compose.yml`
  - `.env.example`

### 2.4 Scalability

- Horizontal scale (mức hạ tầng):
  - `docker-compose.yml` (có thể `docker compose up -d --scale order-service=2 --scale chat-service=2`)
  - `ops/k8s/*.yaml`
- Kafka integration:
  - `apps/backend/chat-service/src/kafka/kafka.service.ts`
  - `apps/backend/payment-service/src/modules/payment/payment.service.ts`
  - `apps/backend/table-service/src/modules/table/table.service.ts`

### 2.5 Maintainability

- Coding convention:
  - ESLint config ở các service Node (`.eslintrc.cjs`)
  - Checkstyle ở service Java:
    - `apps/backend/user-service/config/checkstyle/checkstyle.xml`
    - `apps/backend/table-service/config/checkstyle/checkstyle.xml`
- Swagger/OpenAPI:
  - `apps/backend/*/src/main.ts` và `apps/backend/*/src/common/swagger.ts`
- CI/CD (đã bổ sung):
  - `.github/workflows/deno.yml` (đã chuyển thành pipeline CI cho stack hiện tại)

### 2.6 UX

- Responsive:
  - `apps/frontend/src/pages/CustomerMenu.tsx`
  - `apps/frontend/src/pages/Orders.tsx`
  - `apps/frontend/src/pages/Tables.tsx`
- Luồng thao tác:
  - `apps/frontend/src/pages/CustomerMenu.tsx`
  - `apps/frontend/src/pages/Orders.tsx`
- i18n:
  - Chưa có framework i18n và resource file VI/EN.

## 3) Các bổ sung đã làm trong vòng rà soát này

1. Bật graceful shutdown cho toàn bộ service Nest còn thiếu.
2. Bật graceful shutdown cho 2 service Spring Boot (`user-service`, `table-service`).
3. Nâng backup retention mặc định từ 7 lên 30 ngày.
4. Chuẩn hóa GitHub Actions sang CI cho stack hiện tại (Node + Java + compose validation + deploy job có điều kiện).

## 4) Gap còn lại cần làm tiếp (ưu tiên)

1. Thêm báo cáo benchmark thực tế cho NFR-01/03/04/05 theo ngưỡng yêu cầu và commit artifact.
2. Bổ sung cơ chế CSRF token (hoặc quyết định kiến trúc stateless + threat model rõ ràng nếu không dùng cookie session).
3. Thiết kế chiến lược scale chat đa instance (sticky session / redis adapter vận hành chuẩn) và test tải.
4. Bổ sung i18n VI/EN cho frontend.
5. Đưa ngưỡng coverage `>=70%` thành gate bắt buộc trong CI.
