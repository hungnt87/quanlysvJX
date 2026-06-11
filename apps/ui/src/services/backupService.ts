import ApiService from './base/apiService';
import type {
  BackupList,
  BackupFile,
  BackupJob,
  BackupScheduleConfig,
  DatabaseBackupSchedule,
  BackupSettings,
  BackupKind,
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
    const res = await ApiService.fetchData<any, unknown>({
      url: `/api/backups/${kind}`,
      method: 'POST',
    });
    return res.data;
  },
  uploadBackup: async (kind: BackupKind, file: File) => {
    const form = new FormData();
    form.append('file', file);
    const res = await ApiService.fetchData<FormData, BackupFile>({
      url: `/api/backups/${kind}/upload`,
      method: 'POST',
      data: form,
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
  getJobs: async () => {
    const res = await ApiService.fetchData<any, BackupJob[]>({
      url: '/api/jobs',
      method: 'GET',
    });
    return res.data;
  },
  getSchedules: async () => {
    const res = await ApiService.fetchData<any, BackupScheduleConfig>({
      url: '/api/backup-schedules',
      method: 'GET',
    });
    return res.data;
  },
  saveSchedule: async (kind: BackupKind, schedule: DatabaseBackupSchedule) => {
    const res = await ApiService.fetchData<any, BackupScheduleConfig>({
      url: `/api/backup-schedules/${kind}`,
      method: 'PUT',
      data: schedule,
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
};
