import { resolveComposeServiceConfig, type ComposeConfigDocument } from './composeConfig.js';
import type { CommandResult, ComposeStream } from './composeRunner.js';
import type { ServiceName } from './serviceAllowlist.js';
import { parseManagedServiceStatuses } from './serviceStatus.js';
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
const DETAIL_LIMIT = 2_000;
const activeStartServices = new Set<string>();

export async function startServiceWithProgress(options: StartOptions) {
  if (activeStartServices.has(options.serviceName)) {
    emitError(
      options.emit,
      'START_ALREADY_RUNNING',
      'inspect',
      `Dịch vụ ${options.serviceName} đang được khởi chạy.`,
      '',
      1
    );
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
    emit,
    emitLogs: false
  });
  if (!configResult) return;

  const serviceConfig = parseServiceConfig(configResult.stdout, options.serviceName, emit);
  if (!serviceConfig) return;

  emit({ type: 'phase', phase: 'inspect', message: `Đang kiểm tra image ${serviceConfig.imageName}...` });
  const inspectResult = await options.runDocker(['image', 'inspect', serviceConfig.imageName]);
  const imageMissing =
    inspectResult.exitCode !== 0 &&
    isMissingImageOutput(`${inspectResult.stderr}\n${inspectResult.stdout}`);

  if (inspectResult.exitCode !== 0 && !imageMissing) {
    emitError(
      emit,
      'IMAGE_INSPECT_FAILED',
      'inspect',
      `Không kiểm tra được image ${serviceConfig.imageName}.`,
      formatDetail(inspectResult),
      inspectResult.exitCode
    );
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
    command: () => options.streamCompose(['up', '-d', '--no-build', options.serviceName]),
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

function parseServiceConfig(
  stdout: string,
  serviceName: string,
  emit: (event: StartServiceEvent) => void
) {
  try {
    return resolveComposeServiceConfig(JSON.parse(stdout) as ComposeConfigDocument, serviceName);
  } catch (error) {
    emitError(
      emit,
      'COMPOSE_CONFIG_FAILED',
      'inspect',
      'Không phân tích được Docker Compose config.',
      error instanceof Error ? error.message : String(error),
      1
    );
    emit({ type: 'close', exitCode: 1 });
    return null;
  }
}

async function runPhaseCommand(input: {
  phase: StartPhase;
  errorCode: StartErrorCode;
  message: string;
  command: () => Promise<CommandResult>;
  emit: (event: StartServiceEvent) => void;
  emitLogs?: boolean;
}) {
  input.emit({ type: 'phase', phase: input.phase, message: phaseMessage(input.phase) });
  const result = await input.command();
  if (input.emitLogs !== false) {
    emitCommandLogs(input.emit, result);
  }
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
  if (input.signal?.aborted) {
    abort();
  }

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
  input.emit({
    type: 'phase',
    phase: 'wait-ready',
    message: `Đang chờ dịch vụ ${input.serviceName} sẵn sàng...`
  });
  const deadline = Date.now() + input.timeoutMs;

  while (Date.now() <= deadline) {
    if (input.signal?.aborted) {
      emitError(input.emit, 'STREAM_ABORTED', 'wait-ready', 'Kết nối theo dõi đã bị đóng.', '', 1);
      input.emit({ type: 'close', exitCode: 1 });
      return;
    }

    const result = await input.runCompose(['ps', '--all', '--format', 'json']);
    if (result.exitCode !== 0) {
      emitError(
        input.emit,
        'STATUS_CHECK_FAILED',
        'wait-ready',
        'Không đọc được trạng thái Docker Compose.',
        formatDetail(result),
        result.exitCode
      );
      input.emit({ type: 'close', exitCode: result.exitCode });
      return;
    }

    const status = parseManagedServiceStatuses(result.stdout).find(
      (item) => item.name === input.serviceName
    );
    if (status && isReady(status.state, status.health, input.hasHealthcheck)) {
      input.emit({
        type: 'ready',
        service: input.serviceName,
        state: status.state,
        health: status.health,
        message: `Dịch vụ ${input.serviceName} đã sẵn sàng.`
      });
      input.emit({ type: 'close', exitCode: 0 });
      return;
    }

    await sleep(input.pollIntervalMs);
  }

  emitError(
    input.emit,
    'HEALTH_TIMEOUT',
    'wait-ready',
    `Dịch vụ ${input.serviceName} chưa sẵn sàng sau thời gian chờ.`,
    '',
    1
  );
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

function emitError(
  emit: (event: StartServiceEvent) => void,
  code: StartErrorCode,
  phase: StartPhase,
  message: string,
  detail: string,
  exitCode?: number
) {
  emit({ type: 'error', code, phase, message, detail: detail.trim().slice(0, DETAIL_LIMIT), exitCode });
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
