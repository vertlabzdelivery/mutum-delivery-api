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
  private static disabledUntil = 0;

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

  async get<T>(key: string): Promise<T | null> {
    const cached = await this.getParsed<T>(key);
    if (!cached.hit) {
      return null;
    }

    return cached.value;
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

    try {
      await this.withOperationTimeout(
        ttlSeconds && ttlSeconds > 0
          ? client.set(key, payload, { EX: ttlSeconds })
          : client.set(key, payload),
        `set:${key}`,
      );
    } catch (error) {
      this.handleRedisFailure(error, `set:${key}`);
    }
  }

  async del(key: string) {
    const client = await this.getClient();

    if (!client) {
      return;
    }

    try {
      await this.withOperationTimeout(client.del(key), `del:${key}`);
    } catch (error) {
      this.handleRedisFailure(error, `del:${key}`);
    }
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

    try {
      await this.withOperationTimeout(
        client.del(normalizedKeys),
        `delMany:${normalizedKeys.length}`,
      );
    } catch (error) {
      this.handleRedisFailure(error, `delMany:${normalizedKeys.length}`);
    }
  }

  async delByPrefix(prefix: string) {
    const client = await this.getClient();

    if (!client) {
      return;
    }

    let cursor = '0';

    try {
      do {
        const result = await this.withOperationTimeout(
          client.scan(cursor, {
            MATCH: `${prefix}*`,
            COUNT: 100,
          }),
          `scan:${prefix}`,
          this.getOperationTimeoutMs() * 2,
        );

        cursor = result.cursor;

        if (result.keys.length) {
          await this.withOperationTimeout(client.del(result.keys), `del:${prefix}`);
        }
      } while (cursor !== '0');
    } catch (error) {
      this.handleRedisFailure(error, `delByPrefix:${prefix}`);
    }
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

    try {
      const raw = await this.withOperationTimeout(client.get(key), `get:${key}`);

      if (raw === null) {
        return { hit: false };
      }

      return {
        hit: true,
        value: JSON.parse(raw) as T,
      };
    } catch (error) {
      this.handleRedisFailure(error, `get:${key}`);
      return { hit: false };
    }
  }

  private async getClient(): Promise<RedisLikeClient | null> {
    if (!this.isEnabled()) {
      return null;
    }

    if (Date.now() < RedisCacheService.disabledUntil) {
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

    const forceTls = process.env.REDIS_TLS === 'true';
    const useTls = forceTls || redisUrl.startsWith('rediss://');
    const socket = useTls
      ? {
          connectTimeout: this.getConnectTimeoutMs(),
          reconnectStrategy: false as const,
          tls: true as const,
        }
      : {
          connectTimeout: this.getConnectTimeoutMs(),
          reconnectStrategy: false as const,
        };

    const client = createClient({
      url: redisUrl,
      socket,
      disableOfflineQueue: true,
    }) as unknown as RedisLikeClient;

    client.on('error', (error) => {
      this.logger.error(`Redis error: ${error.message}`);
    });

    try {
      await this.withTimeout(client.connect(), this.getConnectTimeoutMs(), 'connect');
      RedisCacheService.client = client;
      this.logger.log('Redis cache conectado');
      return client;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'erro desconhecido';
      this.logger.warn(`Redis indisponível. A API seguirá sem cache. Motivo: ${message}`);
      RedisCacheService.client = null;
      RedisCacheService.disabledUntil = Date.now() + this.getBackoffMs();
      return null;
    }
  }

  private getConnectTimeoutMs() {
    const parsed = Number(process.env.REDIS_CONNECT_TIMEOUT_MS);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1500;
  }

  private getOperationTimeoutMs() {
    const parsed = Number(process.env.REDIS_OPERATION_TIMEOUT_MS);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 500;
  }

  private getBackoffMs() {
    const parsed = Number(process.env.REDIS_BACKOFF_MS);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 15000;
  }

  private async withOperationTimeout<T>(promise: Promise<T>, label: string, ms?: number) {
    return this.withTimeout(promise, ms ?? this.getOperationTimeoutMs(), label);
  }

  private async withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    let timer: NodeJS.Timeout | undefined;

    try {
      return await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          timer = setTimeout(() => {
            reject(new Error(`Redis timeout em ${label} (${ms}ms)`));
          }, ms);
        }),
      ]);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  private handleRedisFailure(error: unknown, context: string) {
    const message = error instanceof Error ? error.message : 'erro desconhecido';
    this.logger.warn(`Cache ignorado em ${context}: ${message}`);
    RedisCacheService.client = null;
    RedisCacheService.disabledUntil = Date.now() + this.getBackoffMs();
  }
}
