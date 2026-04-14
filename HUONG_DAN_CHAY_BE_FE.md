# Hướng Dẫn Chạy BE/FE (Bản Rút Gọn)

Nội dung chi tiết đã được gộp vào:

- `README.md`:
  - Mục `3. Chạy hệ thống`
  - Mục `4. Routing API qua gateway`
  - Mục `5. API luồng chính`
- `README_DEPLOY.md` cho production.

## Lệnh nhanh

### Chạy mặc định

```bash
docker compose up -d --build
docker compose ps
```

### Chạy dev

```bash
./deploy.sh dev
./seed-database.sh
```

### Truy cập

- Mặc định: `https://localhost`
- Dev: `http://localhost:3000`
