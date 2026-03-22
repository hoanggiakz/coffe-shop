# Notification Service TODO

## Setup
- [ ] `cd notification-service &amp;&amp; npm install`
- [ ] `npm run prisma:generate` (if Prisma needed)
- [ ] `npm run start:dev`
- [ ] Test Kafka: Publish PaymentCompleted/LowStock
- [ ] Configure .env: SMTP_HOST, WS_URL, FCM_KEY

## Channels
- [ ] Email: nodemailer Gmail/SendGrid
- [ ] WebSocket push to chat-service or clients
- [ ] Extensible: Provider interface (SMS via Twilio later)

## Future
- [ ] Prisma for notification log
- [ ] Retry queue (BullMQ)
- [ ] Templates (Handlebars)
- [ ] FCM push
- [ ] Rate limiting

