# Hướng dẫn triển khai demo trên VM Ubuntu (VPS giả lập)

Tài liệu này hướng dẫn chạy dự án `coffe-shop` theo luồng:

```text
Windows host
→ Ubuntu Server VM (VirtualBox)
→ Docker Compose
→ Cloudflare Quick Tunnel
→ QR để khách truy cập bằng 4G/5G
```

Phù hợp cho demo đồ án:

- Không cần thuê VPS
- Không cần domain/IP public
- Vẫn có link public để quét QR

> Lưu ý: `trycloudflare.com` là URL tạm thời. Mỗi lần tắt và chạy lại tunnel, URL có thể đổi.

---

## 1. Quick start (cho buổi demo)

Nếu VM đã setup sẵn từ trước, chỉ cần:

```bash
# 1) SSH vào VM
ssh gia@<VM_IP>

# 2) Chạy app
cd ~/coffe-shop
docker compose up -d
docker compose ps
curl -I http://localhost

# 3) Mở tunnel public (giữ terminal này luôn mở)
cloudflared tunnel --url http://localhost
```

Sau đó copy URL dạng:

```text
https://random-name.trycloudflare.com
```

Cập nhật `.env` theo URL mới rồi build lại:

```bash
cd ~/coffe-shop
nano .env
# sửa APP_BASE_URL, ALLOWED_ORIGINS, VITE_WS_URL

docker compose up -d --build
```

---

## 2. Chuẩn bị máy

### 2.1. Cấu hình đề xuất

- Host Windows 10/11: RAM 16GB+
- VM Ubuntu: 4 vCPU, RAM 6GB, Disk 50GB+
- Ubuntu Server: 22.04 LTS hoặc 24.04 LTS

### 2.2. Network mode

Ưu tiên `Bridged Adapter` để SSH từ Windows vào VM dễ hơn.

Nếu dùng `NAT`, cần cấu hình port forwarding cho SSH.

---

## 3. Tạo VM Ubuntu trên VirtualBox

### 3.1. Tạo VM

- Name: `coffee-shop-server`
- Type: `Linux`
- Version: `Ubuntu (64-bit)`
- RAM: `6144 MB`
- CPU: `4`
- Disk: `50GB`, `VDI`, `Dynamically allocated`
- ISO: `ubuntu-24.04.x-live-server-amd64.iso` (hoặc 22.04)

### 3.2. Cài Ubuntu Server

Khuyến nghị khi cài:

- Install OpenSSH server: bật (`[x]`)
- Storage: `Use entire disk`
- Không cần cài thêm snap package

Cài xong reboot, nếu được hỏi thì tháo ISO khỏi virtual drive.

---

## 4. Kiểm tra VM và SSH

Trong Ubuntu VM:

```bash
hostname -I
ping -c 4 google.com
df -h
free -h
```

Từ PowerShell Windows:

```powershell
ssh gia@<VM_IP>
```

Nếu lỗi `Connection refused`:

```bash
sudo apt update
sudo apt install openssh-server -y
sudo systemctl enable --now ssh
sudo ufw allow OpenSSH
```

---

## 5. Mở rộng dung lượng ổ (nếu `/` quá nhỏ)

Kiểm tra:

```bash
df -h
lsblk
```

Nếu phân vùng root còn khoảng 10-12GB:

1) Tắt VM, tăng size VDI trong VirtualBox (`50GB` hoặc `60GB`).
2) Bật VM, chạy:

```bash
sudo apt update
sudo apt install cloud-guest-utils -y
lsblk

# ví dụ root nằm trên /dev/sda3
sudo growpart /dev/sda 3
sudo pvresize /dev/sda3
sudo lvextend -r -l +100%FREE /dev/mapper/ubuntu--vg-ubuntu--lv

df -h
```

---

## 6. Tạo swap 4GB

```bash
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h
```

---

## 7. Cài Docker Engine + Docker Compose plugin

```bash
sudo apt update
sudo apt upgrade -y
sudo apt install ca-certificates curl -y

sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

sudo tee /etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF

sudo apt update
sudo apt install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin -y
sudo systemctl enable --now docker

sudo usermod -aG docker $USER
newgrp docker
```

Kiểm tra:

```bash
docker --version
docker compose version
docker run hello-world
```

---

## 8. Clone dự án

```bash
sudo apt update
sudo apt install git nano -y

cd ~
git clone https://github.com/hoanggiakz/coffe-shop.git
cd ~/coffe-shop
git status
git pull --ff-only origin develop
```

---

## 9. Tạo `.env`

```bash
cd ~/coffe-shop
cp .env.example .env
nano .env
```

Giá trị demo ban đầu:

```env
APP_BASE_URL=http://localhost
ALLOWED_ORIGINS=http://localhost
QR_BASE_URL=http://localhost/menu

VITE_API_URL=/api
VITE_WS_URL=http://localhost

POSTGRES_PASSWORD=demo_postgres_password_123456
JWT_SECRET=demo_jwt_secret_that_dai_123456789
INTERNAL_SERVICE_TOKEN=demo_internal_token_that_dai_123456789
```

> Không commit `.env`.

---

## 10. Encrypted `.env` Deploy (khuyến nghị khi push GitHub)

Quy trình chuẩn:

1. Local tạo key và mã hóa `.env` thành `.env.enc`.
2. Chỉ commit/push `.env.enc`, tuyệt đối không push `.env`.
3. Trên Ubuntu, lưu private key 1 lần.
4. Mỗi lần deploy trên Ubuntu chỉ chạy 1 lệnh script.

### 10.1. Local: tạo key + mã hóa `.env`

```bash
age-keygen -o age.key
```

Lấy public key từ file `age.key`, sau đó:

```bash
bash scripts/encrypt-env.sh "<public-key>"
```

Kết quả mong muốn: tạo ra file `.env.enc`.

### 10.2. Local: commit đúng file

- Được push: `.env.enc`
- Không được push: `.env`, `age.key`

### 10.3. Ubuntu (chỉ làm 1 lần): lưu private key

```bash
mkdir -p ~/.config/coffee-shop
nano ~/.config/coffee-shop/age.key
```

Dán private key vào file trên rồi lưu lại.

### 10.4. Ubuntu deploy từ `.env.enc`

```bash
cd ~/coffe-shop
bash scripts/deploy-from-encrypted-env.sh
```

### 10.5. Khi thay đổi biến môi trường

1. Cập nhật `.env` ở local.
2. Mã hóa lại để sinh `.env.enc`.
3. Commit/push code + `.env.enc`.
4. Trên Ubuntu chạy lại đúng 1 lệnh:

```bash
bash scripts/deploy-from-encrypted-env.sh
```

---

## 11. Build và chạy

```bash
cd ~/coffe-shop
docker compose config -q
docker compose up -d --build
docker compose ps
```

Test local trong VM:

```bash
curl -I http://localhost
```

Test từ Windows:

```text
http://<VM_IP>
```

---

## 12. Cloudflare Quick Tunnel

Cài `cloudflared`:

```bash
cd ~
curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared.deb
cloudflared --version
```

Chạy tunnel:

```bash
cloudflared tunnel --url http://localhost
```

Khi thấy URL `https://*.trycloudflare.com`, giữ nguyên terminal đó.

---

## 13. Cập nhật `.env` theo URL tunnel

Ví dụ URL:

```text
https://abc-demo.trycloudflare.com
```

Sửa `.env`:

```env
APP_BASE_URL=https://abc-demo.trycloudflare.com
ALLOWED_ORIGINS=https://abc-demo.trycloudflare.com
QR_BASE_URL=https://abc-demo.trycloudflare.com/menu

VITE_API_URL=/api
VITE_WS_URL=https://abc-demo.trycloudflare.com
```

Nếu có các biến tương tự (`NEXT_PUBLIC_*`) thì cập nhật cùng domain.

Apply:

```bash
cd ~/coffe-shop
docker compose up -d --build
docker compose ps
curl -I http://localhost
```

---

## 14. Tạo QR cho bàn

Ví dụ URL menu bàn 1:

```text
https://abc-demo.trycloudflare.com/menu?tableId=1
```

Tạo QR:

```bash
sudo apt install qrencode -y
qrencode -o table-1.png "https://abc-demo.trycloudflare.com/menu?tableId=1"
ls -lh table-1.png
```

Copy file về Windows:

```powershell
scp gia@<VM_IP>:/home/gia/table-1.png .
```

---

## 15. Lệnh vận hành nhanh

```bash
cd ~/coffe-shop

# trạng thái
docker compose ps

# log
docker compose logs -f --tail=100
docker compose logs -f --tail=100 frontend
docker compose logs -f --tail=100 api-gateway

# restart/stop/start
docker compose restart
docker compose down
docker compose up -d

# build lại
docker compose up -d --build

# pull code
git status
git pull --ff-only
git pull --ff-only origin develop
```

---

## 16. Backup database demo

```bash
cd ~/coffe-shop
docker compose exec -T postgres sh -lc 'PGPASSWORD="$POSTGRES_PASSWORD" pg_dumpall -U postgres' > backup-$(date +%Y%m%d-%H%M).sql
ls -lh backup-*.sql
```

Copy về Windows:

```powershell
scp gia@<VM_IP>:/home/gia/coffe-shop/backup-*.sql .
```

---

## 17. Troubleshooting nhanh

### 17.1. `fatal: not a git repository`

```bash
cd ~/coffe-shop
git status
```

### 17.2. `cp: cannot stat '.env.example'`

```bash
cd ~/coffe-shop
ls
```

Nếu chưa clone:

```bash
cd ~
git clone https://github.com/hoanggiakz/coffe-shop.git
cd ~/coffe-shop
```

### 17.3. SSH `Connection refused`

```bash
sudo apt update
sudo apt install openssh-server -y
sudo systemctl enable --now ssh
sudo ufw allow OpenSSH
```

### 17.4. Cloudflare báo `502 Bad Gateway`

```bash
curl -I http://localhost
docker compose ps
docker compose logs --tail=100 frontend
docker compose logs --tail=100 api-gateway
```

### 17.5. Web mở được nhưng login/order lỗi

Thường do `.env` đang trỏ URL cũ. Cập nhật domain tunnel mới và build lại:

```bash
cd ~/coffe-shop
docker compose up -d --build
```

### 17.6. Docker đầy ổ

```bash
df -h
docker system df
docker builder prune -f
docker system prune -f
```

### 17.7. Docker thiếu RAM

```bash
free -h
```

Tạo swap 4GB nếu chưa có (xem mục 6).

---

## 18. Checklist trước giờ demo

```bash
docker --version
docker compose version
cd ~/coffe-shop
docker compose ps
curl -I http://localhost
cloudflared tunnel --url http://localhost
```

Cần đạt:

- Docker/Compose chạy bình thường
- Container `Up` hoặc `healthy`
- `http://localhost` trả `200 OK`
- Có URL `trycloudflare.com`
- Điện thoại dùng 4G/5G mở được URL
- QR trỏ đúng URL tunnel hiện tại

---

## 19. Gợi ý trình bày khi báo cáo đồ án

```text
Người dùng quét QR
→ HTTPS public của Cloudflare Tunnel
→ Request về Ubuntu VM
→ Docker Compose (frontend + API gateway + microservices)
→ PostgreSQL/Redis xử lý dữ liệu
```

Ưu điểm:

- Không tốn chi phí hạ tầng ban đầu
- Dễ setup cho demo
- Kiến trúc gần môi trường production

Hạn chế:

- URL tunnel không cố định
- Máy cá nhân phải bật khi demo
- Không phù hợp production thật
