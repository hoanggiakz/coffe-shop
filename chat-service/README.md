# Chat Service

Production-ready real-time chat service for coffee shop tables using Socket.io + Redis for scalability.

## Quick Start

```bash
cd chat-service
npm install
npx prisma generate
npx prisma db push
npm run start:dev
```

## WebSocket Endpoint
- Connect: `ws://localhost:3007/chat?tableId=table123`
- Events: `join-room`, `send-message`

## Docker
```bash
docker-compose up -d
```

## Architecture
- Rooms: `chat:${tableId}`
- DB: Prisma PostgreSQL (Chat, Message)
- Scaling: Redis Socket.io adapter
- Consistent with other microservices
