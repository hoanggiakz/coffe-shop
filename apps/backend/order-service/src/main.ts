import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
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
  app.set('trust proxy', 1);
  app.enableCors();
  app.enableShutdownHooks();
  app.use(helmet());
  app.use(compression());
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 1000, // relaxed limit to avoid hitting during local SPA bursts
    }),
  );

  // Global validation pipe
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
  }));

  // Swagger
  const config = new DocumentBuilder()
    .setTitle('Order Service API')
    .setDescription('Coffee shop order microservice API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  const port = configService.get('PORT', 3002);
  await app.listen(port);
  customLogger.log(`Order Service running on port ${port}`);
}
bootstrap();

