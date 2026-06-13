import fs from 'node:fs';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { VersionRepository } from '../repositories/versionRepository.js';
import { VersionService } from '../services/versionService.js';
import { VersionController } from '../controllers/versionController.js';

const selectVersionSchema = z.object({
  name: z.string().regex(/^[A-Za-z0-9_-]{1,10}$/),
  subPath: z.string().optional()
});

const cloneVersionSchema = z.object({
  name: z.string().regex(/^[A-Za-z0-9_-]{1,10}$/),
  url: z.string().url(),
  branch: z.string().trim().min(1).default('main')
});

const renameVersionSchema = z.object({
  name: z.string().regex(/^[A-Za-z0-9_-]{1,10}$/).optional()
}).refine((value) => value.name !== undefined, 'Tên phiên bản mới là bắt buộc');

const nameParamsSchema = z.object({
  name: z.string()
});

export async function registerVersionRoutes(app: FastifyInstance) {
  const projectRoot = app.deps.config.projectRoot;
  const versionRepository = new VersionRepository(projectRoot);
  const versionService = new VersionService(versionRepository, app.deps.runCompose);
  const versionController = new VersionController(versionService);

  // Tạo thư mục versions nếu chưa có
  const versionsDir = versionRepository.getVersionsDir();
  fs.mkdirSync(versionsDir, { recursive: true });
  try {
    fs.chmodSync(versionsDir, 0o777);
  } catch {
    void 0;
  }
  try {
    fs.chownSync(versionsDir, 1000, 1000);
  } catch {
    void 0;
  }

  app.get('/api/versions', (req, reply) => versionController.listVersions(req, reply));

  app.post(
    '/api/versions/select',
    {
      preHandler: validate({ body: selectVersionSchema })
    },
    (req, reply) => versionController.selectVersion(req as any, reply)
  );

  app.patch(
    '/api/versions/:name',
    {
      preHandler: validate({ params: nameParamsSchema, body: renameVersionSchema })
    },
    (req, reply) => versionController.renameVersion(req as any, reply)
  );

  app.post(
    '/api/versions/clone',
    {
      preHandler: validate({ body: cloneVersionSchema })
    },
    (req, reply) => versionController.cloneVersion(req as any, reply)
  );

  app.post('/api/versions/upload', (req, reply) => versionController.uploadVersion(req as any, reply));

  app.delete(
    '/api/versions/:name',
    {
      preHandler: validate({ params: nameParamsSchema })
    },
    (req, reply) => versionController.deleteVersion(req as any, reply)
  );

  app.get(
    '/api/versions/:name/browse',
    {
      preHandler: validate({ params: nameParamsSchema })
    },
    (req, reply) => versionController.browseVersion(req as any, reply)
  );
}
