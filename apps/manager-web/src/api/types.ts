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

export type BackupFile = {
  filename: string;
  size: number;
  modifiedAt: string;
};

export type BackupList = {
  mysql: BackupFile[];
  mssql: BackupFile[];
};
