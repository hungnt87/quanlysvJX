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
});
