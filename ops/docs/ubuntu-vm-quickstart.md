# Ubuntu VM Quickstart

## 1) Clone code

```bash
git clone -b develop git@github.com:hoanggiakz/coffe-shop.git
cd coffe-shop/Microservices
```

## 2) Install Docker and initialize env

```bash
chmod +x ops/scripts/setup-ubuntu-vm.sh
./ops/scripts/setup-ubuntu-vm.sh
newgrp docker
```

## 3) Minimum `.env` edits

Open `.env` (copied from `ops/docs/env.vm.example`) and update these required values:

- `POSTGRES_PASSWORD`
- `JWT_SECRET`
- `INTERNAL_SERVICE_TOKEN`
- `APP_BASE_URL` (set to `http://<VM_PUBLIC_IP>`)
- `ALLOWED_ORIGINS` (set to `http://<VM_PUBLIC_IP>:8088`)

## 4) Build and run

```bash
docker compose build --no-cache
docker compose up -d
docker compose ps
```

## 5) Validate health

```bash
curl -f http://127.0.0.1:18080/
curl -f http://127.0.0.1:8088/
```

## 6) If build fails at user-service

The compile error you posted usually means VM is on old source. Verify exact commit and file:

```bash
git rev-parse --short HEAD
git branch --show-current
sed -n '135,170p' apps/backend/user-service/src/main/java/com/coffeeshop/userservice/config/TestAccountSeeder.java
```

Expected: there must be a line similar to:

```java
User user = userRepository.findByEmployeeCode(employeeCode)
```

If missing, sync branch:

```bash
git fetch origin
git checkout develop
git pull --ff-only origin develop
```
