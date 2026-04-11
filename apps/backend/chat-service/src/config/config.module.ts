import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import * as Joi from 'joi';

@Module({
  imports: [
    NestConfigModule,
  ],
  exports: [NestConfigModule],
  providers: [
    {
      provide: 'CONFIG_OPTIONS',
      useFactory: () => ({
        validationSchema: Joi.object({
          PORT: Joi.number().default(3007),
          DATABASE_URL: Joi.string().required(),
          REDIS_URL: Joi.string().default('redis://localhost:6379'),
          KAFKA_BROKERS: Joi.string().default('localhost:9092'),
          NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
        }),
        validationOptions: {
          abortEarly: false,
        },
        isGlobal: true,
      }),
    },
  ],
})
export class ConfigModule {}
