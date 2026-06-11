import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  root = mkdtempSync(path.join(tmpdir(), 'system-routes-'));
  writeFileSync(root + '/.env', 'JX_IP=auto\nJX_MYSQL_IP=auto\nJX_PAYSYS_IP=auto\nJX_MSSQL_IP=auto\n', 'utf8');
  vi.spyOn(os, 'networkInterfaces').mockReturnValue({
    eth0: [{ address: '192.168.1.20', family: 'IPv4', internal: false } as any],
    docker0: [{ address: '172.18.0.1', family: 'IPv4', internal: false } as any],
    lo: [{ address: '127.0.0.1', family: 'IPv4', internal: true } as any]
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
});

describe('system routes', () => {
  it('returns system info with explicit fallback instead of auto', async () => {
    const app = await buildApp({
      config: testConfig(root),
      runCompose: async () => ({ stdout: JSON.stringify([{ Service: 'jxserver', State: 'running' }]), stderr: '', exitCode: 0 })
    });

    const response = await app.inject({ method: 'GET', url: '/api/system/info' });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({
      serverIp: '192.168.1.20',
      mysqlIp: '127.0.0.1',
      mssqlIp: '127.0.0.1',
      coreServicesRunning: true,
      runningCoreServices: ['jxserver']
    });
    expect(response.json().data.ipChoices).toEqual(['192.168.1.20']);
  });

  it('saves host JX IP and free IPv4 network values while rejecting auto', async () => {
    const app = await buildApp({ config: testConfig(root) });

    const badResponse = await app.inject({
      method: 'PUT',
      url: '/api/system/game-network',
      payload: { jxIp: 'auto', mysqlIp: '10.0.0.8', paysysIp: '172.18.0.1', mssqlIp: '8.8.8.8' }
    });
    expect(badResponse.statusCode).toBe(400);

    const badJxResponse = await app.inject({
      method: 'PUT',
      url: '/api/system/game-network',
      payload: { jxIp: '127.0.0.1', mysqlIp: '10.0.0.8', paysysIp: '172.18.0.1', mssqlIp: '8.8.8.8' }
    });
    expect(badJxResponse.statusCode).toBe(400);

    const response = await app.inject({
      method: 'PUT',
      url: '/api/system/game-network',
      payload: { jxIp: '192.168.1.20', mysqlIp: '10.0.0.8', paysysIp: '172.18.0.1', mssqlIp: '8.8.8.8' }
    });

    expect(response.statusCode).toBe(200);
    expect(readFileSync(path.join(root, '.env'), 'utf8')).toContain('JX_IP=192.168.1.20');
    expect(readFileSync(path.join(root, '.env'), 'utf8')).toContain('JX_MYSQL_IP=10.0.0.8');
    expect(readFileSync(path.join(root, '.env'), 'utf8')).toContain('JX_PAYSYS_IP=172.18.0.1');
    expect(readFileSync(path.join(root, '.env'), 'utf8')).toContain('JX_MSSQL_IP=8.8.8.8');
  });
});
