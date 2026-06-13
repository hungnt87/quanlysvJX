import type { FastifyReply, FastifyRequest } from 'fastify';
import type { EnvService } from '../services/envService.js';
import { success } from '../utils/response.js';

export class EnvController {
  constructor(private readonly envService: EnvService) {}

  /**
   * Lấy nội dung cấu hình môi trường
   */
  async getEnv(_request: FastifyRequest, reply: FastifyReply) {
    const content = this.envService.getEnvContent();
    return reply.send(success({ content }));
  }

  /**
   * Lưu cấu hình môi trường
   */
  async saveEnv(request: FastifyRequest<{ Body: { content: string } }>, reply: FastifyReply) {
    const { content } = request.body;
    this.envService.saveEnvContent(content);
    return reply.send(success({ message: 'Env configuration saved successfully' }));
  }
}
