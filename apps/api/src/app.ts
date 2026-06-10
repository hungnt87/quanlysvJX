import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import sensible from '@fastify/sensible';
import { fail } from './api/envelope.js';
import { AppError } from './api/errors.js';
import { startBackupScheduler } from './backups/backupScheduler.js';
import { loadConfig, type ManagerConfig } from './config.js';
import { registerBackupRoutes } from './routes/backupRoutes.js';
import { registerHealthRoutes } from './routes/healthRoutes.js';
import { registerLogRoutes } from './routes/logRoutes.js';
import { registerServiceRoutes } from './routes/serviceRoutes.js';
import {
  runDockerCompose,
  runDockerComposeStream,
  type CommandResult,
  type ComposeStream
} from './services/composeRunner.js';

export type AppDeps = {
  config: ManagerConfig;
  runCompose: (args: readonly string[]) => Promise<CommandResult>;
  streamCompose: (args: readonly string[]) => ComposeStream;
};

export async function buildApp(overrides: Partial<AppDeps> = {}) {
  const config = overrides.config ?? loadConfig();
  const deps: AppDeps = {
    config,
    runCompose: overrides.runCompose ?? ((args) => runDockerCompose(args, config.projectRoot)),
    streamCompose: overrides.streamCompose ?? ((args) => runDockerComposeStream(args, config.projectRoot))
  };

  const app = Fastify({ logger: true });
  await app.register(sensible);
  await app.register(multipart);
  app.decorate('deps', deps);

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AppError) {
      void reply.status(error.statusCode).send(fail(error.message));
      return;
    }

    if (isHttpClientError(error)) {
      void reply.status(error.statusCode).send(fail(error.message));
      return;
    }

    app.log.error({ err: error }, 'Unhandled manager API error');
    void reply.status(500).send(fail('Unexpected server error'));
  });

  await registerHealthRoutes(app);
  await registerServiceRoutes(app);
  await registerLogRoutes(app);
  await registerBackupRoutes(app);

  if (config.schedulerEnabled) {
    const scheduledTask = startBackupScheduler(deps);
    app.addHook('onClose', () => {
      scheduledTask.stop();
    });
  }

  return app;
}

function isHttpClientError(error: unknown): error is { statusCode: number; message: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'statusCode' in error &&
    'message' in error &&
    typeof error.statusCode === 'number' &&
    error.statusCode >= 400 &&
    error.statusCode < 500 &&
    typeof error.message === 'string'
  );
}

declare module 'fastify' {
  interface FastifyInstance {
    deps: AppDeps;
  }
}
