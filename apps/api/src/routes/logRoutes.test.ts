import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
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
    expect(response.json()).toEqual({
      status: 'success',
      data: { service: 'jxmysql', tail: 50, logs: 'ready\n' }
    });
    expect(calls).toEqual([['logs', '--no-color', '--timestamps', '--tail', '50', 'jxmysql']]);
  });

  it('rejects logs for unsupported services', async () => {
    const app = await buildApp();

    const response = await app.inject({ method: 'GET', url: '/api/services/not-real/logs' });

    expect(response.statusCode).toBe(400);
  });

  it('streams docker logs for an allowlisted service', async () => {
    const calls: string[][] = [];
    const kill = vi.fn();
    const app = await buildApp({
      streamCompose: (args) => {
        calls.push([...args]);
        const stdout = new PassThrough();
        const stderr = new PassThrough();
        const stream = Object.assign(new EventEmitter(), { stdout, stderr, kill });

        queueMicrotask(() => {
          stdout.write('ready\n');
          stdout.end();
          stream.emit('close', 0);
        });

        return stream;
      }
    });

    const response = await app.inject({ method: 'GET', url: '/api/services/jxmysql/logs/stream?tail=20' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/event-stream');
    expect(response.payload).toContain('event: log\ndata: "ready\\n"\n\n');
    expect(calls).toEqual([['logs', '--no-color', '--timestamps', '--tail', '20', '--follow', 'jxmysql']]);
  });
});
