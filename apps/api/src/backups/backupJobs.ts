import type { BackupKind } from './backupPaths.js';

export type JobStatus = 'running' | 'succeeded' | 'failed';
export type JobTrigger = 'manual' | 'schedule' | 'restore' | 'upload';

export type BackupJob = {
  id: string;
  kind: string;
  database: BackupKind | 'all' | null;
  trigger: JobTrigger;
  status: JobStatus;
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
};

export type StartJobInput = {
  kind: string;
  database: BackupKind | 'all' | null;
  trigger: JobTrigger;
};

export function createJobStore(now: () => Date = () => new Date()) {
  let jobs = new Map<string, BackupJob>();
  let runningKeys = new Set<string>();

  function runningKey(input: StartJobInput) {
    return `${input.kind}:${input.database ?? 'none'}`;
  }

  return {
    startJob(input: string | StartJobInput) {
      const normalized: StartJobInput = typeof input === 'string' ? { kind: input, database: null, trigger: 'manual' } : input;
      const key = runningKey(normalized);
      if (runningKeys.has(key)) {
        throw new Error(`Job already running for ${normalized.kind}`);
      }

      const startedAt = now().toISOString();
      const id = `${normalized.kind}-${normalized.database ?? 'job'}-${now().getTime()}`;
      const job: BackupJob = { id, ...normalized, status: 'running', startedAt, finishedAt: null, error: null };
      jobs = new Map([...jobs, [id, job]]);
      runningKeys = new Set([...runningKeys, key]);
      return job;
    },

    finishJob(id: string, status: Exclude<JobStatus, 'running'>, error: string | null = null) {
      const job = jobs.get(id);
      if (!job) {
        return null;
      }

      const updated: BackupJob = { ...job, status, error, finishedAt: now().toISOString() };
      jobs = new Map([...jobs, [id, updated]]);
      runningKeys = new Set([...runningKeys].filter((key) => key !== runningKey(job)));
      return updated;
    },

    hasRunningJob(database: BackupKind) {
      return [...jobs.values()].some((job) => job.database === database && job.status === 'running');
    },

    listJobs() {
      return [...jobs.values()].sort((a: BackupJob, b: BackupJob) => b.startedAt.localeCompare(a.startedAt));
    }
  };
}

export const backupJobStore = createJobStore();
