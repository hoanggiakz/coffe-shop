import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { RedisService } from './redis/redis.service';
import { RedisIoAdapter } from './redis/redis-io.adapter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const logger = new Logger('ChatService');

  app.enableCors({ origin: '*', credentials: true });
  app.enableShutdownHooks();
  const enableRedisAdapter = String(configService.get('SOCKET_IO_REDIS_ADAPTER') || 'false').toLowerCase() === 'true';
  if (enableRedisAdapter) {
    try {
      const redisService = app.get(RedisService);
      const redisAdapter = new RedisIoAdapter(app, redisService);
      await redisAdapter.connectToRedis();
      app.useWebSocketAdapter(redisAdapter);
      logger.log('Socket.IO Redis adapter enabled');
    } catch (error: any) {
      logger.warn(`Cannot enable Socket.IO Redis adapter: ${error?.message || error}`);
    }
  }

  const port = configService.get('PORT', 3007);
  await app.listen(port);
  logger.log(`Chat Service running on port ${port}`);
  logger.log(`WebSocket endpoint: ws://localhost:${port}/chat`);
}
bootstrap();
