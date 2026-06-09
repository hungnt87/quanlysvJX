import type { FastifyInstance } from 'fastify';
import { ok } from '../api/envelope.js';
import { CommandError } from '../api/errors.js';
import { assertServiceName } from '../services/serviceAllowlist.js';
import { parseComposePsJson } from '../services/serviceStatus.js';

export async function registerServiceRoutes(app: FastifyInstance) {
  app.get('/api/services', async () => {
    const result = await app.deps.runCompose(['ps', '--format', 'json']);
    if (result.exitCode !== 0) {
      throw new CommandError('Unable to read Docker Compose services');
    }

    return ok(parseComposePsJson(result.stdout));
  });

  app.post('/api/services/:name/start', async (request) => {
    const name = assertServiceName((request.params as { name: string }).name);
    return ok(await runAction(app, ['up', '-d', name], `Started ${name}`));
  });

  app.post('/api/services/:name/stop', async (request) => {
    const name = assertServiceName((request.params as { name: string }).name);
    return ok(await runAction(app, ['stop', name], `Stopped ${name}`));
  });

  app.post('/api/services/:name/restart', async (request) => {
    const name = assertServiceName((request.params as { name: string }).name);
    return ok(await runAction(app, ['restart', name], `Restarted ${name}`));
  });
}

async function runAction(app: FastifyInstance, args: readonly string[], message: string) {
  const result = await app.deps.runCompose(args);
  if (result.exitCode !== 0) {
    throw new CommandError(`${message} failed`);
  }

  return { message };
}
