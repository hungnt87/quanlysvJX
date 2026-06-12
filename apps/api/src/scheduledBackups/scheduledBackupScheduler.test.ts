import { rmSync, mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  tickScheduledBackupScheduler,
  performScheduledBackupStartupInit
} from './scheduledBackupScheduler.js';
import { readScheduledBackupJobs, createScheduledBackupJob } from './scheduledBackupJobs.js';
import { readScheduledBackupRuns } from './scheduledBackupRuns.js';

describe('scheduled backup scheduler', () => {
  let tempDir: string;
  let config: any;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), 'scheduler-test-'));
    config = {
      scheduledBackupJobsFile: path.join(tempDir, 'backup-scheduled-jobs.json'),
      scheduledBackupRunsFile: path.join(tempDir, 'backup-scheduled-job-runs.json'),
      backupScheduleFile: path.join(tempDir, 'backup-schedules.json'),
      mysqlRetentionDays: 14,
      mssqlRetentionDays: 14,
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

  it('deletes legacy schedules file if new jobs file does not exist on startup', () => {
    writeFileSync(config.backupScheduleFile, '{}', 'utf8');
    expect(existsSync(config.backupScheduleFile)).toBe(true);

    performScheduledBackupStartupInit(config, { info: () => {} });

    expect(existsSync(config.backupScheduleFile)).toBe(false);
    expect(existsSync(config.scheduledBackupJobsFile)).toBe(true);
    expect(existsSync(config.scheduledBackupRunsFile)).toBe(true);
  });

  it('enqueues a run when a job is enabled and due', () => {
    // Initialize empty stores
    performScheduledBackupStartupInit(config, { info: () => {} });

    // Create a job due at 03:00 daily
    createScheduledBackupJob(config.scheduledBackupJobsFile, {
      database: 'mysql',
      schedule: { type: 'daily', time: '03:00' },
      enabled: true
    });

    // Tick at 02:59 (not due)
    tickScheduledBackupScheduler(config, new Date('2026-06-12T02:59:00'));
    let runs = readScheduledBackupRuns(config.scheduledBackupRunsFile).runs;
    expect(runs).toHaveLength(0);

    // Tick at 03:00 (due)
    tickScheduledBackupScheduler(config, new Date('2026-06-12T03:00:00'));
    runs = readScheduledBackupRuns(config.scheduledBackupRunsFile).runs;
    expect(runs).toHaveLength(1);
    expect(runs[0]!.status).toBe('queued');

    // Tick again at 03:00 (should not enqueue duplicate for the same minute)
    tickScheduledBackupScheduler(config, new Date('2026-06-12T03:00:00'));
    runs = readScheduledBackupRuns(config.scheduledBackupRunsFile).runs;
    expect(runs).toHaveLength(1);
  });

  it('does not enqueue for disabled or deleted jobs', () => {
    performScheduledBackupStartupInit(config, { info: () => {} });

    // Create disabled job
    createScheduledBackupJob(config.scheduledBackupJobsFile, {
      database: 'mysql',
      schedule: { type: 'daily', time: '03:00' },
      enabled: false
    });

    tickScheduledBackupScheduler(config, new Date('2026-06-12T03:00:00'));
    let runs = readScheduledBackupRuns(config.scheduledBackupRunsFile).runs;
    expect(runs).toHaveLength(0);
  });
});
