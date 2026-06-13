import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import type { ManagerConfig } from '../config.js';

let root: string;

function testConfig(projectRoot: string): ManagerConfig {
  return {
    projectRoot,
    mysqlBackupDir: path.join(projectRoot, 'mysql'),
    mssqlBackupDir: path.join(projectRoot, 'mssql'),
    backupSchedule: '0 3 * * *',
    backupRetentionDays: 14,
    backupMetadataFile: path.join(projectRoot, 'backup-metadata.json'),
    backupScheduleFile: path.join(projectRoot, 'backup-schedules.json'),
    schedulerEnabled: false,
    mssql: { host: 'localhost', port: 1433, database: 'account_tong', user: null, password: null, encrypt: false, trustServerCertificate: true }
  };
}

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'env-routes-'));
  writeFileSync(path.join(root, '.env'), 'TEST_VAR=true\n', 'utf8');
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('env routes', () => {
  it('đọc nội dung tệp .env thành công', async () => {
    const app = await buildApp({ config: testConfig(root) });

    const response = await app.inject({ method: 'GET', url: '/api/env' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: 'success',
      data: {
        content: 'TEST_VAR=true\n'
      }
    });
  });

  it('ghi nội dung mới vào tệp .env thành công', async () => {
    const app = await buildApp({ config: testConfig(root) });

    const response = await app.inject({
      method: 'POST',
      url: '/api/env',
      payload: { content: 'TEST_VAR=false\nNEW_VAR=hello\n' }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: 'success',
      data: {
        message: 'Env configuration saved successfully'
      }
    });

    expect(readFileSync(path.join(root, '.env'), 'utf8')).toBe('TEST_VAR=false\nNEW_VAR=hello\n');
  });

  it('báo lỗi khi gửi dữ liệu body không hợp lệ (Zod validation)', async () => {
    const app = await buildApp({ config: testConfig(root) });

    const response = await app.inject({
      method: 'POST',
      url: '/api/env',
      payload: { invalid_field: 'abc' }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().status).toBe('error');
    expect(response.json().message).toBe('Validation failed');
  });
});
