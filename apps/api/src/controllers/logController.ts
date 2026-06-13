import type { FastifyReply, FastifyRequest } from 'fastify';
import type { LogService } from '../services/logService.js';
import { success } from '../utils/response.js';
import { assertLogServiceName } from '../services/serviceAllowlist.js';
import { normalizeStreamTail, formatSseLogEvent } from '../services/logStream.js';
import type { AppDeps } from '../app.js';

export class LogController {
  constructor(
    private readonly logService: LogService,
    private readonly streamCompose: AppDeps['streamCompose']
  ) {}

  /**
   * Lấy logs tĩnh dạng JSON envelope mới
   */
  async getLogs(
    request: FastifyRequest<{ Params: { name: string }; Querystring: { tail?: string } }>,
    reply: FastifyReply
  ) {
    const { name } = request.params;
    const { tail } = request.query;
    const result = await this.logService.fetchLogs(name, tail);
    return reply.send(success(result));
  }

  /**
   * Stream logs qua SSE
   */
  streamLogs(
    request: FastifyRequest<{ Params: { name: string }; Querystring: { tail?: string } }>,
    reply: FastifyReply
  ) {
    const name = assertLogServiceName(request.params.name);
    const tail = normalizeStreamTail(request.query.tail);

    const args = ['logs', '--no-color', '--timestamps', '--tail', String(tail), '--follow'];
    if (name !== 'all') {
      args.push(name);
    }
    const stream = this.streamCompose(args);
    let closed = false;

    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    reply.raw.write(':\n\n');

    const writeLog = (chunk: unknown) => {
      if (!reply.raw.destroyed) {
        reply.raw.write(formatSseLogEvent(String(chunk)));
      }
    };

    stream.stdout.on('data', writeLog);
    stream.stderr.on('data', writeLog);
    stream.on('error', (error: Error) => {
      if (!reply.raw.destroyed) {
        reply.raw.write(formatSseLogEvent(error.message, 'error'));
        reply.raw.end();
      }
    });
    stream.on('close', () => {
      closed = true;
      if (!reply.raw.destroyed) {
        reply.raw.end();
      }
    });

    request.raw.on('close', () => {
      if (!closed) {
        stream.kill('SIGTERM');
      }
    });
  }
}
