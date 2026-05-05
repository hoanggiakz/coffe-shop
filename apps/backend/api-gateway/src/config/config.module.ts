import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import * as Joi from 'joi';

@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
      validationSchema: Joi.object({
        PORT: Joi.number().default(8080),
        REDIS_URL: Joi.string().required(),
        JWT_SECRET: Joi.string().required(),
        USER_SERVICE_URL: Joi.string().uri().default('http://user-service:3000'),
        ORDER_SERVICE_URL: Joi.string().uri().default('http://order-service:3001'),
        TABLE_SERVICE_URL: Joi.string().uri().default('http://table-service:3003'),
        CHAT_SERVICE_URL: Joi.string().uri().default('http://chat-service:3007'),
        INVENTORY_SERVICE_URL: Joi.string().uri().default('http://inventory-service:3005'),
        PAYMENT_SERVICE_URL: Joi.string().uri().default('http://payment-service:3004'),
        REPORT_SERVICE_URL: Joi.string().uri().default('http://report-service:3006'),
        MENU_QR_ALLOW_BRANCH_ONLY_TEST: Joi.boolean().truthy('true').falsy('false').default(false),
        ALLOWED_ORIGINS: Joi.string(),
      }),
      validationOptions: {
        abortEarly: true,
      },
    }),
  ],
})
export class ConfigModule {}

