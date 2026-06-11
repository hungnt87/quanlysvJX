import { EventEmitter } from 'node:events';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { PassThrough } from 'node:stream';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../app.js';
import type { ManagerConfig } from '../config.js';
import type { ComposeStream } from '../services/composeRunner.js';

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
  root = mkdtempSync(path.join(tmpdir(), 'service-routes-'));
  mkdirSync(path.join(root, 'apps/jx-services/versions/mel/server'), { recursive: true });
  writeFileSync(path.join(root, '.env'), `SERVER_PATH=${path.resolve(root, 'apps/jx-services/versions/mel/server')}/\n`, 'utf8');
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('service routes', () => {
  function composeStream(stdoutText = '', stderrText = '', exitCode = 0): ComposeStream {
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    const stream = Object.assign(new EventEmitter(), { stdout, stderr, kill: vi.fn() });
    queueMicrotask(() => {
      if (stdoutText) stdout.write(stdoutText);
      if (stderrText) stderr.write(stderrText);
      stdout.end();
      stderr.end();
      stream.emit('close', exitCode);
    });
    return stream;
  }

  it('returns normalized service list', async () => {
    const calls: string[][] = [];
    const app = await buildApp({
      config: testConfig(root),
      runDocker: async () => {
        return { stdout: '[]', stderr: '', exitCode: 0 };
      },
      runCompose: async (args) => {
        calls.push([...args]);
        if (args[0] === 'config') {
          return {
            stdout: JSON.stringify({ services: { jxmysql: { image: 'mysql:5.6' } } }),
            stderr: '',
            exitCode: 0
          };
        }
        return {
          stdout: JSON.stringify([{ Service: 'jxmysql', Name: 'jxmysql', State: 'running' }]),
          stderr: '',
          exitCode: 0
        };
      }
    });

    const response = await app.inject({ method: 'GET', url: '/api/services' });

    expect(response.statusCode).toBe(200);
    expect(calls).toEqual([
      ['ps', '--all', '--format', 'json'],
      ['config', '--format', 'json']
    ]);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.error).toBeNull();
    expect(body.data).toHaveLength(8);
    expect(body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'jxmysql', state: 'running', imageExists: true }),
        expect.objectContaining({ name: 'jxmssql', state: 'not created', imageExists: true }),
        expect.objectContaining({ name: 'paysys', state: 'not created', imageExists: true })
      ])
    );
  });

  it('rejects unknown service actions', async () => {
    const app = await buildApp({ config: testConfig(root) });

    const response = await app.inject({ method: 'POST', url: '/api/services/not-real/start' });

    expect(response.statusCode).toBe(400);
  });

  it('runs start through docker compose up with an allowlisted service', async () => {
    const calls: string[][] = [];
    const app = await buildApp({
      config: testConfig(root),
      runCompose: async (args) => {
        calls.push([...args]);
        return { stdout: '', stderr: '', exitCode: 0 };
      }
    });

    const response = await app.inject({ method: 'POST', url: '/api/services/jxmysql/start' });

    expect(response.statusCode).toBe(200);
    expect(calls).toEqual([['up', '-d', 'jxmysql']]);
  });

  it('returns docker error details when a service action fails', async () => {
    const app = await buildApp({
      config: testConfig(root),
      runCompose: async () => ({ stdout: '', stderr: 'dependency failed healthcheck\nextra detail', exitCode: 1 })
    });

    const response = await app.inject({ method: 'POST', url: '/api/services/paysys/start' });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toMatchObject({
      success: false,
      error: 'Started paysys failed: dependency failed healthcheck\nextra detail'
    });
  });

  it('streams structured start events and lets compose handle dependencies', async () => {
    const composeCalls: string[][] = [];
    const dockerCalls: string[][] = [];
    const app = await buildApp({
      config: testConfig(root),
      runDocker: async (args) => {
        dockerCalls.push([...args]);
        return { stdout: '[]', stderr: '', exitCode: 0 };
      },
      runCompose: async (args) => {
        composeCalls.push([...args]);
        if (args[0] === 'config') {
          return {
            stdout: JSON.stringify({
              services: {
                paysys: {
                  image: 'paysys',
                  build: { context: '.' },
                  healthcheck: { interval: '1s', timeout: '1s', retries: 1, start_period: '0s' }
                }
              }
            }),
            stderr: '',
            exitCode: 0
          };
        }
        if (args[0] === 'ps') {
          return {
            stdout: JSON.stringify([
              { Service: 'paysys', Name: 'paysys', State: 'running', Health: 'healthy' }
            ]),
            stderr: '',
            exitCode: 0
          };
        }
        return { stdout: '', stderr: '', exitCode: 0 };
      },
      streamCompose: (args) => {
        composeCalls.push([...args]);
        return composeStream('started\n');
      }
    });

    const response = await app.inject({ method: 'GET', url: '/api/services/paysys/start/stream' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/event-stream');
    expect(response.payload).toContain('event: phase');
    expect(response.payload).toContain('event: ready');
    expect(response.payload).toContain('event: close');
    expect(dockerCalls).toEqual([['image', 'inspect', 'paysys']]);
    expect(composeCalls).toContainEqual(['up', '-d', '--no-build', 'paysys']);
    expect(composeCalls).not.toContainEqual(['up', '-d', 'paysys']);
    expect(composeCalls).not.toContainEqual(['up', '-d', '--build', '--no-deps', 'paysys']);
  });

  it('streams structured errors when start fails', async () => {
    const app = await buildApp({
      config: testConfig(root),
      runDocker: async () => ({ stdout: '[]', stderr: '', exitCode: 0 }),
      runCompose: async (args) => {
        if (args[0] === 'config') {
          return {
            stdout: JSON.stringify({ services: { paysys: { image: 'paysys', build: { context: '.' } } } }),
            stderr: '',
            exitCode: 0
          };
        }
        return { stdout: '', stderr: '', exitCode: 0 };
      },
      streamCompose: () => composeStream('', 'port already allocated', 88)
    });

    const response = await app.inject({ method: 'GET', url: '/api/services/paysys/start/stream' });

    expect(response.statusCode).toBe(200);
    expect(response.payload).toContain('event: error');
    expect(response.payload).toContain('UP_FAILED');
    expect(response.payload).toContain('port already allocated');
  });

  it('runs stop through docker compose rm -f -s', async () => {
    const calls: string[][] = [];
    const app = await buildApp({
      config: testConfig(root),
      runCompose: async (args) => {
        calls.push([...args]);
        if (args[0] === 'ps') {
          return {
            stdout: JSON.stringify([{ Service: 'paysys', Name: 'paysys', State: 'running' }]),
            stderr: '',
            exitCode: 0
          };
        }
        return { stdout: '', stderr: '', exitCode: 0 };
      }
    });

    const response = await app.inject({ method: 'POST', url: '/api/services/paysys/stop' });

    expect(response.statusCode).toBe(200);
    expect(calls).toEqual([
      ['ps', '--all', '--format', 'json'],
      ['rm', '-f', '-s', 'paysys']
    ]);
  });
});
