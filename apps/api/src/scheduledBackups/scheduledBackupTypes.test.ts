import { describe, expect, it } from 'vitest';
import { scheduledBackupJobSchema, scheduledBackupRunSchema } from './scheduledBackupTypes.js';

describe('scheduled backup schemas', () => {
  it('accepts hourly, daily, and weekly schedules', () => {
    expect(scheduledBackupJobSchema.parse({
      id: 'job_1', displayName: 'MySQL · Hàng giờ #1', enabled: true,
      taskType: 'backup', database: 'mysql', deletedAt: null,
      createdAt: '2026-06-12T00:00:00.000Z', updatedAt: '2026-06-12T00:00:00.000Z',
      schedule: { type: 'hourly', everyHours: 2, minute: 30 }
    }).schedule.type).toBe('hourly');
    expect(scheduledBackupJobSchema.parse({
      id: 'job_2', displayName: 'MSSQL · Hằng ngày #1', enabled: true,
      taskType: 'backup', database: 'mssql', deletedAt: null,
      createdAt: '2026-06-12T00:00:00.000Z', updatedAt: '2026-06-12T00:00:00.000Z',
      schedule: { type: 'daily', time: '03:00' }
    }).schedule.type).toBe('daily');
    expect(scheduledBackupJobSchema.parse({
      id: 'job_3', displayName: 'MySQL · Hằng tuần #1', enabled: true,
      taskType: 'backup', database: 'mysql', deletedAt: null,
      createdAt: '2026-06-12T00:00:00.000Z', updatedAt: '2026-06-12T00:00:00.000Z',
      schedule: { type: 'weekly', daysOfWeek: [1, 3, 5], time: '03:00' }
    }).schedule.type).toBe('weekly');
  });

  it('rejects invalid weekly schedules and invalid hourly ranges', () => {
    expect(() => scheduledBackupJobSchema.parse({
      id: 'job_bad', displayName: 'Bad', enabled: true,
      taskType: 'backup', database: 'mysql', deletedAt: null,
      createdAt: '2026-06-12T00:00:00.000Z', updatedAt: '2026-06-12T00:00:00.000Z',
      schedule: { type: 'weekly', daysOfWeek: [], time: '03:00' }
    })).toThrow();
    expect(() => scheduledBackupJobSchema.parse({
      id: 'job_bad2', displayName: 'Bad', enabled: true,
      taskType: 'backup', database: 'mysql', deletedAt: null,
      createdAt: '2026-06-12T00:00:00.000Z', updatedAt: '2026-06-12T00:00:00.000Z',
      schedule: { type: 'hourly', everyHours: 25, minute: 0 }
    })).toThrow();
  });

  it('accepts queued run history records', () => {
    expect(scheduledBackupRunSchema.parse({
      runId: 'run_1', batchId: null, jobId: 'job_1', jobDisplayName: 'MySQL · Hàng giờ #1',
      database: 'mysql', trigger: 'schedule', scheduledFor: '2026-06-12T01:00:00.000Z',
      queuedAt: '2026-06-12T01:00:00.000Z', startedAt: null, finishedAt: null,
      status: 'queued', error: null, backupFilename: null,
      scheduleSnapshot: { type: 'hourly', everyHours: 1, minute: 0 }
    }).status).toBe('queued');
  });
});
