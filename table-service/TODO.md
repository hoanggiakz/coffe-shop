# Table Service Implementation TODO

## Plan Breakdown Steps:
- [x] Step 1: Create root files (package.json, prisma/schema.prisma, .env.example, tsconfig.json, nest-cli.json)

- [x] Step 2: Create Dockerfile, docker-compose.yml  


- [ ] Step 3: Create src/main.ts, src/config/config.module.ts
- [ ] Step 4: Copy/create src/common/ from user-service
- [ ] Step 5: Create src/prisma/prisma.module.ts & service
- [ ] Step 6: Create src/kafka/kafka.module.ts & service
- [ ] Step 7: Create modules/table/ (controller, service, module, dtos)
- [ ] Step 8: Update app.module.ts
- [ ] Step 9: Add QR code generation (qrcode lib)
- [ ] Step 10: Test setup

## Features:
- CRUD tables with QR code (base64)
- Status: AVAILABLE/OCCUPIED
- Kafka: StaffCalled event
- APIs: POST /tables, GET /tables, PATCH /tables/:id/status, POST /tables/:id/call-staff


