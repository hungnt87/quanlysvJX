import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/utils/test/renderWithProviders';
import { BackupPanel } from './BackupPanel';

const mockUseServices = vi.fn();

const mockBackups = vi.fn(() => []);
const mockScheduledJobs = vi.fn(() => []);
const mockScheduledRuns = vi.fn(() => []);

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
      backups: mockBackups(),
      scheduledJobs: mockScheduledJobs(),
      scheduledRuns: mockScheduledRuns(),
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
    getBackupSettings: vi
      .fn()
      .mockResolvedValue({ mysqlRetentionDays: 14, mssqlRetentionDays: 14 }),
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

  it('shows detailed generated backup notes and icon-only row actions', async () => {
    mockBackups.mockReturnValue([
      {
        kind: 'mysql',
        filename: 'mysql-20260612-030000.sql.gz',
        size: 1024,
        modifiedAt: '2026-06-12T03:00:30.000Z',
        note: 'Tự động từ lịch MySQL · Hàng giờ #1',
        source: 'generated',
        uploadedAt: null,
        isLatest: false,
        generatedBy: {
          runId: 'run_123',
          jobId: 'job_456',
          jobDisplayName: 'MySQL · Hàng giờ #1',
          trigger: 'schedule',
          batchId: null,
          scheduledFor: '2026-06-12T03:00:00.000Z',
          generatedAt: '2026-06-12T03:00:30.000Z',
          scheduleSnapshot: { type: 'hourly', everyHours: 2, minute: 0 },
        },
      },
    ] as any);

    renderWithProviders(<BackupPanel onSuccess={vi.fn()} onError={vi.fn()} />, {
      route: '/backup/files',
    });

    expect(await screen.findByText('Tự động: MySQL · Hàng giờ · Mỗi 2 giờ, phút 00')).toBeTruthy();
    expect(screen.getByText('Run: run_123')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Khôi phục file backup mysql-20260612-030000.sql.gz' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sửa ghi chú file backup mysql-20260612-030000.sql.gz' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Tải xuống file backup mysql-20260612-030000.sql.gz' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Xóa file backup mysql-20260612-030000.sql.gz' })).toBeTruthy();
  });

  it('shows detailed schedule names without sequence suffixes and icon-only schedule actions', async () => {
    mockScheduledJobs.mockReturnValue([
      {
        id: 'job_1',
        displayName: 'MySQL · Hàng giờ #1',
        enabled: true,
        taskType: 'backup',
        database: 'mysql',
        schedule: { type: 'hourly', everyHours: 2, minute: 0 },
        nextRunPreviewAt: '2026-06-12T05:00:00.000Z',
        createdAt: '2026-06-12T03:00:00.000Z',
        updatedAt: '2026-06-12T03:00:00.000Z',
      },
    ] as any);

    renderWithProviders(<BackupPanel onSuccess={vi.fn()} onError={vi.fn()} />, {
      route: '/backup/schedule',
    });

    expect(await screen.findByText('MySQL · Hàng giờ · Mỗi 2 giờ, phút 00')).toBeTruthy();
    expect(screen.queryByText('MySQL · Hàng giờ #1')).toBeNull();
    expect(screen.getByRole('button', { name: 'Chạy ngay lịch MySQL · Hàng giờ · Mỗi 2 giờ, phút 00' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sửa lịch MySQL · Hàng giờ · Mỗi 2 giờ, phút 00' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Xóa lịch MySQL · Hàng giờ · Mỗi 2 giờ, phút 00' })).toBeTruthy();
  });
});
