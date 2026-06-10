import { Paper, Tabs } from '@mantine/core';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { BackupFilesTab } from './BackupFilesTab';
import { BackupJobsTab } from './BackupJobsTab';
import { BackupScheduleTab } from './BackupScheduleTab';
import { BackupSettingsTab } from './BackupSettingsTab';

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

function getActiveBackupTab(pathname: string) {
  if (pathname.startsWith('/backup/schedule')) return 'schedule';
  if (pathname.startsWith('/backup/jobs')) return 'jobs';
  if (pathname.startsWith('/backup/settings')) return 'settings';
  return 'files';
}

export function BackupPanel({ onSuccess, onError }: Props) {
  const location = useLocation();
  const navigate = useNavigate();
  const activeTab = getActiveBackupTab(location.pathname);

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
      <Routes>
        <Route path="/backup" element={<Navigate to="/backup/files" replace />} />
        <Route path="/backup/files" element={<BackupFilesTab onSuccess={onSuccess} onError={onError} />} />
        <Route path="/backup/schedule" element={<BackupScheduleTab onSuccess={onSuccess} onError={onError} />} />
        <Route path="/backup/jobs" element={<BackupJobsTab onError={onError} />} />
        <Route path="/backup/settings" element={<BackupSettingsTab onError={onError} />} />
        <Route path="*" element={<Navigate to="/backup/files" replace />} />
      </Routes>
    </Paper>
  );
}
