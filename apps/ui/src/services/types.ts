export type ApiResponse<T> =
  | { status: 'success'; message?: string; data: T }
  | { status: 'error'; message: string; errors?: Array<{ field: string; message: string }> };

export type ApiEnvelope<T> = ApiResponse<T>;

export type ServiceStatus = {
  name: string;
  containerName: string;
  state: string;
  health: string;
  image: string;
  ports: string[];
  startedAt: string | null;
  imageExists: boolean;
  hasBuild: boolean;
  imageName: string;
};

export type GameVersion = {
  name: string;
  path: string;
  uploadedAt: string;
  isActive: boolean;
};

export type VersionListResponse = {
  activeVersion: string | null;
  versions: GameVersion[];
};

export type BackupKind = 'mysql' | 'mssql';

export type UploadBackupPayload = {
  kind: BackupKind;
  file: File;
  filename: string;
  note: string | null;
};

export type BackupFile = {
  kind: BackupKind;
  filename: string;
  size: number;
  modifiedAt: string;
  note: string | null;
  source: 'generated' | 'uploaded';
  uploadedAt: string | null;
  isLatest: boolean;
  generatedBy?: {
    runId: string | null;
    jobId: string | null;
    jobDisplayName?: string | null;
    trigger: 'schedule' | 'manual' | 'retry';
    batchId: string | null;
    scheduledFor?: string | null;
    generatedAt?: string | null;
    scheduleSnapshot?: BackupScheduleRule | null;
  } | null;
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
  scheduler?: {
    enabled: boolean;
    serverTime: string;
  };
  schedules: Record<BackupKind, DatabaseBackupSchedule>;
  status?: Record<
    BackupKind,
    {
      lastRunAt: string | null;
      nextRunAt: string | null;
      scheduledToday?: boolean;
      runsToday: boolean;
    }
  >;
};

export type BackupScheduleRule =
  | { type: 'hourly'; everyHours: number; minute: number }
  | { type: 'daily'; time: string }
  | { type: 'weekly'; daysOfWeek: number[]; time: string };

export type ScheduledBackupJob = {
  id: string;
  displayName: string;
  enabled: boolean;
  taskType: 'backup';
  database: BackupKind;
  schedule: BackupScheduleRule;
  nextRunPreviewAt?: string | null;
  summaryVi?: string;
  createdAt: string;
  updatedAt: string;
};

export type ScheduledBackupRun = {
  runId: string;
  batchId: string | null;
  jobId: string;
  jobDisplayName: string;
  database: BackupKind;
  trigger: 'schedule' | 'manual' | 'retry';
  scheduledFor: string;
  queuedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'skipped';
  error: string | null;
  backupFilename: string | null;
  scheduleSnapshot: BackupScheduleRule | null;
};

export type BackupSettings = {
  mysqlRetentionDays: number;
  mssqlRetentionDays: number;
};

export type GameAccountStatus = 'active' | 'banned';

export type GameAccount = {
  accountName: string;
  expiresAt: string | null;
  leftSeconds: number | null;
  usedSeconds: number | null;
  status: GameAccountStatus;
};

export type GameAccountListResponse = {
  items: GameAccount[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

export type CreateGameAccountPayload = {
  accountName: string;
  password: string;
  secondaryPassword: string;
  expiresAt: string;
  leftSeconds: number;
};

export type UpdateGameAccountPayload = {
  password?: string;
  secondaryPassword?: string;
  expiresAt: string;
  leftSeconds: number;
};

export type GameNetworkConfig = {
  jxIp: string;
  mysqlIp: string;
  paysysIp: string;
  mssqlIp: string;
};

export type ServerIpChoice = {
  address: string;
  interfaceName: string;
  kind: 'host' | 'vpn';
};

export type SystemInfo = {
  serverTime: string;
  timezone: string;
  ipChoices: string[];
  serverIpChoices?: ServerIpChoice[];
  serverIp: string;
  mysqlIp: string;
  mssqlIp: string;
  gameNetwork: GameNetworkConfig;
  coreServicesRunning: boolean;
  runningCoreServices: string[];
};

export type SaveGameNetworkResponse = {
  gameNetwork: GameNetworkConfig;
  message: string;
};
