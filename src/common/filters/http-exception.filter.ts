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

/** Converte status HTTP em label de erro padrão. */
function httpStatusToErrorLabel(status: number): string {
  const map: Record<number, string> = {
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    409: 'Conflict',
    422: 'Unprocessable Entity',
    429: 'Too Many Requests',
    500: 'Internal Server Error',
    502: 'Bad Gateway',
    503: 'Service Unavailable',
  };
  return map[status] ?? 'Internal Server Error';
}

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
    // BUG CORRIGIDO: Passport lança UnauthorizedException sem campo 'error'
    // no objeto de resposta — o fallback era 'Internal Server Error' (errado).
    // Agora derivamos o label do status HTTP quando o campo não estiver presente.
    let error = httpStatusToErrorLabel(status);

    if (typeof exceptionResponse === 'string') {
      message = exceptionResponse;
    } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
      const responseObj = exceptionResponse as Record<string, any>;
      message = responseObj.message ?? message;
      // Só sobrescreve se o campo existir e for string não-vazia
      if (responseObj.error && typeof responseObj.error === 'string') {
        error = responseObj.error;
      }
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
