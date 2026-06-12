import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/utils/test/renderWithProviders';
import { BackupPanel } from './BackupPanel';

const mockUseServices = vi.fn();

vi.mock('@/hooks/useBackups', () => {
  const keys = {
    all: ['backups'] as const,
    lists: () => ['backups', 'list'] as const,
    scheduledJobs: () => ['backups', 'scheduledJobs'] as const,
    scheduledRuns: () => ['backups', 'scheduledRuns'] as const,
    settings: () => ['backups', 'settings'] as const,
  };
  return {
    backupKeys: keys,
    useBackups: vi.fn(() => ({
      backups: [],
      scheduledJobs: [],
      scheduledRuns: [],
      settings: {
        mysqlRetentionDays: 14,
        mssqlRetentionDays: 14,
      },
      isLoading: false,
      createBackup: vi.fn(),
      uploadBackup: vi.fn(),
      updateBackup: vi.fn(),
      deleteBackup: vi.fn(),
      restoreBackup: vi.fn(),
      createScheduledJob: vi.fn(),
      updateScheduledJob: vi.fn(),
      deleteScheduledJob: vi.fn(),
      runScheduledJobNow: vi.fn(),
      retryScheduledRun: vi.fn(),
      saveBackupSettings: vi.fn(),
    })),
  };
});

vi.mock('@/hooks/useServices', () => ({
  useServices: (...args: unknown[]) => mockUseServices(...args),
}));

vi.mock('@/services/backupService', () => ({
  backupService: {
    getBackups: vi.fn().mockResolvedValue([]),
    getScheduledJobs: vi.fn().mockResolvedValue([]),
    getScheduledRuns: vi.fn().mockResolvedValue([]),
    getBackupSettings: vi.fn().mockResolvedValue({ mysqlRetentionDays: 14, mssqlRetentionDays: 14 }),
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

    expect(await screen.findByRole('tab', { name: 'File backup' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Lịch hẹn giờ' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Lịch sử' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Lịch hẹn giờ' }).getAttribute('aria-selected')).toBe(
      'true'
    );
  });

  it('navigates to jobs when Jobs tab is clicked', async () => {
    renderWithProviders(<BackupPanel onSuccess={vi.fn()} onError={vi.fn()} />, {
      route: '/backup/files',
    });

    fireEvent.click(await screen.findByRole('tab', { name: 'Lịch sử' }));

    expect(screen.getByRole('tab', { name: 'Lịch sử' }).getAttribute('aria-selected')).toBe('true');
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
