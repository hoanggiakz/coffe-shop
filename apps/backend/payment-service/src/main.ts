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
  const logger = app.get(CustomLogger);

  // Global prefix and versioning
  app.setGlobalPrefix('api', { exclude: ['/api-docs'] });
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });
  app.set('trust proxy', 1);

  // Security
  app.use(helmet());
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 1000, // relaxed for local SPA polling behind reverse proxy
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
  app.useGlobalFilters(new HttpExceptionFilter(logger));

  // Swagger
  setupSwagger(app, configService);

  const port = configService.get('PORT') || 3004;
  await app.listen(port);
  logger.log(`Payment Service is running on port ${port}`);
}
bootstrap();
