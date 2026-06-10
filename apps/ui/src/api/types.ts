export type ApiEnvelope<T> =
  | { success: true; data: T; error: null }
  | { success: false; data: null; error: string };

export type ServiceStatus = {
  name: string;
  containerName: string;
  state: string;
  health: string;
  image: string;
  ports: string[];
  startedAt: string | null;
};

export type BackupKind = 'mysql' | 'mssql';

export type BackupFile = {
  kind: BackupKind;
  filename: string;
  size: number;
  modifiedAt: string;
  note: string | null;
  source: 'generated' | 'uploaded';
  uploadedAt: string | null;
  isLatest: boolean;
};

export type BackupList = BackupFile[];

export type DatabaseBackupSchedule = {
  enabled: boolean;
  daysOfWeek: Array<0 | 1 | 2 | 3 | 4 | 5 | 6>;
  time: string;
  retentionDays: number;
  lastRunKey: string | null;
};

export type BackupScheduleConfig = {
  version: 1;
  schedules: Record<BackupKind, DatabaseBackupSchedule>;
};

export type BackupJob = {
  id: string;
  kind: string;
  database: BackupKind | 'all' | null;
  trigger: 'manual' | 'schedule' | 'restore' | 'upload';
  status: 'running' | 'succeeded' | 'failed';
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
};

export type BackupSettings = {
  mysqlBackupDir: string;
  mssqlBackupDir: string;
  backupMetadataFile: string;
  backupScheduleFile: string;
};
