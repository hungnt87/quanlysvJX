import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { backupScheduleRuleSchema } from '../scheduledBackups/scheduledBackupTypes.js';
import { BackupRepository } from '../repositories/backupRepository.js';
import { BackupService } from '../services/backupService.js';
import { BackupController } from '../controllers/backupController.js';

const createJobSchema = z.object({
  database: z.enum(['mysql', 'mssql']),
  schedule: backupScheduleRuleSchema,
  enabled: z.boolean().optional()
});

const updateJobSchema = z.object({
  schedule: backupScheduleRuleSchema.optional(),
  enabled: z.boolean().optional()
});

const retentionSettingsSchema = z.object({
  mysqlRetentionDays: z.number().int().min(1),
  mssqlRetentionDays: z.number().int().min(1)
});

const idParamSchema = z.object({
  id: z.string()
});

const runIdParamSchema = z.object({
  runId: z.string()
});

export async function registerScheduledBackupRoutes(app: FastifyInstance) {
  const backupRepository = new BackupRepository(app.deps.config);
  const backupService = new BackupService(backupRepository, app.deps);
  const backupController = new BackupController(backupService);

  app.get('/api/scheduled-jobs', (req, reply) => backupController.listScheduledJobs(req, reply));

  app.post(
    '/api/scheduled-jobs',
    {
      preHandler: validate({ body: createJobSchema })
    },
    (req, reply) => backupController.createScheduledJob(req, reply)
  );

  app.put(
    '/api/scheduled-jobs/:id',
    {
      preHandler: validate({ params: idParamSchema, body: updateJobSchema })
    },
    (req, reply) => backupController.updateScheduledJob(req as any, reply)
  );

  app.delete(
    '/api/scheduled-jobs/:id',
    {
      preHandler: validate({ params: idParamSchema })
    },
    (req, reply) => backupController.deleteScheduledJob(req as any, reply)
  );

  app.post(
    '/api/scheduled-jobs/:id/run',
    {
      preHandler: validate({ params: idParamSchema })
    },
    (req, reply) => backupController.runScheduledJobNow(req as any, reply)
  );

  app.get('/api/scheduled-job-runs', (req, reply) => backupController.getScheduledJobRuns(req as any, reply));

  app.post(
    '/api/scheduled-job-runs/:runId/retry',
    {
      preHandler: validate({ params: runIdParamSchema })
    },
    (req, reply) => backupController.retryScheduledRun(req as any, reply)
  );

  app.get('/api/backup-settings', (req, reply) => backupController.getBackupSettings(req, reply));

  app.put(
    '/api/backup-settings',
    {
      preHandler: validate({ body: retentionSettingsSchema })
    },
    (req, reply) => backupController.saveBackupSettings(req, reply)
  );
}
