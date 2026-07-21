import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import type { Observable } from 'rxjs';
import { finalize } from 'rxjs';

const requestIdPattern = /^[A-Za-z0-9._-]{1,128}$/;

export function resolveRequestId(value: string | undefined) {
  return value && requestIdPattern.test(value) ? value : randomUUID();
}

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const requestId = resolveRequestId(request.header('x-request-id'));
    const startedAt = performance.now();

    response.setHeader('x-request-id', requestId);

    return next.handle().pipe(
      finalize(() => {
        this.logger.log({
          requestId,
          method: request.method,
          path: request.path,
          statusCode: response.statusCode,
          durationMs: Math.round(performance.now() - startedAt),
        });
      }),
    );
  }
}
