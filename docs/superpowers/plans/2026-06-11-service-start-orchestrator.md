# Service Start Orchestrator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a phase-aware Docker Compose service start orchestrator that checks images, builds or pulls missing images, starts services with dependencies, streams progress to the dashboard terminal, and reports structured error codes.

**Architecture:** Add focused API modules for compose config parsing and start orchestration, keeping Fastify routes thin. The SSE route forwards structured orchestrator events to the UI; the modal consumes `phase`, `log`, `error`, `ready`, and `close` events and only closes after `ready`.

**Tech Stack:** Node.js, TypeScript, Fastify, Docker CLI, Docker Compose, Server-Sent Events, React, Mantine, TanStack Query, Vitest, Testing Library.

---

## File Structure

- Create `apps/api/src/services/serviceStartEvents.ts`: shared start phase, event, and error-code types used by orchestrator and route tests.
- Create `apps/api/src/services/composeConfig.ts`: resolve normalized service metadata from `docker compose config --format json`, including image name, build flag, healthcheck flag, and readiness timeout.
- Create `apps/api/src/services/composeConfig.test.ts`: unit tests for compose config parsing and timeout calculation.
- Create `apps/api/src/services/serviceStartOrchestrator.ts`: orchestrate inspect, build or pull, up, real-time log streaming, readiness polling, lock handling, and abort handling.
- Create `apps/api/src/services/serviceStartOrchestrator.test.ts`: unit tests for orchestration phase ordering and error codes.
- Modify `apps/api/src/services/composeRunner.ts`: add generic Docker command helpers while keeping current compose and stream helpers intact.
- Modify `apps/api/src/services/composeRunner.test.ts`: cover new Docker helper argument construction.
- Modify `apps/api/src/app.ts`: add `runDocker` dependency for testable image inspection.
- Modify `apps/api/src/routes/serviceRoutes.ts`: replace current start stream body with orchestrator-backed SSE forwarding.
- Modify `apps/api/src/routes/serviceRoutes.test.ts`: add route-level SSE tests for structured events.
- Modify `apps/ui/src/components/ServiceActionModal.tsx`: consume structured start SSE events and close only after `ready`.
- Create `apps/ui/src/components/ServiceActionModal.test.tsx`: test phase rendering, error rendering, and `ready` close behavior.

## Task 1: Add Generic Docker Command Helpers

**Files:**
- Modify: `apps/api/src/services/composeRunner.ts`
- Modify: `apps/api/src/services/composeRunner.test.ts`

- [ ] **Step 1: Write failing tests for Docker helper argument builders**

Add these tests to `apps/api/src/services/composeRunner.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildComposeArgs, buildDockerArgs } from './composeRunner.js';
import { assertServiceName, serviceNames } from './serviceAllowlist.js';

describe('buildDockerArgs', () => {
  it('passes docker subcommands without shell interpolation', () => {
    expect(buildDockerArgs(['image', 'inspect', 'paysys'])).toEqual(['image', 'inspect', 'paysys']);
  });
});
```

Keep the existing `service allowlist` and `buildComposeArgs` tests in the same file.

- [ ] **Step 2: Run the focused failing test**

Run: `npm --workspace apps/api run test -- src/services/composeRunner.test.ts`

Expected: FAIL with an export error for `buildDockerArgs`.

- [ ] **Step 3: Add generic Docker helpers**

Update `apps/api/src/services/composeRunner.ts` so the exports include the new functions below:

```ts
export function buildDockerArgs(args: readonly string[]) {
  return [...args];
}

export async function runDocker(
  args: readonly string[],
  cwd: string,
  options?: { stdin?: string | Buffer }
): Promise<CommandResult> {
  return runCommand('docker', buildDockerArgs(args), cwd, options);
}

export function runDockerStream(args: readonly string[], cwd: string): ComposeStream {
  return spawn('docker', buildDockerArgs(args), { cwd, shell: false });
}
```

Refactor `runDockerCompose` to use this shared private helper:

```ts
function runCommand(
  command: string,
  args: readonly string[],
  cwd: string,
  options?: { stdin?: string | Buffer }
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, shell: false });
    let stdout = '';
    let stderr = '';

    if (options?.stdin !== undefined) {
      child.stdin.write(options.stdin);
      child.stdin.end();
    }

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.on('error', (error) => {
      reject(new CommandError(error.message));
    });
    child.on('close', (exitCode) => {
      resolve({ stdout, stderr, exitCode: exitCode ?? 1 });
    });
  });
}
```

Then make `runDockerCompose` call `runCommand('docker', buildComposeArgs(args), cwd, options)`.

- [ ] **Step 4: Verify the helper tests pass**

Run: `npm --workspace apps/api run test -- src/services/composeRunner.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

```bash
git add apps/api/src/services/composeRunner.ts apps/api/src/services/composeRunner.test.ts
git commit -m "feat: add docker command helpers"
```

## Task 2: Add Compose Config Resolver

**Files:**
- Create: `apps/api/src/services/composeConfig.ts`
- Create: `apps/api/src/services/composeConfig.test.ts`

- [ ] **Step 1: Write failing compose config tests**

Create `apps/api/src/services/composeConfig.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { resolveComposeServiceConfig, parseComposeDurationMs } from './composeConfig.js';

const config = {
  services: {
    jxmysql: {
      image: 'mysql:5.6',
      healthcheck: {
        test: ['CMD-SHELL', 'mysqladmin ping'],
        interval: '10s',
        timeout: '5s',
        retries: 30,
        start_period: '30s'
      }
    },
    paysys: {
      image: 'paysys',
      build: { context: '.', dockerfile: './dockerfiles/Dockerfile.paysys' },
      healthcheck: {
        test: ['CMD-SHELL', 'bash -ec'],
        interval: '5s',
        timeout: '3s',
        retries: 30,
        start_period: '5s'
      }
    },
    s3relayserver: {
      image: 'paysys',
      healthcheck: {
        test: ['CMD-SHELL', 'bash -ec'],
        interval: 5_000_000_000,
        timeout: 3_000_000_000,
        retries: 30,
        start_period: 5_000_000_000
      }
    },
    nohealth: {
      image: 'busybox:latest'
    }
  }
};

describe('parseComposeDurationMs', () => {
  it('parses compose duration strings and numeric nanoseconds', () => {
    expect(parseComposeDurationMs('1m30s', 0)).toBe(90_000);
    expect(parseComposeDurationMs('500ms', 0)).toBe(500);
    expect(parseComposeDurationMs(5_000_000_000, 0)).toBe(5_000);
    expect(parseComposeDurationMs('bad-value', 12_000)).toBe(12_000);
  });
});

describe('resolveComposeServiceConfig', () => {
  it('resolves external image services', () => {
    expect(resolveComposeServiceConfig(config, 'jxmysql')).toMatchObject({
      serviceName: 'jxmysql',
      imageName: 'mysql:5.6',
      hasBuild: false,
      hasHealthcheck: true,
      readinessTimeoutMs: 495_000
    });
  });

  it('resolves build-backed services', () => {
    expect(resolveComposeServiceConfig(config, 'paysys')).toMatchObject({
      serviceName: 'paysys',
      imageName: 'paysys',
      hasBuild: true,
      hasHealthcheck: true,
      readinessTimeoutMs: 260_000
    });
  });

  it('uses the declared image for services that reuse another service image', () => {
    expect(resolveComposeServiceConfig(config, 's3relayserver')).toMatchObject({
      serviceName: 's3relayserver',
      imageName: 'paysys',
      hasBuild: false,
      hasHealthcheck: true,
      readinessTimeoutMs: 260_000
    });
  });

  it('uses a 60 second readiness timeout when no healthcheck exists', () => {
    expect(resolveComposeServiceConfig(config, 'nohealth')).toMatchObject({
      serviceName: 'nohealth',
      imageName: 'busybox:latest',
      hasBuild: false,
      hasHealthcheck: false,
      readinessTimeoutMs: 60_000
    });
  });
});
```

- [ ] **Step 2: Run the focused failing test**

Run: `npm --workspace apps/api run test -- src/services/composeConfig.test.ts`

Expected: FAIL because `composeConfig.ts` does not exist.

- [ ] **Step 3: Implement `composeConfig.ts`**

Create `apps/api/src/services/composeConfig.ts`:

```ts
export type ComposeServiceConfig = {
  serviceName: string;
  imageName: string;
  hasBuild: boolean;
  hasHealthcheck: boolean;
  readinessTimeoutMs: number;
};

type ComposeConfigDocument = {
  services?: Record<string, ComposeServiceDefinition>;
};

type ComposeServiceDefinition = {
  image?: unknown;
  build?: unknown;
  healthcheck?: {
    interval?: unknown;
    timeout?: unknown;
    retries?: unknown;
    start_period?: unknown;
    start_interval?: unknown;
  } | null;
};

const DEFAULT_INTERVAL_MS = 10_000;
const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_RETRIES = 30;
const DEFAULT_START_PERIOD_MS = 0;
const HEALTH_BUFFER_MS = 15_000;
const NO_HEALTHCHECK_TIMEOUT_MS = 60_000;

export function resolveComposeServiceConfig(
  document: ComposeConfigDocument,
  serviceName: string
): ComposeServiceConfig {
  const service = document.services?.[serviceName];
  if (!service) {
    throw new Error(`Compose service not found: ${serviceName}`);
  }

  const imageName = typeof service.image === 'string' && service.image.trim() ? service.image : serviceName;
  const hasBuild = service.build !== undefined && service.build !== null;
  const hasHealthcheck = service.healthcheck !== undefined && service.healthcheck !== null;

  return {
    serviceName,
    imageName,
    hasBuild,
    hasHealthcheck,
    readinessTimeoutMs: hasHealthcheck ? calculateHealthcheckTimeoutMs(service.healthcheck) : NO_HEALTHCHECK_TIMEOUT_MS
  };
}

function calculateHealthcheckTimeoutMs(healthcheck: ComposeServiceDefinition['healthcheck']) {
  const intervalMs = parseComposeDurationMs(healthcheck?.interval, DEFAULT_INTERVAL_MS);
  const timeoutMs = parseComposeDurationMs(healthcheck?.timeout, DEFAULT_TIMEOUT_MS);
  const startPeriodMs = parseComposeDurationMs(healthcheck?.start_period, DEFAULT_START_PERIOD_MS);
  const retries = typeof healthcheck?.retries === 'number' ? healthcheck.retries : DEFAULT_RETRIES;
  return startPeriodMs + (intervalMs + timeoutMs) * retries + HEALTH_BUFFER_MS;
}

export function parseComposeDurationMs(value: unknown, fallbackMs: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.round(value / 1_000_000));
  }

  if (typeof value !== 'string') {
    return fallbackMs;
  }

  const input = value.trim();
  if (!input) {
    return fallbackMs;
  }

  const pattern = /(\d+(?:\.\d+)?)(ns|us|µs|ms|s|m|h)/g;
  let totalMs = 0;
  let matched = false;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(input)) !== null) {
    matched = true;
    const amount = Number(match[1]);
    const unit = match[2];
    if (!Number.isFinite(amount)) {
      return fallbackMs;
    }
    totalMs += amount * unitToMs(unit);
  }

  return matched ? Math.round(totalMs) : fallbackMs;
}

function unitToMs(unit: string) {
  switch (unit) {
    case 'ns':
      return 0.000001;
    case 'us':
    case 'µs':
      return 0.001;
    case 'ms':
      return 1;
    case 's':
      return 1_000;
    case 'm':
      return 60_000;
    case 'h':
      return 3_600_000;
    default:
      return 0;
  }
}
```

- [ ] **Step 4: Verify compose config tests pass**

Run: `npm --workspace apps/api run test -- src/services/composeConfig.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

```bash
git add apps/api/src/services/composeConfig.ts apps/api/src/services/composeConfig.test.ts
git commit -m "feat: resolve compose service config"
```

## Task 3: Add Start Event Types And Orchestrator

**Files:**
- Create: `apps/api/src/services/serviceStartEvents.ts`
- Create: `apps/api/src/services/serviceStartOrchestrator.ts`
- Create: `apps/api/src/services/serviceStartOrchestrator.test.ts`
- Modify: `apps/api/src/app.ts`

- [ ] **Step 1: Write failing orchestrator tests**

Create `apps/api/src/services/serviceStartOrchestrator.test.ts`:

```ts
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { startServiceWithProgress } from './serviceStartOrchestrator.js';
import type { CommandResult, ComposeStream } from './composeRunner.js';
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

function fail(stderr: string, exitCode = 1): CommandResult {
  return { stdout: '', stderr, exitCode };
}

describe('startServiceWithProgress', () => {
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

  it('skips build and pull when the image already exists', async () => {
    const composeCalls: string[][] = [];
    const dockerCalls: string[][] = [];
    const events: StartServiceEvent[] = [];

    await startServiceWithProgress({
      serviceName: 'paysys',
      runCompose: async (args) => {
        composeCalls.push([...args]);
        if (args[0] === 'config') return ok(composeConfig);
        if (args[0] === 'up') return ok('started');
        if (args[0] === 'ps') return ok(JSON.stringify([{ Service: 'paysys', Name: 'paysys', State: 'running', Health: 'healthy' }]));
        return ok();
      },
      runDocker: async (args) => {
        dockerCalls.push([...args]);
        return ok('[]');
      },
      streamCompose: (args) => {
        composeCalls.push([...args]);
        return streamResult('started\n');
      },
      emit: (event) => events.push(event),
      pollIntervalMs: 1
    });

    expect(dockerCalls).toEqual([['image', 'inspect', 'paysys']]);
    expect(composeCalls).toEqual([
      ['config', '--format', 'json'],
      ['up', '-d', 'paysys'],
      ['ps', '--all', '--format', 'json']
    ]);
    expect(events.some((event) => event.type === 'ready')).toBe(true);
  });

  it('builds a missing build-backed image before up', async () => {
    const composeCalls: string[][] = [];

    await startServiceWithProgress({
      serviceName: 'paysys',
      runCompose: async (args) => {
        composeCalls.push([...args]);
        if (args[0] === 'config') return ok(composeConfig);
        if (args[0] === 'ps') return ok(JSON.stringify([{ Service: 'paysys', Name: 'paysys', State: 'running', Health: 'healthy' }]));
        return ok();
      },
      runDocker: async () => fail('No such image: paysys'),
      streamCompose: (args) => {
        composeCalls.push([...args]);
        return streamResult();
      },
      emit: vi.fn(),
      pollIntervalMs: 1
    });

    expect(composeCalls).toContainEqual(['build', 'paysys']);
    expect(composeCalls).toContainEqual(['up', '-d', 'paysys']);
  });

  it('pulls a missing external image before up', async () => {
    const composeCalls: string[][] = [];

    await startServiceWithProgress({
      serviceName: 'jxmysql',
      runCompose: async (args) => {
        composeCalls.push([...args]);
        if (args[0] === 'config') return ok(composeConfig);
        if (args[0] === 'ps') return ok(JSON.stringify([{ Service: 'jxmysql', Name: 'jxmysql', State: 'running', Health: 'healthy' }]));
        return ok();
      },
      runDocker: async () => fail('No such image: mysql:5.6'),
      streamCompose: (args) => {
        composeCalls.push([...args]);
        return streamResult();
      },
      emit: vi.fn(),
      pollIntervalMs: 1
    });

    expect(composeCalls).toContainEqual(['pull', 'jxmysql']);
    expect(composeCalls).toContainEqual(['up', '-d', 'jxmysql']);
  });

  it('emits BUILD_FAILED when build exits non-zero', async () => {
    const events: StartServiceEvent[] = [];

    await startServiceWithProgress({
      serviceName: 'paysys',
      runCompose: async (args) => {
        if (args[0] === 'config') return ok(composeConfig);
        if (args[0] === 'build') return fail('build exploded', 17);
        return ok();
      },
      runDocker: async () => fail('No such image: paysys'),
      streamCompose: (args) => {
        if (args[0] === 'build') return streamResult('', 'build exploded', 17);
        return streamResult();
      },
      emit: (event) => events.push(event),
      pollIntervalMs: 1
    });

    expect(events).toContainEqual(expect.objectContaining({ type: 'error', code: 'BUILD_FAILED', exitCode: 17 }));
  });

  it('emits HEALTH_TIMEOUT when readiness is not reached', async () => {
    const events: StartServiceEvent[] = [];

    await startServiceWithProgress({
      serviceName: 'paysys',
      runCompose: async (args) => {
        if (args[0] === 'config') return ok(composeConfig);
        if (args[0] === 'ps') return ok(JSON.stringify([{ Service: 'paysys', Name: 'paysys', State: 'running', Health: 'starting' }]));
        return ok();
      },
      runDocker: async () => ok(),
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
    let releaseStream: ((value: void) => void) | null = null;

    const first = startServiceWithProgress({
      serviceName: 'paysys',
      runCompose: async (args) => (args[0] === 'config' ? ok(composeConfig) : ok(JSON.stringify([{ Service: 'paysys', Name: 'paysys', State: 'running', Health: 'healthy' }]))),
      runDocker: async () => ok(),
      streamCompose: () => {
        const stdout = new PassThrough();
        const stderr = new PassThrough();
        const stream = Object.assign(new EventEmitter(), { stdout, stderr, kill: vi.fn() });
        new Promise<void>((resolve) => {
          releaseStream = resolve;
        }).then(() => stream.emit('close', 0));
        return stream;
      },
      emit: (event) => firstEvents.push(event),
      pollIntervalMs: 1
    });

    await Promise.resolve();

    await startServiceWithProgress({
      serviceName: 'paysys',
      runCompose: async () => ok(composeConfig),
      runDocker: async () => ok(),
      streamCompose: () => streamResult(),
      emit: (event) => secondEvents.push(event),
      pollIntervalMs: 1
    });

    releaseStream?.();
    await first;

    expect(firstEvents.some((event) => event.type === 'ready')).toBe(true);
    expect(secondEvents).toContainEqual(expect.objectContaining({ type: 'error', code: 'START_ALREADY_RUNNING' }));
  });
});
```

- [ ] **Step 2: Run the focused failing test**

Run: `npm --workspace apps/api run test -- src/services/serviceStartOrchestrator.test.ts`

Expected: FAIL because the orchestrator files do not exist.

- [ ] **Step 3: Add start event types**

Create `apps/api/src/services/serviceStartEvents.ts`:

```ts
export type StartPhase = 'inspect' | 'pull' | 'build' | 'start' | 'wait-ready';

export type StartErrorCode =
  | 'COMPOSE_CONFIG_FAILED'
  | 'IMAGE_INSPECT_FAILED'
  | 'PULL_FAILED'
  | 'BUILD_FAILED'
  | 'UP_FAILED'
  | 'STATUS_CHECK_FAILED'
  | 'HEALTH_TIMEOUT'
  | 'START_ALREADY_RUNNING'
  | 'STREAM_ABORTED';

export type StartServiceEvent =
  | { type: 'phase'; phase: StartPhase; message: string }
  | { type: 'log'; stream: 'stdout' | 'stderr'; message: string }
  | { type: 'error'; code: StartErrorCode; phase: StartPhase; message: string; detail: string; exitCode?: number }
  | { type: 'ready'; service: string; state: string; health: string; message: string }
  | { type: 'close'; exitCode: number };
```

- [ ] **Step 4: Add `runDocker` to app dependencies**

Modify `apps/api/src/app.ts` imports and `AppDeps`:

```ts
import {
  runDocker,
  runDockerCompose,
  runDockerComposeStream,
  type CommandResult,
  type ComposeStream
} from './services/composeRunner.js';

export type AppDeps = {
  config: ManagerConfig;
  runCompose: (args: readonly string[], options?: { stdin?: string | Buffer }) => Promise<CommandResult>;
  runDocker: (args: readonly string[], options?: { stdin?: string | Buffer }) => Promise<CommandResult>;
  streamCompose: (args: readonly string[]) => ComposeStream;
  gameAccounts: GameAccountService;
};
```

Set default dependency:

```ts
runDocker: overrides.runDocker ?? ((args, options) => runDocker(args, config.projectRoot, options)),
```

- [ ] **Step 5: Implement orchestrator**

Create `apps/api/src/services/serviceStartOrchestrator.ts`:

```ts
import { parseManagedServiceStatuses } from './serviceStatus.js';
import { resolveComposeServiceConfig } from './composeConfig.js';
import type { CommandResult, ComposeStream } from './composeRunner.js';
import type { ServiceName } from './serviceAllowlist.js';
import type { StartErrorCode, StartPhase, StartServiceEvent } from './serviceStartEvents.js';

type StartOptions = {
  serviceName: ServiceName | string;
  runCompose: (args: readonly string[]) => Promise<CommandResult>;
  runDocker: (args: readonly string[]) => Promise<CommandResult>;
  streamCompose: (args: readonly string[]) => ComposeStream;
  emit: (event: StartServiceEvent) => void;
  signal?: AbortSignal;
  pollIntervalMs?: number;
  readinessTimeoutOverrideMs?: number;
};

const DEFAULT_POLL_INTERVAL_MS = 2_000;
const activeStartServices = new Set<string>();

export async function startServiceWithProgress(options: StartOptions) {
  if (activeStartServices.has(options.serviceName)) {
    emitError(options.emit, 'START_ALREADY_RUNNING', 'inspect', `Dịch vụ ${options.serviceName} đang được khởi chạy.`, '', 1);
    options.emit({ type: 'close', exitCode: 1 });
    return;
  }

  activeStartServices.add(options.serviceName);

  try {
    await runStartPipeline(options);
  } finally {
    activeStartServices.delete(options.serviceName);
  }
}

async function runStartPipeline(options: StartOptions) {
  const emit = options.emit;

  const configResult = await runPhaseCommand({
    phase: 'inspect',
    errorCode: 'COMPOSE_CONFIG_FAILED',
    message: 'Không đọc được Docker Compose config.',
    command: () => options.runCompose(['config', '--format', 'json']),
    emit
  });
  if (!configResult) return;

  let serviceConfig;
  try {
    serviceConfig = resolveComposeServiceConfig(JSON.parse(configResult.stdout), options.serviceName);
  } catch (error) {
    emitError(emit, 'COMPOSE_CONFIG_FAILED', 'inspect', 'Không phân tích được Docker Compose config.', error instanceof Error ? error.message : String(error));
    emit({ type: 'close', exitCode: 1 });
    return;
  }

  emit({ type: 'phase', phase: 'inspect', message: `Đang kiểm tra image ${serviceConfig.imageName}...` });
  const inspectResult = await options.runDocker(['image', 'inspect', serviceConfig.imageName]);
  const imageMissing = inspectResult.exitCode !== 0 && isMissingImageOutput(`${inspectResult.stderr}\n${inspectResult.stdout}`);
  if (inspectResult.exitCode !== 0 && !imageMissing) {
    emitError(emit, 'IMAGE_INSPECT_FAILED', 'inspect', `Không kiểm tra được image ${serviceConfig.imageName}.`, formatDetail(inspectResult), inspectResult.exitCode);
    emit({ type: 'close', exitCode: inspectResult.exitCode });
    return;
  }

  if (imageMissing) {
    const phase: StartPhase = serviceConfig.hasBuild ? 'build' : 'pull';
    const args = serviceConfig.hasBuild ? ['build', options.serviceName] : ['pull', options.serviceName];
    const errorCode: StartErrorCode = serviceConfig.hasBuild ? 'BUILD_FAILED' : 'PULL_FAILED';
    const label = serviceConfig.hasBuild ? 'Build' : 'Pull';
    const prepared = await runStreamPhaseCommand({
      phase,
      errorCode,
      message: `${label} image ${serviceConfig.imageName} thất bại.`,
      command: () => options.streamCompose(args),
      emit,
      signal: options.signal
    });
    if (!prepared) return;
  }

  const upResult = await runStreamPhaseCommand({
    phase: 'start',
    errorCode: 'UP_FAILED',
    message: `Khởi chạy dịch vụ ${options.serviceName} thất bại.`,
    command: () => options.streamCompose(['up', '-d', options.serviceName]),
    emit,
    signal: options.signal
  });
  if (!upResult) return;

  await waitForReadiness({
    serviceName: options.serviceName,
    hasHealthcheck: serviceConfig.hasHealthcheck,
    timeoutMs: options.readinessTimeoutOverrideMs ?? serviceConfig.readinessTimeoutMs,
    pollIntervalMs: options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
    runCompose: options.runCompose,
    emit,
    signal: options.signal
  });
}

async function runPhaseCommand(input: {
  phase: StartPhase;
  errorCode: StartErrorCode;
  message: string;
  command: () => Promise<CommandResult>;
  emit: (event: StartServiceEvent) => void;
}) {
  input.emit({ type: 'phase', phase: input.phase, message: phaseMessage(input.phase) });
  const result = await input.command();
  emitCommandLogs(input.emit, result);
  if (result.exitCode !== 0) {
    emitError(input.emit, input.errorCode, input.phase, input.message, formatDetail(result), result.exitCode);
    input.emit({ type: 'close', exitCode: result.exitCode });
    return null;
  }
  return result;
}

async function runStreamPhaseCommand(input: {
  phase: StartPhase;
  errorCode: StartErrorCode;
  message: string;
  command: () => ComposeStream;
  emit: (event: StartServiceEvent) => void;
  signal?: AbortSignal;
}) {
  input.emit({ type: 'phase', phase: input.phase, message: phaseMessage(input.phase) });
  const stream = input.command();
  let stdout = '';
  let stderr = '';
  let aborted = false;

  const abort = () => {
    aborted = true;
    stream.kill('SIGTERM');
  };

  input.signal?.addEventListener('abort', abort, { once: true });

  const exitCode = await new Promise<number>((resolve) => {
    stream.stdout.setEncoding('utf8');
    stream.stderr.setEncoding('utf8');
    stream.stdout.on('data', (chunk: string) => {
      stdout += chunk;
      input.emit({ type: 'log', stream: 'stdout', message: chunk });
    });
    stream.stderr.on('data', (chunk: string) => {
      stderr += chunk;
      input.emit({ type: 'log', stream: 'stderr', message: chunk });
    });
    stream.on('error', (error: Error) => {
      stderr += error.message;
      resolve(1);
    });
    stream.on('close', (code) => {
      resolve(code ?? 1);
    });
  });

  input.signal?.removeEventListener('abort', abort);

  if (aborted) {
    emitError(input.emit, 'STREAM_ABORTED', input.phase, 'Kết nối theo dõi đã bị đóng.', stderr || stdout, 1);
    input.emit({ type: 'close', exitCode: 1 });
    return null;
  }

  if (exitCode !== 0) {
    emitError(input.emit, input.errorCode, input.phase, input.message, `${stderr}\n${stdout}`.trim(), exitCode);
    input.emit({ type: 'close', exitCode });
    return null;
  }

  return { stdout, stderr, exitCode } satisfies CommandResult;
}

async function waitForReadiness(input: {
  serviceName: string;
  hasHealthcheck: boolean;
  timeoutMs: number;
  pollIntervalMs: number;
  runCompose: (args: readonly string[]) => Promise<CommandResult>;
  emit: (event: StartServiceEvent) => void;
  signal?: AbortSignal;
}) {
  input.emit({ type: 'phase', phase: 'wait-ready', message: `Đang chờ dịch vụ ${input.serviceName} sẵn sàng...` });
  const deadline = Date.now() + input.timeoutMs;

  while (Date.now() <= deadline) {
    if (input.signal?.aborted) {
      emitError(input.emit, 'STREAM_ABORTED', 'wait-ready', 'Kết nối theo dõi đã bị đóng.', '', 1);
      input.emit({ type: 'close', exitCode: 1 });
      return;
    }

    const result = await input.runCompose(['ps', '--all', '--format', 'json']);
    if (result.exitCode !== 0) {
      emitError(input.emit, 'STATUS_CHECK_FAILED', 'wait-ready', 'Không đọc được trạng thái Docker Compose.', formatDetail(result), result.exitCode);
      input.emit({ type: 'close', exitCode: result.exitCode });
      return;
    }

    const status = parseManagedServiceStatuses(result.stdout).find((item) => item.name === input.serviceName);
    if (status && isReady(status.state, status.health, input.hasHealthcheck)) {
      input.emit({ type: 'ready', service: input.serviceName, state: status.state, health: status.health, message: `Dịch vụ ${input.serviceName} đã sẵn sàng.` });
      input.emit({ type: 'close', exitCode: 0 });
      return;
    }

    await sleep(input.pollIntervalMs);
  }

  emitError(input.emit, 'HEALTH_TIMEOUT', 'wait-ready', `Dịch vụ ${input.serviceName} chưa sẵn sàng sau thời gian chờ.`, '', 1);
  input.emit({ type: 'close', exitCode: 1 });
}

function isReady(state: string, health: string, hasHealthcheck: boolean) {
  return hasHealthcheck ? state === 'running' && health === 'healthy' : state === 'running';
}

function isMissingImageOutput(output: string) {
  return /no such image|not found|reference does not exist/i.test(output);
}

function emitCommandLogs(emit: (event: StartServiceEvent) => void, result: CommandResult) {
  if (result.stdout) emit({ type: 'log', stream: 'stdout', message: result.stdout });
  if (result.stderr) emit({ type: 'log', stream: 'stderr', message: result.stderr });
}

function emitError(emit: (event: StartServiceEvent) => void, code: StartErrorCode, phase: StartPhase, message: string, detail: string, exitCode?: number) {
  emit({ type: 'error', code, phase, message, detail: detail.trim().slice(0, 2_000), exitCode });
}

function formatDetail(result: CommandResult) {
  return `${result.stderr}\n${result.stdout}`.trim();
}

function phaseMessage(phase: StartPhase) {
  const messages: Record<StartPhase, string> = {
    inspect: 'Đang đọc Docker Compose config...',
    pull: 'Đang pull image...',
    build: 'Đang build image...',
    start: 'Đang khởi chạy service...',
    'wait-ready': 'Đang chờ service sẵn sàng...'
  };
  return messages[phase];
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
```

- [ ] **Step 6: Verify orchestrator tests pass**

Run: `npm --workspace apps/api run test -- src/services/serviceStartOrchestrator.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit Task 3**

```bash
git add apps/api/src/app.ts apps/api/src/services/serviceStartEvents.ts apps/api/src/services/serviceStartOrchestrator.ts apps/api/src/services/serviceStartOrchestrator.test.ts
git commit -m "feat: orchestrate service start phases"
```

## Task 4: Wire Orchestrator Into Start SSE Route

**Files:**
- Modify: `apps/api/src/routes/serviceRoutes.ts`
- Modify: `apps/api/src/routes/serviceRoutes.test.ts`

- [ ] **Step 1: Add failing route tests for structured SSE**

Append these tests to `apps/api/src/routes/serviceRoutes.test.ts`:

```ts
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
            stdout: JSON.stringify({ services: { paysys: { image: 'paysys', build: { context: '.' }, healthcheck: { interval: '1s', timeout: '1s', retries: 1, start_period: '0s' } } } }),
            stderr: '',
            exitCode: 0
          };
        }
        if (args[0] === 'ps') {
          return { stdout: JSON.stringify([{ Service: 'paysys', Name: 'paysys', State: 'running', Health: 'healthy' }]), stderr: '', exitCode: 0 };
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
    expect(composeCalls).toContainEqual(['up', '-d', 'paysys']);
    expect(composeCalls).not.toContainEqual(['up', '-d', '--build', '--no-deps', 'paysys']);
  });

  it('streams structured errors when start fails', async () => {
    const app = await buildApp({
      config: testConfig(root),
      runDocker: async () => ({ stdout: '[]', stderr: '', exitCode: 0 }),
      runCompose: async (args) => {
        if (args[0] === 'config') {
          return { stdout: JSON.stringify({ services: { paysys: { image: 'paysys', build: { context: '.' } } } }), stderr: '', exitCode: 0 };
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
```

Also add these imports at the top of `apps/api/src/routes/serviceRoutes.test.ts`:

```ts
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { ComposeStream } from '../services/composeRunner.js';
```

The file already imports `vi` from Vitest. If it does not after local edits, use this import shape:

```ts
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
```

- [ ] **Step 2: Run the route tests and verify failure**

Run: `npm --workspace apps/api run test -- src/routes/serviceRoutes.test.ts`

Expected: FAIL because the route still emits the old string log format and uses `--build --no-deps`.

- [ ] **Step 3: Update start stream route**

In `apps/api/src/routes/serviceRoutes.ts`, import the orchestrator and event type:

```ts
import { startServiceWithProgress } from '../services/serviceStartOrchestrator.js';
import type { StartServiceEvent } from '../services/serviceStartEvents.js';
```

Replace the body of `app.get('/api/services/:name/start/stream', ...)` after validation with:

```ts
    const abortController = new AbortController();
    let closed = false;

    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    reply.raw.write(':\n\n');

    const writeEvent = (event: StartServiceEvent) => {
      if (reply.raw.destroyed) {
        return;
      }
      reply.raw.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      if (event.type === 'close') {
        closed = true;
        reply.raw.end();
      }
    };

    request.raw.on('close', () => {
      if (!closed) {
        abortController.abort();
      }
    });

    void startServiceWithProgress({
      serviceName: name,
      runCompose: app.deps.runCompose,
      runDocker: app.deps.runDocker,
      streamCompose: app.deps.streamCompose,
      emit: writeEvent,
      signal: abortController.signal
    }).catch((error: unknown) => {
      const detail = error instanceof Error ? error.message : String(error);
      writeEvent({
        type: 'error',
        code: 'UP_FAILED',
        phase: 'start',
        message: `Khởi chạy dịch vụ ${name} thất bại.`,
        detail
      });
      writeEvent({ type: 'close', exitCode: 1 });
    });
```

Remove the old `streamCompose(['up', '-d', '--build', '--no-deps', name])` logic from this route.

- [ ] **Step 4: Verify route tests pass**

Run: `npm --workspace apps/api run test -- src/routes/serviceRoutes.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit Task 4**

```bash
git add apps/api/src/routes/serviceRoutes.ts apps/api/src/routes/serviceRoutes.test.ts
git commit -m "feat: stream structured service start events"
```

## Task 5: Update ServiceActionModal To Consume Structured Events

**Files:**
- Modify: `apps/ui/src/components/ServiceActionModal.tsx`
- Create: `apps/ui/src/components/ServiceActionModal.test.tsx`

- [ ] **Step 1: Write failing UI tests**

Create `apps/ui/src/components/ServiceActionModal.test.tsx`:

```tsx
import { act, cleanup, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/utils/test/renderWithProviders';
import { ServiceActionModal } from './ServiceActionModal';

type Listener = (event: MessageEvent<string>) => void;

const listeners = new Map<string, Listener[]>();

class MockEventSource {
  url: string;
  close = vi.fn();

  constructor(url: string) {
    this.url = url;
  }

  addEventListener(type: string, listener: Listener) {
    const current = listeners.get(type) ?? [];
    listeners.set(type, [...current, listener]);
  }
}

function emitSse(type: string, data: unknown) {
  const event = new MessageEvent(type, { data: JSON.stringify(data) });
  for (const listener of listeners.get(type) ?? []) {
    listener(event);
  }
}

const service = {
  name: 'paysys',
  containerName: 'paysys',
  state: 'stopped',
  health: 'none',
  image: 'paysys',
  ports: [],
  startedAt: null
};

describe('ServiceActionModal structured start events', () => {
  beforeEach(() => {
    listeners.clear();
    vi.useFakeTimers();
    vi.stubGlobal('EventSource', MockEventSource);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    cleanup();
  });

  it('renders phase and log events in the terminal', async () => {
    renderWithProviders(
      <ServiceActionModal opened service="paysys" action="start" loading services={[service]} onClose={vi.fn()} onConfirm={vi.fn()} />
    );

    act(() => vi.advanceTimersByTime(250));
    act(() => {
      emitSse('phase', { type: 'phase', phase: 'build', message: 'Đang build image paysys...' });
      emitSse('log', { type: 'log', stream: 'stdout', message: 'Step 1/4\n' });
    });

    expect(screen.getByText(/Đang build image paysys/)).toBeTruthy();
    expect(screen.getByText(/Step 1\/4/)).toBeTruthy();
  });

  it('shows structured error details and does not call onComplete', () => {
    const onComplete = vi.fn();
    renderWithProviders(
      <ServiceActionModal opened service="paysys" action="start" loading services={[service]} onClose={vi.fn()} onConfirm={vi.fn()} onComplete={onComplete} />
    );

    act(() => vi.advanceTimersByTime(250));
    act(() => {
      emitSse('error', { type: 'error', code: 'BUILD_FAILED', phase: 'build', message: 'Build image paysys thất bại.', detail: 'missing package', exitCode: 17 });
      emitSse('close', { type: 'close', exitCode: 17 });
    });

    expect(screen.getByText(/BUILD_FAILED/)).toBeTruthy();
    expect(screen.getByText(/missing package/)).toBeTruthy();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('calls onComplete only after ready', () => {
    const onComplete = vi.fn();
    renderWithProviders(
      <ServiceActionModal opened service="paysys" action="start" loading services={[service]} onClose={vi.fn()} onConfirm={vi.fn()} onComplete={onComplete} />
    );

    act(() => vi.advanceTimersByTime(250));
    act(() => emitSse('close', { type: 'close', exitCode: 0 }));
    expect(onComplete).not.toHaveBeenCalled();

    act(() => emitSse('ready', { type: 'ready', service: 'paysys', state: 'running', health: 'healthy', message: 'Dịch vụ paysys đã sẵn sàng.' }));
    act(() => vi.advanceTimersByTime(1500));

    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the focused failing UI tests**

Run: `npm --workspace apps/ui run vitest -- src/components/ServiceActionModal.test.tsx`

Expected: FAIL because the modal still expects string `log` events and closes through polling instead of `ready`.

- [ ] **Step 3: Add structured event parsing in `ServiceActionModal.tsx`**

Inside the start EventSource block, add local types:

```ts
type StartPhaseEvent = { type: 'phase'; phase: string; message: string };
type StartLogEvent = { type: 'log'; stream: 'stdout' | 'stderr'; message: string };
type StartErrorEvent = { type: 'error'; code: string; message: string; detail: string; exitCode?: number };
type StartReadyEvent = { type: 'ready'; service: string; state: string; health: string; message: string };
type StartCloseEvent = { type: 'close'; exitCode: number };
```

Replace the current `appendLog` and close handling for `action === 'start'` with handlers shaped like this:

```ts
let readyReceived = false;
let errorReceived = false;

const appendTerminalLine = (line: string) => {
  setLogs((current) => `${current}${line.endsWith('\n') ? line : `${line}\n`}`);
};

const parseEventData = <T,>(event: MessageEvent<string>): T | null => {
  try {
    return JSON.parse(event.data) as T;
  } catch {
    return null;
  }
};

const handlePhase = (event: MessageEvent<string>) => {
  const data = parseEventData<StartPhaseEvent>(event);
  if (data) appendTerminalLine(`[${data.phase}] ${data.message}`);
};

const handleLog = (event: MessageEvent<string>) => {
  const data = parseEventData<StartLogEvent>(event);
  appendTerminalLine(data ? data.message : event.data);
};

const handleStartError = (event: MessageEvent<string>) => {
  const data = parseEventData<StartErrorEvent>(event);
  errorReceived = true;
  const message = data
    ? `[${data.code}] ${data.message}${data.exitCode !== undefined ? ` (exitCode: ${data.exitCode})` : ''}\n${data.detail}`
    : event.data;
  appendTerminalLine(message);
  notifications.show({
    title: data ? `Lỗi ${data.code}` : 'Lỗi tiến trình',
    message: data?.message ?? 'Tiến trình start thất bại.',
    color: 'red'
  });
};

const handleReady = (event: MessageEvent<string>) => {
  const data = parseEventData<StartReadyEvent>(event);
  readyReceived = true;
  appendTerminalLine(data?.message ?? `Dịch vụ ${service} đã sẵn sàng.`);
  notifications.show({
    title: 'Thành công',
    message: `Khởi động dịch vụ ${service} thành công!`,
    color: 'green'
  });
  setTimeout(() => {
    onCompleteRef.current?.();
  }, 1500);
};

const handleCloseEvent = (event: Event) => {
  streamEnded = true;
  const data = parseEventData<StartCloseEvent>(event as MessageEvent<string>);
  source?.close();
  if (activeEventSourceRef.current === source) {
    activeEventSourceRef.current = null;
    activeStreamTargetRef.current = null;
  }
  if (!readyReceived && !errorReceived) {
    appendTerminalLine(`[Hệ thống] Tiến trình kết thúc với mã ${data?.exitCode ?? 'không xác định'}, đang chờ trạng thái ready.`);
  }
};
```

Register the new listeners:

```ts
source.addEventListener('phase', handlePhase);
source.addEventListener('log', handleLog);
source.addEventListener('error', handleStartError);
source.addEventListener('ready', handleReady);
source.addEventListener('close', handleCloseEvent);
```

- [ ] **Step 4: Remove start success auto-close from polling effect**

In the effect that watches `services`, narrow the auto-close logic so polling handles `stop` and `restart`, but `start` success is driven by `ready` SSE:

```ts
if (action === 'start') {
  return;
}
```

Place this after the early guard and before calculating `currentService`.

- [ ] **Step 5: Verify UI tests pass**

Run: `npm --workspace apps/ui run vitest -- src/components/ServiceActionModal.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit Task 5**

```bash
git add apps/ui/src/components/ServiceActionModal.tsx apps/ui/src/components/ServiceActionModal.test.tsx
git commit -m "feat: consume structured start events"
```

## Task 6: Full Verification And Cleanup

**Files:**
- Modify only files needed to fix verification failures found in this task.

- [ ] **Step 1: Run API tests**

Run: `npm --workspace apps/api run test`

Expected: PASS.

- [ ] **Step 2: Run UI focused tests**

Run: `npm --workspace apps/ui run vitest -- src/components/ServiceActionModal.test.tsx`

Expected: PASS.

- [ ] **Step 3: Run typechecks**

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 4: Run full workspace tests**

Run: `npm test`

Expected: PASS. If format or lint fails on existing unrelated files, capture exact file paths and only fix files touched by this implementation unless the failure blocks build output.

- [ ] **Step 5: Review git diff for accidental scope drift**

Run: `git diff --stat`

Expected: changed files match the file structure section.

Run: `git diff -- apps/api/src apps/ui/src`

Expected: no hardcoded secrets, no shell interpolation, no `--no-deps` in the start stream route, and no UI success close path that ignores `ready`.

- [ ] **Step 6: Commit verification fixes**

If Step 1-5 required fixes, commit them:

```bash
git add apps/api/src apps/ui/src
git commit -m "fix: stabilize service start orchestration"
```

If no fixes were needed, do not create an empty commit.

## Self-Review Notes

- Spec coverage: image inspect, build, pull, up without `--no-deps`, readiness polling, structured errors, modal ready behavior, and healthcheck-derived timeout are all covered by Tasks 1-5.
- Placeholder scan: this plan contains concrete file paths, commands, expected outcomes, and code snippets for each code-changing task.
- Type consistency: API event types use `type` as the discriminant and SSE event names mirror the same values: `phase`, `log`, `error`, `ready`, `close`.
