# Encrypted .env Deploy
1) Local: `age-keygen -o age.key` rồi lấy public key và chạy `bash scripts/encrypt-env.sh "<public-key>"` để tạo `.env.enc`.
2) Chỉ commit/push `.env.enc`, tuyệt đối không push `.env`.
3) Ubuntu (1 lần): `mkdir -p ~/.config/coffee-shop && nano ~/.config/coffee-shop/age.key` rồi dán private key.
4) Ubuntu deploy: `bash scripts/deploy-from-encrypted-env.sh`.
5) Mỗi lần đổi env: mã hóa lại `.env.enc`, push code, rồi chạy lại đúng 1 lệnh ở bước 4.
