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
