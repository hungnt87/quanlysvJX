import cron from 'node-cron';
import type { AppDeps } from '../app.js';
import { backupJobStore } from './backupJobs.js';
import { backupMssql } from './mssqlBackup.js';
import { backupMysql } from './mysqlBackup.js';
import type { BackupKind } from './backupPaths.js';
import { getRunKey, readBackupSchedules, updateBackupSchedule, type BackupDayOfWeek, type DatabaseBackupSchedule } from './backupSchedules.js';

type RunDeps = {
  now: Date;
  scheduleFile: string;
  backupMysql: () => Promise<unknown>;
  backupMssql: () => Promise<unknown>;
  hasRunningJob: (kind: BackupKind) => boolean;
};

export async function runDueBackupSchedules(deps: RunDeps) {
  const config = readBackupSchedules(deps.scheduleFile);
  await Promise.all((['mysql', 'mssql'] as const).map((kind) => runKindIfDue(kind, deps, config.schedules[kind])));
}

export function startBackupScheduler(appDeps: AppDeps) {
  return cron.schedule('* * * * *', () => {
    void runDueBackupSchedules({
      now: new Date(),
      scheduleFile: appDeps.config.backupScheduleFile,
      backupMysql: () => backupMysql(appDeps),
      backupMssql: () => backupMssql(appDeps),
      hasRunningJob: (kind) => backupJobStore.hasRunningJob(kind)
    });
  });
}

async function runKindIfDue(kind: BackupKind, deps: RunDeps, schedule: DatabaseBackupSchedule) {
  const hh = String(deps.now.getHours()).padStart(2, '0');
  const mm = String(deps.now.getMinutes()).padStart(2, '0');
  const dayOfWeek = deps.now.getDay() as BackupDayOfWeek;
  const runKey = getRunKey(kind, deps.now);
  if (!schedule.enabled || schedule.time !== `${hh}:${mm}` || !schedule.daysOfWeek.includes(dayOfWeek) || schedule.lastRunKey === runKey) {
    return;
  }
  if (deps.hasRunningJob(kind)) {
    return;
  }

  if (kind === 'mysql') {
    await deps.backupMysql();
  } else {
    await deps.backupMssql();
  }

  updateBackupSchedule(deps.scheduleFile, kind, { ...schedule, lastRunKey: runKey });
}
