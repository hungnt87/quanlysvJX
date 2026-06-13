import { describe, expect, it } from 'vitest';
import { success, error, paginated } from '../utils/response.js';
import { NotFoundError } from '../utils/errors.js';
import { validate } from './validate.js';
import { z } from 'zod';
import Fastify from 'fastify';
import { getErrorHandler } from './errorHandler.js';

describe('Kiểm thử phần nền tảng (Foundation Tests)', () => {
  describe('Response Helpers', () => {
    it('success() trả về đúng định dạng thành công', () => {
      const result = success({ id: 1 }, 'Thao tác thành công');
      expect(result).toEqual({
        status: 'success',
        message: 'Thao tác thành công',
        data: { id: 1 }
      });
    });

    it('error() trả về đúng định dạng lỗi', () => {
      const result = error('Đã xảy ra lỗi hệ thống', [{ field: 'name', message: 'Tên không hợp lệ' }]);
      expect(result).toEqual({
        status: 'error',
        message: 'Đã xảy ra lỗi hệ thống',
        errors: [{ field: 'name', message: 'Tên không hợp lệ' }]
      });
    });

    it('paginated() trả về đúng định dạng phân trang', () => {
      const result = paginated([{ id: 1 }], { page: 1, limit: 10, total: 15 });
      expect(result).toEqual({
        status: 'success',
        data: [{ id: 1 }],
        pagination: {
          page: 1,
          limit: 10,
          total: 15,
          pages: 2
        }
      });
    });
  });

  describe('Validation Middleware & Error Handler', () => {
    it('validate() ném lỗi ValidationError khi dữ liệu không hợp lệ', async () => {
      const app = Fastify();
      app.setErrorHandler(getErrorHandler(app));

      const schema = {
        body: z.object({
          tuoi: z.number().min(18, 'Tuổi phải từ 18 trở lên')
        })
      };

      app.post('/test', { preHandler: validate(schema) }, async (request, reply) => {
        return reply.send({ ok: true });
      });

      const response = await app.inject({
        method: 'POST',
        url: '/test',
        payload: { tuoi: 16 }
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body).toEqual({
        status: 'error',
        message: 'Validation failed',
        errors: [
          { field: 'body.tuoi', message: 'Tuổi phải từ 18 trở lên' }
        ]
      });
    });

    it('Xử lý AppError tùy chỉnh chính xác', async () => {
      const app = Fastify();
      app.setErrorHandler(getErrorHandler(app));

      app.get('/test-error', async () => {
        throw new NotFoundError('Không tìm thấy tài nguyên yêu cầu');
      });

      const response = await app.inject({
        method: 'GET',
        url: '/test-error'
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({
        status: 'error',
        message: 'Không tìm thấy tài nguyên yêu cầu'
      });
    });
  });
});
