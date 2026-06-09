export type JobStatus = 'running' | 'succeeded' | 'failed';

export type BackupJob = {
  id: string;
  kind: string;
  status: JobStatus;
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
};

export function createJobStore(now: () => Date = () => new Date()) {
  let jobs = new Map<string, BackupJob>();
  let runningKinds = new Set<string>();

  return {
    startJob(kind: string) {
      if (runningKinds.has(kind)) {
        throw new Error(`Job already running for ${kind}`);
      }

      const startedAt = now().toISOString();
      const id = `${kind}-${now().getTime()}`;
      const job: BackupJob = { id, kind, status: 'running', startedAt, finishedAt: null, error: null };
      jobs = new Map([...jobs, [id, job]]);
      runningKinds = new Set([...runningKinds, kind]);
      return job;
    },

    finishJob(id: string, status: Exclude<JobStatus, 'running'>, error: string | null = null) {
      const job = jobs.get(id);
      if (!job) {
        return null;
      }

      const updated: BackupJob = { ...job, status, error, finishedAt: now().toISOString() };
      jobs = new Map([...jobs, [id, updated]]);
      runningKinds = new Set([...runningKinds].filter((kind) => kind !== job.kind));
      return updated;
    },

    listJobs() {
      return [...jobs.values()].sort((a: BackupJob, b: BackupJob) => b.startedAt.localeCompare(a.startedAt));
    }
  };
}

export const backupJobStore = createJobStore();
