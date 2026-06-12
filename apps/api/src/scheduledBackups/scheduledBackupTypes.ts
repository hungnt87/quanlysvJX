import { z } from 'zod';

const timeSchema = z.string().regex(/^([0-1]\d|2[0-3]):[0-5]\d$/);

export const hourlyScheduleSchema = z.object({
  type: z.literal('hourly'),
  everyHours: z.number().int().min(1).max(24),
  minute: z.number().int().min(0).max(59),
});

export const dailyScheduleSchema = z.object({
  type: z.literal('daily'),
  time: timeSchema,
});

export const weeklyScheduleSchema = z.object({
  type: z.literal('weekly'),
  daysOfWeek: z.array(z.union([
    z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6)
  ])).min(1),
  time: timeSchema,
});

export const backupScheduleRuleSchema = z.discriminatedUnion('type', [
  hourlyScheduleSchema,
  dailyScheduleSchema,
  weeklyScheduleSchema,
]);

export type BackupScheduleRule = z.infer<typeof backupScheduleRuleSchema>;

export const scheduledBackupJobSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  enabled: z.boolean(),
  taskType: z.literal('backup'),
  database: z.union([z.literal('mysql'), z.literal('mssql')]),
  schedule: backupScheduleRuleSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable(),
});

export type ScheduledBackupJob = z.infer<typeof scheduledBackupJobSchema>;

export const scheduledBackupRunSchema = z.object({
  runId: z.string(),
  batchId: z.string().nullable(),
  jobId: z.string().nullable(),
  jobDisplayName: z.string().nullable(),
  database: z.union([z.literal('mysql'), z.literal('mssql')]),
  trigger: z.union([z.literal('schedule'), z.literal('manual'), z.literal('retry')]),
  scheduledFor: z.string(),
  queuedAt: z.string(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  status: z.union([
    z.literal('queued'),
    z.literal('running'),
    z.literal('succeeded'),
    z.literal('failed'),
    z.literal('skipped'),
    z.literal('cancelled'),
  ]),
  error: z.string().nullable(),
  backupFilename: z.string().nullable(),
  scheduleSnapshot: backupScheduleRuleSchema.nullable(),
});

export type ScheduledBackupRun = z.infer<typeof scheduledBackupRunSchema>;

export const scheduledBackupJobsFileSchema = z.object({
  version: z.literal(2),
  jobs: z.array(scheduledBackupJobSchema),
});

export type ScheduledBackupJobsFile = z.infer<typeof scheduledBackupJobsFileSchema>;

export const scheduledBackupRunsFileSchema = z.object({
  version: z.literal(1),
  runs: z.array(scheduledBackupRunSchema),
});

export type ScheduledBackupRunsFile = z.infer<typeof scheduledBackupRunsFileSchema>;
