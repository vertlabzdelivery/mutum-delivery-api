import { Injectable } from '@nestjs/common';
import { RedisCacheService } from '../cache/cache.service';

type MemoryEntry = {
  value: unknown;
  expiresAt: number | null;
};

@Injectable()
export class EphemeralStoreService {
  private readonly memory = new Map<string, MemoryEntry>();

  constructor(private readonly cache: RedisCacheService) {}

  async get<T>(key: string): Promise<T | null> {
    const cached = await this.cache.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    this.gc();
    const entry = this.memory.get(key);
    if (!entry) return null;
    if (entry.expiresAt && entry.expiresAt <= Date.now()) {
      this.memory.delete(key);
      return null;
    }

    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlSeconds?: number) {
    await this.cache.set(key, value, ttlSeconds);
    this.memory.set(key, {
      value,
      expiresAt: ttlSeconds && ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : null,
    });
  }

  async delete(key: string) {
    await this.cache.del(key);
    this.memory.delete(key);
  }

  async increment(key: string, ttlSeconds: number) {
    const current = (await this.get<number>(key)) ?? 0;
    const next = current + 1;
    await this.set(key, next, ttlSeconds);
    return next;
  }

  private gc() {
    const now = Date.now();
    for (const [key, value] of this.memory.entries()) {
      if (value.expiresAt && value.expiresAt <= now) {
        this.memory.delete(key);
      }
    }
  }
}
