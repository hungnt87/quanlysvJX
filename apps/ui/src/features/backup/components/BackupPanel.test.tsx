import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/utils/test/renderWithProviders';
import { BackupPanel } from '@/features/backup';

vi.mock('@/services/client', () => ({
  api: {
    backups: vi.fn().mockResolvedValue([]),
    jobs: vi.fn().mockResolvedValue([]),
    schedules: vi.fn().mockResolvedValue({
      version: 1,
      schedules: {
        mysql: { enabled: false, daysOfWeek: [], time: '03:00', retentionDays: 14, lastRunKey: null },
        mssql: { enabled: false, daysOfWeek: [], time: '03:30', retentionDays: 14, lastRunKey: null }
      }
    }),
    backupSettings: vi.fn().mockResolvedValue({
      mysqlBackupDir: '/mysql',
      mssqlBackupDir: '/mssql',
      backupMetadataFile: '/backup-metadata.json',
      backupScheduleFile: '/backup-schedules.json'
    })
  }
}));

describe('BackupPanel routing', () => {
  afterEach(() => cleanup());

  it('selects Schedule tab from /backup/schedule', async () => {
    renderWithProviders(<BackupPanel onSuccess={vi.fn()} onError={vi.fn()} />, { route: '/backup/schedule' });

    expect(await screen.findByRole('tab', { name: 'Files' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Schedule' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Jobs' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Settings' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Schedule' }).getAttribute('aria-selected')).toBe('true');
  });

  it('navigates to jobs when Jobs tab is clicked', async () => {
    renderWithProviders(<BackupPanel onSuccess={vi.fn()} onError={vi.fn()} />, { route: '/backup/files' });

    fireEvent.click(await screen.findByRole('tab', { name: 'Jobs' }));

    expect(screen.getByRole('tab', { name: 'Jobs' }).getAttribute('aria-selected')).toBe('true');
  });
});
