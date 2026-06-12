import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  type BackupScheduleRule,
  type ScheduledBackupRun,
  type ScheduledBackupRunsFile,
  scheduledBackupRunsFileSchema
} from './scheduledBackupTypes.js';

export type EnqueueRunInput = {
  jobId: string | null;
  jobDisplayName: string | null;
  database: 'mysql' | 'mssql';
  trigger: 'schedule' | 'manual' | 'retry';
  scheduledFor: string;
  scheduleSnapshot: BackupScheduleRule | null;
  batchId?: string | null;
};

export function readScheduledBackupRuns(file: string): ScheduledBackupRunsFile {
  if (!fs.existsSync(file)) {
    return { version: 1, runs: [] };
  }
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw);
    const validated = scheduledBackupRunsFileSchema.parse(parsed);
    return validated;
  } catch (err) {
    return { version: 1, runs: [] };
  }
}

export function writeScheduledBackupRuns(file: string, data: ScheduledBackupRunsFile): void {
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

export function enqueueScheduledBackupRun(
  file: string,
  input: EnqueueRunInput,
  maxQueuedRunsPerJob = 100,
  maxFinishedRuns = 1000,
  now = new Date()
): ScheduledBackupRun {
  const data = readScheduledBackupRuns(file);
  const nowStr = now.toISOString();

  let status: ScheduledBackupRun['status'] = 'queued';
  let error: string | null = null;
  let finishedAt: string | null = null;

  if (input.jobId) {
    const queuedCount = data.runs.filter(
      r => r.jobId === input.jobId && r.status === 'queued'
    ).length;

    if (queuedCount >= maxQueuedRunsPerJob) {
      status = 'skipped';
      error = `Hủy bỏ lượt chạy do hàng đợi đầy (${queuedCount}/${maxQueuedRunsPerJob}).`;
      finishedAt = nowStr;
    }
  }

  const newRun: ScheduledBackupRun = {
    runId: `run_${crypto.randomUUID()}`,
    batchId: input.batchId ?? null,
    jobId: input.jobId,
    jobDisplayName: input.jobDisplayName,
    database: input.database,
    trigger: input.trigger,
    scheduledFor: input.scheduledFor,
    queuedAt: nowStr,
    startedAt: null,
    finishedAt,
    status,
    error,
    backupFilename: null,
    scheduleSnapshot: input.scheduleSnapshot
  };

  data.runs.push(newRun);

  // Prune history
  data.runs = pruneFinishedRuns(data.runs, maxFinishedRuns);

  writeScheduledBackupRuns(file, data);
  return newRun;
}

export function cancelQueuedRunsForJob(
  file: string,
  jobId: string,
  reason = 'Job disabled/updated/deleted',
  now = new Date()
): ScheduledBackupRun[] {
  const data = readScheduledBackupRuns(file);
  const nowStr = now.toISOString();
  const modified: ScheduledBackupRun[] = [];

  data.runs = data.runs.map(run => {
    if (run.jobId === jobId && run.status === 'queued') {
      const updatedRun: ScheduledBackupRun = {
        ...run,
        status: 'cancelled',
        finishedAt: nowStr,
        error: reason
      };
      modified.push(updatedRun);
      return updatedRun;
    }
    return run;
  });

  if (modified.length > 0) {
    writeScheduledBackupRuns(file, data);
  }
  return modified;
}

export function markStaleRunningRunsFailed(file: string, now = new Date()): ScheduledBackupRun[] {
  const data = readScheduledBackupRuns(file);
  const nowStr = now.toISOString();
  const modified: ScheduledBackupRun[] = [];

  data.runs = data.runs.map(run => {
    if (run.status === 'running') {
      const updatedRun: ScheduledBackupRun = {
        ...run,
        status: 'failed',
        finishedAt: nowStr,
        error: 'API khởi động lại trước khi job hoàn tất.'
      };
      modified.push(updatedRun);
      return updatedRun;
    }
    return run;
  });

  if (modified.length > 0) {
    writeScheduledBackupRuns(file, data);
  }
  return modified;
}

export function startNextQueuedRunForDatabase(
  file: string,
  database: 'mysql' | 'mssql',
  now = new Date()
): ScheduledBackupRun | null {
  const data = readScheduledBackupRuns(file);

  // Find all queued runs for the database
  const queuedRuns = data.runs.filter(r => r.database === database && r.status === 'queued');
  if (queuedRuns.length === 0) {
    return null;
  }

  // Sort by scheduledFor (ascending), then queuedAt (ascending)
  queuedRuns.sort((a, b) => {
    const timeA = new Date(a.scheduledFor).getTime();
    const timeB = new Date(b.scheduledFor).getTime();
    if (timeA !== timeB) return timeA - timeB;

    const queueA = new Date(a.queuedAt).getTime();
    const queueB = new Date(b.queuedAt).getTime();
    return queueA - queueB;
  });

  const nextRun = queuedRuns[0];
  if (!nextRun) {
    return null;
  }
  const runIndex = data.runs.findIndex(r => r.runId === nextRun.runId);

  if (runIndex !== -1) {
    const existingRun = data.runs[runIndex];
    if (!existingRun) {
      return null;
    }
    const updatedRun: ScheduledBackupRun = {
      ...existingRun,
      status: 'running',
      startedAt: now.toISOString()
    };
    data.runs[runIndex] = updatedRun;
    writeScheduledBackupRuns(file, data);
    return updatedRun;
  }

  return null;
}

export function finishScheduledBackupRun(
  file: string,
  runId: string,
  updates: {
    status: 'succeeded' | 'failed';
    error: string | null;
    backupFilename: string | null;
  },
  now = new Date()
): ScheduledBackupRun {
  const data = readScheduledBackupRuns(file);
  const runIndex = data.runs.findIndex(r => r.runId === runId);

  if (runIndex === -1) {
    throw new Error('Không tìm thấy lượt chạy.');
  }

  const existingRun = data.runs[runIndex];
  if (!existingRun) {
    throw new Error('Không tìm thấy lượt chạy.');
  }

  const updatedRun: ScheduledBackupRun = {
    ...existingRun,
    status: updates.status,
    error: updates.error,
    backupFilename: updates.backupFilename,
    finishedAt: now.toISOString()
  };

  data.runs[runIndex] = updatedRun;
  writeScheduledBackupRuns(file, data);
  return updatedRun;
}

export function listScheduledBackupRuns(file: string): ScheduledBackupRun[] {
  return readScheduledBackupRuns(file).runs;
}

function pruneFinishedRuns(runs: ScheduledBackupRun[], maxFinished: number): ScheduledBackupRun[] {
  const finished = runs.filter(r => r.status !== 'queued' && r.status !== 'running');

  if (finished.length <= maxFinished) {
    return runs;
  }

  // Sort finished runs by finishedAt or queuedAt ascending
  const sortedFinished = [...finished].sort((a, b) => {
    const timeA = new Date(a.finishedAt || a.queuedAt).getTime();
    const timeB = new Date(b.finishedAt || b.queuedAt).getTime();
    return timeA - timeB;
  });

  // Keep the newest finished runs
  const keptFinished = sortedFinished.slice(sortedFinished.length - maxFinished);
  const keptFinishedIds = new Set(keptFinished.map(r => r.runId));

  // Maintain original order
  return runs.filter(
    r => r.status === 'queued' || r.status === 'running' || keptFinishedIds.has(r.runId)
  );
}
