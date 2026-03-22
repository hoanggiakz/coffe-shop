# KDS Service

Kitchen Display System microservice for real-time order display via WebSocket.

## Features
- Consume OrderCreated from Kafka
- Real-time push to clients via Socket.io ('order:new', 'order:update')
- Update item status via WS
- Redis-backed state for scalability

## Run
```bash
npm run start:dev
```

Port: 3006
WS: ws://localhost:3006
