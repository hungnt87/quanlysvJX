import { rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  readScheduledBackupRuns,
  enqueueScheduledBackupRun,
  cancelQueuedRunsForJob,
  markStaleRunningRunsFailed,
  startNextQueuedRunForDatabase,
  finishScheduledBackupRun,
  listScheduledBackupRuns
} from './scheduledBackupRuns.js';

describe('scheduled backup runs store', () => {
  let tempDir: string;
  let runsFile: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), 'scheduled-runs-test-'));
    runsFile = path.join(tempDir, 'backup-scheduled-job-runs.json');
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('returns an empty version 1 runs structure if file does not exist', () => {
    const data = readScheduledBackupRuns(runsFile);
    expect(data.version).toBe(1);
    expect(data.runs).toEqual([]);
  });

  it('enqueues a run and returns it with status queued', () => {
    const run = enqueueScheduledBackupRun(
      runsFile,
      {
        jobId: 'job_1',
        jobDisplayName: 'MySQL · Hàng giờ #1',
        database: 'mysql',
        trigger: 'schedule',
        scheduledFor: '2026-06-12T01:00:00.000Z',
        scheduleSnapshot: { type: 'hourly', everyHours: 1, minute: 0 }
      },
      100, // maxQueuedRunsPerJob
      1000, // maxFinishedRuns
      new Date('2026-06-12T01:00:00.000Z')
    );

    expect(run.runId).toBeDefined();
    expect(run.status).toBe('queued');
    expect(run.queuedAt).toBe('2026-06-12T01:00:00.000Z');
    expect(run.scheduledFor).toBe('2026-06-12T01:00:00.000Z');

    const data = readScheduledBackupRuns(runsFile);
    expect(data.runs).toHaveLength(1);
    expect(data.runs[0]!.runId).toBe(run.runId);
  });

  it('enqueues as skipped if the queue limit is exceeded', () => {
    // Fill the queue
    for (let i = 0; i < 3; i++) {
      enqueueScheduledBackupRun(
        runsFile,
        {
          jobId: 'job_1',
          jobDisplayName: 'MySQL · Hàng giờ #1',
          database: 'mysql',
          trigger: 'schedule',
          scheduledFor: `2026-06-12T0${i}:00:00.000Z`,
          scheduleSnapshot: { type: 'hourly', everyHours: 1, minute: 0 }
        },
        3, // maxQueuedRunsPerJob = 3
        1000
      );
    }

    // Attempting a 4th should result in status 'skipped' due to queue limit
    const skippedRun = enqueueScheduledBackupRun(
      runsFile,
      {
        jobId: 'job_1',
        jobDisplayName: 'MySQL · Hàng giờ #1',
        database: 'mysql',
        trigger: 'schedule',
        scheduledFor: '2026-06-12T04:00:00.000Z',
        scheduleSnapshot: { type: 'hourly', everyHours: 1, minute: 0 }
      },
      3, // maxQueued = 3
      1000,
      new Date('2026-06-12T04:00:00.000Z')
    );

    expect(skippedRun.status).toBe('skipped');
    expect(skippedRun.error).toContain('hàng đợi đầy');
  });

  it('cancels queued runs for a job', () => {
    enqueueScheduledBackupRun(
      runsFile,
      {
        jobId: 'job_1',
        jobDisplayName: 'MySQL · Hàng giờ #1',
        database: 'mysql',
        trigger: 'schedule',
        scheduledFor: '2026-06-12T01:00:00.000Z',
        scheduleSnapshot: { type: 'hourly', everyHours: 1, minute: 0 }
      },
      100,
      1000
    );

    const cancelled = cancelQueuedRunsForJob(runsFile, 'job_1', 'Job disabled', new Date('2026-06-12T01:10:00.000Z'));
    expect(cancelled).toHaveLength(1);
    expect(cancelled[0]!.status).toBe('cancelled');
    expect(cancelled[0]!.finishedAt).toBe('2026-06-12T01:10:00.000Z');
    expect(cancelled[0]!.error).toBe('Job disabled');

    const data = readScheduledBackupRuns(runsFile);
    expect(data.runs[0]!.status).toBe('cancelled');
  });

  it('marks running runs as failed on startup recovery', () => {
    // Write a file with a running run
    const initialData = {
      version: 1,
      runs: [
        {
          runId: 'run_running',
          batchId: null,
          jobId: 'job_1',
          jobDisplayName: 'MySQL · Hàng giờ #1',
          database: 'mysql',
          trigger: 'schedule',
          scheduledFor: '2026-06-12T01:00:00.000Z',
          queuedAt: '2026-06-12T01:00:00.000Z',
          startedAt: '2026-06-12T01:01:00.000Z',
          finishedAt: null,
          status: 'running',
          error: null,
          backupFilename: null,
          scheduleSnapshot: null
        }
      ]
    };
    const fs = require('node:fs');
    fs.writeFileSync(runsFile, JSON.stringify(initialData, null, 2));

    const recovered = markStaleRunningRunsFailed(runsFile, new Date('2026-06-12T02:00:00.000Z'));
    expect(recovered).toHaveLength(1);
    expect(recovered[0]!.status).toBe('failed');
    expect(recovered[0]!.finishedAt).toBe('2026-06-12T02:00:00.000Z');
    expect(recovered[0]!.error).toContain('API khởi động lại trước khi job hoàn tất');
  });

  it('starts the next queued run for database', () => {
    enqueueScheduledBackupRun(runsFile, {
      jobId: 'job_1',
      jobDisplayName: 'MySQL #1',
      database: 'mysql',
      trigger: 'schedule',
      scheduledFor: '2026-06-12T02:00:00.000Z',
      scheduleSnapshot: null
    }, 100, 1000);

    enqueueScheduledBackupRun(runsFile, {
      jobId: 'job_1',
      jobDisplayName: 'MySQL #1',
      database: 'mysql',
      trigger: 'schedule',
      scheduledFor: '2026-06-12T01:00:00.000Z',
      scheduleSnapshot: null
    }, 100, 1000);

    // Should pull scheduledFor 01:00 first
    const next = startNextQueuedRunForDatabase(runsFile, 'mysql', new Date('2026-06-12T01:05:00.000Z'));
    expect(next).not.toBeNull();
    expect(next?.scheduledFor).toBe('2026-06-12T01:00:00.000Z');
    expect(next?.status).toBe('running');
    expect(next?.startedAt).toBe('2026-06-12T01:05:00.000Z');
  });

  it('prunes old finished runs keeping only newest', () => {
    // Add 1005 finished runs
    const data = {
      version: 1,
      runs: [] as any[]
    };
    for (let i = 0; i < 1005; i++) {
      data.runs.push({
        runId: `run_${i}`,
        batchId: null,
        jobId: 'job_1',
        jobDisplayName: 'MySQL #1',
        database: 'mysql',
        trigger: 'schedule',
        scheduledFor: `2026-06-12T00:00:00.000Z`,
        queuedAt: `2026-06-12T00:00:00.000Z`,
        startedAt: `2026-06-12T00:00:00.000Z`,
        finishedAt: `2026-06-12T00:00:00.000Z`,
        status: 'succeeded',
        error: null,
        backupFilename: `file_${i}.sql.gz`,
        scheduleSnapshot: null
      });
    }
    const fs = require('node:fs');
    fs.writeFileSync(runsFile, JSON.stringify(data, null, 2));

    // Enqueue a new run which triggers pruning
    enqueueScheduledBackupRun(runsFile, {
      jobId: 'job_1',
      jobDisplayName: 'MySQL #1',
      database: 'mysql',
      trigger: 'schedule',
      scheduledFor: '2026-06-12T10:00:00.000Z',
      scheduleSnapshot: null
    }, 100, 10, new Date()); // limit maxFinished to 10

    const updatedData = readScheduledBackupRuns(runsFile);
    // Should have 1 queued run + 10 pruned finished runs = 11 runs total
    expect(updatedData.runs).toHaveLength(11);
  });
});
