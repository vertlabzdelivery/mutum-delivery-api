import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createClient } from 'redis';

type RedisLikeClient = {
  isOpen: boolean;
  connect(): Promise<void>;
  on(event: 'error', listener: (error: Error) => void): unknown;
  set(key: string, value: string, options?: { EX: number }): Promise<unknown>;
  get(key: string): Promise<string | null>;
  del(keys: string | string[]): Promise<unknown>;
  scan(
    cursor: string,
    options: { MATCH: string; COUNT: number },
  ): Promise<{ cursor: string; keys: string[] }>;
};

@Injectable()
export class RedisCacheService implements OnModuleInit {
  private readonly logger = new Logger(RedisCacheService.name);
  private static client: RedisLikeClient | null = null;
  private static connectPromise: Promise<RedisLikeClient | null> | null = null;

  async onModuleInit() {
    await this.getClient();
  }

  isEnabled() {
    return Boolean(process.env.REDIS_URL) && process.env.CACHE_ENABLED !== 'false';
  }

  getTtlSeconds(envName: string, fallbackSeconds: number) {
    const parsed = Number(process.env[envName]);

    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.floor(parsed);
    }

    return fallbackSeconds;
  }

  async getOrSet<T>(
    key: string,
    ttlSeconds: number,
    factory: () => Promise<T>,
  ): Promise<T> {
    const cached = await this.getParsed<T>(key);

    if (cached.hit) {
      return cached.value;
    }

    const value = await factory();
    await this.set(key, value, ttlSeconds);
    return value;
  }

  async set(key: string, value: unknown, ttlSeconds?: number) {
    const client = await this.getClient();

    if (!client) {
      return;
    }

    const payload = JSON.stringify(value);

    if (ttlSeconds && ttlSeconds > 0) {
      await client.set(key, payload, { EX: ttlSeconds });
      return;
    }

    await client.set(key, payload);
  }

  async del(key: string) {
    const client = await this.getClient();

    if (!client) {
      return;
    }

    await client.del(key);
  }

  async delMany(keys: string[]) {
    const normalizedKeys = [...new Set(keys.filter(Boolean))];

    if (!normalizedKeys.length) {
      return;
    }

    const client = await this.getClient();

    if (!client) {
      return;
    }

    await client.del(normalizedKeys);
  }

  async delByPrefix(prefix: string) {
    const client = await this.getClient();

    if (!client) {
      return;
    }

    let cursor = '0';

    do {
      const result = await client.scan(cursor, {
        MATCH: `${prefix}*`,
        COUNT: 100,
      });

      cursor = result.cursor;

      if (result.keys.length) {
        await client.del(result.keys);
      }
    } while (cursor !== '0');
  }

  async getStatus() {
    const client = await this.getClient();

    return {
      enabled: this.isEnabled(),
      connected: Boolean(client?.isOpen),
      store: client ? 'redis' : 'memoryless',
    };
  }

  private async getParsed<T>(
    key: string,
  ): Promise<{ hit: false } | { hit: true; value: T }> {
    const client = await this.getClient();

    if (!client) {
      return { hit: false };
    }

    const raw = await client.get(key);

    if (raw === null) {
      return { hit: false };
    }

    return {
      hit: true,
      value: JSON.parse(raw) as T,
    };
  }

  private async getClient(): Promise<RedisLikeClient | null> {
    if (!this.isEnabled()) {
      return null;
    }

    if (RedisCacheService.client?.isOpen) {
      return RedisCacheService.client;
    }

    if (RedisCacheService.connectPromise) {
      return RedisCacheService.connectPromise;
    }

    RedisCacheService.connectPromise = this.connect();

    try {
      return await RedisCacheService.connectPromise;
    } finally {
      RedisCacheService.connectPromise = null;
    }
  }

  private async connect(): Promise<RedisLikeClient | null> {
    const redisUrl = process.env.REDIS_URL;

    if (!redisUrl) {
      return null;
    }

    const client = createClient({
      url: redisUrl,
    }) as unknown as RedisLikeClient;

    client.on('error', (error) => {
      this.logger.error(`Redis error: ${error.message}`);
    });

    try {
      await client.connect();
      RedisCacheService.client = client;
      this.logger.log('Redis cache conectado');
      return client;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'erro desconhecido';
      this.logger.warn(`Redis indisponível. A API seguirá sem cache. Motivo: ${message}`);
      RedisCacheService.client = null;
      return null;
    }
  }
}
