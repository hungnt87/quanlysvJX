export type ApiResponse<T> =
  | { success: true; data: T; error: null }
  | { success: false; data: null; error: string };

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
