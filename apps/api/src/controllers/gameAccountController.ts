import type { FastifyReply, FastifyRequest } from 'fastify';
import type { GameAccountService } from '../gameAccounts/gameAccountService.js';
import { success } from '../utils/response.js';

export class GameAccountController {
  constructor(private readonly gameAccountService: GameAccountService) {}

  /**
   * Lấy danh sách tài khoản game
   */
  async list(request: FastifyRequest, reply: FastifyReply) {
    const result = await this.gameAccountService.list(request.query as any);
    return reply.send(success(result));
  }

  /**
   * Tạo tài khoản game mới
   */
  async create(request: FastifyRequest, reply: FastifyReply) {
    const result = await this.gameAccountService.create(request.body as any);
    return reply.send(success(result));
  }

  /**
   * Cập nhật thông tin tài khoản (mật khẩu/phân quyền)
   */
  async update(request: FastifyRequest<{ Params: { accountName: string } }>, reply: FastifyReply) {
    const { accountName } = request.params;
    const result = await this.gameAccountService.update(accountName, request.body as any);
    return reply.send(success(result));
  }

  /**
   * Xóa tài khoản game
   */
  async delete(request: FastifyRequest<{ Params: { accountName: string } }>, reply: FastifyReply) {
    const { accountName } = request.params;
    await this.gameAccountService.delete(accountName);
    return reply.send(success({ message: 'Account deleted' }));
  }

  /**
   * Khóa tài khoản game
   */
  async ban(request: FastifyRequest<{ Params: { accountName: string } }>, reply: FastifyReply) {
    const { accountName } = request.params;
    const result = await this.gameAccountService.ban(accountName);
    return reply.send(success(result));
  }

  /**
   * Mở khóa tài khoản game
   */
  async unban(request: FastifyRequest<{ Params: { accountName: string } }>, reply: FastifyReply) {
    const { accountName } = request.params;
    const result = await this.gameAccountService.unban(accountName);
    return reply.send(success(result));
  }
}
