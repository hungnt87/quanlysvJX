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
    schedulerEnabled: false
  };
}

describe('backup routes', () => {
  it('starts mysql backup job', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'manager-'));
    const app = await buildApp({
      config: testConfig(root),
      runCompose: async () => ({ stdout: 'CREATE DATABASE server1;\n', stderr: '', exitCode: 0 })
    });

    const response = await app.inject({ method: 'POST', url: '/api/backups/mysql' });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.kind).toBe('mysql');
  });

  it('lists managed backup files', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'manager-'));
    const app = await buildApp({ config: testConfig(root) });

    const response = await app.inject({ method: 'GET', url: '/api/backups' });

    expect(app.deps.config.backupMetadataFile.endsWith('backup-metadata.json')).toBe(true);
    expect(app.deps.config.backupScheduleFile.endsWith('backup-schedules.json')).toBe(true);
    expect(app.deps.config.schedulerEnabled).toBe(false);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ success: true, data: [], error: null });
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
    expect(response.json().error).toContain('Cannot delete the newest mysql backup');
  });

  it('saves and returns backup schedules', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'manager-'));
    const app = await buildApp({ config: testConfig(root) });

    const put = await app.inject({
      method: 'PUT',
      url: '/api/backup-schedules/mysql',
      payload: { enabled: true, daysOfWeek: [1, 3, 5], time: '03:00', retentionDays: 14, lastRunKey: null }
    });
    const get = await app.inject({ method: 'GET', url: '/api/backup-schedules' });

    expect(put.statusCode).toBe(200);
    expect(get.json().data.schedules.mysql.enabled).toBe(true);
  });

  it('returns readonly backup settings', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'manager-'));
    const config = testConfig(root);
    const app = await buildApp({ config });

    const response = await app.inject({ method: 'GET', url: '/api/backup-settings' });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({
      mysqlBackupDir: config.mysqlBackupDir,
      mssqlBackupDir: config.mssqlBackupDir,
      backupMetadataFile: config.backupMetadataFile,
      backupScheduleFile: config.backupScheduleFile
    });
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
