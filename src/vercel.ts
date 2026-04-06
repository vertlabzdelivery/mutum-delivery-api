/**
 * Entry point exclusivo para o Vercel Serverless.
 *
 * O @vercel/node compila este arquivo TypeScript automaticamente.
 * A app NestJS é inicializada uma única vez e reutilizada entre
 * invocações da mesma instância (warm start).
 */
import express from 'express';
import type { IncomingMessage, ServerResponse } from 'http';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Request, Response } from 'express';

import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import type { RequestContextData } from './common/interfaces/request-context.interface';
import { ObservabilityModule } from './observability/observability.module';
import { RequestLoggingInterceptor } from './observability/request-logging.interceptor';
import { StructuredLoggerService } from './observability/structured-logger.service';
import { VercelSpeedInsightsInterceptor } from './observability/vercel-speed-insights.interceptor';

const server = express();
let isReady = false;

async function bootstrap() {
  if (isReady) return;

  const adapter = new ExpressAdapter(server);
  const app = await NestFactory.create(AppModule, adapter, { bufferLogs: false });

  const corsOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
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
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  const logger = app.select(ObservabilityModule).get(StructuredLoggerService, { strict: false });
  app.useGlobalFilters(new HttpExceptionFilter(logger));
  app.useGlobalInterceptors(
    new VercelSpeedInsightsInterceptor(logger),
    new RequestLoggingInterceptor(logger),
    new ResponseInterceptor(),
  );

  await app.init();
  isReady = true;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  await bootstrap();
  server(req, res);
}
