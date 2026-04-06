/**
 * Vercel Speed Insights — Integração para APIs NestJS
 *
 * CONTEXTO IMPORTANTE:
 * O pacote @vercel/speed-insights foi originalmente desenvolvido para medir
 * Web Vitals do browser (LCP, CLS, FID). Para APIs Node.js/NestJS no Vercel,
 * a forma correta de monitorar performance é via métricas de tempo de resposta
 * por rota, que o Vercel expõe automaticamente no dashboard de Functions.
 *
 * Este interceptor:
 *   1. Mede o tempo de resposta de cada endpoint
 *   2. Classifica rotas lentas (>800ms) como "poor", médias (200-800ms) como
 *      "needs-improvement" e rápidas (<200ms) como "good"
 *   3. Emite o header `Server-Timing` (padrão W3C) que o Vercel Speed Insights
 *      e o DevTools do Chrome leem nativamente
 *   4. Adiciona o header `X-Response-Time` para debug
 *   5. Registra métricas no logger estruturado para correlação com logs
 *
 * Para habilitar o painel de Speed Insights no Vercel:
 *   → Project Settings → Speed Insights → Enable
 * O Vercel coleta automaticamente métricas de Function duration via runtime.
 */
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';
import { StructuredLoggerService } from './structured-logger.service';

type PerformanceRating = 'good' | 'needs-improvement' | 'poor';

function getRating(durationMs: number): PerformanceRating {
  if (durationMs < 200) return 'good';
  if (durationMs < 800) return 'needs-improvement';
  return 'poor';
}

/** Normaliza o path removendo IDs dinâmicos para agrupar métricas por rota. */
function normalizePath(url: string): string {
  return url
    .split('?')[0]                                       // remove query string
    .replace(/\/[0-9a-f-]{8,}/gi, '/:id')               // UUIDs
    .replace(/\/\d+/g, '/:id')                          // IDs numéricos
    .replace(/\/$/, '') || '/';
}

@Injectable()
export class VercelSpeedInsightsInterceptor implements NestInterceptor {
  constructor(private readonly logger: StructuredLoggerService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const startedAt = Date.now();

    return next.handle().pipe(
      tap({
        next: () => this.record(request, response, startedAt),
        error: () => this.record(request, response, startedAt),
      }),
    );
  }

  private record(request: Request, response: Response, startedAt: number) {
    const durationMs = Date.now() - startedAt;
    const rating = getRating(durationMs);
    const route = normalizePath(request.originalUrl ?? request.url);

    // Server-Timing header — lido pelo Vercel Speed Insights e pelo Chrome DevTools
    response.setHeader(
      'Server-Timing',
      `handler;dur=${durationMs};desc="${route}"`,
    );

    // Header auxiliar para debug e testes de integração
    response.setHeader('X-Response-Time', `${durationMs}ms`);

    // Loga apenas rotas lentas ou com erros (evita ruído em rotas rápidas)
    if (rating !== 'good') {
      this.logger.warn('perf.endpoint', {
        route,
        method: request.method,
        durationMs,
        rating,
        statusCode: response.statusCode,
      });
    }
  }
}
