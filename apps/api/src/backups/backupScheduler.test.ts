import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { updateBackupSchedule } from './backupSchedules.js';
import { runDueBackupSchedules } from './backupScheduler.js';

describe('backup scheduler', () => {
  it('runs an enabled schedule once for a matching day and time', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'scheduler-'));
    const scheduleFile = path.join(root, 'backup-schedules.json');
    updateBackupSchedule(scheduleFile, 'mysql', {
      enabled: true,
      daysOfWeek: [3],
      time: '03:00',
      retentionDays: 14,
      lastRunKey: null
    });
    const backupMysql = vi.fn().mockResolvedValue({ kind: 'mysql' });

    await runDueBackupSchedules({
      now: new Date(2026, 5, 10, 3, 0, 0),
      scheduleFile,
      backupMysql,
      backupMssql: vi.fn(),
      hasRunningJob: () => false
    });

    await runDueBackupSchedules({
      now: new Date(2026, 5, 10, 3, 0, 30),
      scheduleFile,
      backupMysql,
      backupMssql: vi.fn(),
      hasRunningJob: () => false
    });

    expect(backupMysql).toHaveBeenCalledTimes(1);
  });
});
