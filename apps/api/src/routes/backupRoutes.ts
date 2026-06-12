import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Multipart, MultipartValue } from '@fastify/multipart';
import { z } from 'zod';
import { ok } from '../api/envelope.js';
import { deleteBackupFile, listBackupFiles, renameBackupFile, writeUploadedBackupFile } from '../backups/backupFiles.js';
import { backupJobStore, type StartJobInput } from '../backups/backupJobs.js';
import { getBackupDirectory, assertBackupFile } from '../backups/backupPaths.js';
import { restoreMssql } from '../backups/mssqlBackup.js';
import { restoreMysql } from '../backups/mysqlBackup.js';
import { enqueueScheduledBackupRun } from '../scheduledBackups/scheduledBackupRuns.js';

const kindSchema = z.enum(['mysql', 'mssql']);
const restoreSchema = z.object({ filename: z.string().min(1) });
const updateBackupSchema = z.object({ filename: z.string().min(1), note: z.string().nullable() });

export async function registerBackupRoutes(app: FastifyInstance) {
  app.get('/api/backups', async () => ok(listBackupFiles(app.deps.config)));

  app.get('/api/backups/:kind/:filename/download', async (request, reply) => {
    const { kind, filename } = request.params as { kind: string; filename: string };
    const parsedKind = kindSchema.parse(kind);
    const dir = getBackupDirectory(parsedKind, app.deps.config);
    assertBackupFile(dir, filename);
    const filePath = path.join(dir, filename);

    const fileStream = fs.createReadStream(filePath);
    reply.header('Content-Disposition', `attachment; filename="${filename}"`);
    reply.header('Content-Type', 'application/octet-stream');
    return reply.send(fileStream);
  });

  app.get('/api/jobs', async () => ok(backupJobStore.listJobs()));

  app.post('/api/backups/mysql', async () => {
    const run = enqueueScheduledBackupRun(
      app.deps.config.scheduledBackupRunsFile!,
      {
        jobId: null,
        jobDisplayName: null,
        database: 'mysql',
        trigger: 'manual',
        scheduledFor: new Date().toISOString(),
        scheduleSnapshot: null
      },
      app.deps.config.maxQueuedRunsPerJob,
      app.deps.config.maxFinishedScheduledRuns
    );
    return ok(run);
  });

  app.post('/api/backups/mssql', async () => {
    const run = enqueueScheduledBackupRun(
      app.deps.config.scheduledBackupRunsFile!,
      {
        jobId: null,
        jobDisplayName: null,
        database: 'mssql',
        trigger: 'manual',
        scheduledFor: new Date().toISOString(),
        scheduleSnapshot: null
      },
      app.deps.config.maxQueuedRunsPerJob,
      app.deps.config.maxFinishedScheduledRuns
    );
    return ok(run);
  });

  app.post('/api/backups/all', async () => {
    const batchId = `batch_${crypto.randomUUID()}`;
    const mysqlRun = enqueueScheduledBackupRun(
      app.deps.config.scheduledBackupRunsFile!,
      {
        jobId: null,
        jobDisplayName: null,
        database: 'mysql',
        trigger: 'manual',
        scheduledFor: new Date().toISOString(),
        scheduleSnapshot: null,
        batchId
      },
      app.deps.config.maxQueuedRunsPerJob,
      app.deps.config.maxFinishedScheduledRuns
    );

    const mssqlRun = enqueueScheduledBackupRun(
      app.deps.config.scheduledBackupRunsFile!,
      {
        jobId: null,
        jobDisplayName: null,
        database: 'mssql',
        trigger: 'manual',
        scheduledFor: new Date().toISOString(),
        scheduleSnapshot: null,
        batchId
      },
      app.deps.config.maxQueuedRunsPerJob,
      app.deps.config.maxFinishedScheduledRuns
    );

    return ok({ mysql: mysqlRun, mssql: mssqlRun });
  });

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
        filename: normalizeUploadFilename(readMultipartTextField(part.fields.filename), part.filename),
        note: normalizeOptionalNote(readMultipartTextField(part.fields.note)),
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
}

function readMultipartTextField(field: Multipart | Multipart[] | undefined) {
  const value = Array.isArray(field) ? field[0] : field;
  if (!value || value.type !== 'field') {
    return null;
  }

  const fieldValue = (value as MultipartValue).value;
  return typeof fieldValue === 'string' ? fieldValue.trim() : null;
}

function normalizeOptionalNote(value: string | null) {
  return value && value.length > 0 ? value : null;
}

function normalizeUploadFilename(value: string | null, fallback: string) {
  return value && value.length > 0 ? value : fallback;
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
