import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const logger = new Logger('ChatService');

  app.enableCors({ origin: '*', credentials: true });
  app.enableShutdownHooks();

  const port = configService.get('PORT', 3007);
  await app.listen(port);
  logger.log(`Chat Service running on port ${port}`);
  logger.log(`WebSocket endpoint: ws://localhost:${port}/chat`);
}
bootstrap();
