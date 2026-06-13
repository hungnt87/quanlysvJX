import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import sensible from '@fastify/sensible';
import { getErrorHandler } from './middleware/errorHandler.js';
import { startScheduledBackupScheduler } from './scheduledBackups/scheduledBackupScheduler.js';
import { loadConfig, type ManagerConfig } from './config.js';
import { createGameAccountService, type GameAccountService } from './gameAccounts/gameAccountService.js';
import { createMssqlGameAccountRepository } from './gameAccounts/mssqlGameAccountRepository.js';
import { registerBackupRoutes } from './routes/backupRoutes.js';
import { registerScheduledBackupRoutes } from './routes/scheduledBackupRoutes.js';
import { registerGameAccountRoutes } from './routes/gameAccountRoutes.js';
import { registerHealthRoutes } from './routes/healthRoutes.js';
import { registerLogRoutes } from './routes/logRoutes.js';
import { registerServiceRoutes } from './routes/serviceRoutes.js';
import { registerEnvRoutes } from './routes/envRoutes.js';
import { registerSystemRoutes } from './routes/systemRoutes.js';
import { registerVersionRoutes } from './routes/versionRoutes.js';
import {
  runDocker,
  runDockerCompose,
  runDockerComposeStream,
  type CommandResult,
  type ComposeStream
} from './services/composeRunner.js';

export type AppDeps = {
  config: ManagerConfig;
  runCompose: (args: readonly string[], options?: { stdin?: string | Buffer }) => Promise<CommandResult>;
  runDocker: (args: readonly string[], options?: { stdin?: string | Buffer }) => Promise<CommandResult>;
  streamCompose: (args: readonly string[]) => ComposeStream;
  gameAccounts: GameAccountService;
};

export async function buildApp(overrides: Partial<AppDeps> = {}) {
  const config = overrides.config ?? loadConfig();
  const deps: AppDeps = {
    config,
    runCompose: overrides.runCompose ?? ((args, options) => runDockerCompose(args, config.projectRoot, options)),
    runDocker: overrides.runDocker ?? ((args, options) => runDocker(args, config.projectRoot, options)),
    streamCompose: overrides.streamCompose ?? ((args) => runDockerComposeStream(args, config.projectRoot)),
    gameAccounts: overrides.gameAccounts ?? createGameAccountService(createMssqlGameAccountRepository(config.mssql))
  };

  const app = Fastify({ logger: true });
  await app.register(sensible);
  await app.register(multipart, {
    limits: {
      fileSize: 2 * 1024 * 1024 * 1024 // 2GB
    }
  });
  app.decorate('deps', deps);

  app.setErrorHandler(getErrorHandler(app));

  await registerHealthRoutes(app);
  await registerServiceRoutes(app);
  await registerLogRoutes(app);
  await registerBackupRoutes(app);
  await registerScheduledBackupRoutes(app);
  await registerGameAccountRoutes(app);
  await registerEnvRoutes(app);
  await registerSystemRoutes(app);
  await registerVersionRoutes(app);

  if (config.schedulerEnabled) {
    app.log.info('Backup scheduler enabled');
    const scheduledTask = startScheduledBackupScheduler(deps, app.log);
    app.addHook('onClose', () => {
      scheduledTask.stop();
    });
  } else {
    app.log.info('Backup scheduler disabled');
  }

  return app;
}


declare module 'fastify' {
  interface FastifyInstance {
    deps: AppDeps;
  }
}
