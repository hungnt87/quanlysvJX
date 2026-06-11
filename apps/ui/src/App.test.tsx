import { cleanup, screen, waitFor, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/App';

const mockGetServices = vi.fn();
const mockGetBackups = vi.fn();
const mockGetGameAccounts = vi.fn();

vi.mock('@/hooks/useServices', () => ({
  useServices: vi.fn(() => {
    mockGetServices();
    return {
      services: [],
      isFetching: false,
      error: null,
      isError: false,
      runAction: vi.fn(),
      isActionLoading: false,
    };
  }),
  serviceKeys: {
    all: ['services'] as const,
    lists: () => ['services', 'list'] as const,
    logs: (service: string, tail: number) => ['services', 'logs', service, { tail }] as const,
  },
}));

vi.mock('@/hooks/useBackups', () => ({
  useBackups: vi.fn(() => {
    mockGetBackups();
    return {
      backups: [],
      jobs: [],
      schedules: {
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
      },
      settings: {
        mysqlBackupDir: '/mysql',
        mssqlBackupDir: '/mssql',
        backupMetadataFile: '/backup-metadata.json',
        backupScheduleFile: '/backup-schedules.json',
      },
      isLoading: false,
      createBackup: vi.fn(),
      uploadBackup: vi.fn(),
      updateBackup: vi.fn(),
      deleteBackup: vi.fn(),
      restoreBackup: vi.fn(),
      saveSchedule: vi.fn(),
    };
  }),
  backupKeys: {
    all: ['backups'] as const,
    lists: () => ['backups', 'list'] as const,
    jobs: () => ['backups', 'jobs'] as const,
    schedules: () => ['backups', 'schedules'] as const,
    settings: () => ['backups', 'settings'] as const,
  },
}));

vi.mock('@/hooks/useGameAccounts', () => ({
  useGameAccounts: vi.fn(() => {
    mockGetGameAccounts();
    return {
      accountsData: { items: [], pagination: { page: 1, pageSize: 10, total: 0, totalPages: 1 } },
      isLoading: false,
      isActionLoading: false,
      createAccount: vi.fn(),
      updateAccount: vi.fn(),
      deleteAccount: vi.fn(),
      banAccount: vi.fn(),
      unbanAccount: vi.fn(),
    };
  }),
}));

vi.mock('@/hooks/useVersions', () => ({
  useVersions: vi.fn(() => ({
    versionsData: { activeVersion: null, versions: [] },
    isLoading: false,
    selectVersion: vi.fn(),
    deleteVersion: vi.fn(),
    renameVersion: vi.fn(),
  })),
  versionKeys: {
    all: ['versions'] as const,
    lists: () => ['versions', 'list'] as const,
    browse: (name: string, path?: string) => ['versions', 'browse', name, { path }] as const,
  },
}));

vi.mock('@/hooks/useEnv', () => ({
  useEnv: vi.fn(() => ({
    envData: { content: '' },
    isLoading: false,
    saveEnv: vi.fn(),
  })),
}));

vi.mock('@/services/serviceService', () => ({
  serviceService: {
    getLogs: vi.fn().mockResolvedValue({ service: 'all', tail: 300, logs: '' }),
    logStreamUrl: vi.fn(() => '/api/services/all/logs/stream?tail=0'),
  },
}));

vi.mock('@/services/backupService', () => ({
  backupService: {
    getJobs: vi.fn().mockResolvedValue([]),
    getBackupSettings: vi.fn().mockResolvedValue({
      mysqlBackupDir: '/mysql',
      mssqlBackupDir: '/mssql',
      backupMetadataFile: '/backup-metadata.json',
      backupScheduleFile: '/backup-schedules.json',
    }),
  },
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

  it('renders app default view and triggers services query', async () => {
    // When rendering <App />, it uses createBrowserRouter starting at '/'
    // which redirects to '/dashboard'
    render(<App />);

    expect(screen.getByText('JX Compose Manager')).toBeTruthy();
    await waitFor(() => expect(mockGetServices).toHaveBeenCalled());
  });
});
