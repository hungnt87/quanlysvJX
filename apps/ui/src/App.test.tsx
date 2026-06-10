import { cleanup, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/App';
import { api } from '@/services/client';
import { renderWithProviders } from '@/utils/test/renderWithProviders';

vi.mock('@/services/client', () => ({
  api: {
    services: vi.fn().mockResolvedValue([]),
    action: vi.fn(),
    logs: vi.fn().mockResolvedValue({ service: 'all', tail: 300, logs: '' }),
    logStreamUrl: vi.fn(() => '/api/services/all/logs/stream?tail=0'),
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

class MockEventSource {
  close = vi.fn();

  constructor(public readonly url: string) {}

  addEventListener() {
    return undefined;
  }
}

describe('App routing', () => {
  beforeEach(() => {
    vi.stubGlobal('EventSource', MockEventSource);
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('renders dashboard on /dashboard and loads services through query', async () => {
    renderWithProviders(<App />, { route: '/dashboard' });

    expect(screen.getByRole('tab', { name: 'Bảng điều khiển & Logs' }).getAttribute('aria-selected')).toBe('true');
    await waitFor(() => expect(api.services).toHaveBeenCalledTimes(1));
  });

  it('renders backup files when opened at /backup/files', async () => {
    renderWithProviders(<App />, { route: '/backup/files' });

    expect(screen.getByRole('tab', { name: 'Sao lưu (Backup)' }).getAttribute('aria-selected')).toBe('true');
    expect(await screen.findByRole('tab', { name: 'Files' })).toBeTruthy();
    await waitFor(() => expect(api.backups).toHaveBeenCalledTimes(1));
    expect(api.services).not.toHaveBeenCalled();
  });
});
