import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

const mockUseServices = vi.fn();

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

vi.mock('@/hooks/useServices', () => ({
  useServices: (...args: unknown[]) => mockUseServices(...args),
}));

vi.mock('@/services/backupService', () => ({
  backupService: {
    getJobs: vi.fn().mockResolvedValue([]),
  },
}));

describe('BackupPanel routing', () => {
  afterEach(() => {
    cleanup();
    mockUseServices.mockReset();
  });

  beforeEach(() => {
    mockUseServices.mockReturnValue({
      services: [
        { name: 'jxmysql', state: 'running', health: 'healthy' },
        { name: 'jxmssql', state: 'running', health: 'healthy' },
      ],
    });
  });

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

  it('warns and disables only unavailable backup actions when a database is not healthy', async () => {
    mockUseServices.mockReturnValue({
      services: [
        { name: 'jxmysql', state: 'running', health: 'healthy' },
        { name: 'jxmssql', state: 'running', health: 'unhealthy' },
      ],
    });

    renderWithProviders(<BackupPanel onSuccess={vi.fn()} onError={vi.fn()} />, {
      route: '/backup/files',
    });

    expect(await screen.findByText(/MSSQL chưa sẵn sàng/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sao lưu tất cả' }).hasAttribute('disabled')).toBe(
      true
    );
    expect(screen.getByRole('button', { name: 'Sao lưu MySQL' }).hasAttribute('disabled')).toBe(
      false
    );
    expect(screen.getByRole('button', { name: 'Sao lưu MSSQL' }).hasAttribute('disabled')).toBe(
      true
    );
  });
});
