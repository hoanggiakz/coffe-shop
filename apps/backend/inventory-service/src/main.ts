import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import compression from 'compression';
import { HttpExceptionFilter } from './common/exceptions/http-exception.filter';
import { CustomLogger } from './common/logger.service';
import { setupSwagger } from './common/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const configService = app.get(ConfigService);
  app.set('trust proxy', 1);
  app.enableShutdownHooks();

  // Global prefix and versioning
  app.setGlobalPrefix('api', { exclude: ['/api-docs'] });
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  // Security
  app.use(helmet());
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 1000,
    }),
  );
  app.use(compression());

  // Global pipes
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Global exception filter
  app.useGlobalFilters(new HttpExceptionFilter(app.get(CustomLogger)));

  // Swagger
  setupSwagger(app, configService);

  const port = configService.get('PORT') || 3005;
  await app.listen(port);
  console.log(`Inventory Service is running on port ${port}`);
}
bootstrap();

