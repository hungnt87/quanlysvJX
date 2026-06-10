import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import type { ManagerConfig } from '../config.js';
import { createVersionRecord, ensureVersionRegistry, getVersionsDir } from '../versions/versionRegistry.js';

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
  root = mkdtempSync(path.join(tmpdir(), 'version-routes-'));
  mkdirSync(path.join(root, 'apps/jx-services/versions/mel/server'), { recursive: true });
  writeFileSync(path.join(root, '.env'), 'SERVER_PATH=./apps/jx-services/versions/mel/server/\n', 'utf8');
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('version routes', () => {
  it('lists versions from the JSON registry', async () => {
    const app = await buildApp({ config: testConfig(root) });

    const response = await app.inject({ method: 'GET', url: '/api/versions' });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({
      activeVersion: 'mel',
      versions: [
        {
          name: 'mel',
          displayName: 'mel',
          isActive: true,
          serverPath: 'apps/jx-services/versions/mel/server'
        }
      ]
    });
  });

  it('renames the active version and keeps SERVER_PATH synchronized', async () => {
    ensureVersionRegistry(root);
    const app = await buildApp({ config: testConfig(root) });

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/versions/mel',
      payload: { name: 'mel_2026', displayName: 'MEL 2026' }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({ name: 'mel_2026', displayName: 'MEL 2026' });
    expect(readFileSync(path.join(root, '.env'), 'utf8')).toContain('SERVER_PATH=' + path.resolve(root, 'apps/jx-services/versions/mel_2026/server') + '/');
  });

  it('rejects renaming a version to an existing version name', async () => {
    ensureVersionRegistry(root);
    mkdirSync(path.join(getVersionsDir(root), 'other/server'), { recursive: true });
    createVersionRecord(root, { name: 'other', source: 'upload', allowExistingDirectory: true });
    const app = await buildApp({ config: testConfig(root) });

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/versions/mel',
      payload: { name: 'other', displayName: 'Other' }
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error).toContain('Tên phiên bản đã tồn tại');
  });
});
