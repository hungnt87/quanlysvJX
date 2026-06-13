import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import type { CommandResult, ComposeStream } from './composeRunner.js';
import { startServiceWithProgress } from './serviceStartOrchestrator.js';
import type { StartServiceEvent } from './serviceStartEvents.js';

const composeConfig = JSON.stringify({
  services: {
    paysys: {
      image: 'paysys',
      build: { context: '.' },
      healthcheck: { interval: '1s', timeout: '1s', retries: 2, start_period: '0s' }
    },
    jxmysql: {
      image: 'mysql:5.6',
      healthcheck: { interval: '1s', timeout: '1s', retries: 2, start_period: '0s' }
    }
  }
});

function ok(stdout = ''): CommandResult {
  return { stdout, stderr: '', exitCode: 0 };
}

function streamResult(stdoutText = '', stderrText = '', exitCode = 0): ComposeStream {
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

describe('startServiceWithProgress', () => {
  it('starts the service without rebuilding', async () => {
    const composeCalls: string[][] = [];
    const events: StartServiceEvent[] = [];

    await startServiceWithProgress({
      serviceName: 'paysys',
      runCompose: async (args) => {
        composeCalls.push([...args]);
        if (args[0] === 'config') return ok(composeConfig);
        if (args[0] === 'ps') {
          return ok(
            JSON.stringify([
              { Service: 'paysys', Name: 'paysys', State: 'running', Health: 'healthy' }
            ])
          );
        }
        return ok();
      },
      streamCompose: (args) => {
        composeCalls.push([...args]);
        return streamResult('started\n');
      },
      emit: (event) => events.push(event),
      pollIntervalMs: 1
    });

    expect(composeCalls).toEqual([
      ['config', '--format', 'json'],
      ['up', '-d', '--no-build', 'paysys'],
      ['ps', '--all', '--format', 'json']
    ]);
    expect(events.some((event) => event.type === 'ready')).toBe(true);
  });

  it('uses the same no-build start command for external images', async () => {
    const composeCalls: string[][] = [];

    await startServiceWithProgress({
      serviceName: 'jxmysql',
      runCompose: async (args) => {
        composeCalls.push([...args]);
        if (args[0] === 'config') return ok(composeConfig);
        if (args[0] === 'ps') {
          return ok(
            JSON.stringify([
              { Service: 'jxmysql', Name: 'jxmysql', State: 'running', Health: 'healthy' }
            ])
          );
        }
        return ok();
      },
      streamCompose: (args) => {
        composeCalls.push([...args]);
        return streamResult();
      },
      emit: vi.fn(),
      pollIntervalMs: 1
    });

    expect(composeCalls).toContainEqual(['up', '-d', '--no-build', 'jxmysql']);
    expect(composeCalls).not.toContainEqual(['pull', 'jxmysql']);
    expect(composeCalls).not.toContainEqual(['up', '-d', '--build', 'jxmysql']);
  });

  it('emits UP_FAILED when compose up exits non-zero', async () => {
    const events: StartServiceEvent[] = [];

    await startServiceWithProgress({
      serviceName: 'paysys',
      runCompose: async (args) => (args[0] === 'config' ? ok(composeConfig) : ok()),
      streamCompose: () => streamResult('', 'start exploded', 17),
      emit: (event) => events.push(event),
      pollIntervalMs: 1
    });

    expect(events).toContainEqual(
      expect.objectContaining({ type: 'error', code: 'UP_FAILED', exitCode: 17 })
    );
  });

  it('emits HEALTH_TIMEOUT when readiness is not reached', async () => {
    const events: StartServiceEvent[] = [];

    await startServiceWithProgress({
      serviceName: 'paysys',
      runCompose: async (args) => {
        if (args[0] === 'config') return ok(composeConfig);
        if (args[0] === 'ps') {
          return ok(
            JSON.stringify([
              { Service: 'paysys', Name: 'paysys', State: 'running', Health: 'starting' }
            ])
          );
        }
        return ok();
      },
      streamCompose: () => streamResult(),
      emit: (event) => events.push(event),
      pollIntervalMs: 1,
      readinessTimeoutOverrideMs: 2
    });

    expect(events).toContainEqual(expect.objectContaining({ type: 'error', code: 'HEALTH_TIMEOUT' }));
  });

  it('emits START_ALREADY_RUNNING for duplicate starts of the same service', async () => {
    const firstEvents: StartServiceEvent[] = [];
    const secondEvents: StartServiceEvent[] = [];
    let releaseStream: (() => void) | null = null;
    let markStreamStarted: (() => void) | null = null;
    const streamStarted = new Promise<void>((resolve) => {
      markStreamStarted = resolve;
    });

    const first = startServiceWithProgress({
      serviceName: 'paysys',
      runCompose: async (args) =>
        args[0] === 'config'
          ? ok(composeConfig)
          : ok(
              JSON.stringify([
                { Service: 'paysys', Name: 'paysys', State: 'running', Health: 'healthy' }
              ])
            ),
      streamCompose: () => {
        const stdout = new PassThrough();
        const stderr = new PassThrough();
        const stream = Object.assign(new EventEmitter(), { stdout, stderr, kill: vi.fn() });
        new Promise<void>((resolve) => {
          releaseStream = resolve;
        }).then(() => stream.emit('close', 0));
        markStreamStarted?.();
        return stream;
      },
      emit: (event) => firstEvents.push(event),
      pollIntervalMs: 1
    });

    await streamStarted;

    await startServiceWithProgress({
      serviceName: 'paysys',
      runCompose: async () => ok(composeConfig),
      streamCompose: () => streamResult(),
      emit: (event) => secondEvents.push(event),
      pollIntervalMs: 1
    });

    const release = releaseStream as (() => void) | null;
    if (!release) {
      throw new Error('Expected first start stream to be active');
    }
    release();
    await first;

    expect(firstEvents.some((event) => event.type === 'ready')).toBe(true);
    expect(secondEvents).toContainEqual(
      expect.objectContaining({ type: 'error', code: 'START_ALREADY_RUNNING' })
    );
  });
});
