import type { FastifyInstance } from 'fastify';
import { ok } from '../api/envelope.js';
import { CommandError, ValidationError } from '../api/errors.js';
import { assertServiceName } from '../services/serviceAllowlist.js';
import { startServiceWithProgress } from '../services/serviceStartOrchestrator.js';
import { parseManagedServiceStatuses } from '../services/serviceStatus.js';
import { readVersionRegistry } from '../versions/versionRegistry.js';
import type { StartServiceEvent } from '../services/serviceStartEvents.js';
import { resolveComposeServiceConfig, type ComposeConfigDocument } from '../services/composeConfig.js';
import { prepareServicesWithProgress, type PrepareServiceEvent } from '../services/servicePrepareOrchestrator.js';

let cachedComposeConfig: ComposeConfigDocument | null = null;

function assertActiveVersion(projectRoot: string) {
  const registry = readVersionRegistry(projectRoot);
  if (!registry.activeVersion) {
    throw new ValidationError('Chưa có phiên bản game nào được kích hoạt. Vui lòng kích hoạt một phiên bản trước.');
  }
}

export async function registerServiceRoutes(app: FastifyInstance) {
  const projectRoot = app.deps.config.projectRoot;

  app.get('/api/services', async () => {
    const result = await app.deps.runCompose(['ps', '--all', '--format', 'json']);
    if (result.exitCode !== 0) {
      throw new CommandError('Unable to read Docker Compose services');
    }

    const services = parseManagedServiceStatuses(result.stdout);

    if (!cachedComposeConfig) {
      const configResult = await app.deps.runCompose(['config', '--format', 'json']);
      if (configResult.exitCode === 0) {
        try {
          cachedComposeConfig = JSON.parse(configResult.stdout) as ComposeConfigDocument;
        } catch {
          // Ignore json parsing issues
        }
      }
    }

    const updatedServices = await Promise.all(
      services.map(async (service) => {
        let hasBuild = false;
        let imageName: string = service.name;
        if (cachedComposeConfig) {
          try {
            const resolved = resolveComposeServiceConfig(cachedComposeConfig, service.name);
            hasBuild = resolved.hasBuild;
            imageName = resolved.imageName;
          } catch {
            // Ignore if service not found in compose config
          }
        }

        let imageExists = false;
        if (imageName) {
          const inspectResult = await app.deps.runDocker(['image', 'inspect', imageName]);
          imageExists = inspectResult.exitCode === 0;
        }

        return {
          ...service,
          imageName,
          hasBuild,
          imageExists
        };
      })
    );

    return ok(updatedServices);
  });

  app.get('/api/services/images/prepare/stream', (request, reply) => {
    assertActiveVersion(projectRoot);

    const query = request.query as { services?: string };
    const servicesParam = query.services || '';
    const names = servicesParam
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((name) => assertServiceName(name));

    if (names.length === 0) {
      throw new ValidationError('Danh sách dịch vụ cần chuẩn bị không được trống.');
    }

    const abortController = new AbortController();
    let closed = false;

    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    reply.raw.write(':\n\n');

    const heartbeat = setInterval(() => {
      if (!reply.raw.destroyed) {
        reply.raw.write(': heartbeat\n\n');
      } else {
        clearInterval(heartbeat);
      }
    }, 10000);

    const writeEvent = (event: PrepareServiceEvent) => {
      if (reply.raw.destroyed) {
        clearInterval(heartbeat);
        return;
      }
      reply.raw.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      if (event.type === 'close') {
        clearInterval(heartbeat);
        closed = true;
        reply.raw.end();
      }
    };

    request.raw.on('close', () => {
      clearInterval(heartbeat);
      if (!closed) {
        abortController.abort();
      }
    });

    void (async () => {
      if (!cachedComposeConfig) {
        const configResult = await app.deps.runCompose(['config', '--format', 'json']);
        if (configResult.exitCode === 0) {
          cachedComposeConfig = JSON.parse(configResult.stdout) as ComposeConfigDocument;
        }
      }

      if (!cachedComposeConfig) {
        throw new Error('Không đọc được cấu hình Docker Compose.');
      }

      await prepareServicesWithProgress({
        services: names,
        runDocker: app.deps.runDocker,
        streamCompose: app.deps.streamCompose,
        emit: writeEvent,
        composeConfig: cachedComposeConfig,
        signal: abortController.signal
      });
    })().catch((error: unknown) => {
      const detail = error instanceof Error ? error.message : String(error);
      writeEvent({
        type: 'error',
        service: names[0] || 'unknown',
        message: 'Chuẩn bị image thất bại.',
        detail
      });
      writeEvent({ type: 'close', exitCode: 1 });
    });
  });

  app.post('/api/services/:name/start', async (request) => {
    const name = assertServiceName((request.params as { name: string }).name);
    assertActiveVersion(projectRoot);
    const result = await runAction(app, ['up', '-d', name], `Started ${name}`);
    return ok(result);
  });

  app.get('/api/services/:name/start/stream', (request, reply) => {
    const name = assertServiceName((request.params as { name: string }).name);
    assertActiveVersion(projectRoot);

    const abortController = new AbortController();
    let closed = false;

    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    reply.raw.write(':\n\n');

    const heartbeat = setInterval(() => {
      if (!reply.raw.destroyed) {
        reply.raw.write(': heartbeat\n\n');
      } else {
        clearInterval(heartbeat);
      }
    }, 10000);

    const writeEvent = (event: StartServiceEvent) => {
      if (reply.raw.destroyed) {
        clearInterval(heartbeat);
        return;
      }
      reply.raw.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      if (event.type === 'close') {
        clearInterval(heartbeat);
        closed = true;
        reply.raw.end();
      }
    };

    request.raw.on('close', () => {
      clearInterval(heartbeat);
      if (!closed) {
        abortController.abort();
      }
    });

    void startServiceWithProgress({
      serviceName: name,
      runCompose: app.deps.runCompose,
      runDocker: app.deps.runDocker,
      streamCompose: app.deps.streamCompose,
      emit: writeEvent,
      signal: abortController.signal
    }).catch((error: unknown) => {
      const detail = error instanceof Error ? error.message : String(error);
      writeEvent({
        type: 'error',
        code: 'UP_FAILED',
        phase: 'start',
        message: `Khởi chạy dịch vụ ${name} thất bại.`,
        detail
      });
      writeEvent({ type: 'close', exitCode: 1 });
    });
  });

  app.post('/api/services/:name/stop', async (request) => {
    const name = assertServiceName((request.params as { name: string }).name);
    await preHandleStopDependency(app, name);
    return ok(await runAction(app, ['rm', '-f', '-s', name], `Stopped ${name}`));
  });

  app.post('/api/services/:name/restart', async (request) => {
    const name = assertServiceName((request.params as { name: string }).name);
    assertActiveVersion(projectRoot);
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
      await runAction(app, ['rm', '-f', '-s', 's3relay'], 'Auto stopped s3relay');
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

  return { message, stdout: result.stdout, stderr: result.stderr };
}

function formatActionError(message: string, output: string) {
  const detail = output.trim().slice(0, 1000);
  return detail ? `${message} failed: ${detail}` : `${message} failed`;
}
