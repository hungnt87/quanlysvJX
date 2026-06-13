import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ServiceService } from '../services/serviceService.js';
import { success } from '../utils/response.js';
import { assertServiceName } from '../services/serviceAllowlist.js';
import { ValidationError } from '../utils/errors.js';
import { prepareServicesWithProgress, type PrepareServiceEvent } from '../services/servicePrepareOrchestrator.js';
import { startServiceWithProgress } from '../services/serviceStartOrchestrator.js';
import { getServiceBuildReadiness, markServiceImagePrepared } from '../services/serviceImageBuildState.js';
import type { StartServiceEvent } from '../services/serviceStartEvents.js';
import type { AppDeps } from '../app.js';

export class ServiceController {
  constructor(
    private readonly serviceService: ServiceService,
    private readonly deps: {
      runCompose: AppDeps['runCompose'];
      runDocker: AppDeps['runDocker'];
      streamCompose: AppDeps['streamCompose'];
    }
  ) {}

  /**
   * Lấy danh sách dịch vụ
   */
  async listServices(_request: FastifyRequest, reply: FastifyReply) {
    const list = await this.serviceService.getServicesList();
    return reply.send(success(list));
  }

  /**
   * Bắt đầu một dịch vụ
   */
  async startService(request: FastifyRequest<{ Params: { name: string } }>, reply: FastifyReply) {
    const name = request.params.name;
    const result = await this.serviceService.executeServiceAction(name, 'start');
    return reply.send(success(result));
  }

  /**
   * Dừng một dịch vụ
   */
  async stopService(request: FastifyRequest<{ Params: { name: string } }>, reply: FastifyReply) {
    const name = request.params.name;
    const result = await this.serviceService.executeServiceAction(name, 'stop');
    return reply.send(success(result));
  }

  /**
   * Khởi động lại một dịch vụ
   */
  async restartService(request: FastifyRequest<{ Params: { name: string } }>, reply: FastifyReply) {
    const name = request.params.name;
    const result = await this.serviceService.executeServiceAction(name, 'restart');
    return reply.send(success(result));
  }

  /**
   * Stream chuẩn bị Docker Images qua Server-Sent Events (SSE)
   */
  prepareImagesStream(request: FastifyRequest, reply: FastifyReply) {
    const abortController = new AbortController();
    let closed = false;
    let names: string[] = [];

    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    reply.raw.write(':\n\n');

    const heartbeat = setInterval(() => {
      if (!reply.raw.destroyed) {
        reply.raw.write(': heartbeat\n\n');
      } else {
        clearInterval(heartbeat);
      }
    }, 10000);

    const writeEvent = (event: PrepareServiceEvent) => {
      if (reply.raw.destroyed) {
        clearInterval(heartbeat);
        return;
      }
      reply.raw.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      if (event.type === 'close') {
        clearInterval(heartbeat);
        closed = true;
        reply.raw.end();
      }
    };

    request.raw.on('close', () => {
      clearInterval(heartbeat);
      if (!closed) {
        abortController.abort();
      }
    });

    void (async () => {
      this.serviceService.assertActiveVersion();

      const query = request.query as { services?: string };
      const servicesParam = query.services || '';
      names = servicesParam
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((name) => assertServiceName(name));

      if (names.length === 0) {
        throw new ValidationError('Danh sách dịch vụ cần chuẩn bị không được trống.');
      }

      // Lấy cấu hình Docker Compose từ repository (thông qua service)
      // Để tránh thay đổi lớn, ta cast tạm hoặc gọi api nội bộ
      const composeConfig = await (this.serviceService as any).serviceRepository.getComposeConfig();
      if (!composeConfig) {
        throw new Error('Không đọc được cấu hình Docker Compose.');
      }

      await prepareServicesWithProgress({
        services: names,
        runDocker: this.deps.runDocker,
        streamCompose: this.deps.streamCompose,
        emit: writeEvent,
        composeConfig,
        shouldPrepare: (serviceName) => {
          return getServiceBuildReadiness(
            request.server.deps.config.projectRoot,
            composeConfig,
            serviceName,
            true
          ).needsRebuild;
        },
        markPrepared: (serviceName) => {
          markServiceImagePrepared(request.server.deps.config.projectRoot, composeConfig, serviceName);
        },
        signal: abortController.signal
      });
    })().catch((error: unknown) => {
      const detail = error instanceof Error ? error.message : String(error);
      writeEvent({
        type: 'error',
        service: names[0] || 'unknown',
        message: 'Chuẩn bị image thất bại.',
        detail
      });
      writeEvent({ type: 'close', exitCode: 1 });
    });
  }

  /**
   * Stream quá trình khởi chạy dịch vụ qua SSE
   */
  startServiceStream(request: FastifyRequest, reply: FastifyReply) {
    const name = assertServiceName((request.params as { name: string }).name);
    this.serviceService.assertActiveVersion();

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

    const heartbeat = setInterval(() => {
      if (!reply.raw.destroyed) {
        reply.raw.write(': heartbeat\n\n');
      } else {
        clearInterval(heartbeat);
      }
    }, 10000);

    const writeEvent = (event: StartServiceEvent) => {
      if (reply.raw.destroyed) {
        clearInterval(heartbeat);
        return;
      }
      reply.raw.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      if (event.type === 'close') {
        clearInterval(heartbeat);
        closed = true;
        reply.raw.end();
      }
    };

    request.raw.on('close', () => {
      clearInterval(heartbeat);
      if (!closed) {
        abortController.abort();
      }
    });

    void startServiceWithProgress({
      serviceName: name,
      runCompose: this.deps.runCompose,
      streamCompose: this.deps.streamCompose,
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
  }
}
