import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BackupPanel } from './BackupPanel';

vi.mock('../../api/client', () => ({
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

describe('BackupPanel', () => {
  it('renders backup workspace tabs', async () => {
    render(
      <MantineProvider>
        <BackupPanel onSuccess={vi.fn()} onError={vi.fn()} />
      </MantineProvider>
    );

    expect(await screen.findByRole('tab', { name: 'Files' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Schedule' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Jobs' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Settings' })).toBeTruthy();
  });
});
