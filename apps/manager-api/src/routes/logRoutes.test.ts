import { describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';

describe('log routes', () => {
  it('returns docker logs for an allowlisted service', async () => {
    const calls: string[][] = [];
    const app = await buildApp({
      runCompose: async (args) => {
        calls.push([...args]);
        return { stdout: 'ready\n', stderr: '', exitCode: 0 };
      }
    });

    const response = await app.inject({ method: 'GET', url: '/api/services/jxmysql/logs?tail=20' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      success: true,
      data: { service: 'jxmysql', tail: 50, logs: 'ready\n' },
      error: null
    });
    expect(calls).toEqual([['logs', '--no-color', '--tail', '50', 'jxmysql']]);
  });

  it('rejects logs for unsupported services', async () => {
    const app = await buildApp();

    const response = await app.inject({ method: 'GET', url: '/api/services/not-real/logs' });

    expect(response.statusCode).toBe(400);
  });
});
