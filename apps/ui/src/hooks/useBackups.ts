import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { backupService } from '@/services/backupService';
import type { BackupKind, DatabaseBackupSchedule } from '@/services/types';

export const backupKeys = {
  all: ['backups'] as const,
  lists: () => [...backupKeys.all, 'list'] as const,
  jobs: () => [...backupKeys.all, 'jobs'] as const,
  schedules: () => [...backupKeys.all, 'schedules'] as const,
  settings: () => [...backupKeys.all, 'settings'] as const,
};

export const useBackups = () => {
  const queryClient = useQueryClient();

  const backupsQuery = useQuery({
    queryKey: backupKeys.lists(),
    queryFn: backupService.getBackups,
  });

  const jobsQuery = useQuery({
    queryKey: backupKeys.jobs(),
    queryFn: backupService.getJobs,
  });

  const schedulesQuery = useQuery({
    queryKey: backupKeys.schedules(),
    queryFn: backupService.getSchedules,
  });

  const settingsQuery = useQuery({
    queryKey: backupKeys.settings(),
    queryFn: backupService.getBackupSettings,
  });

  const createBackupMutation = useMutation({
    mutationFn: (kind: BackupKind | 'all') => backupService.createBackup(kind),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: backupKeys.all });
    },
  });

  const uploadBackupMutation = useMutation({
    mutationFn: ({ kind, file }: { kind: BackupKind; file: File }) =>
      backupService.uploadBackup(kind, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: backupKeys.all });
    },
  });

  const updateBackupMutation = useMutation({
    mutationFn: ({
      kind,
      currentFilename,
      payload,
    }: {
      kind: BackupKind;
      currentFilename: string;
      payload: { filename: string; note: string | null };
    }) => backupService.updateBackup(kind, currentFilename, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: backupKeys.all });
    },
  });

  const deleteBackupMutation = useMutation({
    mutationFn: ({ kind, filename }: { kind: BackupKind; filename: string }) =>
      backupService.deleteBackup(kind, filename),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: backupKeys.all });
    },
  });

  const restoreBackupMutation = useMutation({
    mutationFn: ({ kind, filename }: { kind: BackupKind; filename: string }) =>
      backupService.restoreBackup(kind, filename),
  });

  const saveScheduleMutation = useMutation({
    mutationFn: ({ kind, schedule }: { kind: BackupKind; schedule: DatabaseBackupSchedule }) =>
      backupService.saveSchedule(kind, schedule),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: backupKeys.schedules() });
    },
  });

  return {
    backups: backupsQuery.data ?? [],
    jobs: jobsQuery.data ?? [],
    schedules: schedulesQuery.data,
    settings: settingsQuery.data,
    isLoading: backupsQuery.isLoading || jobsQuery.isLoading,
    createBackup: createBackupMutation.mutateAsync,
    uploadBackup: uploadBackupMutation.mutateAsync,
    updateBackup: updateBackupMutation.mutateAsync,
    deleteBackup: deleteBackupMutation.mutateAsync,
    restoreBackup: restoreBackupMutation.mutateAsync,
    saveSchedule: saveScheduleMutation.mutateAsync,
  };
};
