import type { z } from 'zod';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { ValidationError } from '../utils/errors.js';

interface ValidationSchemas {
  body?: z.ZodType<any>;
  query?: z.ZodType<any>;
  params?: z.ZodType<any>;
}

export function validate(schemas: ValidationSchemas) {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    const errors: Array<{ field: string; message: string }> = [];

    if (schemas.params && request.params) {
      const result = schemas.params.safeParse(request.params);
      if (!result.success) {
        errors.push(
          ...result.error.issues.map((issue) => ({
            field: `params.${issue.path.join('.')}`,
            message: issue.message
          }))
        );
      } else {
        request.params = result.data;
      }
    }

    if (schemas.query && request.query) {
      const result = schemas.query.safeParse(request.query);
      if (!result.success) {
        errors.push(
          ...result.error.issues.map((issue) => ({
            field: `query.${issue.path.join('.')}`,
            message: issue.message
          }))
        );
      } else {
        request.query = result.data;
      }
    }

    if (schemas.body && request.body) {
      const result = schemas.body.safeParse(request.body);
      if (!result.success) {
        errors.push(
          ...result.error.issues.map((issue) => ({
            field: `body.${issue.path.join('.')}`,
            message: issue.message
          }))
        );
      } else {
        request.body = result.data;
      }
    }

    if (errors.length > 0) {
      throw new ValidationError('Validation failed', errors);
    }
  };
}
