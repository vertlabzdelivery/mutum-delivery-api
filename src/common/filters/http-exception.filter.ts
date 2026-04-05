import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { RequestContextData } from '../interfaces/request-context.interface';
import { StructuredLoggerService } from '../../observability/structured-logger.service';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: StructuredLoggerService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request & RequestContextData>();
    const response = ctx.getResponse<Response>();

    const isHttpException = exception instanceof HttpException;

    const status = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse = isHttpException
      ? exception.getResponse()
      : 'Erro interno do servidor';

    let message: string | string[] = 'Erro interno do servidor';
    let error = 'Internal Server Error';

    if (typeof exceptionResponse === 'string') {
      message = exceptionResponse;
    } else if (
      typeof exceptionResponse === 'object' &&
      exceptionResponse !== null
    ) {
      const responseObj = exceptionResponse as Record<string, any>;
      message = responseObj.message ?? message;
      error = responseObj.error ?? error;
    }

    const logPayload = {
      requestId: request.requestId,
      method: request.method,
      path: request.originalUrl ?? request.url,
      clientIp: request.clientIp,
      statusCode: status,
      error,
      message,
    };

    if (status >= 500) {
      this.logger.error('http.exception', {
        ...logPayload,
        stack: exception instanceof Error ? exception.stack : undefined,
      });
    } else {
      this.logger.warn('http.rejection', logPayload);
    }

    response.status(status).json({
      success: false,
      statusCode: status,
      path: request.url,
      timestamp: new Date().toISOString(),
      requestId: request.requestId,
      error,
      message,
    });
  }
}
