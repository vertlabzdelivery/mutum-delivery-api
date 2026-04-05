import { Body, Controller, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import type { RequestContextData } from '../common/interfaces/request-context.interface';
import { CreateClientLogDto } from './dto/create-client-log.dto';
import { StructuredLoggerService } from './structured-logger.service';

@Controller('observability')
export class ObservabilityController {
  constructor(private readonly logger: StructuredLoggerService) {}

  @Post('mobile-log')
  createClientLog(@Req() req: Request, @Body() dto: CreateClientLogDto) {
    const request = req as Request & RequestContextData;

    const meta: Record<string, unknown> = {
      requestId: request.requestId,
      clientIp: request.clientIp,
      source: 'mobile',
      event: dto.event,
      level: dto.level ?? 'info',
      platform: dto.platform ?? null,
      appVersion: dto.appVersion ?? null,
      message: dto.message ?? null,
      context: dto.context ?? null,
    };

    if (dto.stack) {
      meta.stack = dto.stack;
    }

    const level = (dto.level ?? 'info') as 'info' | 'warn' | 'error';

    if (level === 'error') {
      this.logger.error('mobile.log', meta);
    } else if (level === 'warn') {
      this.logger.warn('mobile.log', meta);
    } else {
      this.logger.log('mobile.log', meta);
    }

    return { success: true };
  }
}
