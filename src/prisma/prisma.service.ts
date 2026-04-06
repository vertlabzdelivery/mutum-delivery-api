import { INestApplication, Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { StructuredLoggerService } from '../observability/structured-logger.service';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor(private readonly logger: StructuredLoggerService) {
    super({
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'stdout', level: 'warn' },
        { emit: 'stdout', level: 'error' },
      ],
    });

    this.$on('query' as never, (event: any) => {
      const threshold = this.getSlowQueryThresholdMs();
      if (Number(event?.duration) >= threshold) {
        this.logger.warn('db.query.slow', {
          durationMs: Number(event.duration),
          query: event.query,
          params: event.params,
          target: event.target,
        });
      }
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  /**
   * CORRIGIDO: registra `beforeExit` para compatibilidade com desligamentos
   * normais do processo. O SIGTERM/SIGINT é tratado no main.ts para cobrir
   * desligamentos forçados (Vercel, Docker, Kubernetes).
   */
  async enableShutdownHooks(app: INestApplication) {
    process.on('beforeExit', async () => {
      await app.close();
    });
  }

  private getSlowQueryThresholdMs() {
    const parsed = Number(process.env.DB_SLOW_QUERY_THRESHOLD_MS);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 400;
  }
}
