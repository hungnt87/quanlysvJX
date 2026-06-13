import type { FastifyError, FastifyInstance } from 'fastify';
import { AppError, ValidationError } from '../utils/errors.js';
import { error as formatError } from '../utils/response.js';
import { DuplicateVersionError, VersionNotFoundError, InvalidVersionPathError } from '../versions/versionRegistry.js';

export function getErrorHandler(app: FastifyInstance) {
  return (error: FastifyError | Error, _request: any, reply: any) => {
    if (error instanceof DuplicateVersionError) {
      void reply.status(409).send(formatError(error.message));
      return;
    }

    if (error instanceof VersionNotFoundError) {
      void reply.status(404).send(formatError(error.message));
      return;
    }

    if (error instanceof InvalidVersionPathError) {
      void reply.status(400).send(formatError(error.message));
      return;
    }

    if (error instanceof ValidationError) {
      void reply.status(error.statusCode).send(formatError(error.message, error.errors));
      return;
    }

    if (error instanceof AppError) {
      void reply.status(error.statusCode).send(formatError(error.message));
      return;
    }

    // Xử lý lỗi từ Fastify hoặc các lỗi HTTP có statusCode dạng 4xx
    if ('statusCode' in error && typeof error.statusCode === 'number' && error.statusCode >= 400 && error.statusCode < 500) {
      void reply.status(error.statusCode).send(formatError(error.message));
      return;
    }

    // Log chi tiết lỗi không mong đợi ở phía máy chủ
    app.log.error({ err: error }, 'Lỗi hệ thống không mong đợi (Unhandled server error)');
    void reply.status(500).send(formatError('Internal server error'));
  };
}
