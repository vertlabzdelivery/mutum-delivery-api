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

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });

  const corsOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim())
    : true;

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Request-Id'],
    // Expõe os headers de performance para clientes e ferramentas de monitoramento
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
    // Speed Insights primeiro — mede o tempo total incluindo outros interceptors
    new VercelSpeedInsightsInterceptor(logger),
    new RequestLoggingInterceptor(logger),
    new ResponseInterceptor(),
  );

  const prismaService = app.get(PrismaService);

  // CORRIGIDO: trata SIGTERM e SIGINT além de beforeExit
  // beforeExit não dispara em process.exit() explícito ou sinais de SO
  const shutdown = async (signal: string) => {
    logger.log(`app.shutdown`, { signal });
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

bootstrap();
