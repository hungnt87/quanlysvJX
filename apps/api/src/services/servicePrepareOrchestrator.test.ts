import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import type { CommandResult, ComposeStream } from './composeRunner.js';
import { prepareServicesWithProgress, type PrepareServiceEvent } from './servicePrepareOrchestrator.js';

const composeConfig = {
  services: {
    paysys: {
      image: 'paysys',
      build: { context: '.' }
    },
    jxmysql: {
      image: 'mysql:5.6'
    }
  }
};

function ok(stdout = ''): CommandResult {
  return { stdout, stderr: '', exitCode: 0 };
}

function fail(stderr: string, exitCode = 1): CommandResult {
  return { stdout: '', stderr, exitCode };
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

describe('prepareServicesWithProgress', () => {
  it('skips build and pull when image already exists', async () => {
    const dockerCalls: string[][] = [];
    const events: PrepareServiceEvent[] = [];

    await prepareServicesWithProgress({
      services: ['paysys'],
      runDocker: async (args) => {
        dockerCalls.push([...args]);
        return ok('[]');
      },
      streamCompose: vi.fn(),
      emit: (event) => events.push(event),
      composeConfig
    });

    expect(dockerCalls).toEqual([['image', 'inspect', 'paysys']]);
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'success', service: 'paysys' })
    );
    expect(events).toContainEqual({ type: 'close', exitCode: 0 });
  });

  it('runs build for missing image with hasBuild: true', async () => {
    const dockerCalls: string[][] = [];
    const composeCalls: string[][] = [];
    const events: PrepareServiceEvent[] = [];

    await prepareServicesWithProgress({
      services: ['paysys'],
      runDocker: async (args) => {
        dockerCalls.push([...args]);
        return fail('No such image');
      },
      streamCompose: (args) => {
        composeCalls.push([...args]);
        return streamResult('building paysys...\n');
      },
      emit: (event) => events.push(event),
      composeConfig
    });

    expect(dockerCalls).toEqual([['image', 'inspect', 'paysys']]);
    expect(composeCalls).toEqual([['build', 'paysys']]);
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'start', service: 'paysys', phase: 'build' })
    );
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'success', service: 'paysys' })
    );
    expect(events).toContainEqual({ type: 'close', exitCode: 0 });
  });

  it('runs build when a build-backed image needs rebuild', async () => {
    const composeCalls: string[][] = [];
    const markedServices: string[] = [];

    await prepareServicesWithProgress({
      services: ['paysys'],
      runDocker: async () => ok('[]'),
      streamCompose: (args) => {
        composeCalls.push([...args]);
        return streamResult('rebuilding paysys...\n');
      },
      emit: vi.fn(),
      composeConfig,
      shouldPrepare: (serviceName) => serviceName === 'paysys',
      markPrepared: (serviceName) => markedServices.push(serviceName)
    });

    expect(composeCalls).toEqual([['build', 'paysys']]);
    expect(markedServices).toEqual(['paysys']);
  });

  it('runs pull for missing image with hasBuild: false', async () => {
    const dockerCalls: string[][] = [];
    const composeCalls: string[][] = [];
    const events: PrepareServiceEvent[] = [];

    await prepareServicesWithProgress({
      services: ['jxmysql'],
      runDocker: async (args) => {
        dockerCalls.push([...args]);
        return fail('No such image');
      },
      streamCompose: (args) => {
        composeCalls.push([...args]);
        return streamResult('pulling mysql...\n');
      },
      emit: (event) => events.push(event),
      composeConfig
    });

    expect(dockerCalls).toEqual([['image', 'inspect', 'mysql:5.6']]);
    expect(composeCalls).toEqual([['pull', 'jxmysql']]);
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'start', service: 'jxmysql', phase: 'pull' })
    );
    expect(events).toContainEqual({ type: 'close', exitCode: 0 });
  });

  it('stops early and fail-fast when a service fails', async () => {
    const dockerCalls: string[][] = [];
    const composeCalls: string[][] = [];
    const events: PrepareServiceEvent[] = [];

    await prepareServicesWithProgress({
      services: ['paysys', 'jxmysql'],
      runDocker: async (args) => {
        dockerCalls.push([...args]);
        return fail('No such image');
      },
      streamCompose: (args) => {
        composeCalls.push([...args]);
        if (args[0] === 'build') {
          return streamResult('', 'build error', 1);
        }
        return streamResult();
      },
      emit: (event) => events.push(event),
      composeConfig
    });

    expect(composeCalls).toEqual([['build', 'paysys']]); // jxmysql is not called due to fail-fast
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'error', service: 'paysys' })
    );
    expect(events).toContainEqual({ type: 'close', exitCode: 1 });
  });
});
