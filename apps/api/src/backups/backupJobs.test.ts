import { describe, expect, it } from 'vitest';
import { createJobStore } from './backupJobs.js';

describe('backup job store', () => {
  it('tracks running and finished jobs immutably', () => {
    const store = createJobStore();
    const job = store.startJob('mysql');
    const finished = store.finishJob(job.id, 'succeeded');

    expect(job.status).toBe('running');
    expect(finished?.status).toBe('succeeded');
    expect(store.listJobs()).toHaveLength(1);
  });

  it('rejects duplicate running jobs for the same kind', () => {
    const store = createJobStore();
    store.startJob('mysql');

    expect(() => store.startJob('mysql')).toThrow('Job already running for mysql');
  });

  it('records database kind and trigger metadata', () => {
    const store = createJobStore(() => new Date('2026-06-10T03:00:00.000Z'));

    const job = store.startJob({ kind: 'backup', database: 'mysql', trigger: 'schedule' });

    expect(job).toMatchObject({ kind: 'backup', database: 'mysql', trigger: 'schedule', status: 'running' });
    expect(store.hasRunningJob('mysql')).toBe(true);
  });
});
