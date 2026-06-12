import type { BackupScheduleRule } from './scheduledBackupTypes.js';

export function isScheduleDue(rule: BackupScheduleRule, now: Date): boolean {
  const min = now.getMinutes();
  const hour = now.getHours();

  if (rule.type === 'hourly') {
    return hour % rule.everyHours === 0 && min === rule.minute;
  }

  const [h, m] = rule.time.split(':').map(Number);
  if (rule.type === 'daily') {
    return hour === h && min === m;
  }

  if (rule.type === 'weekly') {
    const day = now.getDay(); // 0 is Sunday, 1 is Monday, etc.
    return rule.daysOfWeek.includes(day as any) && hour === h && min === m;
  }

  return false;
}

export function getNextRunAt(rule: BackupScheduleRule, now: Date): string | null {
  // Truncate seconds and milliseconds to ensure clean minute matching
  const current = new Date(now);
  current.setSeconds(0, 0);

  // Search up to 8 days in the future (8 * 24 * 60 minutes)
  for (let i = 1; i <= 8 * 24 * 60; i++) {
    current.setTime(current.getTime() + 60 * 1000);
    if (isScheduleDue(rule, current)) {
      return current.toISOString();
    }
  }

  return null;
}

export function getNextRunPreviewAt(rule: BackupScheduleRule, now: Date): string | null {
  return getNextRunAt(rule, now);
}

const VIETNAMESE_DAYS: Record<number, string> = {
  0: 'Chủ Nhật',
  1: 'Thứ 2',
  2: 'Thứ 3',
  3: 'Thứ 4',
  4: 'Thứ 5',
  5: 'Thứ 6',
  6: 'Thứ 7'
};

const DAY_SORT_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Monday to Saturday, then Sunday last

export function getScheduleSummaryVi(rule: BackupScheduleRule): string {
  if (rule.type === 'hourly') {
    return `Hàng giờ (Mỗi ${rule.everyHours} giờ vào phút ${rule.minute})`;
  }
  if (rule.type === 'daily') {
    return `Hằng ngày lúc ${rule.time}`;
  }
  if (rule.type === 'weekly') {
    const sortedDays = [...rule.daysOfWeek].sort(
      (a, b) => DAY_SORT_ORDER.indexOf(a) - DAY_SORT_ORDER.indexOf(b)
    );
    const dayNames = sortedDays.map(d => VIETNAMESE_DAYS[d]).join(', ');
    return `Hằng tuần vào ${dayNames} lúc ${rule.time}`;
  }
  return '';
}
