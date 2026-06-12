import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  type BackupScheduleRule,
  type ScheduledBackupJob,
  type ScheduledBackupJobsFile,
  scheduledBackupJobsFileSchema
} from './scheduledBackupTypes.js';

export type CreateScheduledBackupJobInput = {
  database: 'mysql' | 'mssql';
  schedule: BackupScheduleRule;
  enabled?: boolean;
};

export type UpdateScheduledBackupJobInput = {
  schedule?: BackupScheduleRule;
  enabled?: boolean;
};

export function readScheduledBackupJobs(file: string): ScheduledBackupJobsFile {
  if (!fs.existsSync(file)) {
    return { version: 2, jobs: [] };
  }
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw);
    const validated = scheduledBackupJobsFileSchema.parse(parsed);
    return validated;
  } catch (err) {
    // If the file is version 1 or invalid, fallback to empty or throw?
    // The spec says: if version 2 is not present, start fresh or empty.
    return { version: 2, jobs: [] };
  }
}

export function writeScheduledBackupJobs(file: string, data: ScheduledBackupJobsFile): void {
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

export function isSameSchedule(r1: BackupScheduleRule, r2: BackupScheduleRule): boolean {
  if (r1.type !== r2.type) return false;
  if (r1.type === 'hourly' && r2.type === 'hourly') {
    return r1.everyHours === r2.everyHours && r1.minute === r2.minute;
  }
  if (r1.type === 'daily' && r2.type === 'daily') {
    return r1.time === r2.time;
  }
  if (r1.type === 'weekly' && r2.type === 'weekly') {
    if (r1.time !== r2.time) return false;
    if (r1.daysOfWeek.length !== r2.daysOfWeek.length) return false;
    const s1 = [...r1.daysOfWeek].sort();
    const s2 = [...r2.daysOfWeek].sort();
    return s1.every((val, index) => val === s2[index]);
  }
  return false;
}

export function createScheduledBackupJob(
  file: string,
  input: CreateScheduledBackupJobInput,
  now = new Date()
): ScheduledBackupJob {
  const data = readScheduledBackupJobs(file);

  // Check for duplicate schedule on the same database (active/non-deleted jobs)
  const isDuplicate = data.jobs.some(
    job =>
      job.deletedAt === null &&
      job.database === input.database &&
      isSameSchedule(job.schedule, input.schedule)
  );

  if (isDuplicate) {
    throw new Error('Lịch này đã tồn tại cho database này.');
  }

  // Generate stable displayName
  const dbLabel = input.database === 'mysql' ? 'MySQL' : 'MSSQL';
  let scheduleLabel = 'Hàng giờ';
  if (input.schedule.type === 'daily') scheduleLabel = 'Hằng ngày';
  if (input.schedule.type === 'weekly') scheduleLabel = 'Hằng tuần';

  // Count existing matching jobs (including deleted ones to keep sequence numbers stable)
  const count = data.jobs.filter(
    job => job.database === input.database && job.schedule.type === input.schedule.type
  ).length;

  const displayName = `${dbLabel} · ${scheduleLabel} #${count + 1}`;
  const nowStr = now.toISOString();

  const newJob: ScheduledBackupJob = {
    id: `job_${crypto.randomUUID()}`,
    displayName,
    enabled: input.enabled ?? true,
    taskType: 'backup',
    database: input.database,
    schedule: input.schedule,
    createdAt: nowStr,
    updatedAt: nowStr,
    deletedAt: null
  };

  data.jobs.push(newJob);
  writeScheduledBackupJobs(file, data);

  return newJob;
}

export function updateScheduledBackupJob(
  file: string,
  id: string,
  input: UpdateScheduledBackupJobInput,
  now = new Date()
): ScheduledBackupJob {
  const data = readScheduledBackupJobs(file);
  const jobIndex = data.jobs.findIndex(job => job.id === id && job.deletedAt === null);

  if (jobIndex === -1) {
    throw new Error('Không tìm thấy job hoặc job đã bị xóa.');
  }

  const job = data.jobs[jobIndex];
  if (!job) {
    throw new Error('Không tìm thấy job hoặc job đã bị xóa.');
  }

  // If updating schedule, check for duplicate schedule
  if (input.schedule) {
    const isDuplicate = data.jobs.some(
      other =>
        other.id !== id &&
        other.deletedAt === null &&
        other.database === job.database &&
        isSameSchedule(other.schedule, input.schedule!)
    );
    if (isDuplicate) {
      throw new Error('Lịch này đã tồn tại cho database này.');
    }
    job.schedule = input.schedule;
  }

  if (input.enabled !== undefined) {
    job.enabled = input.enabled;
  }

  job.updatedAt = now.toISOString();
  data.jobs[jobIndex] = job;
  writeScheduledBackupJobs(file, data);

  return job;
}

export function softDeleteScheduledBackupJob(
  file: string,
  id: string,
  now = new Date()
): ScheduledBackupJob {
  const data = readScheduledBackupJobs(file);
  const jobIndex = data.jobs.findIndex(job => job.id === id && job.deletedAt === null);

  if (jobIndex === -1) {
    throw new Error('Không tìm thấy job hoặc job đã bị xóa.');
  }

  const job = data.jobs[jobIndex];
  if (!job) {
    throw new Error('Không tìm thấy job hoặc job đã bị xóa.');
  }
  job.deletedAt = now.toISOString();
  job.updatedAt = now.toISOString();

  data.jobs[jobIndex] = job;
  writeScheduledBackupJobs(file, data);

  return job;
}

export type BackupRetentionSettings = {
  mysqlRetentionDays: number;
  mssqlRetentionDays: number;
};

export function readBackupSettings(
  jobsFile: string,
  defaultConfig: { mysqlRetentionDays: number; mssqlRetentionDays: number }
): BackupRetentionSettings {
  const settingsFile = path.join(path.dirname(jobsFile), 'backup-settings.json');
  if (!fs.existsSync(settingsFile)) {
    return {
      mysqlRetentionDays: defaultConfig.mysqlRetentionDays,
      mssqlRetentionDays: defaultConfig.mssqlRetentionDays
    };
  }
  try {
    const raw = fs.readFileSync(settingsFile, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      mysqlRetentionDays: Number(parsed.mysqlRetentionDays ?? defaultConfig.mysqlRetentionDays),
      mssqlRetentionDays: Number(parsed.mssqlRetentionDays ?? defaultConfig.mssqlRetentionDays)
    };
  } catch {
    return {
      mysqlRetentionDays: defaultConfig.mysqlRetentionDays,
      mssqlRetentionDays: defaultConfig.mssqlRetentionDays
    };
  }
}

export function writeBackupSettings(jobsFile: string, settings: BackupRetentionSettings): void {
  const settingsFile = path.join(path.dirname(jobsFile), 'backup-settings.json');
  const dir = path.dirname(settingsFile);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2), 'utf8');
}
