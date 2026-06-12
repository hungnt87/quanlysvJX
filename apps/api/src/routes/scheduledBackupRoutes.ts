import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ok } from '../api/envelope.js';
import { backupScheduleRuleSchema } from '../scheduledBackups/scheduledBackupTypes.js';
import {
  createScheduledBackupJob,
  readScheduledBackupJobs,
  updateScheduledBackupJob,
  softDeleteScheduledBackupJob,
  readBackupSettings,
  writeBackupSettings
} from '../scheduledBackups/scheduledBackupJobs.js';
import {
  enqueueScheduledBackupRun,
  listScheduledBackupRuns,
  readScheduledBackupRuns
} from '../scheduledBackups/scheduledBackupRuns.js';

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

export async function registerScheduledBackupRoutes(app: FastifyInstance) {
  // GET /api/scheduled-jobs
  app.get('/api/scheduled-jobs', async () => {
    const file = app.deps.config.scheduledBackupJobsFile!;
    const data = readScheduledBackupJobs(file);
    return ok(data.jobs.filter(job => job.deletedAt === null));
  });

  // POST /api/scheduled-jobs
  app.post('/api/scheduled-jobs', async (request) => {
    const file = app.deps.config.scheduledBackupJobsFile!;
    const body = createJobSchema.parse(request.body);
    const newJob = createScheduledBackupJob(file, body);
    return ok(newJob);
  });

  // PUT /api/scheduled-jobs/:id
  app.put('/api/scheduled-jobs/:id', async (request) => {
    const file = app.deps.config.scheduledBackupJobsFile!;
    const { id } = request.params as { id: string };
    const body = updateJobSchema.parse(request.body);
    const updatedJob = updateScheduledBackupJob(file, id, body);
    return ok(updatedJob);
  });

  // DELETE /api/scheduled-jobs/:id
  app.delete('/api/scheduled-jobs/:id', async (request) => {
    const file = app.deps.config.scheduledBackupJobsFile!;
    const { id } = request.params as { id: string };
    const deletedJob = softDeleteScheduledBackupJob(file, id);
    return ok(deletedJob);
  });

  // POST /api/scheduled-jobs/:id/run
  app.post('/api/scheduled-jobs/:id/run', async (request) => {
    const jobsFile = app.deps.config.scheduledBackupJobsFile!;
    const runsFile = app.deps.config.scheduledBackupRunsFile!;
    const { id } = request.params as { id: string };

    const jobsData = readScheduledBackupJobs(jobsFile);
    const job = jobsData.jobs.find(j => j.id === id && j.deletedAt === null);

    if (!job) {
      throw app.httpErrors.notFound('Không tìm thấy job hoặc job đã bị xóa.');
    }

    const run = enqueueScheduledBackupRun(
      runsFile,
      {
        jobId: job.id,
        jobDisplayName: job.displayName,
        database: job.database,
        trigger: 'manual',
        scheduledFor: new Date().toISOString(),
        scheduleSnapshot: job.schedule
      },
      app.deps.config.maxQueuedRunsPerJob,
      app.deps.config.maxFinishedScheduledRuns
    );

    return ok(run);
  });

  // GET /api/scheduled-job-runs
  app.get('/api/scheduled-job-runs', async (request) => {
    const query = request.query as {
      database?: string;
      status?: string;
      trigger?: string;
      jobId?: string;
    };
    const runs = listScheduledBackupRuns(app.deps.config.scheduledBackupRunsFile!);
    const filtered = runs.filter(run => {
      if (query.database && run.database !== query.database) return false;
      if (query.status && run.status !== query.status) return false;
      if (query.trigger && run.trigger !== query.trigger) return false;
      if (query.jobId && run.jobId !== query.jobId) return false;
      return true;
    });

    // Sắp xếp giảm dần theo queuedAt (mới nhất lên đầu)
    filtered.sort((a, b) => new Date(b.queuedAt).getTime() - new Date(a.queuedAt).getTime());
    return ok(filtered);
  });

  // POST /api/scheduled-job-runs/:runId/retry
  app.post('/api/scheduled-job-runs/:runId/retry', async (request) => {
    const runsFile = app.deps.config.scheduledBackupRunsFile!;
    const { runId } = request.params as { runId: string };

    const runsData = readScheduledBackupRuns(runsFile);
    const oldRun = runsData.runs.find(r => r.runId === runId);

    if (!oldRun) {
      throw app.httpErrors.notFound('Không tìm thấy lượt chạy.');
    }

    const run = enqueueScheduledBackupRun(
      runsFile,
      {
        jobId: oldRun.jobId,
        jobDisplayName: oldRun.jobDisplayName,
        database: oldRun.database,
        trigger: 'retry',
        scheduledFor: new Date().toISOString(),
        scheduleSnapshot: oldRun.scheduleSnapshot
      },
      app.deps.config.maxQueuedRunsPerJob,
      app.deps.config.maxFinishedScheduledRuns
    );

    return ok(run);
  });

  // GET /api/backup-settings
  app.get('/api/backup-settings', async () => {
    const jobsFile = app.deps.config.scheduledBackupJobsFile!;
    const defaultConfig = {
      mysqlRetentionDays: app.deps.config.mysqlRetentionDays ?? 14,
      mssqlRetentionDays: app.deps.config.mssqlRetentionDays ?? 14
    };
    const settings = readBackupSettings(jobsFile, defaultConfig);

    return ok({
      mysqlBackupDir: app.deps.config.mysqlBackupDir,
      mssqlBackupDir: app.deps.config.mssqlBackupDir,
      backupMetadataFile: app.deps.config.backupMetadataFile,
      backupScheduleFile: app.deps.config.backupScheduleFile,
      scheduledBackupJobsFile: app.deps.config.scheduledBackupJobsFile,
      scheduledBackupRunsFile: app.deps.config.scheduledBackupRunsFile,
      mysqlRetentionDays: settings.mysqlRetentionDays,
      mssqlRetentionDays: settings.mssqlRetentionDays
    });
  });

  // PUT /api/backup-settings
  app.put('/api/backup-settings', async (request) => {
    const jobsFile = app.deps.config.scheduledBackupJobsFile!;
    const body = retentionSettingsSchema.parse(request.body);
    writeBackupSettings(jobsFile, body);
    return ok(body);
  });
}
