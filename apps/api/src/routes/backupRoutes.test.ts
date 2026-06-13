import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
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

describe('backup routes', () => {
  it('enqueues mysql backup job', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'manager-'));
    const app = await buildApp({
      config: testConfig(root),
      runCompose: async () => ({ stdout: 'CREATE DATABASE server1;\n', stderr: '', exitCode: 0 })
    });

    const response = await app.inject({ method: 'POST', url: '/api/backups/mysql' });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.database).toBe('mysql');
    expect(response.json().data.status).toBe('queued');
  });

  it('lists managed backup files', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'manager-'));
    const app = await buildApp({ config: testConfig(root) });

    const response = await app.inject({ method: 'GET', url: '/api/backups' });

    expect(app.deps.config.backupMetadataFile.endsWith('backup-metadata.json')).toBe(true);
    expect(app.deps.config.backupScheduleFile.endsWith('backup-schedules.json')).toBe(true);
    expect(app.deps.config.schedulerEnabled).toBe(false);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'success', data: [] });
  });

  it('updates a backup filename and note', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'manager-'));
    const config = testConfig(root);
    mkdirSync(config.mysqlBackupDir, { recursive: true });
    writeFileSync(path.join(config.mysqlBackupDir, 'mysql-old.sql.gz'), 'backup');
    const app = await buildApp({ config });

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/backups/mysql/mysql-old.sql.gz',
      payload: { filename: 'mysql-renamed.sql.gz', note: 'safe restore point' }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.filename).toBe('mysql-renamed.sql.gz');
    expect(response.json().data.note).toBe('safe restore point');
  });

  it('blocks deleting the newest backup', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'manager-'));
    const config = testConfig(root);
    mkdirSync(config.mysqlBackupDir, { recursive: true });
    writeFileSync(path.join(config.mysqlBackupDir, 'mysql-latest.sql.gz'), 'backup');
    const app = await buildApp({ config });

    const response = await app.inject({ method: 'DELETE', url: '/api/backups/mysql/mysql-latest.sql.gz' });

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toContain('Cannot delete the newest mysql backup');
  });

  it('returns 404 for deleted backup schedules routes', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'manager-'));
    const app = await buildApp({ config: testConfig(root) });

    const put = await app.inject({
      method: 'PUT',
      url: '/api/backup-schedules/mysql',
      payload: { enabled: true, daysOfWeek: [1, 3, 5], time: '03:00', retentionDays: 14, lastRunKey: null }
    });
    const get = await app.inject({ method: 'GET', url: '/api/backup-schedules' });

    expect(put.statusCode).toBe(404);
    expect(get.statusCode).toBe(404);
  });

  it('rejects restore traversal filename', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'manager-'));
    const app = await buildApp({ config: testConfig(root) });

    const response = await app.inject({
      method: 'POST',
      url: '/api/restores/mysql',
      payload: { filename: '../bad.sql.gz' }
    });

    expect(response.statusCode).toBe(400);
  });
});
