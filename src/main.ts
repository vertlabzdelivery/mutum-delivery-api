import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import type { RequestContextData } from './common/interfaces/request-context.interface';
import { ObservabilityModule } from './observability/observability.module';
import { RequestLoggingInterceptor } from './observability/request-logging.interceptor';
import { StructuredLoggerService } from './observability/structured-logger.service';
import { VercelSpeedInsightsInterceptor } from './observability/vercel-speed-insights.interceptor';
import { PrismaService } from './prisma/prisma.service';

// setupApp é exportado e reutilizado pelo handler do Vercel (src/vercel.ts)
export async function setupApp() {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });

  const corsOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim())
    : true;

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id', 'X-Response-Time', 'Server-Timing'],
  });

  app.use((req: Request, res: Response, next: () => void) => {
    const request = req as Request & RequestContextData;
    const forwardedFor = req.headers['x-forwarded-for'];
    const firstForwardedIp = Array.isArray(forwardedFor)
      ? forwardedFor[0]
      : String(forwardedFor || '').split(',')[0]?.trim();

    request.requestId = String(req.headers['x-request-id'] || randomUUID());
    request.clientIp = firstForwardedIp || req.ip || req.socket.remoteAddress || 'unknown';
    request.startedAt = Date.now();
    res.setHeader('X-Request-Id', request.requestId);
    next();
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const logger = app.select(ObservabilityModule).get(StructuredLoggerService, { strict: false });

  app.useGlobalFilters(new HttpExceptionFilter(logger));
  app.useGlobalInterceptors(
    new VercelSpeedInsightsInterceptor(logger),
    new RequestLoggingInterceptor(logger),
    new ResponseInterceptor(),
  );

  return { app, logger };
}

// Bootstrap padrão para execução local e outros ambientes (Railway, Render, etc.)
async function bootstrap() {
  const { app, logger } = await setupApp();

  const prismaService = app.get(PrismaService);

  const shutdown = async (signal: string) => {
    logger.log('app.shutdown', { signal });
    await app.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  await prismaService.enableShutdownHooks(app);

  await app.listen(process.env.PORT ?? 3001);

  logger.log('app.started', {
    port: process.env.PORT ?? 3001,
    env: process.env.NODE_ENV ?? 'development',
  });
}

// Executa apenas quando chamado diretamente (não pelo Vercel)
if (process.env.VERCEL !== '1') {
  bootstrap();
}
