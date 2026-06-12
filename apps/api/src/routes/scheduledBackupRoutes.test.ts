import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import type { ManagerConfig } from '../config.js';

function testConfig(root: string): ManagerConfig {
  return {
    projectRoot: root,
    mysqlBackupDir: path.join(root, 'mysql'),
    mssqlBackupDir: path.join(root, 'mssql'),
    backupSchedule: '0 3 * * *',
    backupRetentionDays: 14,
    backupMetadataFile: path.join(root, 'backup-metadata.json'),
    backupScheduleFile: path.join(root, 'backup-schedules.json'),
    scheduledBackupJobsFile: path.join(root, 'backup-scheduled-jobs.json'),
    scheduledBackupRunsFile: path.join(root, 'backup-scheduled-job-runs.json'),
    mysqlRetentionDays: 14,
    mssqlRetentionDays: 14,
    maxQueuedRunsPerJob: 100,
    maxFinishedScheduledRuns: 1000,
    schedulerEnabled: false,
    mssql: {
      host: 'localhost',
      port: 1433,
      database: 'account_tong',
      user: null,
      password: null,
      encrypt: false,
      trustServerCertificate: true
    }
  };
}

describe('scheduled backup routes', () => {
  it('performs CRUD operations on scheduled jobs', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'routes-test-'));
    const app = await buildApp({
      config: testConfig(root)
    });

    // 1. GET scheduled-jobs (initially empty)
    let getResponse = await app.inject({ method: 'GET', url: '/api/scheduled-jobs' });
    expect(getResponse.statusCode).toBe(200);
    expect(getResponse.json().data).toEqual([]);

    // 2. POST scheduled-jobs (create job)
    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/scheduled-jobs',
      payload: {
        database: 'mysql',
        schedule: { type: 'daily', time: '03:00' },
        enabled: true
      }
    });
    expect(createResponse.statusCode).toBe(200);
    const createdJob = createResponse.json().data;
    expect(createdJob.displayName).toBe('MySQL · Hằng ngày #1');

    // 3. PUT scheduled-jobs/:id (update job)
    const updateResponse = await app.inject({
      method: 'PUT',
      url: `/api/scheduled-jobs/${createdJob.id}`,
      payload: {
        schedule: { type: 'daily', time: '04:00' },
        enabled: false
      }
    });
    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json().data.schedule.time).toBe('04:00');
    expect(updateResponse.json().data.enabled).toBe(false);

    // 4. DELETE scheduled-jobs/:id (delete job)
    const deleteResponse = await app.inject({
      method: 'DELETE',
      url: `/api/scheduled-jobs/${createdJob.id}`
    });
    expect(deleteResponse.statusCode).toBe(200);
    expect(deleteResponse.json().data.deletedAt).not.toBeNull();

    // 5. GET scheduled-jobs again (should be empty since it is deleted)
    getResponse = await app.inject({ method: 'GET', url: '/api/scheduled-jobs' });
    expect(getResponse.json().data).toEqual([]);
  });

  it('allows running a job immediately and listing runs', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'routes-test-'));
    const app = await buildApp({
      config: testConfig(root)
    });

    // Create job
    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/scheduled-jobs',
      payload: {
        database: 'mysql',
        schedule: { type: 'daily', time: '03:00' },
        enabled: true
      }
    });
    const job = createResponse.json().data;

    // Run now
    const runResponse = await app.inject({
      method: 'POST',
      url: `/api/scheduled-jobs/${job.id}/run`
    });
    expect(runResponse.statusCode).toBe(200);
    expect(runResponse.json().data.status).toBe('queued');
    expect(runResponse.json().data.trigger).toBe('manual');

    // GET runs
    const runsResponse = await app.inject({
      method: 'GET',
      url: '/api/scheduled-job-runs'
    });
    expect(runsResponse.statusCode).toBe(200);
    expect(runsResponse.json().data).toHaveLength(1);
    expect(runsResponse.json().data[0].jobId).toBe(job.id);
  });

  it('allows updating and fetching backup settings', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'routes-test-'));
    const app = await buildApp({
      config: testConfig(root)
    });

    // GET settings
    let settingsResponse = await app.inject({ method: 'GET', url: '/api/backup-settings' });
    expect(settingsResponse.statusCode).toBe(200);
    expect(settingsResponse.json().data.mysqlRetentionDays).toBe(14);

    // PUT settings
    const updateResponse = await app.inject({
      method: 'PUT',
      url: '/api/backup-settings',
      payload: {
        mysqlRetentionDays: 7,
        mssqlRetentionDays: 30
      }
    });
    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json().data.mysqlRetentionDays).toBe(7);
    expect(updateResponse.json().data.mssqlRetentionDays).toBe(30);

    // GET settings again
    settingsResponse = await app.inject({ method: 'GET', url: '/api/backup-settings' });
    expect(settingsResponse.json().data.mysqlRetentionDays).toBe(7);
  });
});
