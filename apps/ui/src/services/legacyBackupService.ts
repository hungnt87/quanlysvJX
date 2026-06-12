import ApiService from '@/services/base/apiService';

export type LegacyBackupSettings = {
  mysqlBackupDir: string;
  mssqlBackupDir: string;
  backupMetadataFile: string;
  backupScheduleFile: string;
};

export const legacyBackupService = {
  getLegacySettings: async () => {
    const res = await ApiService.fetchData<any, LegacyBackupSettings>({
      url: '/api/backup-settings',
      method: 'GET',
    });
    return res.data;
  },
};
