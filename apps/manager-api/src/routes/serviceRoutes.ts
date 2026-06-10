import type { FastifyInstance } from 'fastify';
import { ok } from '../api/envelope.js';
import { CommandError, ValidationError } from '../api/errors.js';
import { assertServiceName } from '../services/serviceAllowlist.js';
import { parseManagedServiceStatuses } from '../services/serviceStatus.js';

export async function registerServiceRoutes(app: FastifyInstance) {
  app.get('/api/services', async () => {
    const result = await app.deps.runCompose(['ps', '--all', '--format', 'json']);
    if (result.exitCode !== 0) {
      throw new CommandError('Unable to read Docker Compose services');
    }

    return ok(parseManagedServiceStatuses(result.stdout));
  });

  app.post('/api/services/:name/start', async (request) => {
    const name = assertServiceName((request.params as { name: string }).name);
    return ok(await runAction(app, ['up', '-d', name], `Started ${name}`));
  });

  app.post('/api/services/:name/stop', async (request) => {
    const name = assertServiceName((request.params as { name: string }).name);
    await preHandleStopDependency(app, name);
    return ok(await runAction(app, ['stop', name], `Stopped ${name}`));
  });

  app.post('/api/services/:name/restart', async (request) => {
    const name = assertServiceName((request.params as { name: string }).name);
    await preHandleStopDependency(app, name);
    return ok(await runAction(app, ['restart', name], `Restarted ${name}`));
  });
}

async function preHandleStopDependency(app: FastifyInstance, serviceName: string) {
  const result = await app.deps.runCompose(['ps', '--all', '--format', 'json']);
  if (result.exitCode !== 0) {
    throw new CommandError('Unable to read Docker Compose services');
  }
  const services = parseManagedServiceStatuses(result.stdout);

  if (serviceName === 'jxserver') {
    const isS3RelayRunning = services.some(
      (s) => s.name === 's3relay' && (s.state === 'running' || s.state === 'starting')
    );
    if (isS3RelayRunning) {
      // Tự động tắt s3relay chạy ngầm trước
      await runAction(app, ['stop', 's3relay'], 'Auto stopped s3relay');
    }
  }

  if (serviceName === 'jxmysql' || serviceName === 'jxmssql') {
    const areOtherServicesRunning = services.some(
      (s) => s.name !== 'jxmysql' && s.name !== 'jxmssql' && (s.state === 'running' || s.state === 'starting')
    );
    if (areOtherServicesRunning) {
      throw new ValidationError('Cần tắt toàn bộ các dịch vụ JX khác trước khi dừng hoặc khởi động lại Database');
    }
  }
}

async function runAction(app: FastifyInstance, args: readonly string[], message: string) {
  const result = await app.deps.runCompose(args);
  if (result.exitCode !== 0) {
    throw new CommandError(formatActionError(message, result.stderr || result.stdout));
  }

  return { message };
}

function formatActionError(message: string, output: string) {
  const detail = output.trim().slice(0, 1000);
  return detail ? `${message} failed: ${detail}` : `${message} failed`;
}
