import { Injectable } from '@nestjs/common';

/**
 * Logger estruturado em JSON.
 *
 * Na Vercel os logs aparecem em: Vercel Dashboard → seu projeto → Logs.
 * Filtre por `level`, `message` ou qualquer campo via barra de busca.
 *
 * Para um painel de logs bonito e pesquisável, configure o Betterstack:
 *   1. Acesse https://logs.betterstack.com → New Source → "HTTP"
 *   2. Copie o Ingesting URL e o Source Token
 *   3. Defina no .env:
 *        BETTERSTACK_LOG_URL=https://in.logs.betterstack.com
 *        BETTERSTACK_LOG_TOKEN=<seu_token>
 *   4. Pronto — todos os logs da API aparecem no Betterstack em tempo real.
 *
 * Sem Betterstack os logs continuam funcionando normalmente via console
 * (visíveis no painel da Vercel em Runtime Logs).
 */

@Injectable()
export class StructuredLoggerService {
  log(message: string, meta?: Record<string, unknown>) {
    this.write('info', message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>) {
    this.write('warn', message, meta);
  }

  error(message: string, meta?: Record<string, unknown>) {
    this.write('error', message, meta);
  }

  private write(level: 'info' | 'warn' | 'error', message: string, meta?: Record<string, unknown>) {
    const payload: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      level,
      message,
      service: process.env.LOG_SERVICE_NAME ?? 'uai-pede-api',
      env: process.env.NODE_ENV ?? 'production',
      ...(meta ?? {}),
    };

    const serialized = JSON.stringify(payload);

    if (level === 'error') {
      console.error(serialized);
    } else if (level === 'warn') {
      console.warn(serialized);
    } else {
      console.log(serialized);
    }

    this.drainToBetterstack(payload).catch(() => undefined);
  }

  /**
   * Envia o log para o Betterstack de forma assíncrona (fire-and-forget).
   * Se o token não estiver configurado, a função retorna imediatamente.
   * Falhas de rede são silenciadas para nunca impactar a API.
   */
  private async drainToBetterstack(payload: Record<string, unknown>): Promise<void> {
    const token = process.env.BETTERSTACK_LOG_TOKEN;
    if (!token) return;

    const url = (process.env.BETTERSTACK_LOG_URL ?? 'https://in.logs.betterstack.com').replace(/\/$/, '');

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);

      await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeout);
    } catch {
      // Silencioso — a falha do log drain nunca pode interromper a API.
    }
  }
}
