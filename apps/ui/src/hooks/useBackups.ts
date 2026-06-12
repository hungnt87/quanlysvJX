import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { backupService } from '@/services/backupService';
import type { BackupKind, UploadBackupPayload, ScheduledBackupJob, BackupSettings } from '@/services/types';

export const backupKeys = {
  all: ['backups'] as const,
  lists: () => [...backupKeys.all, 'list'] as const,
  scheduledJobs: () => [...backupKeys.all, 'scheduledJobs'] as const,
  scheduledRuns: () => [...backupKeys.all, 'scheduledRuns'] as const,
  settings: () => [...backupKeys.all, 'settings'] as const,
};

export const useBackups = () => {
  const queryClient = useQueryClient();

  const backupsQuery = useQuery({
    queryKey: backupKeys.lists(),
    queryFn: backupService.getBackups,
  });

  const scheduledJobsQuery = useQuery({
    queryKey: backupKeys.scheduledJobs(),
    queryFn: backupService.getScheduledJobs,
  });

  const scheduledRunsQuery = useQuery({
    queryKey: backupKeys.scheduledRuns(),
    queryFn: backupService.getScheduledRuns,
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
    mutationFn: (payload: UploadBackupPayload) => backupService.uploadBackup(payload),
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

  const createScheduledJobMutation = useMutation({
    mutationFn: (payload: Omit<ScheduledBackupJob, 'id' | 'displayName' | 'createdAt' | 'updatedAt' | 'taskType'>) =>
      backupService.createScheduledJob(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: backupKeys.scheduledJobs() });
    },
  });

  const updateScheduledJobMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<Omit<ScheduledBackupJob, 'id' | 'displayName' | 'createdAt' | 'updatedAt' | 'taskType'>> }) =>
      backupService.updateScheduledJob(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: backupKeys.scheduledJobs() });
    },
  });

  const deleteScheduledJobMutation = useMutation({
    mutationFn: (id: string) => backupService.deleteScheduledJob(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: backupKeys.scheduledJobs() });
    },
  });

  const runScheduledJobNowMutation = useMutation({
    mutationFn: (id: string) => backupService.runScheduledJobNow(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: backupKeys.scheduledRuns() });
    },
  });

  const retryScheduledRunMutation = useMutation({
    mutationFn: (runId: string) => backupService.retryScheduledRun(runId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: backupKeys.scheduledRuns() });
    },
  });

  const saveBackupSettingsMutation = useMutation({
    mutationFn: (payload: BackupSettings) => backupService.saveBackupSettings(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: backupKeys.settings() });
    },
  });

  return {
    backups: backupsQuery.data ?? [],
    scheduledJobs: scheduledJobsQuery.data ?? [],
    scheduledRuns: scheduledRunsQuery.data ?? [],
    settings: settingsQuery.data,
    isLoading: backupsQuery.isLoading || scheduledJobsQuery.isLoading || scheduledRunsQuery.isLoading || settingsQuery.isLoading,
    isActionLoading:
      createBackupMutation.isPending ||
      uploadBackupMutation.isPending ||
      updateBackupMutation.isPending ||
      deleteBackupMutation.isPending ||
      restoreBackupMutation.isPending ||
      createScheduledJobMutation.isPending ||
      updateScheduledJobMutation.isPending ||
      deleteScheduledJobMutation.isPending ||
      runScheduledJobNowMutation.isPending ||
      retryScheduledRunMutation.isPending ||
      saveBackupSettingsMutation.isPending,
    createBackup: createBackupMutation.mutateAsync,
    uploadBackup: uploadBackupMutation.mutateAsync,
    updateBackup: updateBackupMutation.mutateAsync,
    deleteBackup: deleteBackupMutation.mutateAsync,
    restoreBackup: restoreBackupMutation.mutateAsync,
    createScheduledJob: createScheduledJobMutation.mutateAsync,
    updateScheduledJob: updateScheduledJobMutation.mutateAsync,
    deleteScheduledJob: deleteScheduledJobMutation.mutateAsync,
    runScheduledJobNow: runScheduledJobNowMutation.mutateAsync,
    retryScheduledRun: retryScheduledRunMutation.mutateAsync,
    saveBackupSettings: saveBackupSettingsMutation.mutateAsync,
  };
};
