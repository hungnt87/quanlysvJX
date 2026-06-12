import { Paper, Tabs } from '@mantine/core';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import {
  DatabaseReadinessAlert,
  getUnavailableDatabases,
  isDatabaseHealthy,
} from '@/components/DatabaseReadinessAlert';
import { useServices } from '@/hooks/useServices';
import type { BackupKind } from '@/services/types';
import { BackupFilesTab } from './BackupFilesTab';
import { ScheduledJobsTab } from './ScheduledJobsTab';
import { ScheduledRunsTab } from './ScheduledRunsTab';
import { BackupSettingsTab } from './BackupSettingsTab';

type Props = {
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
};

const backupRoutes = new Map([
  ['files', '/backup/files'],
  ['schedule', '/backup/schedule'],
  ['jobs', '/backup/jobs'],
  ['settings', '/backup/settings'],
]);

type BackupTab = 'files' | 'schedule' | 'jobs' | 'settings';
type DatabaseReadiness = Record<BackupKind, boolean>;

function getActiveBackupTab(pathname: string): BackupTab | null {
  if (pathname === '/backup' || pathname === '/backup/') {
    return 'files';
  }
  if (pathname.startsWith('/backup/schedule')) {
    return 'schedule';
  }
  if (pathname.startsWith('/backup/jobs')) {
    return 'jobs';
  }
  if (pathname.startsWith('/backup/files')) {
    return 'files';
  }
  if (pathname.startsWith('/backup/settings')) {
    return 'settings';
  }
  return null;
}

function renderBackupTab(
  tab: BackupTab,
  onSuccess: Props['onSuccess'],
  onError: Props['onError'],
  databaseReadiness: DatabaseReadiness
) {
  if (tab === 'schedule') {
    return (
      <ScheduledJobsTab
        databaseReadiness={databaseReadiness}
        onSuccess={onSuccess}
        onError={onError}
      />
    );
  }
  if (tab === 'jobs') {
    return (
      <ScheduledRunsTab
        onSuccess={onSuccess}
        onError={onError}
      />
    );
  }
  if (tab === 'settings') {
    return (
      <BackupSettingsTab
        onSuccess={onSuccess}
        onError={onError}
      />
    );
  }
  return (
    <BackupFilesTab databaseReadiness={databaseReadiness} onSuccess={onSuccess} onError={onError} />
  );
}

export function BackupPanel({ onSuccess, onError }: Props) {
  const location = useLocation();
  const navigate = useNavigate();
  const activeTab = getActiveBackupTab(location.pathname);
  const { services } = useServices(true);
  const databaseReadiness = {
    mysql: isDatabaseHealthy(services, 'mysql'),
    mssql: isDatabaseHealthy(services, 'mssql'),
  };
  const unavailableDatabases = getUnavailableDatabases(services, ['mysql', 'mssql']);

  if (!activeTab) {
    return <Navigate to="/backup/files" replace />;
  }

  return (
    <Paper withBorder p="md">
      <DatabaseReadinessAlert unavailable={unavailableDatabases} scope="backup" />
      <Tabs
        value={activeTab}
        onChange={(value) => value && navigate(backupRoutes.get(value) ?? '/backup/files')}
        keepMounted={false}
      >
        <Tabs.List my="md">
          <Tabs.Tab value="files">File backup</Tabs.Tab>
          <Tabs.Tab value="schedule">Lịch hẹn giờ</Tabs.Tab>
          <Tabs.Tab value="jobs">Lịch sử</Tabs.Tab>
          <Tabs.Tab value="settings">Cài đặt</Tabs.Tab>
        </Tabs.List>
      </Tabs>
      {renderBackupTab(activeTab, onSuccess, onError, databaseReadiness)}
    </Paper>
  );
}
