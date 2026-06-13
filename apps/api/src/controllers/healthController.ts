import type { FastifyReply, FastifyRequest } from 'fastify';
import { success } from '../utils/response.js';

export class HealthController {
  /**
   * Kiểm tra tình trạng hoạt động của API
   */
  async getHealth(_request: FastifyRequest, reply: FastifyReply) {
    return reply.send(success({ status: 'ok' }));
  }
}
