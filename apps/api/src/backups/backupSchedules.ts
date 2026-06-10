import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { BackupKind } from './backupPaths.js';

const daySchema = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6)]);

const scheduleSchema = z.object({
  enabled: z.boolean(),
  daysOfWeek: z.array(daySchema),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  retentionDays: z.number().int().min(1),
  lastRunKey: z.string().nullable()
});

const schedulesSchema = z.object({
  version: z.literal(1),
  schedules: z.object({ mysql: scheduleSchema, mssql: scheduleSchema })
});

export type DatabaseBackupSchedule = z.infer<typeof scheduleSchema>;
export type BackupScheduleConfig = z.infer<typeof schedulesSchema>;

export function defaultBackupSchedules(): BackupScheduleConfig {
  const disabled: DatabaseBackupSchedule = {
    enabled: false,
    daysOfWeek: [],
    time: '03:00',
    retentionDays: 14,
    lastRunKey: null
  };

  return { version: 1, schedules: { mysql: disabled, mssql: { ...disabled, time: '03:30' } } };
}

export function readBackupSchedules(file: string): BackupScheduleConfig {
  if (!existsSync(file)) {
    return defaultBackupSchedules();
  }

  try {
    return schedulesSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
  } catch {
    return defaultBackupSchedules();
  }
}

export function writeBackupSchedules(file: string, config: BackupScheduleConfig) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}

export function updateBackupSchedule(file: string, kind: BackupKind, schedule: DatabaseBackupSchedule) {
  const current = readBackupSchedules(file);
  const next: BackupScheduleConfig = { ...current, schedules: { ...current.schedules, [kind]: schedule } };
  writeBackupSchedules(file, next);
  return next;
}

export function getRunKey(kind: BackupKind, date: Date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${kind}:${yyyy}-${mm}-${dd}T${hh}:${min}`;
}
