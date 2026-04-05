import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, catchError, tap, throwError } from 'rxjs';
import type { RequestContextData } from '../common/interfaces/request-context.interface';
import { StructuredLoggerService } from './structured-logger.service';

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: StructuredLoggerService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<Request & RequestContextData & { user?: { userId?: string; role?: string } }>();
    const response = context.switchToHttp().getResponse<Response>();
    const startedAt = request.startedAt ?? Date.now();
    const slowThresholdMs = this.getSlowThresholdMs();

    return next.handle().pipe(
      tap(() => {
        const durationMs = Date.now() - startedAt;
        const message = durationMs >= slowThresholdMs ? 'http.request.slow' : 'http.request.completed';
        const baseMeta = this.buildMeta(request, response, durationMs);

        if (durationMs >= slowThresholdMs) {
          this.logger.warn(message, baseMeta);
          return;
        }

        this.logger.log(message, baseMeta);
      }),
      catchError((error: unknown) => {
        const durationMs = Date.now() - startedAt;
        const statusCode = typeof (error as { getStatus?: () => number })?.getStatus === 'function'
          ? (error as { getStatus: () => number }).getStatus()
          : 500;

        this.logger.error('http.request.failed', {
          ...this.buildMeta(request, response, durationMs),
          statusCode,
          errorMessage: error instanceof Error ? error.message : 'Erro desconhecido',
        });

        return throwError(() => error);
      }),
    );
  }

  private buildMeta(request: Request & RequestContextData & { user?: { userId?: string; role?: string } }, response: Response, durationMs: number) {
    return {
      requestId: request.requestId,
      method: request.method,
      path: request.originalUrl ?? request.url,
      statusCode: response.statusCode,
      durationMs,
      clientIp: request.clientIp,
      userAgent: request.headers['user-agent'] ?? null,
      userId: request.user?.userId ?? null,
      userRole: request.user?.role ?? null,
    };
  }

  private getSlowThresholdMs() {
    const parsed = Number(process.env.API_SLOW_REQUEST_THRESHOLD_MS);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 800;
  }
}
