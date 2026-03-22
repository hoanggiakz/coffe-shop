import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const configService = app.get(ConfigService);
  const logger = new Logger('ApiGateway');

  app.enableCors({ origin: '*', credentials: true });
  app.enableShutdownHooks();

  const port = configService.get('PORT', 8080);
  await app.listen(port);
  logger.log(`API Gateway running on port ${port}`);
}
bootstrap();

