import Fastify from 'fastify';
import sensible from '@fastify/sensible';
import { fail } from './api/envelope.js';
import { AppError } from './api/errors.js';
import { loadConfig, type ManagerConfig } from './config.js';
import { registerHealthRoutes } from './routes/healthRoutes.js';
import { registerLogRoutes } from './routes/logRoutes.js';
import { registerServiceRoutes } from './routes/serviceRoutes.js';
import { runDockerCompose, type CommandResult } from './services/composeRunner.js';

export type AppDeps = {
  config: ManagerConfig;
  runCompose: (args: readonly string[]) => Promise<CommandResult>;
};

export async function buildApp(overrides: Partial<AppDeps> = {}) {
  const config = overrides.config ?? loadConfig();
  const deps: AppDeps = {
    config,
    runCompose: overrides.runCompose ?? ((args) => runDockerCompose(args, config.projectRoot))
  };

  const app = Fastify({ logger: true });
  await app.register(sensible);
  app.decorate('deps', deps);

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AppError) {
      void reply.status(error.statusCode).send(fail(error.message));
      return;
    }

    app.log.error({ err: error }, 'Unhandled manager API error');
    void reply.status(500).send(fail('Unexpected server error'));
  });

  await registerHealthRoutes(app);
  await registerServiceRoutes(app);
  await registerLogRoutes(app);
  return app;
}

declare module 'fastify' {
  interface FastifyInstance {
    deps: AppDeps;
  }
}
