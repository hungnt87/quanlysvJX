import type { ManagerConfig } from '../config.js';
import type { ScheduledBackupRun } from './scheduledBackupTypes.js';
import {
  startNextQueuedRunForDatabase,
  finishScheduledBackupRun
} from './scheduledBackupRuns.js';

export type WorkerDeps = {
  config: ManagerConfig;
  database: 'mysql' | 'mssql';
  isDatabaseHealthy: (database: 'mysql' | 'mssql') => Promise<boolean>;
  runBackup: (
    database: 'mysql' | 'mssql',
    context: { trigger: 'schedule' | 'manual' | 'retry'; runId: string }
  ) => Promise<{ filename: string | null }>;
  logger: { info: (msg: string) => void; error: (msg: string) => void };
  now?: Date;
};

export async function processNextScheduledBackupRun(
  deps: WorkerDeps
): Promise<ScheduledBackupRun | null> {
  const { config, database, isDatabaseHealthy, runBackup, logger, now = new Date() } = deps;
  const runsFile = config.scheduledBackupRunsFile!;

  // 1. Check if the database is healthy
  const healthy = await isDatabaseHealthy(database);
  if (!healthy) {
    logger.info(`Database ${database} is not healthy. Skipping worker tick.`);
    return null;
  }

  // 2. Fetch and start the next queued run
  const run = startNextQueuedRunForDatabase(runsFile, database, now);
  if (!run) {
    return null;
  }

  logger.info(`Starting backup run ${run.runId} for database ${database} (trigger: ${run.trigger}).`);

  try {
    // 3. Execute backup callback
    const result = await runBackup(database, { trigger: run.trigger, runId: run.runId });

    // 4. Record success
    const finishedRun = finishScheduledBackupRun(
      runsFile,
      run.runId,
      {
        status: 'succeeded',
        error: null,
        backupFilename: result.filename
      },
      now
    );
    logger.info(`Backup run ${run.runId} succeeded. Filename: ${result.filename}`);
    return finishedRun;
  } catch (err) {
    const errMsg = (err as Error).message || 'Unknown error';
    logger.error(`Backup run ${run.runId} failed: ${errMsg}`);

    // 5. Record failure
    const finishedRun = finishScheduledBackupRun(
      runsFile,
      run.runId,
      {
        status: 'failed',
        error: errMsg,
        backupFilename: null
      },
      now
    );
    return finishedRun;
  }
}
