import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { CustomLogger } from './common/logger.service';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import compression from 'compression';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['error', 'warn'],
  });
  const configService = app.get(ConfigService);
  const customLogger = app.get(CustomLogger);

  app.useLogger(customLogger);
  app.enableCors({
    origin: '*', // Adjust for production
    credentials: true,
  });
  app.use(helmet());
  app.use(compression());
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 100,
    }),
  );

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
  }));

  // No Swagger for WS-only service

  const port = configService.get('PORT', 3006);
  await app.listen(port);
  customLogger.log(`KDS Service running on port ${port}`);
  customLogger.log('WebSocket endpoint: ws://localhost:' + port);
}
bootstrap();

