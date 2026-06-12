import { describe, expect, it } from 'vitest';
import {
  isScheduleDue,
  getNextRunAt,
  getScheduleSummaryVi
} from './scheduledBackupTime.js';

describe('scheduled backup time helpers', () => {
  describe('isScheduleDue', () => {
    it('detects hourly schedule matches', () => {
      const rule = { type: 'hourly' as const, everyHours: 2, minute: 30 };
      // 00:30 is due (0 % 2 === 0, minutes = 30)
      expect(isScheduleDue(rule, new Date('2026-06-12T00:30:00'))).toBe(true);
      // 01:30 is not due (1 % 2 !== 0)
      expect(isScheduleDue(rule, new Date('2026-06-12T01:30:00'))).toBe(false);
      // 02:00 is not due (minutes !== 30)
      expect(isScheduleDue(rule, new Date('2026-06-12T02:00:00'))).toBe(false);
    });

    it('detects daily schedule matches', () => {
      const rule = { type: 'daily' as const, time: '03:15' };
      expect(isScheduleDue(rule, new Date('2026-06-12T03:15:00'))).toBe(true);
      expect(isScheduleDue(rule, new Date('2026-06-12T03:16:00'))).toBe(false);
      expect(isScheduleDue(rule, new Date('2026-06-12T04:15:00'))).toBe(false);
    });

    it('detects weekly schedule matches', () => {
      const rule = { type: 'weekly' as const, daysOfWeek: [1, 3, 5] as (0 | 1 | 2 | 3 | 4 | 5 | 6)[], time: '04:00' };
      // 2026-06-12 is a Friday (getDay() = 5)
      expect(isScheduleDue(rule, new Date('2026-06-12T04:00:00'))).toBe(true);
      // Saturday 2026-06-13 (getDay() = 6)
      expect(isScheduleDue(rule, new Date('2026-06-13T04:00:00'))).toBe(false);
    });
  });

  describe('getNextRunAt', () => {
    it('calculates hourly next runs', () => {
      const rule = { type: 'hourly' as const, everyHours: 2, minute: 30 };
      const now = new Date('2026-06-12T00:15:00');
      const next = getNextRunAt(rule, now);
      expect(next).not.toBeNull();
      // Should be 00:30 of the same day
      expect(new Date(next!).getHours()).toBe(0);
      expect(new Date(next!).getMinutes()).toBe(30);

      const now2 = new Date('2026-06-12T00:35:00');
      const next2 = getNextRunAt(rule, now2);
      // Should be 02:30
      expect(new Date(next2!).getHours()).toBe(2);
      expect(new Date(next2!).getMinutes()).toBe(30);
    });

    it('calculates daily next runs', () => {
      const rule = { type: 'daily' as const, time: '03:00' };
      const now = new Date('2026-06-12T02:00:00');
      const next = getNextRunAt(rule, now);
      // Same day 03:00
      expect(new Date(next!).getDate()).toBe(12);
      expect(new Date(next!).getHours()).toBe(3);

      const now2 = new Date('2026-06-12T04:00:00');
      const next2 = getNextRunAt(rule, now2);
      // Next day 03:00
      expect(new Date(next2!).getDate()).toBe(13);
      expect(new Date(next2!).getHours()).toBe(3);
    });

    it('calculates weekly next runs', () => {
      const rule = { type: 'weekly' as const, daysOfWeek: [1, 3, 5] as (0 | 1 | 2 | 3 | 4 | 5 | 6)[], time: '04:00' };
      // Friday 2026-06-12 02:00 (due day Friday)
      const now = new Date('2026-06-12T02:00:00');
      const next = getNextRunAt(rule, now);
      expect(new Date(next!).getDate()).toBe(12); // Friday 12th

      // Friday 2026-06-12 05:00 (Friday already passed, next is Monday 15th)
      const now2 = new Date('2026-06-12T05:00:00');
      const next2 = getNextRunAt(rule, now2);
      expect(new Date(next2!).getDate()).toBe(15); // Monday 15th
    });
  });

  describe('getScheduleSummaryVi', () => {
    it('summarizes schedules correctly in Vietnamese', () => {
      expect(getScheduleSummaryVi({ type: 'hourly', everyHours: 2, minute: 30 })).toBe(
        'Hàng giờ (Mỗi 2 giờ vào phút 30)'
      );
      expect(getScheduleSummaryVi({ type: 'daily', time: '03:00' })).toBe(
        'Hằng ngày lúc 03:00'
      );
      expect(
        getScheduleSummaryVi({ type: 'weekly', daysOfWeek: [1, 3, 0], time: '04:00' })
      ).toBe('Hằng tuần vào Thứ 2, Thứ 4, Chủ Nhật lúc 04:00');
    });
  });
});
