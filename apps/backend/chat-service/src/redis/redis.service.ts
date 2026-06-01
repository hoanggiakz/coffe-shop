import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis, { type Redis as RedisClient } from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private clients: Map<string, RedisClient> = new Map();

  constructor(private configService: ConfigService) {}

  getClient(name: string = 'default'): RedisClient {
    if (this.clients.has(name)) {
      return this.clients.get(name)!;
    }

    const url = this.configService.get('REDIS_URL');
    const client = new Redis(url, {
      name,
      lazyConnect: true,
    });

    this.clients.set(name, client);
    return client;
  }

  async onModuleDestroy() {
    await Promise.all(
      Array.from(this.clients.values()).map(client => client.quit()),
    );
  }

  async readiness() {
    try {
      const client = this.getClient('health-check');
      await client.connect();
      const pong = await client.ping();
      return {
        connected: String(pong || '').toUpperCase() === 'PONG',
        error: null as string | null,
      };
    } catch (error) {
      return {
        connected: false,
        error: (error as Error).message,
      };
    }
  }
}
