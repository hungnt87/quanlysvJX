import path from 'node:path';

export type MssqlConfig = {
  host: string;
  port: number;
  database: string;
  user: string | null;
  password: string | null;
  encrypt: boolean;
  trustServerCertificate: boolean;
};

export type ManagerConfig = {
  projectRoot: string;
  mysqlBackupDir: string;
  mssqlBackupDir: string;
  backupSchedule: string;
  backupRetentionDays: number;
  backupMetadataFile: string;
  backupScheduleFile: string;
  scheduledBackupJobsFile?: string;
  scheduledBackupRunsFile?: string;
  mysqlRetentionDays?: number;
  mssqlRetentionDays?: number;
  maxQueuedRunsPerJob?: number;
  maxFinishedScheduledRuns?: number;
  schedulerEnabled: boolean;
  mssql: MssqlConfig;
};

export function loadConfig(env = process.env): ManagerConfig {
  const projectRoot = path.resolve(env.MANAGER_PROJECT_ROOT ?? process.cwd());
  const backupRoot = path.resolve(projectRoot, env.BACKUP_ROOT_DIR ?? 'apps/jx-services/mount/database/backups');

  return {
    projectRoot,
    mysqlBackupDir: path.resolve(projectRoot, env.MYSQL_BACKUP_DIR ?? 'apps/jx-services/mount/database/backups/mysql'),
    mssqlBackupDir: path.resolve(projectRoot, env.MSSQL_BACKUP_DIR ?? 'apps/jx-services/mount/database/mssql/data/database_backups'),
    backupSchedule: env.BACKUP_SCHEDULE ?? '0 3 * * *',
    backupRetentionDays: Number(env.BACKUP_RETENTION_DAYS ?? '14'),
    backupMetadataFile: path.resolve(projectRoot, env.BACKUP_METADATA_FILE ?? path.join(backupRoot, 'backup-metadata.json')),
    backupScheduleFile: path.resolve(projectRoot, env.BACKUP_SCHEDULE_FILE ?? path.join(backupRoot, 'backup-schedules.json')),
    scheduledBackupJobsFile: path.resolve(projectRoot, env.SCHEDULED_BACKUP_JOBS_FILE ?? path.join(backupRoot, 'backup-scheduled-jobs.json')),
    scheduledBackupRunsFile: path.resolve(projectRoot, env.SCHEDULED_BACKUP_RUNS_FILE ?? path.join(backupRoot, 'backup-scheduled-job-runs.json')),
    mysqlRetentionDays: Number(env.MYSQL_RETENTION_DAYS ?? env.BACKUP_RETENTION_DAYS ?? '14'),
    mssqlRetentionDays: Number(env.MSSQL_RETENTION_DAYS ?? env.BACKUP_RETENTION_DAYS ?? '14'),
    maxQueuedRunsPerJob: Number(env.MAX_QUEUED_RUNS_PER_JOB ?? '100'),
    maxFinishedScheduledRuns: Number(env.MAX_FINISHED_SCHEDULED_RUNS ?? '1000'),
    schedulerEnabled: env.BACKUP_SCHEDULER_ENABLED === 'true',
    mssql: {
      host: normalizeMssqlHost(env.MSSQL_HOST ?? env.JX_MSSQL_IP),
      port: Number(env.MSSQL_PORT ?? '1433'),
      database: env.MSSQL_DATABASE ?? 'account_tong',
      user: env.MSSQL_USER ?? null,
      password: env.MSSQL_PASSWORD ?? null,
      encrypt: env.MSSQL_ENCRYPT === 'true',
      trustServerCertificate: env.MSSQL_TRUST_SERVER_CERTIFICATE !== 'false'
    }
  };
}

function normalizeMssqlHost(value: string | undefined) {
  if (!value || value === 'auto') {
    return 'localhost';
  }
  return value;
}
