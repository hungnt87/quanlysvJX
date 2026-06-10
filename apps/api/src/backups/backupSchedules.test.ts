import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { defaultBackupSchedules, getRunKey, readBackupSchedules, updateBackupSchedule } from './backupSchedules.js';

describe('backup schedules', () => {
  it('returns disabled defaults when the file is missing', () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), 'schedules-')), 'backup-schedules.json');

    expect(readBackupSchedules(file)).toEqual(defaultBackupSchedules());
  });

  it('saves one database schedule without mutating the other', () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), 'schedules-')), 'backup-schedules.json');

    const updated = updateBackupSchedule(file, 'mysql', {
      enabled: true,
      daysOfWeek: [1, 3, 5],
      time: '03:00',
      retentionDays: 14,
      lastRunKey: null
    });

    expect(updated.schedules.mysql.enabled).toBe(true);
    expect(updated.schedules.mssql.enabled).toBe(false);
    expect(readBackupSchedules(file).schedules.mysql.daysOfWeek).toEqual([1, 3, 5]);
  });

  it('builds stable run keys in server local time', () => {
    expect(getRunKey('mysql', new Date(2026, 5, 10, 3, 0, 30))).toBe('mysql:2026-06-10T03:00');
  });
});
