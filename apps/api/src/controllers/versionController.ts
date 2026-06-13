import type { FastifyReply, FastifyRequest } from 'fastify';
import type { VersionService } from '../services/versionService.js';
import { success } from '../utils/response.js';
import { ValidationError } from '../utils/errors.js';
import path from 'node:path';
import fs from 'node:fs';

export class VersionController {
  constructor(private readonly versionService: VersionService) {}

  /**
   * Lấy danh sách phiên bản
   */
  async listVersions(_request: FastifyRequest, reply: FastifyReply) {
    const data = this.versionService.getVersions();
    return reply.send(success(data));
  }

  /**
   * Chọn phiên bản game hoạt động
   */
  async selectVersion(
    request: FastifyRequest<{ Body: { name: string; subPath?: string } }>,
    reply: FastifyReply
  ) {
    const { name, subPath } = request.body;
    const result = this.versionService.select(name, subPath);
    return reply.send(success(result));
  }

  /**
   * Đổi tên phiên bản game
   */
  async renameVersion(
    request: FastifyRequest<{ Params: { name: string }; Body: { name?: string } }>,
    reply: FastifyReply
  ) {
    const currentName = request.params.name;
    const result = this.versionService.rename(currentName, request.body);
    return reply.send(success(result));
  }

  /**
   * Clone phiên bản game mới từ Git
   */
  async cloneVersion(
    request: FastifyRequest<{ Body: { name: string; url: string; branch?: string } }>,
    reply: FastifyReply
  ) {
    const { name, url, branch } = request.body;
    const result = this.versionService.clone(name, url, branch);
    return reply.send(success(result));
  }

  /**
   * Xóa phiên bản game
   */
  async deleteVersion(request: FastifyRequest<{ Params: { name: string } }>, reply: FastifyReply) {
    const name = request.params.name;
    await this.versionService.delete(name);
    return reply.send(success({ message: 'Version deleted successfully' }));
  }

  /**
   * Duyệt thư mục phiên bản game
   */
  async browseVersion(
    request: FastifyRequest<{ Params: { name: string }; Querystring: { path?: string } }>,
    reply: FastifyReply
  ) {
    const name = request.params.name;
    const relativePath = request.query.path || '';
    const result = this.versionService.browseDirectory(name, relativePath);
    return reply.send(success(result));
  }

  /**
   * Tải lên phiên bản game qua tệp nén (zip, tar.gz)
   */
  async uploadVersion(request: FastifyRequest, reply: FastifyReply) {
    let name = '';
    let filename = '';
    let tempArchivePath = '';

    const versionsDir = path.join(
      request.server.deps.config.projectRoot,
      'apps',
      'jx-services',
      'versions'
    );

    try {
      for await (const part of request.parts()) {
        if (part.type === 'field') {
          if (part.fieldname === 'name' && typeof part.value === 'string') {
            name = part.value;
          }
          continue;
        }

        if (part.fieldname !== 'file') {
          continue;
        }

        filename = part.filename;
        tempArchivePath = path.join(
          versionsDir,
          `temp_${Date.now()}_${filename.replace(/[^A-Za-z0-9_.-]/g, '_')}`
        );
        const writeStream = fs.createWriteStream(tempArchivePath);
        for await (const chunk of part.file) {
          writeStream.write(chunk);
        }
        writeStream.end();
        await new Promise<void>((resolve, reject) => {
          writeStream.on('finish', resolve);
          writeStream.on('error', reject);
        });
        try {
          fs.chmodSync(tempArchivePath, 0o777);
        } catch {
          void 0;
        }
        try {
          fs.chownSync(tempArchivePath, 1000, 1000);
        } catch {
          void 0;
        }
      }

      if (!name) {
        throw new ValidationError('Tên phiên bản là bắt buộc');
      }
      if (!tempArchivePath || !filename) {
        throw new ValidationError('File is required');
      }

      const result = await this.versionService.extractUploadedArchive(name, tempArchivePath, filename);
      return reply.send(success(result));
    } finally {
      if (tempArchivePath && fs.existsSync(tempArchivePath)) {
        fs.rmSync(tempArchivePath, { force: true });
      }
    }
  }
}
