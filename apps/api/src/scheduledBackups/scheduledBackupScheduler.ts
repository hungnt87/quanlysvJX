import fs from 'node:fs';
import cron from 'node-cron';
import type { AppDeps } from '../app.js';
import type { ManagerConfig } from '../config.js';
import { backupMssql } from '../backups/mssqlBackup.js';
import { backupMysql } from '../backups/mysqlBackup.js';
import { parseManagedServiceStatuses } from '../services/serviceStatus.js';
import {
  readScheduledBackupJobs,
  writeScheduledBackupJobs
} from './scheduledBackupJobs.js';
import {
  readScheduledBackupRuns,
  writeScheduledBackupRuns,
  enqueueScheduledBackupRun,
  markStaleRunningRunsFailed
} from './scheduledBackupRuns.js';
import { isScheduleDue } from './scheduledBackupTime.js';
import { processNextScheduledBackupRun } from './scheduledBackupWorker.js';

export function performScheduledBackupStartupInit(
  config: ManagerConfig,
  logger: { info: (msg: string) => void },
  now = new Date()
): void {
  const scheduleFile = config.backupScheduleFile;
  const jobsFile = config.scheduledBackupJobsFile!;
  const runsFile = config.scheduledBackupRunsFile!;

  // If legacy file exists and new jobs file doesn't exist, remove the legacy file
  if (fs.existsSync(scheduleFile) && !fs.existsSync(jobsFile)) {
    try {
      fs.unlinkSync(scheduleFile);
      logger.info('Deleted legacy backup-schedules.json file as new jobs file does not exist.');
    } catch (err) {
      logger.info(`Failed to delete legacy backup-schedules.json: ${(err as Error).message}`);
    }
  }

  // Ensure new files are initialized
  if (!fs.existsSync(jobsFile)) {
    writeScheduledBackupJobs(jobsFile, { version: 2, jobs: [] });
  }
  if (!fs.existsSync(runsFile)) {
    writeScheduledBackupRuns(runsFile, { version: 1, runs: [] });
  }

  // Mark running runs as failed on startup recovery
  markStaleRunningRunsFailed(runsFile, now);
}

export function tickScheduledBackupScheduler(config: ManagerConfig, now = new Date()): void {
  const jobsFile = config.scheduledBackupJobsFile!;
  const runsFile = config.scheduledBackupRunsFile!;

  const jobsData = readScheduledBackupJobs(jobsFile);
  const activeJobs = jobsData.jobs.filter(job => job.enabled && job.deletedAt === null);

  const scheduledForStr = now.toISOString();

  for (const job of activeJobs) {
    if (isScheduleDue(job.schedule, now)) {
      const runsData = readScheduledBackupRuns(runsFile);
      const isAlreadyScheduled = runsData.runs.some(
        run => run.jobId === job.id && run.scheduledFor === scheduledForStr
      );

      if (!isAlreadyScheduled) {
        enqueueScheduledBackupRun(
          runsFile,
          {
            jobId: job.id,
            jobDisplayName: job.displayName,
            database: job.database,
            trigger: 'schedule',
            scheduledFor: scheduledForStr,
            scheduleSnapshot: job.schedule
          },
          config.maxQueuedRunsPerJob ?? 100,
          config.maxFinishedScheduledRuns ?? 1000,
          now
        );
      }
    }
  }
}

export function startScheduledBackupScheduler(deps: AppDeps, logger: any) {
  // 1. Run startup init
  performScheduledBackupStartupInit(deps.config, logger);

  // 2. Start scheduler timer (tick every minute)
  const cronJob = cron.schedule('* * * * *', () => {
    try {
      tickScheduledBackupScheduler(deps.config, new Date());
    } catch (err) {
      logger.error({ err }, 'Error in scheduled backup scheduler tick');
    }
  });

  // 3. Start workers
  let active = true;

  const isDatabaseHealthy = async (database: 'mysql' | 'mssql'): Promise<boolean> => {
    const serviceName = database === 'mysql' ? 'jxmysql' : 'jxmssql';
    try {
      const result = await deps.runCompose(['ps', '--format', 'json']);
      const statuses = parseManagedServiceStatuses(result.stdout);
      const service = statuses.find(s => s.name === serviceName);
      if (!service) return false;
      return (
        service.state === 'running' &&
        (service.health === 'healthy' || service.health === 'unknown' || service.health === '')
      );
    } catch {
      return false;
    }
  };

  const runBackup = async (
    database: 'mysql' | 'mssql',
    context: { trigger: 'schedule' | 'manual' | 'retry'; runId: string }
  ) => {
    if (database === 'mysql') {
      return backupMysql(deps, context as any);
    } else {
      return backupMssql(deps, context as any);
    }
  };

  const startWorker = async (database: 'mysql' | 'mssql') => {
    while (active) {
      let sleepTime = 10000; // 10s idle sleep
      try {
        const healthy = await isDatabaseHealthy(database);
        if (!healthy) {
          sleepTime = 60000; // 1 min unhealthy sleep
        } else {
          const processedRun = await processNextScheduledBackupRun({
            config: deps.config,
            database,
            isDatabaseHealthy: async () => true,
            runBackup,
            logger
          });
          if (processedRun) {
            sleepTime = 0; // check queue immediately
          }
        }
      } catch (err) {
        logger.error({ err }, `Error in worker loop for ${database}`);
      }
      if (sleepTime > 0 && active) {
        await new Promise(resolve => setTimeout(resolve, sleepTime));
      }
    }
  };

  void startWorker('mysql');
  void startWorker('mssql');

  return {
    stop: () => {
      active = false;
      cronJob.stop();
    }
  };
}
