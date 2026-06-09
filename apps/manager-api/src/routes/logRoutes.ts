import type { FastifyInstance } from 'fastify';
import { ok } from '../api/envelope.js';
import { CommandError } from '../api/errors.js';
import { normalizeTail } from '../services/logStream.js';
import { assertServiceName } from '../services/serviceAllowlist.js';

export async function registerLogRoutes(app: FastifyInstance) {
  app.get('/api/services/:name/logs', async (request) => {
    const name = assertServiceName((request.params as { name: string }).name);
    const tail = normalizeTail((request.query as { tail?: string }).tail);
    const result = await app.deps.runCompose(['logs', '--no-color', '--tail', String(tail), name]);

    if (result.exitCode !== 0) {
      throw new CommandError(`Unable to read logs for ${name}`);
    }

    return ok({ service: name, tail, logs: result.stdout });
  });
}
