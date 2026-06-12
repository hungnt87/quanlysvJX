import { rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { processNextScheduledBackupRun } from './scheduledBackupWorker.js';
import { enqueueScheduledBackupRun, readScheduledBackupRuns } from './scheduledBackupRuns.js';

describe('scheduled backup worker', () => {
  let tempDir: string;
  let config: any;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), 'worker-test-'));
    config = {
      scheduledBackupJobsFile: path.join(tempDir, 'backup-scheduled-jobs.json'),
      scheduledBackupRunsFile: path.join(tempDir, 'backup-scheduled-job-runs.json'),
      maxQueuedRunsPerJob: 100,
      maxFinishedScheduledRuns: 1000
    };
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('keeps the run queued if the database is not healthy', async () => {
    enqueueScheduledBackupRun(config.scheduledBackupRunsFile, {
      jobId: 'job_1',
      jobDisplayName: 'MySQL #1',
      database: 'mysql',
      trigger: 'schedule',
      scheduledFor: '2026-06-12T03:00:00.000Z',
      scheduleSnapshot: null
    });

    const isDatabaseHealthy = vi.fn().mockResolvedValue(false);
    const runBackup = vi.fn();

    const result = await processNextScheduledBackupRun({
      config,
      database: 'mysql',
      isDatabaseHealthy,
      runBackup,
      logger: { info: () => {}, error: () => {} } as any
    });

    expect(result).toBeNull(); // No run processed because db not healthy
    expect(isDatabaseHealthy).toHaveBeenCalledWith('mysql');
    expect(runBackup).not.toHaveBeenCalled();

    const runs = readScheduledBackupRuns(config.scheduledBackupRunsFile).runs;
    expect(runs[0]!.status).toBe('queued'); // Still queued
  });

  it('runs backup and marks succeeded if backup succeeds', async () => {
    enqueueScheduledBackupRun(config.scheduledBackupRunsFile, {
      jobId: 'job_1',
      jobDisplayName: 'MySQL #1',
      database: 'mysql',
      trigger: 'schedule',
      scheduledFor: '2026-06-12T03:00:00.000Z',
      scheduleSnapshot: null
    });

    const isDatabaseHealthy = vi.fn().mockResolvedValue(true);
    const runBackup = vi.fn().mockResolvedValue({ filename: 'mysql-backup.sql.gz' });

    const result = await processNextScheduledBackupRun({
      config,
      database: 'mysql',
      isDatabaseHealthy,
      runBackup,
      logger: { info: () => {}, error: () => {} } as any
    });

    expect(result).not.toBeNull();
    expect(result?.status).toBe('succeeded');
    expect(result?.backupFilename).toBe('mysql-backup.sql.gz');
    expect(runBackup).toHaveBeenCalled();

    const runs = readScheduledBackupRuns(config.scheduledBackupRunsFile).runs;
    expect(runs[0]!.status).toBe('succeeded');
    expect(runs[0]!.backupFilename).toBe('mysql-backup.sql.gz');
  });

  it('marks run as failed if backup throws an error', async () => {
    enqueueScheduledBackupRun(config.scheduledBackupRunsFile, {
      jobId: 'job_1',
      jobDisplayName: 'MySQL #1',
      database: 'mysql',
      trigger: 'schedule',
      scheduledFor: '2026-06-12T03:00:00.000Z',
      scheduleSnapshot: null
    });

    const isDatabaseHealthy = vi.fn().mockResolvedValue(true);
    const runBackup = vi.fn().mockRejectedValue(new Error('Disk Full'));

    const result = await processNextScheduledBackupRun({
      config,
      database: 'mysql',
      isDatabaseHealthy,
      runBackup,
      logger: { info: () => {}, error: () => {} } as any
    });

    expect(result).not.toBeNull();
    expect(result?.status).toBe('failed');
    expect(result?.error).toContain('Disk Full');

    const runs = readScheduledBackupRuns(config.scheduledBackupRunsFile).runs;
    expect(runs[0]!.status).toBe('failed');
    expect(runs[0]!.error).toContain('Disk Full');
  });
});
