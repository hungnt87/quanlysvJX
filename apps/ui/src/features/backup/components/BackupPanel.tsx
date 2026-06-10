import { Paper, Tabs } from '@mantine/core';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { BackupFilesTab } from '@/features/backup/components/BackupFilesTab';
import { BackupJobsTab } from '@/features/backup/components/BackupJobsTab';
import { BackupScheduleTab } from '@/features/backup/components/BackupScheduleTab';
import { BackupSettingsTab } from '@/features/backup/components/BackupSettingsTab';

type Props = {
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
};

const backupRoutes = new Map([
  ['files', '/backup/files'],
  ['schedule', '/backup/schedule'],
  ['jobs', '/backup/jobs'],
  ['settings', '/backup/settings']
]);

type BackupTab = 'files' | 'schedule' | 'jobs' | 'settings';

function getActiveBackupTab(pathname: string): BackupTab | null {
  if (pathname === '/backup' || pathname === '/backup/') return 'files';
  if (pathname.startsWith('/backup/schedule')) return 'schedule';
  if (pathname.startsWith('/backup/jobs')) return 'jobs';
  if (pathname.startsWith('/backup/settings')) return 'settings';
  if (pathname.startsWith('/backup/files')) return 'files';
  return null;
}

function renderBackupTab(tab: BackupTab, onSuccess: Props['onSuccess'], onError: Props['onError']) {
  if (tab === 'schedule') return <BackupScheduleTab onSuccess={onSuccess} onError={onError} />;
  if (tab === 'jobs') return <BackupJobsTab onError={onError} />;
  if (tab === 'settings') return <BackupSettingsTab onError={onError} />;
  return <BackupFilesTab onSuccess={onSuccess} onError={onError} />;
}

export function BackupPanel({ onSuccess, onError }: Props) {
  const location = useLocation();
  const navigate = useNavigate();
  const activeTab = getActiveBackupTab(location.pathname);

  if (!activeTab) {
    return <Navigate to="/backup/files" replace />;
  }

  return (
    <Paper withBorder p="md">
      <Tabs value={activeTab} onChange={(value) => value && navigate(backupRoutes.get(value) ?? '/backup/files')} keepMounted={false}>
        <Tabs.List mb="md">
          <Tabs.Tab value="files">Files</Tabs.Tab>
          <Tabs.Tab value="schedule">Schedule</Tabs.Tab>
          <Tabs.Tab value="jobs">Jobs</Tabs.Tab>
          <Tabs.Tab value="settings">Settings</Tabs.Tab>
        </Tabs.List>
      </Tabs>
      {renderBackupTab(activeTab, onSuccess, onError)}
    </Paper>
  );
}
