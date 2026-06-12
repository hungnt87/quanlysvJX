import ApiService from './base/apiService';
import type {
  BackupList,
  BackupFile,
  BackupSettings,
  BackupKind,
  UploadBackupPayload,
  ScheduledBackupJob,
  ScheduledBackupRun,
} from './types';

export const backupService = {
  getBackups: async () => {
    const res = await ApiService.fetchData<any, BackupList>({
      url: '/api/backups',
      method: 'GET',
    });
    return res.data;
  },
  createBackup: async (kind: BackupKind | 'all') => {
    const res = await ApiService.fetchData<any, ScheduledBackupRun[]>({
      url: `/api/backups/${kind}`,
      method: 'POST',
    });
    return res.data;
  },
  uploadBackup: async ({ kind, file, filename, note }: UploadBackupPayload) => {
    const form = new FormData();
    form.append('filename', filename);
    form.append('note', note ?? '');
    form.append('file', file);
    const res = await ApiService.fetchData<FormData, BackupFile>({
      url: `/api/backups/${kind}/upload`,
      method: 'POST',
      data: form,
      timeout: 0,
    });
    return res.data;
  },
  updateBackup: async (
    kind: BackupKind,
    currentFilename: string,
    payload: { filename: string; note: string | null }
  ) => {
    const res = await ApiService.fetchData<any, BackupFile>({
      url: `/api/backups/${kind}/${encodeURIComponent(currentFilename)}`,
      method: 'PATCH',
      data: payload,
    });
    return res.data;
  },
  deleteBackup: async (kind: BackupKind, filename: string) => {
    const res = await ApiService.fetchData<any, { filename: string }>({
      url: `/api/backups/${kind}/${encodeURIComponent(filename)}`,
      method: 'DELETE',
    });
    return res.data;
  },
  restoreBackup: async (kind: BackupKind, filename: string) => {
    const res = await ApiService.fetchData<any, unknown>({
      url: `/api/restores/${kind}`,
      method: 'POST',
      data: { filename },
    });
    return res.data;
  },
  getScheduledJobs: async () => {
    const res = await ApiService.fetchData<any, ScheduledBackupJob[]>({
      url: '/api/scheduled-jobs',
      method: 'GET',
    });
    return res.data;
  },
  createScheduledJob: async (payload: Omit<ScheduledBackupJob, 'id' | 'displayName' | 'createdAt' | 'updatedAt' | 'taskType'>) => {
    const res = await ApiService.fetchData<any, ScheduledBackupJob>({
      url: '/api/scheduled-jobs',
      method: 'POST',
      data: payload,
    });
    return res.data;
  },
  updateScheduledJob: async (
    id: string,
    payload: Partial<Omit<ScheduledBackupJob, 'id' | 'displayName' | 'createdAt' | 'updatedAt' | 'taskType'>>
  ) => {
    const res = await ApiService.fetchData<any, ScheduledBackupJob>({
      url: `/api/scheduled-jobs/${id}`,
      method: 'PUT',
      data: payload,
    });
    return res.data;
  },
  deleteScheduledJob: async (id: string) => {
    const res = await ApiService.fetchData<any, ScheduledBackupJob>({
      url: `/api/scheduled-jobs/${id}`,
      method: 'DELETE',
    });
    return res.data;
  },
  runScheduledJobNow: async (id: string) => {
    const res = await ApiService.fetchData<any, ScheduledBackupRun>({
      url: `/api/scheduled-jobs/${id}/run`,
      method: 'POST',
    });
    return res.data;
  },
  getScheduledRuns: async () => {
    const res = await ApiService.fetchData<any, ScheduledBackupRun[]>({
      url: '/api/scheduled-job-runs',
      method: 'GET',
    });
    return res.data;
  },
  retryScheduledRun: async (runId: string) => {
    const res = await ApiService.fetchData<any, ScheduledBackupRun>({
      url: `/api/scheduled-job-runs/${runId}/retry`,
      method: 'POST',
    });
    return res.data;
  },
  getBackupSettings: async () => {
    const res = await ApiService.fetchData<any, BackupSettings>({
      url: '/api/backup-settings',
      method: 'GET',
    });
    return res.data;
  },
  saveBackupSettings: async (payload: BackupSettings) => {
    const res = await ApiService.fetchData<any, BackupSettings>({
      url: '/api/backup-settings',
      method: 'PUT',
      data: payload,
    });
    return res.data;
  },
};
