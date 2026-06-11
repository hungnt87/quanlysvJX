import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/utils/test/renderWithProviders';
import { BackupPanel } from './BackupPanel';

const mockSchedules = {
  version: 1,
  schedules: {
    mysql: {
      enabled: false,
      daysOfWeek: [],
      time: '03:00',
      retentionDays: 14,
      lastRunKey: null,
    },
    mssql: {
      enabled: false,
      daysOfWeek: [],
      time: '03:30',
      retentionDays: 14,
      lastRunKey: null,
    },
  },
};

const mockSettings = {
  mysqlBackupDir: '/mysql',
  mssqlBackupDir: '/mssql',
  backupMetadataFile: '/backup-metadata.json',
  backupScheduleFile: '/backup-schedules.json',
};

vi.mock('@/hooks/useBackups', () => {
  const keys = {
    all: ['backups'] as const,
    lists: () => ['backups', 'list'] as const,
    jobs: () => ['backups', 'jobs'] as const,
    schedules: () => ['backups', 'schedules'] as const,
    settings: () => ['backups', 'settings'] as const,
  };
  return {
    backupKeys: keys,
    useBackups: vi.fn(() => ({
      backups: [],
      jobs: [],
      schedules: mockSchedules,
      settings: mockSettings,
      isLoading: false,
      createBackup: vi.fn(),
      uploadBackup: vi.fn(),
      updateBackup: vi.fn(),
      deleteBackup: vi.fn(),
      restoreBackup: vi.fn(),
      saveSchedule: vi.fn(),
    })),
  };
});

vi.mock('@/services/backupService', () => ({
  backupService: {
    getJobs: vi.fn().mockResolvedValue([]),
  },
}));

describe('BackupPanel routing', () => {
  afterEach(() => cleanup());

  it('selects Schedule tab from /backup/schedule', async () => {
    renderWithProviders(<BackupPanel onSuccess={vi.fn()} onError={vi.fn()} />, {
      route: '/backup/schedule',
    });

    expect(await screen.findByRole('tab', { name: 'Files' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Schedule' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Jobs' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Schedule' }).getAttribute('aria-selected')).toBe(
      'true'
    );
  });

  it('navigates to jobs when Jobs tab is clicked', async () => {
    renderWithProviders(<BackupPanel onSuccess={vi.fn()} onError={vi.fn()} />, {
      route: '/backup/files',
    });

    fireEvent.click(await screen.findByRole('tab', { name: 'Jobs' }));

    expect(screen.getByRole('tab', { name: 'Jobs' }).getAttribute('aria-selected')).toBe('true');
  });
});
