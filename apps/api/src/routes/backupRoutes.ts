import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ok } from '../api/envelope.js';
import { deleteBackupFile, listBackupFiles, renameBackupFile, writeUploadedBackupFile } from '../backups/backupFiles.js';
import { backupJobStore, type StartJobInput } from '../backups/backupJobs.js';
import { getBackupDirectory, assertBackupFile } from '../backups/backupPaths.js';
import { readBackupSchedules, updateBackupSchedule } from '../backups/backupSchedules.js';
import { backupMssql, restoreMssql } from '../backups/mssqlBackup.js';
import { backupMysql, restoreMysql } from '../backups/mysqlBackup.js';

const kindSchema = z.enum(['mysql', 'mssql']);
const restoreSchema = z.object({ filename: z.string().min(1) });
const updateBackupSchema = z.object({ filename: z.string().min(1), note: z.string().nullable() });
const daySchema = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6)]);
const scheduleSchema = z.object({
  enabled: z.boolean(),
  daysOfWeek: z.array(daySchema),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  retentionDays: z.number().int().min(1),
  lastRunKey: z.string().nullable()
});

export async function registerBackupRoutes(app: FastifyInstance) {
  app.get('/api/backups', async () => ok(listBackupFiles(app.deps.config)));
  app.get('/api/jobs', async () => ok(backupJobStore.listJobs()));

  app.post('/api/backups/mysql', async () => ok(await runJob({ kind: 'backup', database: 'mysql', trigger: 'manual' }, () => backupMysql(app.deps))));
  app.post('/api/backups/mssql', async () => ok(await runJob({ kind: 'backup', database: 'mssql', trigger: 'manual' }, () => backupMssql(app.deps))));
  app.post('/api/backups/all', async () =>
    ok({
      mysql: await runJob({ kind: 'backup', database: 'mysql', trigger: 'manual' }, () => backupMysql(app.deps)),
      mssql: await runJob({ kind: 'backup', database: 'mssql', trigger: 'manual' }, () => backupMssql(app.deps))
    })
  );

  app.post('/api/backups/:kind/upload', async (request) => {
    const { kind } = request.params as { kind: string };
    const parsedKind = kindSchema.parse(kind);
    const part = await request.file();
    if (!part) {
      throw app.httpErrors.badRequest('Backup file is required');
    }

    const chunks: Buffer[] = [];
    for await (const chunk of part.file) {
      chunks.push(Buffer.from(chunk));
    }

    return ok(
      writeUploadedBackupFile({
        ...app.deps.config,
        kind: parsedKind,
        filename: part.filename,
        data: Buffer.concat(chunks)
      })
    );
  });

  app.patch('/api/backups/:kind/:filename', async (request) => {
    const { kind, filename } = request.params as { kind: string; filename: string };
    const parsedKind = kindSchema.parse(kind);
    const body = updateBackupSchema.parse(request.body);
    return ok(renameBackupFile({ ...app.deps.config, kind: parsedKind, filename, nextFilename: body.filename, note: body.note }));
  });

  app.delete('/api/backups/:kind/:filename', async (request) => {
    const { kind, filename } = request.params as { kind: string; filename: string };
    const parsedKind = kindSchema.parse(kind);
    return ok(deleteBackupFile({ ...app.deps.config, kind: parsedKind, filename }));
  });

  app.post('/api/restores/mysql', async (request) => {
    const { filename } = restoreSchema.parse(request.body);
    assertBackupFile(getBackupDirectory('mysql', app.deps.config), filename);
    return ok(await runJob({ kind: 'restore', database: 'mysql', trigger: 'restore' }, () => restoreMysql(app.deps, filename)));
  });

  app.post('/api/restores/mssql', async (request) => {
    const { filename } = restoreSchema.parse(request.body);
    assertBackupFile(getBackupDirectory('mssql', app.deps.config), filename);
    return ok(await runJob({ kind: 'restore', database: 'mssql', trigger: 'restore' }, () => restoreMssql(app.deps, filename)));
  });

  app.get('/api/backup-schedules', async () => ok(readBackupSchedules(app.deps.config.backupScheduleFile)));

  app.put('/api/backup-schedules/:kind', async (request) => {
    const { kind } = request.params as { kind: string };
    const parsedKind = kindSchema.parse(kind);
    const schedule = scheduleSchema.parse(request.body);
    return ok(updateBackupSchedule(app.deps.config.backupScheduleFile, parsedKind, schedule));
  });

  app.get('/api/backup-settings', async () =>
    ok({
      mysqlBackupDir: app.deps.config.mysqlBackupDir,
      mssqlBackupDir: app.deps.config.mssqlBackupDir,
      backupMetadataFile: app.deps.config.backupMetadataFile,
      backupScheduleFile: app.deps.config.backupScheduleFile
    })
  );
}

async function runJob<T extends object>(input: StartJobInput, action: () => Promise<T>) {
  const job = backupJobStore.startJob(input);
  try {
    const result = await action();
    backupJobStore.finishJob(job.id, 'succeeded');
    return { ...result, jobId: job.id };
  } catch (error) {
    backupJobStore.finishJob(job.id, 'failed', error instanceof Error ? error.message : 'Unknown error');
    throw error;
  }
}
