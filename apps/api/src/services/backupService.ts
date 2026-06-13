import crypto from 'node:crypto';
import type { BackupRepository } from '../repositories/backupRepository.js';
import { NotFoundError } from '../utils/errors.js';
import { restoreMysql } from '../backups/mysqlBackup.js';
import { restoreMssql } from '../backups/mssqlBackup.js';

export class BackupService {
  constructor(
    private readonly backupRepository: BackupRepository,
    private readonly appDeps: any
  ) {}

  /**
   * Lấy danh sách files sao lưu
   */
  listBackups() {
    return this.backupRepository.listBackupFiles();
  }

  /**
   * Lấy danh sách các jobs tiến trình sao lưu hiện tại
   */
  listJobs() {
    return this.backupRepository.listJobs();
  }

  /**
   * Tạo lượt sao lưu thủ công
   */
  createManualBackup(database: 'mysql' | 'mssql') {
    return this.backupRepository.enqueueScheduledRun({
      jobId: null,
      jobDisplayName: null,
      database,
      trigger: 'manual',
      scheduledFor: new Date().toISOString(),
      scheduleSnapshot: null
    });
  }

  /**
   * Tạo lượt sao lưu thủ công cho cả 2 loại DB theo lô (batch)
   */
  createAllManualBackups() {
    const batchId = `batch_${crypto.randomUUID()}`;
    const mysqlRun = this.backupRepository.enqueueScheduledRun({
      jobId: null,
      jobDisplayName: null,
      database: 'mysql',
      trigger: 'manual',
      scheduledFor: new Date().toISOString(),
      scheduleSnapshot: null,
      batchId
    });

    const mssqlRun = this.backupRepository.enqueueScheduledRun({
      jobId: null,
      jobDisplayName: null,
      database: 'mssql',
      trigger: 'manual',
      scheduledFor: new Date().toISOString(),
      scheduleSnapshot: null,
      batchId
    });

    return { mysql: mysqlRun, mssql: mssqlRun };
  }

  /**
   * Tải tệp sao lưu lên hệ thống
   */
  uploadBackup(kind: 'mysql' | 'mssql', filename: string, note: string | null, data: Buffer) {
    return this.backupRepository.writeUploadedBackupFile({
      kind,
      filename,
      note,
      data
    });
  }

  /**
   * Cập nhật thông tin tệp sao lưu (đổi tên/note)
   */
  updateBackup(kind: 'mysql' | 'mssql', filename: string, nextFilename: string, note: string | null) {
    return this.backupRepository.renameBackupFile({
      kind,
      filename,
      nextFilename,
      note
    });
  }

  /**
   * Xóa tệp sao lưu
   */
  deleteBackup(kind: 'mysql' | 'mssql', filename: string) {
    return this.backupRepository.deleteBackupFile({
      kind,
      filename
    });
  }

  /**
   * Phục hồi cơ sở dữ liệu MySQL
   */
  async restoreMysql(filename: string) {
    const dir = this.backupRepository.getBackupDirectory('mysql');
    this.backupRepository.assertBackupFile(dir, filename);

    return this.runJob(
      { kind: 'restore', database: 'mysql', trigger: 'restore' },
      () => restoreMysql(this.appDeps, filename)
    );
  }

  /**
   * Phục hồi cơ sở dữ liệu MSSQL
   */
  async restoreMssql(filename: string) {
    const dir = this.backupRepository.getBackupDirectory('mssql');
    this.backupRepository.assertBackupFile(dir, filename);

    return this.runJob(
      { kind: 'restore', database: 'mssql', trigger: 'restore' },
      () => restoreMssql(this.appDeps, filename)
    );
  }

  private async runJob<T extends object>(input: any, action: () => Promise<T>) {
    const job = this.backupRepository.startJob(input);
    try {
      const result = await action();
      this.backupRepository.finishJob(job.id, 'succeeded');
      return { ...result, jobId: job.id };
    } catch (error) {
      this.backupRepository.finishJob(job.id, 'failed', error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }

  // Lịch chạy tự động (Scheduled Backup Jobs)
  getScheduledJobs() {
    const data = this.backupRepository.readScheduledJobs();
    return data.jobs.filter((job: any) => job.deletedAt === null);
  }

  createScheduledJob(body: any) {
    return this.backupRepository.createScheduledJob(body);
  }

  updateScheduledJob(id: string, body: any) {
    return this.backupRepository.updateScheduledJob(id, body);
  }

  deleteScheduledJob(id: string) {
    return this.backupRepository.deleteScheduledJob(id);
  }

  runScheduledJobNow(id: string) {
    const jobsData = this.backupRepository.readScheduledJobs();
    const job = jobsData.jobs.find((j: any) => j.id === id && j.deletedAt === null);

    if (!job) {
      throw new NotFoundError('Không tìm thấy job hoặc job đã bị xóa.');
    }

    return this.backupRepository.enqueueScheduledRun({
      jobId: job.id,
      jobDisplayName: job.displayName,
      database: job.database,
      trigger: 'manual',
      scheduledFor: new Date().toISOString(),
      scheduleSnapshot: job.schedule
    });
  }

  listScheduledRuns(query: { database?: string; status?: string; trigger?: string; jobId?: string }) {
    const runs = this.backupRepository.listScheduledRuns();
    const filtered = runs.filter((run: any) => {
      if (query.database && run.database !== query.database) return false;
      if (query.status && run.status !== query.status) return false;
      if (query.trigger && run.trigger !== query.trigger) return false;
      if (query.jobId && run.jobId !== query.jobId) return false;
      return true;
    });

    filtered.sort((a: any, b: any) => new Date(b.queuedAt).getTime() - new Date(a.queuedAt).getTime());
    return filtered;
  }

  retryScheduledRun(runId: string) {
    const runsData = this.backupRepository.readScheduledRuns();
    const oldRun = runsData.runs.find((r: any) => r.runId === runId);

    if (!oldRun) {
      throw new NotFoundError('Không tìm thấy lượt chạy.');
    }

    return this.backupRepository.enqueueScheduledRun({
      jobId: oldRun.jobId,
      jobDisplayName: oldRun.jobDisplayName,
      database: oldRun.database,
      trigger: 'retry',
      scheduledFor: new Date().toISOString(),
      scheduleSnapshot: oldRun.scheduleSnapshot
    });
  }

  getBackupSettings(config: any) {
    const defaultConfig = {
      mysqlRetentionDays: config.mysqlRetentionDays ?? 14,
      mssqlRetentionDays: config.mssqlRetentionDays ?? 14
    };
    const settings = this.backupRepository.readSettings(defaultConfig);

    return {
      mysqlBackupDir: config.mysqlBackupDir,
      mssqlBackupDir: config.mssqlBackupDir,
      backupMetadataFile: config.backupMetadataFile,
      backupScheduleFile: config.backupScheduleFile,
      scheduledBackupJobsFile: config.scheduledBackupJobsFile,
      scheduledBackupRunsFile: config.scheduledBackupRunsFile,
      mysqlRetentionDays: settings.mysqlRetentionDays,
      mssqlRetentionDays: settings.mssqlRetentionDays
    };
  }

  saveBackupSettings(body: any) {
    this.backupRepository.writeSettings(body);
  }
}
