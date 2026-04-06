import { Injectable } from '@nestjs/common';
import { RedisCacheService } from '../cache/cache.service';

type MemoryEntry = {
  value: unknown;
  expiresAt: number | null;
};

@Injectable()
export class EphemeralStoreService {
  /**
   * Fallback em memória usado apenas quando o Redis está indisponível.
   * ATENÇÃO: Em ambientes multi-instância (ex: Vercel Serverless) este
   * store não é compartilhado entre instâncias — configure Redis para
   * garantir rate-limiting consistente em produção.
   */
  private readonly memory = new Map<string, MemoryEntry>();

  constructor(private readonly cache: RedisCacheService) {}

  async get<T>(key: string): Promise<T | null> {
    const cached = await this.cache.get<T>(key);
    if (cached !== null) return cached;

    // Fallback local
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

  /**
   * Incremento atômico.
   * Usa INCR nativo do Redis quando disponível (sem race condition).
   * Cai para o fallback em memória apenas se o Redis estiver indisponível.
   *
   * BUG CORRIGIDO: a implementação anterior fazia get→set em dois passos,
   * criando uma race condition onde requisições simultâneas podiam ler o
   * mesmo valor e ambas gravar "1", burlando o rate-limit.
   */
  async increment(key: string, ttlSeconds: number): Promise<number> {
    // Tenta incremento atômico via Redis INCR
    const atomicResult = await this.cache.atomicIncr(key, ttlSeconds);
    if (atomicResult !== null) {
      // Mantém o fallback local sincronizado para leituras offline
      this.memory.set(key, {
        value: atomicResult,
        expiresAt: Date.now() + ttlSeconds * 1000,
      });
      return atomicResult;
    }

    // Fallback não-atômico (apenas quando Redis está completamente indisponível)
    this.gc();
    const entry = this.memory.get(key);
    const current =
      entry && (!entry.expiresAt || entry.expiresAt > Date.now())
        ? (entry.value as number)
        : 0;
    const next = current + 1;
    this.memory.set(key, {
      value: next,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
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
