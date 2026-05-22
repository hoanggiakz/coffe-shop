# Chat Service

NestJS service cho chat realtime giữa khách theo bàn và nhân viên.

## Runtime

- Port container: `3007`
- REST base path: `/api/chats`
- WebSocket namespace: `/chat`

## REST API chính

- `GET /api/chats/health`
- `GET /api/chats`
- `POST /api/chats`
- `POST /api/chats/staff-notifications`
- `POST /api/chats/:id/messages`
- `PATCH /api/chats/:id/close`
- `GET /api/chats/:id/messages`

## WebSocket events

- Client -> server: `join`, `join-staff`, `send-message`
- Server -> client: `joined`, `joined-staff`, `new-message`, `staff-notification`, `error`
- Phòng chat theo bàn: `{tableId}` (service vẫn join thêm `table:{tableId}` để tương thích ngược).

Frontend hiện tại kết nối bằng:

- Dev: `ws://localhost:3007/chat`
- Qua Nginx: `wss://<host>/chat`

## Chạy trong hệ thống

Từ thư mục `Microservices/`:

```bash
docker compose up -d --build chat-service
```

Hoặc chạy toàn hệ thống theo `README.md`.
