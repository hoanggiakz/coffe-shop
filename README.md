# Hệ Thống Quản Lý Quán Cà Phê Theo Kiến Trúc Microservices

Dự án xây dựng hệ thống quản lý quán cà phê theo mô hình microservices, phục vụ đồng thời 3 nhóm người dùng:

- Khách hàng: quét QR, xem menu, đặt món, theo dõi đơn, gọi phục vụ, chat hỗ trợ, thanh toán.
- Nhân viên: nhận đơn, xử lý bàn, vận hành KDS, chat với khách, thu ngân.
- Quản lý / quản trị: quản lý nhân sự, menu, kho, khuyến mãi, chi nhánh, báo cáo.

Tài liệu chạy BE/FE chi tiết: `HUONG_DAN_CHAY_BE_FE.md`

## 1. Kiến trúc hệ thống

### 1.1 Các service chính

| Service | Công nghệ | Vai trò |
|---|---|---|
| `frontend` | React + Vite + Nginx | Giao diện khách hàng và nhân viên |
| `api-gateway` | NestJS | Điểm vào duy nhất cho API |
| `user-service` | Spring Boot | Xác thực, JWT, khách hàng, nhân sự, chi nhánh |
| `table-service` | Spring Boot | Quản lý bàn, QR, gọi phục vụ |
| `order-service` | NestJS + Prisma | Menu, đơn hàng, KDS, khuyến mãi |
| `chat-service` | NestJS + Socket.IO + Prisma | Chat thời gian thực và thông báo realtime |
| `inventory-service` | NestJS + Prisma | Nguyên liệu, nhập xuất kho, cảnh báo tồn |
| `payment-service` | NestJS + Prisma | Thanh toán tiền mặt, VNPay, MoMo, VietQR |
| `report-service` | NestJS + Prisma | Báo cáo doanh thu, tồn kho, hiệu suất |
| `postgres` | PostgreSQL 15 | Cơ sở dữ liệu |
| `redis` | Redis 7 | Hỗ trợ realtime và cache |
| `db-backup` | PostgreSQL tools | Sao lưu PostgreSQL định kỳ |

### 1.2 Kết nối hiện tại

- `http://localhost:3000` tự động chuyển sang HTTPS.
- `https://localhost:3443` là cổng chính để truy cập hệ thống.
- API đi qua reverse proxy Nginx tại `/api`.
- WebSocket chat đi qua cùng domain frontend.
- Các service backend nội bộ không publish trực tiếp ra host trong cấu hình Docker hiện tại.

Lưu ý:

- Frontend đang dùng chứng chỉ tự ký (`self-signed certificate`), trình duyệt có thể cảnh báo ở lần truy cập đầu tiên.
- `order-service` và `payment-service` được chạy nhiều replica trong gói NFR phase 1.

## 2. Cấu trúc thư mục

```text
Microservices/
|- api-gateway/
|- user-service/
|- table-service/
|- order-service/
|- chat-service/
|- inventory-service/
|- payment-service/
|- report-service/
|- frontend/
|- docker-compose.yml
|- init-db.sh
|- backups/
|- scripts/
|  |- up-nfr.ps1
|  |- measure-nfr.ps1
```

## 3. Yêu cầu môi trường

- Docker Desktop
- Docker Compose plugin (`docker compose`)
- Nếu chạy local từng service:
  - Node.js 20+
  - Java 17
  - npm

## 4. Khởi chạy nhanh bằng Docker

### 4.1 Chạy toàn bộ hệ thống

```powershell
docker compose up -d --build
```

### 4.2 Kiểm tra container

```powershell
docker compose ps
```

Kỳ vọng tối thiểu các container sau ở trạng thái `Up`:

- `frontend`
- `api-gateway`
- `user-service`
- `table-service`
- `order-service`
- `chat-service`
- `inventory-service`
- `payment-service`
- `report-service`
- `postgres`
- `redis`
- `db-backup`

### 4.3 Truy cập hệ thống

- Frontend: `https://localhost:3443`
- HTTP redirect: `http://localhost:3000`

### 4.4 Tài khoản test mặc định

Các tài khoản dưới đây được seed tự động trong `user-service` để phục vụ test:

| Vai trò | Email | Mật khẩu |
|---|---|---|
| `ADMIN` | `admin.test@coffeeshop.local` | `Admin@123` |
| `MANAGER` | `manager.central@coffeeshop.local` | `Manager@123` |
| `MANAGER` | `manager.riverside@coffeeshop.local` | `Manager@123` |
| `WAITER` | `waiter.test@coffeeshop.local` | `Waiter@123` |
| `BARISTA` | `barista.test@coffeeshop.local` | `Barista@123` |
| `STAFF` | `staff.test@coffeeshop.local` | `Staff@123` |
| `CUSTOMER` | `customer.test@coffeeshop.local` | `Customer@123` |

Lưu ý:

- Nhân viên thường không được tự đăng ký tài khoản.
- Chỉ `ADMIN` hoặc `MANAGER` mới được cấp tài khoản nhân viên.
- `MANAGER` chỉ được tạo và quản lý tài khoản vận hành (`WAITER`, `BARISTA`, `STAFF`), không được tạo hoặc chỉnh sửa tài khoản `ADMIN`.

## 5. Các luồng chức năng đã tích hợp

### 5.1 Khách hàng

- Quét QR bàn và vào đúng menu theo `tableId`.
- Xem menu, tìm kiếm, lọc, tùy chọn món, giỏ hàng.
- Đặt món theo luồng trả sau hoặc trả trước.
- Theo dõi trạng thái đơn.
- Gọi phục vụ.
- Chat hỗ trợ thời gian thực.
- Đăng nhập khách hàng, xem lịch sử đơn, điểm thưởng, ưu đãi.

### 5.2 Nhân viên

- Đăng nhập và phân quyền theo role.
- Dashboard tổng quan và thông báo thời gian thực.
- Quản lý bàn, chuyển bàn, ghép bàn.
- Tạo đơn hộ khách.
- Quản lý đơn hàng, xác nhận đơn, thanh toán tiền mặt.
- KDS cho bếp.
- Chat với khách.

### 5.3 Quản lý / quản trị

- Quản lý nhân viên, phân ca, chấm công.
- Quản lý danh mục, món, tùy chọn, công thức.
- Quản lý kho, phiếu nhập, kiểm kê, lịch sử nhập xuất.
- Tự động trừ kho khi món hoàn thành.
- Quản lý bàn và QR.
- Quản lý khuyến mãi.
- Báo cáo doanh thu, tồn kho, top món, hiệu suất nhân viên.
- Quản lý chi nhánh.

## 6. Hướng dẫn test nhanh theo giao diện

### 6.1 Đăng nhập nhân viên

1. Mở `https://localhost:3443/login`
2. Đăng nhập bằng tài khoản nhân viên có sẵn trong dữ liệu seed hoặc tài khoản bạn đã tạo.
3. Sau khi vào hệ thống, kiểm tra:
   - `Tổng quan`
   - `Bàn`
   - `Đơn hàng / POS`
   - `Bếp`
   - `Trò chuyện`
   - `Kho`
   - `Khuyến mãi`
   - `Báo cáo`

### 6.2 Test luồng bàn và QR

1. Vào màn `Bàn`.
2. Tạo bàn mới với số bàn, khu vực, sức chứa.
3. Bấm `Xem / In QR` hoặc `Tải QR`.
4. Mở QR hoặc truy cập URL menu tương ứng.
5. Kiểm tra khách vào đúng bàn.

### 6.3 Test khách đặt món qua QR

1. Mở trang khách từ QR.
2. Chọn món, tùy chỉnh món, thêm vào giỏ.
3. Áp dụng mã khuyến mãi nếu có.
4. Chọn:
   - `Trả sau`
   - hoặc `Trả trước` với `VNPay`, `MoMo`, `VietQR`
5. Gửi đơn.
6. Kiểm tra trạng thái đơn ở trang khách và giao diện nhân viên.

### 6.4 Test KDS

1. Vào màn `Bếp`.
2. Xác nhận một đơn ở màn `Đơn hàng / POS`.
3. Kiểm tra đơn xuất hiện ở KDS.
4. Cập nhật món:
   - `Bắt đầu làm`
   - `Hoàn thành`
5. Kiểm tra đơn chuyển trạng thái đồng bộ ở các màn khác.

### 6.5 Test gọi phục vụ và chat

1. Từ giao diện khách, bấm `Gọi phục vụ`.
2. Kiểm tra nhân viên nhận thông báo realtime.
3. Mở chat khách hàng.
4. Gửi tin nhắn từ khách.
5. Trả lời từ màn `Trò chuyện` phía nhân viên.
6. Xác nhận hai phía đều nhận tin nhắn realtime.

### 6.6 Test kho

1. Vào màn `Kho`.
2. Tạo nguyên liệu.
3. Tạo phiếu nhập.
4. Điều chỉnh tồn kho.
5. Kiểm tra lịch sử nhập xuất.
6. Cho một món có công thức hoàn thành ở KDS và kiểm tra tồn kho bị trừ tự động.

### 6.7 Test khuyến mãi

1. Vào màn `Khuyến mãi`.
2. Tạo mã giảm giá.
3. Chọn phạm vi:
   - toàn đơn
   - món cụ thể
4. Quay lại trang khách để nhập mã và xác nhận tiền giảm.

### 6.8 Test báo cáo

1. Vào màn `Báo cáo`.
2. Chọn khoảng ngày và kiểu nhóm dữ liệu.
3. Kiểm tra:
   - doanh thu
   - top món
   - tồn kho
   - hiệu suất nhân viên
4. Thử xuất Excel hoặc PDF.

## 7. Test nhanh bằng API

Toàn bộ API đi qua:

```text
https://localhost:3443/api
```

Ví dụ:

- `POST /api/users/login`
- `GET /api/tables`
- `POST /api/orders`
- `PATCH /api/orders/:id/status`
- `GET /api/chats`
- `GET /api/v1/ingredients`
- `POST /api/v1/payments`
- `GET /api/reports/dashboard`

## 8. Gói NFR phase 1 đã triển khai

Các hạng mục đã được thêm vào:

- JWT guard thật cho các service nội bộ quan trọng.
- Đóng port backend nội bộ khỏi host.
- TLS reverse proxy bằng Nginx.
- Retry policy cho một số lời gọi liên service.
- Replica cho `order-service` và `payment-service`.
- Backup PostgreSQL định kỳ vào thư mục `backups/`.

## 9. Chạy bộ đo NFR

### 9.1 Khởi động stack NFR

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\up-nfr.ps1
```

### 9.2 Đo lại

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\measure-nfr.ps1
```

Kết quả đo sẽ dùng để kiểm tra nhanh:

- độ trễ health endpoint
- độ trễ menu/order
- độ trễ WebSocket cơ bản
- trạng thái redirect HTTP -> HTTPS
- backup file sinh ra trong `backups/`

## 10. Chạy local từng service

Nếu không dùng Docker toàn phần, có thể chạy riêng từng service. Ví dụ:

### `order-service`

```powershell
cd order-service
npm install
npx prisma db push
npx prisma db seed
npm run start:dev
```

### `chat-service`

```powershell
cd chat-service
npm install
npx prisma db push
npm run start:dev
```

### `user-service`

```powershell
cd user-service
./gradlew bootRun
```

### `table-service`

```powershell
cd table-service
./gradlew bootRun
```

### `frontend`

```powershell
cd frontend
npm install
npm run dev
```

## 11. Xử lý lỗi thường gặp

### Docker build lỗi ở `npm ci`

- Kiểm tra file `package-lock.json` có đồng bộ với `package.json` không.
- Nếu image Alpine gây lỗi Prisma/OpenSSL, dùng base image Debian hoặc cài đúng `openssl`.

### Frontend mở không lên do TLS

- Truy cập `https://localhost:3443`
- Chấp nhận cảnh báo chứng chỉ tự ký ở lần đầu.

### QR hoặc frontend báo sai upstream

- Kiểm tra `frontend/nginx.conf`
- Kiểm tra `docker compose ps`
- Kiểm tra container `api-gateway` và `chat-service` đã `Up`

### Không thấy dữ liệu

- Kiểm tra seed của `order-service`
- Kiểm tra database đã được tạo qua `init-db.sh`
- Kiểm tra log:

```powershell
docker compose logs -f order-service
docker compose logs -f user-service
docker compose logs -f table-service
docker compose logs -f frontend
```

## 12. Ghi chú hiện trạng

- UI đã được chuẩn hóa theo tiếng Việt cho shell và các màn nghiệp vụ chính.
- Hạ tầng đa ngôn ngữ vẫn được giữ lại để mở rộng sau.
- Một số báo cáo và dữ liệu demo vẫn dựa trên seed/mock khi chưa có dữ liệu thực tế đủ lớn.
