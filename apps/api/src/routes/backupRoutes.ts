import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { BackupRepository } from '../repositories/backupRepository.js';
import { BackupService } from '../services/backupService.js';
import { BackupController } from '../controllers/backupController.js';

const kindParamSchema = z.object({
  kind: z.enum(['mysql', 'mssql'])
});

const filenameParamSchema = z.object({
  kind: z.enum(['mysql', 'mssql']),
  filename: z.string()
});

const restoreSchema = z.object({
  filename: z.string().min(1)
});

const updateBackupSchema = z.object({
  filename: z.string().min(1),
  note: z.string().nullable()
});

export async function registerBackupRoutes(app: FastifyInstance) {
  const backupRepository = new BackupRepository(app.deps.config);
  const backupService = new BackupService(backupRepository, app.deps);
  const backupController = new BackupController(backupService);

  app.get('/api/backups', (req, reply) => backupController.getBackups(req, reply));

  app.get(
    '/api/backups/:kind/:filename/download',
    {
      preHandler: validate({ params: filenameParamSchema })
    },
    (req, reply) => backupController.downloadBackup(req as any, reply)
  );

  app.get('/api/jobs', (req, reply) => backupController.getJobs(req, reply));

  app.post('/api/backups/mysql', (req, reply) => backupController.backupMysql(req, reply));

  app.post('/api/backups/mssql', (req, reply) => backupController.backupMssql(req, reply));

  app.post('/api/backups/all', (req, reply) => backupController.backupAll(req, reply));

  app.post(
    '/api/backups/:kind/upload',
    {
      preHandler: validate({ params: kindParamSchema })
    },
    (req, reply) => backupController.uploadBackup(req as any, reply)
  );

  app.patch(
    '/api/backups/:kind/:filename',
    {
      preHandler: validate({ params: filenameParamSchema, body: updateBackupSchema })
    },
    (req, reply) => backupController.updateBackup(req as any, reply)
  );

  app.delete(
    '/api/backups/:kind/:filename',
    {
      preHandler: validate({ params: filenameParamSchema })
    },
    (req, reply) => backupController.deleteBackup(req as any, reply)
  );

  app.post(
    '/api/restores/mysql',
    {
      preHandler: validate({ body: restoreSchema })
    },
    (req, reply) => backupController.restoreMysql(req as any, reply)
  );

  app.post(
    '/api/restores/mssql',
    {
      preHandler: validate({ body: restoreSchema })
    },
    (req, reply) => backupController.restoreMssql(req as any, reply)
  );
}
