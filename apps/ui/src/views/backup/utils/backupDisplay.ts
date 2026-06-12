import type {
  BackupFile,
  BackupKind,
  BackupScheduleRule,
  ScheduledBackupJob,
} from '@/services/types';

const dayLabels = new Map<number, string>([
  [0, 'Chủ Nhật'],
  [1, 'Thứ 2'],
  [2, 'Thứ 3'],
  [3, 'Thứ 4'],
  [4, 'Thứ 5'],
  [5, 'Thứ 6'],
  [6, 'Thứ 7'],
]);

export function formatDatabaseLabel(kind: BackupKind) {
  return kind === 'mysql' ? 'MySQL' : 'MSSQL';
}

export function formatScheduleKindVi(schedule: BackupScheduleRule) {
  if (schedule.type === 'hourly') {
    return 'Hàng giờ';
  }
  if (schedule.type === 'daily') {
    return 'Hằng ngày';
  }
  return 'Hằng tuần';
}

export function formatScheduleDetailVi(schedule: BackupScheduleRule) {
  if (schedule.type === 'hourly') {
    return `Mỗi ${schedule.everyHours} giờ, phút ${String(schedule.minute).padStart(2, '0')}`;
  }
  if (schedule.type === 'daily') {
    return `Lúc ${schedule.time}`;
  }

  const days = schedule.daysOfWeek.map((day) => dayLabels.get(day) ?? String(day)).join(', ');
  return `${days} lúc ${schedule.time}`;
}

export function formatScheduleDisplayName(job: ScheduledBackupJob) {
  return `${formatDatabaseLabel(job.database)} · ${formatScheduleKindVi(job.schedule)} · ${formatScheduleDetailVi(job.schedule)}`;
}

export function formatScheduleDisplayNameFromParts(
  database: BackupKind,
  schedule: BackupScheduleRule | null | undefined,
  fallbackName: string | null | undefined
) {
  if (!schedule) {
    return fallbackName ?? formatDatabaseLabel(database);
  }

  return `${formatDatabaseLabel(database)} · ${formatScheduleKindVi(schedule)} · ${formatScheduleDetailVi(schedule)}`;
}

export function formatFullDateTime(value: string | null | undefined) {
  if (!value) {
    return '-';
  }

  return new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour12: false,
  }).format(new Date(value));
}

export function formatBackupNoteSummary(file: BackupFile) {
  if (file.source === 'uploaded') {
    return [file.note?.trim() || 'Tải lên thủ công'];
  }

  if (!file.generatedBy) {
    return [file.note?.trim() || 'File backup được tạo bởi hệ thống'];
  }

  const scheduleName = formatScheduleDisplayNameFromParts(
    file.kind,
    file.generatedBy.scheduleSnapshot,
    file.generatedBy.jobDisplayName
  );
  const sourceLabel = file.generatedBy.trigger === 'schedule' ? 'Tự động' : 'Thủ công';
  const runLine = file.generatedBy.runId ? `Run: ${file.generatedBy.runId}` : 'Run: -';

  return [`${sourceLabel}: ${scheduleName}`, runLine];
}

export function formatBackupNoteTooltip(file: BackupFile) {
  if (file.source === 'uploaded') {
    return [
      'Nguồn: Tải lên thủ công',
      `Ghi chú: ${file.note?.trim() || '-'}`,
      `Thời điểm cập nhật: ${formatFullDateTime(file.modifiedAt)}`,
    ].join('\n');
  }

  if (!file.generatedBy) {
    return [
      'Nguồn: File được tạo bởi hệ thống',
      `Ghi chú: ${file.note?.trim() || '-'}`,
      `Thời điểm cập nhật: ${formatFullDateTime(file.modifiedAt)}`,
    ].join('\n');
  }

  const scheduleName = formatScheduleDisplayNameFromParts(
    file.kind,
    file.generatedBy.scheduleSnapshot,
    file.generatedBy.jobDisplayName
  );
  const source =
    file.generatedBy.trigger === 'schedule'
      ? 'Sao lưu tự động'
      : file.generatedBy.trigger === 'retry'
        ? 'Chạy lại'
        : 'Sao lưu thủ công';

  return [
    `Nguồn: ${source}`,
    `Lịch: ${scheduleName}`,
    `Run ID: ${file.generatedBy.runId ?? '-'}`,
    `Job ID: ${file.generatedBy.jobId ?? '-'}`,
    `Thời điểm hẹn: ${formatFullDateTime(file.generatedBy.scheduledFor)}`,
    `Thời điểm tạo: ${formatFullDateTime(file.generatedBy.generatedAt ?? file.modifiedAt)}`,
    `Batch ID: ${file.generatedBy.batchId ?? '-'}`,
  ].join('\n');
}
