import type { FastifyReply, FastifyRequest } from 'fastify';
import type { SystemService } from '../services/systemService.js';
import { success } from '../utils/response.js';

export class SystemController {
  constructor(private readonly systemService: SystemService) {}

  /**
   * Lấy thông tin hệ thống
   */
  async getSystemInfo(_request: FastifyRequest, reply: FastifyReply) {
    const info = await this.systemService.getSystemInfo();
    return reply.send(success(info));
  }

  /**
   * Lưu cấu hình mạng game
   */
  async saveGameNetwork(request: FastifyRequest, reply: FastifyReply) {
    const payload = this.systemService.saveGameNetwork(request.body);
    return reply.send(
      success({
        gameNetwork: payload,
        message: 'Đã lưu cấu hình IP game vào .env. Restart dịch vụ để áp dụng.'
      })
    );
  }
}
