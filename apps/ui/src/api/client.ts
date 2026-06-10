import type {
  ApiEnvelope,
  BackupFile,
  BackupJob,
  BackupKind,
  BackupList,
  BackupScheduleConfig,
  BackupSettings,
  DatabaseBackupSchedule,
  ServiceStatus
} from './types';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const isFormData = init?.body instanceof FormData;
  const headers = init?.body === undefined || isFormData ? init?.headers : { 'Content-Type': 'application/json', ...init.headers };
  const response = await fetch(url, { ...init, headers });
  const body = (await response.json()) as ApiEnvelope<T>;

  if (!body.success) {
    throw new Error(body.error);
  }

  return body.data;
}

export const api = {
  services: () => request<ServiceStatus[]>('/api/services'),
  action: (service: string, action: 'start' | 'stop' | 'restart') =>
    request<{ message: string }>(`/api/services/${service}/${action}`, { method: 'POST' }),
  logs: (service: string, tail: number) =>
    request<{ service: string; tail: number; logs: string }>(`/api/services/${service}/logs?tail=${tail}`),
  logStreamUrl: (service: string, tail: number) => `/api/services/${service}/logs/stream?tail=${tail}`,
  backups: () => request<BackupList>('/api/backups'),
  backup: (kind: BackupKind | 'all') => request<unknown>(`/api/backups/${kind}`, { method: 'POST' }),
  uploadBackup: (kind: BackupKind, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<BackupFile>(`/api/backups/${kind}/upload`, { method: 'POST', body: form });
  },
  updateBackup: (kind: BackupKind, currentFilename: string, payload: { filename: string; note: string | null }) =>
    request<BackupFile>(`/api/backups/${kind}/${encodeURIComponent(currentFilename)}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteBackup: (kind: BackupKind, filename: string) =>
    request<{ filename: string }>(`/api/backups/${kind}/${encodeURIComponent(filename)}`, { method: 'DELETE' }),
  restore: (kind: BackupKind, filename: string) =>
    request<unknown>(`/api/restores/${kind}`, { method: 'POST', body: JSON.stringify({ filename }) }),
  jobs: () => request<BackupJob[]>('/api/jobs'),
  schedules: () => request<BackupScheduleConfig>('/api/backup-schedules'),
  saveSchedule: (kind: BackupKind, schedule: DatabaseBackupSchedule) =>
    request<BackupScheduleConfig>(`/api/backup-schedules/${kind}`, { method: 'PUT', body: JSON.stringify(schedule) }),
  backupSettings: () => request<BackupSettings>('/api/backup-settings')
};
