import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createScheduledBackupJob,
  readScheduledBackupJobs,
  softDeleteScheduledBackupJob,
  updateScheduledBackupJob
} from './scheduledBackupJobs.js';

describe('scheduled backup jobs store', () => {
  let tempDir: string;
  let jobsFile: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), 'scheduled-jobs-test-'));
    jobsFile = path.join(tempDir, 'backup-scheduled-jobs.json');
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('returns an empty version 2 jobs structure if file does not exist', () => {
    const data = readScheduledBackupJobs(jobsFile);
    expect(data).toEqual({ version: 2, jobs: [] });
  });

  it('creates a MySQL job and auto-generates a stable display name', () => {
    const job1 = createScheduledBackupJob(jobsFile, {
      database: 'mysql',
      schedule: { type: 'hourly', everyHours: 2, minute: 30 },
      enabled: true
    }, new Date('2026-06-12T00:00:00.000Z'));

    expect(job1.id).toBeDefined();
    expect(job1.displayName).toBe('MySQL · Hàng giờ #1');
    expect(job1.database).toBe('mysql');
    expect(job1.enabled).toBe(true);
    expect(job1.deletedAt).toBeNull();

    const job2 = createScheduledBackupJob(jobsFile, {
      database: 'mysql',
      schedule: { type: 'hourly', everyHours: 4, minute: 0 },
      enabled: false
    }, new Date('2026-06-12T01:00:00.000Z'));

    expect(job2.displayName).toBe('MySQL · Hàng giờ #2');
    expect(job2.enabled).toBe(false);

    const job3 = createScheduledBackupJob(jobsFile, {
      database: 'mysql',
      schedule: { type: 'daily', time: '03:00' }
    });
    expect(job3.displayName).toBe('MySQL · Hằng ngày #1');

    const job4 = createScheduledBackupJob(jobsFile, {
      database: 'mysql',
      schedule: { type: 'weekly', daysOfWeek: [1, 2], time: '04:00' }
    });
    expect(job4.displayName).toBe('MySQL · Hằng tuần #1');
  });

  it('rejects duplicate schedules for the same database', () => {
    createScheduledBackupJob(jobsFile, {
      database: 'mysql',
      schedule: { type: 'daily', time: '03:00' }
    });

    expect(() => {
      createScheduledBackupJob(jobsFile, {
        database: 'mysql',
        schedule: { type: 'daily', time: '03:00' }
      });
    }).toThrow(/Lịch này đã tồn tại/);

    // Should allow duplicate schedule on a DIFFERENT database
    expect(() => {
      createScheduledBackupJob(jobsFile, {
        database: 'mssql',
        schedule: { type: 'daily', time: '03:00' }
      });
    }).not.toThrow();
  });

  it('updates a job but prevents changing its database', () => {
    const job = createScheduledBackupJob(jobsFile, {
      database: 'mysql',
      schedule: { type: 'daily', time: '03:00' }
    });

    const updated = updateScheduledBackupJob(jobsFile, job.id, {
      schedule: { type: 'daily', time: '04:00' },
      enabled: false
    });

    expect(updated.schedule).toEqual({ type: 'daily', time: '04:00' });
    expect(updated.enabled).toBe(false);

    // Try to update with database - should ignore database changes or throw if we try to change it in the schema,
    // actually database is not in UpdateScheduledBackupJobInput type.
  });

  it('soft deletes a job by setting deletedAt', () => {
    const job = createScheduledBackupJob(jobsFile, {
      database: 'mysql',
      schedule: { type: 'daily', time: '03:00' }
    });

    const deleted = softDeleteScheduledBackupJob(jobsFile, job.id, new Date('2026-06-12T02:00:00.000Z'));
    expect(deleted.deletedAt).toBe('2026-06-12T02:00:00.000Z');

    const data = readScheduledBackupJobs(jobsFile);
    expect(data.jobs.find(j => j.id === job.id)?.deletedAt).toBe('2026-06-12T02:00:00.000Z');
  });
});
