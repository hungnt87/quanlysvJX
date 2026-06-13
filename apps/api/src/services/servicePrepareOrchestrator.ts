import { resolveComposeServiceConfig, type ComposeConfigDocument } from './composeConfig.js';
import type { CommandResult, ComposeStream } from './composeRunner.js';

export type PrepareServiceEvent =
  | { type: 'start'; service: string; phase: 'pull' | 'build'; message: string }
  | { type: 'log'; service: string; stream: 'stdout' | 'stderr'; message: string }
  | { type: 'success'; service: string; message: string }
  | { type: 'error'; service: string; message: string; detail: string; exitCode?: number }
  | { type: 'close'; exitCode: number };

type PrepareOptions = {
  services: string[];
  runDocker: (args: readonly string[]) => Promise<CommandResult>;
  streamCompose: (args: readonly string[]) => ComposeStream;
  emit: (event: PrepareServiceEvent) => void;
  composeConfig: ComposeConfigDocument;
  shouldPrepare?: (serviceName: string) => boolean;
  markPrepared?: (serviceName: string) => void;
  signal?: AbortSignal;
};

export async function prepareServicesWithProgress(options: PrepareOptions) {
  const { services, runDocker, streamCompose, emit, composeConfig, signal } = options;

  for (const serviceName of services) {
    if (signal?.aborted) {
      emit({ type: 'error', service: serviceName, message: 'Đã hủy tiến trình chuẩn bị.', detail: '' });
      emit({ type: 'close', exitCode: 1 });
      return;
    }

    let serviceConfig;
    try {
      serviceConfig = resolveComposeServiceConfig(composeConfig, serviceName);
    } catch (error) {
      emit({
        type: 'error',
        service: serviceName,
        message: `Không tìm thấy cấu hình cho dịch vụ ${serviceName}.`,
        detail: error instanceof Error ? error.message : String(error)
      });
      emit({ type: 'close', exitCode: 1 });
      return;
    }

    const { imageName, hasBuild } = serviceConfig;
    const shouldForcePrepare = options.shouldPrepare?.(serviceName) ?? false;

    // Check if image already exists
    const inspectResult = await runDocker(['image', 'inspect', imageName]);
    if (inspectResult.exitCode === 0 && !shouldForcePrepare) {
      emit({
        type: 'success',
        service: serviceName,
        message: `Image ${imageName} đã tồn tại cục bộ.`
      });
      continue;
    }

    const phase = hasBuild ? 'build' : 'pull';
    const args = hasBuild ? ['build', serviceName] : ['pull', serviceName];
    const label = hasBuild ? 'Build' : 'Pull';

    emit({
      type: 'start',
      service: serviceName,
      phase,
      message: `Đang ${label.toLowerCase()} image cho dịch vụ ${serviceName}...`
    });

    const stream = streamCompose(args);
    let stdout = '';
    let stderr = '';
    let aborted = false;

    const abort = () => {
      aborted = true;
      stream.kill('SIGTERM');
    };

    const onAbort = () => {
      abort();
    };

    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) {
      abort();
    }

    const exitCode = await new Promise<number>((resolve) => {
      stream.stdout.setEncoding('utf8');
      stream.stderr.setEncoding('utf8');
      stream.stdout.on('data', (chunk: string) => {
        stdout += chunk;
        emit({ type: 'log', service: serviceName, stream: 'stdout', message: chunk });
      });
      stream.stderr.on('data', (chunk: string) => {
        stderr += chunk;
        emit({ type: 'log', service: serviceName, stream: 'stderr', message: chunk });
      });
      stream.on('error', (error: Error) => {
        stderr += error.message;
        resolve(1);
      });
      stream.on('close', (code) => {
        resolve(code ?? 1);
      });
    });

    signal?.removeEventListener('abort', onAbort);

    if (aborted) {
      emit({
        type: 'error',
        service: serviceName,
        message: 'Kết nối theo dõi đã bị đóng.',
        detail: stderr || stdout
      });
      emit({ type: 'close', exitCode: 1 });
      return;
    }

    if (exitCode !== 0) {
      emit({
        type: 'error',
        service: serviceName,
        message: `${label} image cho dịch vụ ${serviceName} thất bại.`,
        detail: `${stderr}\n${stdout}`.trim(),
        exitCode
      });
      emit({ type: 'close', exitCode });
      return;
    }

    emit({
      type: 'success',
      service: serviceName,
      message: `Đã chuẩn bị xong image cho dịch vụ ${serviceName}.`
    });
    options.markPrepared?.(serviceName);
  }

  emit({ type: 'close', exitCode: 0 });
}
