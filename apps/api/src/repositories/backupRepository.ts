import { listBackupFiles, renameBackupFile, deleteBackupFile, writeUploadedBackupFile } from '../backups/backupFiles.js';
import { getBackupDirectory, assertBackupFile } from '../backups/backupPaths.js';
import {
  readScheduledBackupJobs,
  createScheduledBackupJob,
  updateScheduledBackupJob,
  softDeleteScheduledBackupJob,
  readBackupSettings,
  writeBackupSettings
} from '../scheduledBackups/scheduledBackupJobs.js';
import {
  enqueueScheduledBackupRun,
  listScheduledBackupRuns,
  readScheduledBackupRuns
} from '../scheduledBackups/scheduledBackupRuns.js';
import { backupJobStore, type StartJobInput } from '../backups/backupJobs.js';

export class BackupRepository {
  constructor(private readonly config: any) {}

  listBackupFiles() {
    return listBackupFiles(this.config);
  }

  getBackupDirectory(kind: 'mysql' | 'mssql') {
    return getBackupDirectory(kind, this.config);
  }

  assertBackupFile(dir: string, filename: string) {
    assertBackupFile(dir, filename);
  }

  writeUploadedBackupFile(options: {
    kind: 'mysql' | 'mssql';
    filename: string;
    note: string | null;
    data: Buffer;
  }) {
    return writeUploadedBackupFile({
      ...this.config,
      ...options
    });
  }

  renameBackupFile(options: {
    kind: 'mysql' | 'mssql';
    filename: string;
    nextFilename: string;
    note: string | null;
  }) {
    return renameBackupFile({
      ...this.config,
      ...options
    });
  }

  deleteBackupFile(options: { kind: 'mysql' | 'mssql'; filename: string }) {
    return deleteBackupFile({
      ...this.config,
      ...options
    });
  }

  listJobs() {
    return backupJobStore.listJobs();
  }

  startJob(input: StartJobInput) {
    return backupJobStore.startJob(input);
  }

  finishJob(id: string, status: 'succeeded' | 'failed', error?: string) {
    backupJobStore.finishJob(id, status, error);
  }

  readScheduledJobs() {
    return readScheduledBackupJobs(this.config.scheduledBackupJobsFile);
  }

  createScheduledJob(data: any) {
    return createScheduledBackupJob(this.config.scheduledBackupJobsFile, data);
  }

  updateScheduledJob(id: string, data: any) {
    return updateScheduledBackupJob(this.config.scheduledBackupJobsFile, id, data);
  }

  deleteScheduledJob(id: string) {
    return softDeleteScheduledBackupJob(this.config.scheduledBackupJobsFile, id);
  }

  enqueueScheduledRun(runInput: any) {
    return enqueueScheduledBackupRun(
      this.config.scheduledBackupRunsFile,
      runInput,
      this.config.maxQueuedRunsPerJob,
      this.config.maxFinishedScheduledRuns
    );
  }

  listScheduledRuns() {
    return listScheduledBackupRuns(this.config.scheduledBackupRunsFile);
  }

  readScheduledRuns() {
    return readScheduledBackupRuns(this.config.scheduledBackupRunsFile);
  }

  readSettings(defaultConfig: any) {
    return readBackupSettings(this.config.scheduledBackupJobsFile, defaultConfig);
  }

  writeSettings(settings: any) {
    writeBackupSettings(this.config.scheduledBackupJobsFile, settings);
  }
}
