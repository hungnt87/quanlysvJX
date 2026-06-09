import { describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';

describe('service routes', () => {
  it('returns normalized service list', async () => {
    const app = await buildApp({
      runCompose: async () => ({
        stdout: JSON.stringify([{ Service: 'jxmysql', Name: 'jxmysql', State: 'running' }]),
        stderr: '',
        exitCode: 0
      })
    });

    const response = await app.inject({ method: 'GET', url: '/api/services' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      success: true,
      data: [{ name: 'jxmysql', state: 'running' }],
      error: null
    });
  });

  it('rejects unknown service actions', async () => {
    const app = await buildApp();

    const response = await app.inject({ method: 'POST', url: '/api/services/not-real/start' });

    expect(response.statusCode).toBe(400);
  });

  it('runs start through docker compose up with an allowlisted service', async () => {
    const calls: string[][] = [];
    const app = await buildApp({
      runCompose: async (args) => {
        calls.push([...args]);
        return { stdout: '', stderr: '', exitCode: 0 };
      }
    });

    const response = await app.inject({ method: 'POST', url: '/api/services/jxmysql/start' });

    expect(response.statusCode).toBe(200);
    expect(calls).toEqual([['up', '-d', 'jxmysql']]);
  });
});
